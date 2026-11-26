import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  BrandCandidate,
  BrandInspectionResponse,
  DictionaryStatsResponse,
  DiscoveryFilterParams,
  DiscoveryStreamEvent,
  ExportReportPayload,
  QuickCheckRequest,
  QuickCheckResponse,
  RawLexiconEntry,
} from '../src/types/brand.ts';
import {
  getSystemDictionaryCount,
  loadMultilingualLexicon,
  selectCandidateSlice,
} from './services/dictionary/index.ts';
import { lookupFreeDictionaryDetails } from './services/dictionary/datamuseClient.ts';
import {
  getCachedDomainCount,
  verifyDomainAvailability,
  verifyLexiconCandidate,
} from './services/domain/domainChecker.ts';
import { normalizeBrandWord } from './services/phonetics/brandScorer.ts';
import { generateBrandReportPdf } from './services/export/pdfReportBuilder.ts';

const PORT = Number(process.env.PORT ?? 3456);
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
};

async function parseJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > 4 * 1024 * 1024) {
      throw new Error('Request payload exceeds 4MB limit');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw) as T;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

async function runWithConcurrency<TItem>(
  items: TItem[],
  concurrency: number,
  isAborted: () => boolean,
  worker: (item: TItem, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length && !isAborted()) {
      const idx = cursor;
      cursor += 1;
      await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
}

async function handleDiscoverStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const params = await parseJsonBody<DiscoveryFilterParams>(req);
  let aborted = false;

  req.on('close', () => {
    aborted = true;
  });

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const emit = (event: DiscoveryStreamEvent): void => {
    if (!aborted && !res.writableEnded) {
      res.write(`${JSON.stringify(event)}\n`);
    }
  };

  try {
    const { slice, totalMatchingPool } = await selectCandidateSlice(params);
    let scannedCount = 0;
    let availableCount = 0;
    let takenCount = 0;

    await runWithConcurrency(
      slice,
      6,
      () => aborted,
      async (entry) => {
        if (aborted) return;
        const candidate = await verifyLexiconCandidate(entry, Boolean(params.forceRefresh));
        scannedCount += 1;

        if (candidate.status === 'available') {
          availableCount += 1;
        } else if (candidate.status === 'taken') {
          takenCount += 1;
        }

        emit({ type: 'candidate', candidate });
        emit({
          type: 'progress',
          scannedCount,
          totalBatchCandidates: slice.length,
          availableCount,
          takenCount,
          currentWord: entry.word,
        });
      },
    );

    emit({
      type: 'done',
      scannedCount,
      availableCount,
      takenCount,
      nextOffset: params.offset + slice.length,
      totalMatchingPool,
    });
  } catch (err) {
    emit({
      type: 'error',
      message: err instanceof Error ? err.message : 'Discovery pipeline error',
    });
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}

async function handleQuickCheck(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await parseJsonBody<QuickCheckRequest>(req);
  const uniqueWords = Array.from(
    new Set(
      (body.words ?? [])
        .map((w) => normalizeBrandWord(w))
        .filter((w) => w.length >= 2 && w.length <= 32),
    ),
  ).slice(0, 300);

  const results: BrandCandidate[] = new Array(uniqueWords.length);
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  await runWithConcurrency(
    uniqueWords,
    6,
    () => aborted,
    async (word, index) => {
      const entry: RawLexiconEntry = {
        word,
        source: 'world-dictionary',
        languageOrigin: 'Direct Team Check',
      };
      results[index] = await verifyLexiconCandidate(entry, Boolean(body.forceRefresh));
    },
  );

  const valid = results.filter(Boolean);
  const responsePayload: QuickCheckResponse = {
    results: valid,
    availableCount: valid.filter((r) => r.status === 'available').length,
    takenCount: valid.filter((r) => r.status === 'taken').length,
  };

  sendJson(res, 200, responsePayload);
}

async function handleBrandInspect(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await parseJsonBody<{ word: string }>(req);
  const cleanWord = normalizeBrandWord(body.word ?? '');

  if (cleanWord.length < 2) {
    sendJson(res, 400, { error: 'Provide a valid alphabetic brand name.' });
    return;
  }

  const tldList = ['com', 'io', 'ai', 'dev', 'co', 'org', 'net', 'xyz'];
  const [tlds, dictInfo] = await Promise.all([
    Promise.all(tldList.map((tld) => verifyDomainAvailability(cleanWord, tld, false))),
    lookupFreeDictionaryDetails(cleanWord),
  ]);

  const payload: BrandInspectionResponse = {
    word: cleanWord,
    tlds,
    phoneticIpa: dictInfo.phoneticIpa,
    originNote: dictInfo.originNote,
    definitions: dictInfo.definitions,
  };

  sendJson(res, 200, payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      const [worldCount, cachedCount] = await Promise.all([
        getSystemDictionaryCount(),
        getCachedDomainCount(),
      ]);
      const payload: DictionaryStatsResponse = {
        worldDictionaryCount: worldCount,
        multilingualRootsCount: loadMultilingualLexicon().length,
        cachedDomainsCount: cachedCount,
        liveApiConnected: true,
      };
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/discover/stream') {
      await handleDiscoverStream(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/domain/check') {
      await handleQuickCheck(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/domain/inspect') {
      await handleBrandInspect(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/export/pdf') {
      const payload = await parseJsonBody<ExportReportPayload>(req);
      const pdfBuffer = generateBrandReportPdf(payload);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="mother-brand-report.pdf"',
        'Content-Length': String(pdfBuffer.length),
      });
      res.end(pdfBuffer);
      return;
    }

    // Serve built frontend assets when running standalone via `npm start`
    if (existsSync(DIST_DIR)) {
      const requested = url.pathname === '/' ? '/index.html' : url.pathname;
      const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(DIST_DIR, safePath);
      const targetFile = existsSync(fullPath) ? fullPath : path.join(DIST_DIR, 'index.html');

      if (existsSync(targetFile)) {
        const ext = path.extname(targetFile);
        const content = await readFile(targetFile);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        });
        res.end(content);
        return;
      }
    }

    sendJson(res, 404, { error: 'Route not found' });
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Unexpected server error',
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Brand Finder server listening on http://127.0.0.1:${PORT}`);
});

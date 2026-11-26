import type {
  BrandInspectionResponse,
  DictionaryStatsResponse,
  DiscoveryFilterParams,
  DiscoveryStreamEvent,
  ExportReportPayload,
  QuickCheckResponse,
} from '../types/brand.ts';
import {
  buildStaticPdfReportBlob,
  getStaticDictionaryStats,
  inspectStaticBrandCandidate,
  runStaticQuickDomainCheck,
  streamStaticBrandDiscovery,
} from './staticEngine.ts';

// Remember when running on static hosting (no Node /api backend) so subsequent
// calls go straight to the browser-native RDAP + Datamuse engine.
let useStaticFallback = false;

function isMissingBackendResponse(res: Response, expectedMime: string): boolean {
  if (res.status === 404 || res.status === 405) return true;
  const contentType = res.headers.get('content-type') ?? '';
  return res.ok && !contentType.includes(expectedMime);
}

export async function fetchDictionaryStats(): Promise<DictionaryStatsResponse> {
  if (useStaticFallback) {
    return getStaticDictionaryStats();
  }

  const res = await fetch('/api/stats');
  if (isMissingBackendResponse(res, 'application/json')) {
    useStaticFallback = true;
    return getStaticDictionaryStats();
  }
  if (!res.ok) {
    throw new Error('Failed to load dictionary statistics');
  }
  return (await res.json()) as DictionaryStatsResponse;
}

export async function streamBrandDiscovery(
  params: DiscoveryFilterParams,
  signal: AbortSignal,
  onEvent: (event: DiscoveryStreamEvent) => void,
): Promise<void> {
  if (useStaticFallback) {
    await streamStaticBrandDiscovery(params, signal, onEvent);
    return;
  }

  const res = await fetch('/api/discover/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (isMissingBackendResponse(res, 'x-ndjson')) {
    useStaticFallback = true;
    await streamStaticBrandDiscovery(params, signal, onEvent);
    return;
  }

  if (!res.ok || !res.body) {
    throw new Error(`Discovery request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed) as DiscoveryStreamEvent;
      onEvent(parsed);
    }
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer.trim()) as DiscoveryStreamEvent);
  }
}

export async function runQuickDomainCheck(
  words: string[],
  forceRefresh = false,
): Promise<QuickCheckResponse> {
  if (useStaticFallback) {
    return runStaticQuickDomainCheck(words, forceRefresh);
  }

  const res = await fetch('/api/domain/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words, forceRefresh }),
  });

  if (isMissingBackendResponse(res, 'application/json')) {
    useStaticFallback = true;
    return runStaticQuickDomainCheck(words, forceRefresh);
  }

  if (!res.ok) {
    throw new Error('Domain verification failed');
  }

  return (await res.json()) as QuickCheckResponse;
}

export async function inspectBrandCandidate(
  word: string,
): Promise<BrandInspectionResponse> {
  if (useStaticFallback) {
    return inspectStaticBrandCandidate(word);
  }

  const res = await fetch('/api/domain/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word }),
  });

  if (isMissingBackendResponse(res, 'application/json')) {
    useStaticFallback = true;
    return inspectStaticBrandCandidate(word);
  }

  if (!res.ok) {
    throw new Error('Brand inspection request failed');
  }

  return (await res.json()) as BrandInspectionResponse;
}

export async function requestPdfReportBlob(
  payload: ExportReportPayload,
): Promise<Blob> {
  if (useStaticFallback) {
    return buildStaticPdfReportBlob(payload);
  }

  const res = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (isMissingBackendResponse(res, 'application/pdf')) {
    useStaticFallback = true;
    return buildStaticPdfReportBlob(payload);
  }

  if (!res.ok) {
    throw new Error('PDF report export failed');
  }

  return res.blob();
}

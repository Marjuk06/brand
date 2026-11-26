import type {
  BrandCandidate,
  ExportReportPayload,
} from '../../../src/types/brand.ts';

function sanitizePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

function formatClearMeaning(item: BrandCandidate): string {
  const raw = item.meaning?.trim() ?? '';
  if (!raw) {
    return item.languageOrigin || 'Dictionary word';
  }

  let cleaned = sanitizePdfText(raw)
    // Remove empty language glosses left behind after stripping non-ASCII scripts
    .replace(/\(\s*[A-Za-z-]+:\s*\)/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  // Drop trailing redundant "(WordNet Live Dictionary)" when a real definition exists
  cleaned = cleaned.replace(/\s*\(WordNet Live Dictionary\)\s*$/i, '').trim();

  return cleaned || item.languageOrigin || 'Dictionary word';
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return ['—'];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word.length > maxCharsPerLine ? truncateText(word, maxCharsPerLine) : word;
      continue;
    }

    if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      if (lines.length === maxLines) {
        lines[maxLines - 1] = truncateText(`${lines[maxLines - 1]} ${word}`, maxCharsPerLine);
        return lines;
      }
      current = word.length > maxCharsPerLine ? truncateText(word, maxCharsPerLine) : word;
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

function drawText(
  ops: string[],
  x: number,
  y: number,
  text: string,
  size: number,
  bold: boolean,
  rgb: [number, number, number],
): void {
  ops.push('BT');
  ops.push(`${bold ? '/F2' : '/F1'} ${size} Tf`);
  ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`);
  ops.push(`${x} ${y} Td (${sanitizePdfText(text)}) Tj`);
  ops.push('ET');
}

interface PreparedRow {
  rank: number;
  item: BrandCandidate;
  meaningLines: string[];
  rowHeight: number;
}

function paginateRows(candidates: BrandCandidate[]): PreparedRow[][] {
  const maxContentBottom = 46;
  const tableStartTop = 482;
  const pages: PreparedRow[][] = [];
  let currentPage: PreparedRow[] = [];
  let cursorY = tableStartTop;

  candidates.forEach((item, idx) => {
    const meaningLines = wrapText(formatClearMeaning(item), 82, 3);
    const rowHeight = Math.max(24, meaningLines.length * 11 + 12);

    if (currentPage.length > 0 && cursorY - rowHeight < maxContentBottom) {
      pages.push(currentPage);
      currentPage = [];
      cursorY = tableStartTop;
    }

    currentPage.push({
      rank: idx + 1,
      item,
      meaningLines,
      rowHeight,
    });
    cursorY -= rowHeight;
  });

  if (currentPage.length > 0 || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

function renderReportPageStream(
  title: string,
  filterSummary: string,
  rows: PreparedRow[],
  pageIndex: number,
  totalPages: number,
  totalCandidates: number,
  availableTotal: number,
): string {
  const ops: string[] = [];

  // Minimal monochrome header banner (A4 Landscape: 842 x 595 pt)
  ops.push('0.07 0.07 0.08 rg');
  ops.push('36 516 770 46 re f');

  drawText(ops, 48, 542, truncateText(title, 78), 13.5, true, [1, 1, 1]);

  const subtitle = [
    `Filter: ${filterSummary}`,
    `Total: ${totalCandidates}`,
    `Available: ${availableTotal}`,
  ].join('   |   ');
  drawText(
    ops,
    48,
    526,
    truncateText(subtitle, 128),
    8.5,
    false,
    [0.74, 0.74, 0.78],
  );

  // Minimal table header bar
  ops.push('0.95 0.95 0.96 rg');
  ops.push('36 482 770 22 re f');
  ops.push('0.18 0.18 0.21 RG');
  ops.push('0.8 w');
  ops.push('36 482 m 806 482 l S');

  const columns: Array<{ x: number; label: string }> = [
    { x: 46, label: '#' },
    { x: 76, label: 'Brand' },
    { x: 180, label: '.com Domain' },
    { x: 302, label: 'Status' },
    { x: 378, label: 'Meaning' },
  ];

  for (const col of columns) {
    drawText(ops, col.x, 490, col.label, 8.5, true, [0.12, 0.12, 0.15]);
  }

  let rowTop = 482;

  rows.forEach((prepared, idx) => {
    const { rank, item, meaningLines, rowHeight } = prepared;
    const rowBottom = rowTop - rowHeight;

    if (idx % 2 === 1) {
      ops.push('0.98 0.98 0.99 rg');
      ops.push(`36 ${rowBottom} 770 ${rowHeight} re f`);
    }

    ops.push('0.90 0.90 0.92 RG');
    ops.push('0.4 w');
    ops.push(`36 ${rowBottom} m 806 ${rowBottom} l S`);

    const primaryTextY = rowTop - 15;
    drawText(ops, 46, primaryTextY, String(rank), 8.5, false, [0.46, 0.46, 0.52]);
    drawText(
      ops,
      76,
      primaryTextY,
      truncateText(item.displayName, 18),
      8.5,
      true,
      [0.06, 0.06, 0.08],
    );
    drawText(
      ops,
      180,
      primaryTextY,
      truncateText(item.domain, 22),
      8.5,
      false,
      [0.18, 0.22, 0.30],
    );

    if (item.status === 'available') {
      drawText(ops, 302, primaryTextY, 'AVAILABLE', 8, true, [0.04, 0.48, 0.28]);
    } else if (item.status === 'taken') {
      drawText(ops, 302, primaryTextY, 'TAKEN', 8, true, [0.65, 0.16, 0.20]);
    } else {
      drawText(ops, 302, primaryTextY, 'UNKNOWN', 8, false, [0.45, 0.45, 0.50]);
    }

    meaningLines.forEach((line, lineIdx) => {
      drawText(
        ops,
        378,
        primaryTextY - lineIdx * 11,
        line,
        8.5,
        false,
        [0.24, 0.24, 0.30],
      );
    });

    rowTop = rowBottom;
  });

  // Outer table border
  const tableHeight = 504 - rowTop;
  ops.push('0.84 0.84 0.88 RG');
  ops.push('0.6 w');
  ops.push(`36 ${rowTop} 770 ${tableHeight} re S`);

  // Minimal footer
  const generatedStamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  drawText(
    ops,
    36,
    22,
    `Brand Finder  |  Generated ${generatedStamp} UTC`,
    8,
    false,
    [0.48, 0.48, 0.54],
  );
  drawText(
    ops,
    750,
    22,
    `Page ${pageIndex + 1} of ${totalPages}`,
    8,
    false,
    [0.48, 0.48, 0.54],
  );

  return ops.join('\n');
}

export function generateBrandReportPdf(
  payload: ExportReportPayload,
): Uint8Array<ArrayBuffer> {
  const pages = paginateRows(payload.candidates);
  const totalPages = pages.length;
  const availableTotal = payload.candidates.filter(
    (c) => c.status === 'available',
  ).length;
  const encoder = new TextEncoder();

  const pageStreams = pages.map((chunk, p) =>
    renderReportPageStream(
      payload.title || 'Brand Name & .com Availability Report',
      payload.filterSummary || 'All Selected Candidates',
      chunk,
      p,
      totalPages,
      payload.candidates.length,
      availableTotal,
    ),
  );

  const objects: string[] = [];
  const pageKids: string[] = [];

  for (let i = 0; i < totalPages; i += 1) {
    pageKids.push(`${5 + i * 2} 0 R`);
  }

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${totalPages} >>\nendobj`,
  );
  objects.push(
    '3 0 obj\n' +
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n' +
      'endobj',
  );
  objects.push(
    '4 0 obj\n' +
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n' +
      'endobj',
  );

  for (let i = 0; i < totalPages; i += 1) {
    const pageObjId = 5 + i * 2;
    const contentObjId = 6 + i * 2;
    const stream = pageStreams[i];
    const byteLen = encoder.encode(stream).length;

    objects.push(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\nendobj`,
    );
    objects.push(
      `${contentObjId} 0 obj\n<< /Length ${byteLen} >>\nstream\n${stream}\nendstream\nendobj`,
    );
  }

  let pdfBody = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(encoder.encode(pdfBody).length);
    pdfBody += `${obj}\n`;
  }

  const xrefStart = encoder.encode(pdfBody).length;
  pdfBody += `xref\n0 ${objects.length + 1}\n`;
  pdfBody += '0000000000 65535 f \n';

  for (let i = 1; i < offsets.length; i += 1) {
    pdfBody += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfBody +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  return encoder.encode(pdfBody);
}

import type {
  BrandCandidate,
  ExportReportPayload,
} from '../../../src/types/brand.ts';

function sanitizePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
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

function renderReportPageStream(
  title: string,
  filterSummary: string,
  rows: BrandCandidate[],
  pageIndex: number,
  totalPages: number,
  startRank: number,
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
  ops.push('36 484 770 22 re f');
  ops.push('0.18 0.18 0.21 RG');
  ops.push('0.8 w');
  ops.push('36 484 m 806 484 l S');

  const columns: Array<{ x: number; label: string }> = [
    { x: 44, label: '#' },
    { x: 76, label: 'Brand' },
    { x: 180, label: '.com Domain' },
    { x: 302, label: 'Status' },
    { x: 378, label: 'Len / Syl' },
    { x: 434, label: 'Smooth' },
    { x: 490, label: 'Definition / Origin' },
  ];

  for (const col of columns) {
    drawText(ops, col.x, 492, col.label, 8.5, true, [0.12, 0.12, 0.15]);
  }

  let y = 464;
  const rowHeight = 20;

  rows.forEach((item, idx) => {
    const rank = startRank + idx + 1;

    if (idx % 2 === 1) {
      ops.push('0.98 0.98 0.99 rg');
      ops.push(`36 ${y - 5} 770 ${rowHeight} re f`);
    }

    ops.push('0.90 0.90 0.92 RG');
    ops.push('0.4 w');
    ops.push(`36 ${y - 5} m 806 ${y - 5} l S`);

    drawText(ops, 44, y + 2, String(rank), 8.5, false, [0.46, 0.46, 0.52]);
    drawText(
      ops,
      76,
      y + 2,
      truncateText(item.displayName, 18),
      8.5,
      true,
      [0.06, 0.06, 0.08],
    );
    drawText(
      ops,
      180,
      y + 2,
      truncateText(item.domain, 22),
      8.5,
      false,
      [0.18, 0.22, 0.30],
    );

    if (item.status === 'available') {
      drawText(ops, 302, y + 2, 'AVAILABLE', 8, true, [0.04, 0.48, 0.28]);
    } else if (item.status === 'taken') {
      drawText(ops, 302, y + 2, 'TAKEN', 8, true, [0.65, 0.16, 0.20]);
    } else {
      drawText(ops, 302, y + 2, 'UNKNOWN', 8, false, [0.45, 0.45, 0.50]);
    }

    drawText(
      ops,
      378,
      y + 2,
      `${item.length}L / ${item.syllables}S`,
      8.5,
      false,
      [0.24, 0.24, 0.28],
    );
    drawText(
      ops,
      434,
      y + 2,
      `${item.smoothnessScore}/99`,
      8.5,
      false,
      [0.24, 0.24, 0.28],
    );

    const meaningSummary = item.meaning
      ? `${item.meaning} (${item.languageOrigin})`
      : item.languageOrigin;
    drawText(
      ops,
      490,
      y + 2,
      truncateText(meaningSummary, 64),
      8.5,
      false,
      [0.28, 0.28, 0.34],
    );

    y -= rowHeight;
  });

  // Subtle outer table border
  const tableBottom = 464 - rows.length * rowHeight + 15;
  ops.push('0.84 0.84 0.88 RG');
  ops.push('0.6 w');
  ops.push(`36 ${tableBottom} 770 ${506 - tableBottom} re S`);

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
  const rowsPerPage = 21;
  const allRows = payload.candidates;
  const totalPages = Math.max(1, Math.ceil(allRows.length / rowsPerPage));
  const availableTotal = allRows.filter((c) => c.status === 'available').length;
  const encoder = new TextEncoder();

  const pageStreams: string[] = [];
  for (let p = 0; p < totalPages; p += 1) {
    const chunk = allRows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    pageStreams.push(
      renderReportPageStream(
        payload.title || 'Brand Name & .com Availability Report',
        payload.filterSummary || 'All Selected Candidates',
        chunk,
        p,
        totalPages,
        p * rowsPerPage,
        allRows.length,
        availableTotal,
      ),
    );
  }

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

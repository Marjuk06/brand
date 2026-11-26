import type { BrandCandidate, ExportReportPayload } from '../../../src/types/brand.ts';

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

function renderReportPageStream(
  title: string,
  filterSummary: string,
  rows: BrandCandidate[],
  pageIndex: number,
  totalPages: number,
  startRank: number,
  totalCandidates: number,
): string {
  const ops: string[] = [];

  // Page dimensions: A4 Landscape (842 x 595 pt)
  // Header banner
  ops.push('0.07 0.09 0.16 rg');
  ops.push('36 515 770 52 re f');

  ops.push('BT');
  ops.push('/F2 15 Tf');
  ops.push('1 1 1 rg');
  ops.push(`50 544 Td (${sanitizePdfText(truncateText(title, 78))}) Tj`);
  ops.push('ET');

  ops.push('BT');
  ops.push('/F1 9 Tf');
  ops.push('0.72 0.78 0.90 rg');
  const subtitle = [
    'Founder: Marjuk Amin',
    `Filter: ${filterSummary}`,
    `Total Exported: ${totalCandidates}`,
  ].join('  |  ');
  ops.push(`50 527 Td (${sanitizePdfText(truncateText(subtitle, 125))}) Tj`);
  ops.push('ET');

  // Table header bar
  ops.push('0.14 0.19 0.30 rg');
  ops.push('36 486 770 22 re f');

  const columns: Array<{ x: number; label: string }> = [
    { x: 44, label: '#' },
    { x: 74, label: 'Brand Name' },
    { x: 170, label: '.com Domain' },
    { x: 282, label: 'Status' },
    { x: 356, label: 'Len / Syl' },
    { x: 416, label: 'Smooth' },
    { x: 468, label: 'Ecosystem Subdomain & Email' },
    { x: 642, label: 'Origin / Meaning' },
  ];

  for (const col of columns) {
    ops.push('BT');
    ops.push('/F2 8.5 Tf');
    ops.push('0.95 0.97 1 rg');
    ops.push(`${col.x} 494 Td (${sanitizePdfText(col.label)}) Tj`);
    ops.push('ET');
  }

  let y = 466;
  const rowHeight = 20;

  rows.forEach((item, idx) => {
    const rank = startRank + idx + 1;

    if (idx % 2 === 1) {
      ops.push('0.96 0.97 0.99 rg');
      ops.push(`36 ${y - 5} 770 ${rowHeight} re f`);
    }

    // Subtle row divider
    ops.push('0.88 0.90 0.94 RG');
    ops.push('0.4 w');
    ops.push(`36 ${y - 5} m 806 ${y - 5} l S`);

    const drawCell = (
      x: number,
      value: string,
      bold = false,
      rgb: [number, number, number] = [0.1, 0.13, 0.2],
    ): void => {
      ops.push('BT');
      ops.push(`${bold ? '/F2' : '/F1'} 8.5 Tf`);
      ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`);
      ops.push(`${x} ${y + 2} Td (${sanitizePdfText(value)}) Tj`);
      ops.push('ET');
    };

    drawCell(44, String(rank), false, [0.42, 0.46, 0.55]);
    drawCell(74, item.displayName, true, [0.06, 0.09, 0.18]);
    drawCell(170, item.domain, false, [0.15, 0.25, 0.48]);

    if (item.status === 'available') {
      drawCell(282, 'AVAILABLE', true, [0.04, 0.48, 0.28]);
    } else if (item.status === 'taken') {
      drawCell(282, 'TAKEN', true, [0.68, 0.16, 0.2]);
    } else {
      drawCell(282, 'UNVERIFIED', false, [0.45, 0.45, 0.5]);
    }

    drawCell(356, `${item.length}L / ${item.syllables}S`);
    drawCell(416, `${item.smoothnessScore}/99`);
    drawCell(
      468,
      truncateText(`web.${item.domain} | team@${item.domain}`, 33),
      false,
      [0.24, 0.28, 0.36],
    );

    const meaningSummary = item.meaning
      ? `${item.languageOrigin}: ${item.meaning}`
      : item.languageOrigin;
    drawCell(642, truncateText(meaningSummary, 31), false, [0.3, 0.34, 0.42]);

    y -= rowHeight;
  });

  // Footer
  ops.push('BT');
  ops.push('/F1 8 Tf');
  ops.push('0.45 0.49 0.56 rg');
  const generatedStamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  ops.push(
    `36 22 Td (Brand Finder  |  Generated ${generatedStamp} UTC) Tj`,
  );
  ops.push(`735 22 Td (Page ${pageIndex + 1} of ${totalPages}) Tj`);
  ops.push('ET');

  return ops.join('\n');
}

export function generateBrandReportPdf(payload: ExportReportPayload): Buffer {
  const rowsPerPage = 21;
  const allRows = payload.candidates;
  const totalPages = Math.max(1, Math.ceil(allRows.length / rowsPerPage));

  const pageStreams: string[] = [];
  for (let p = 0; p < totalPages; p += 1) {
    const chunk = allRows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    pageStreams.push(
      renderReportPageStream(
        payload.title || 'Mother Brand & .com Availability Report',
        payload.filterSummary || 'All Selected Candidates',
        chunk,
        p,
        totalPages,
        p * rowsPerPage,
        allRows.length,
      ),
    );
  }

  // Object IDs:
  // 1: Catalog, 2: Pages, 3: Helvetica (/F1), 4: Helvetica-Bold (/F2)
  // For each page i: pageObj = 5 + i*2, contentObj = 6 + i*2
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
    const byteLen = Buffer.byteLength(stream, 'ascii');

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
    offsets.push(Buffer.byteLength(pdfBody, 'ascii'));
    pdfBody += `${obj}\n`;
  }

  const xrefStart = Buffer.byteLength(pdfBody, 'ascii');
  pdfBody += `xref\n0 ${objects.length + 1}\n`;
  pdfBody += '0000000000 65535 f \n';

  for (let i = 1; i < offsets.length; i += 1) {
    pdfBody += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfBody +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdfBody, 'ascii');
}

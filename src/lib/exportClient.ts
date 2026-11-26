import type { BrandCandidate } from '../types/brand.ts';
import { requestPdfReportBlob } from './apiClient.ts';

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeCsvCell(value: string | number | undefined): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildExportFilename(
  prefix: string,
  filterSummary: string,
  count: number,
  extension: 'csv' | 'json' | 'pdf',
): string {
  const slug = filterSummary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const parts = [prefix, slug, `${count}items`, `${datePart}-${timePart}`].filter(
    Boolean,
  );
  return `${parts.join('-')}.${extension}`;
}

export function exportCandidatesAsCsv(
  candidates: BrandCandidate[],
  filenamePrefix = 'mother-brand-candidates',
  filterSummary = '',
): void {
  const headers = [
    'Brand Name',
    'Domain (.com)',
    'Availability Status',
    'Verification Source',
    'Length',
    'Syllables',
    'Starts With',
    'Ending Sound',
    'Smoothness Score',
    'Pronunciation Guide',
    'Language / Source',
    'Meaning / Root Note',
    'Subdomain Web',
    'Subdomain Edu',
    'Subdomain Design',
    'Founder Email',
    'Team Email',
    'Checked Timestamp',
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const item of candidates) {
    const row = [
      item.displayName,
      item.domain,
      item.status.toUpperCase(),
      item.verificationMethod,
      item.length,
      item.syllables,
      item.startsWith.toUpperCase(),
      `-${item.ending}`,
      item.smoothnessScore,
      item.pronunciationHint,
      item.languageOrigin,
      item.meaning ?? '',
      `web.${item.domain}`,
      `edu.${item.domain}`,
      `design.${item.domain}`,
      `marjuk@${item.domain}`,
      `team@${item.domain}`,
      item.checkedAt,
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  }

  const csvContent = `\uFEFF${lines.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(
    blob,
    buildExportFilename(filenamePrefix, filterSummary, candidates.length, 'csv'),
  );
}

export function exportCandidatesAsJson(
  candidates: BrandCandidate[],
  filterSummary: string,
  filenamePrefix = 'mother-brand-candidates',
): void {
  const payload = {
    generatedAt: new Date().toISOString(),
    founder: 'Marjuk Amin',
    filterSummary,
    totalCount: candidates.length,
    availableDotComCount: candidates.filter((c) => c.status === 'available').length,
    candidates: candidates.map((item) => ({
      ...item,
      ecosystemPreview: {
        subBrands: [
          `${item.displayName} Web`,
          `${item.displayName} Edu`,
          `${item.displayName} Design`,
          `${item.displayName} AI`,
        ],
        subdomains: [
          `web.${item.domain}`,
          `edu.${item.domain}`,
          `design.${item.domain}`,
          `support.${item.domain}`,
        ],
        emails: [`marjuk@${item.domain}`, `team@${item.domain}`, `hello@${item.domain}`],
      },
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  triggerBlobDownload(
    blob,
    buildExportFilename(filenamePrefix, filterSummary, candidates.length, 'json'),
  );
}

export async function exportCandidatesAsPdf(
  candidates: BrandCandidate[],
  title: string,
  filterSummary: string,
  filenamePrefix = 'mother-brand-report',
): Promise<void> {
  const blob = await requestPdfReportBlob({
    title,
    filterSummary,
    candidates,
  });
  triggerBlobDownload(
    blob,
    buildExportFilename(filenamePrefix, filterSummary, candidates.length, 'pdf'),
  );
}

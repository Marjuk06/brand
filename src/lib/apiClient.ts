import type {
  BrandInspectionResponse,
  DictionaryStatsResponse,
  DiscoveryFilterParams,
  DiscoveryStreamEvent,
  ExportReportPayload,
  QuickCheckResponse,
} from '../types/brand.ts';

export async function fetchDictionaryStats(): Promise<DictionaryStatsResponse> {
  const res = await fetch('/api/stats');
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
  const res = await fetch('/api/discover/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

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
  const res = await fetch('/api/domain/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words, forceRefresh }),
  });

  if (!res.ok) {
    throw new Error('Domain verification failed');
  }

  return (await res.json()) as QuickCheckResponse;
}

export async function inspectBrandCandidate(
  word: string,
): Promise<BrandInspectionResponse> {
  const res = await fetch('/api/domain/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word }),
  });

  if (!res.ok) {
    throw new Error('Brand inspection request failed');
  }

  return (await res.json()) as BrandInspectionResponse;
}

export async function requestPdfReportBlob(
  payload: ExportReportPayload,
): Promise<Blob> {
  const res = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error('Failed to generate PDF report');
  }

  return await res.blob();
}

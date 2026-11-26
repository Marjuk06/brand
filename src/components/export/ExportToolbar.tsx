import { useState } from 'react';
import type { BrandCandidate } from '../../types/brand.ts';
import {
  exportCandidatesAsCsv,
  exportCandidatesAsJson,
  exportCandidatesAsPdf,
} from '../../lib/exportClient.ts';
import { DownloadIcon } from '../ui/Icons.tsx';
import { haptics } from '../../lib/haptics.ts';

interface ExportToolbarProps {
  candidates: BrandCandidate[];
  reportTitle: string;
  filterSummary: string;
  filenamePrefix: string;
}

export function ExportToolbar({
  candidates,
  reportTitle,
  filterSummary,
  filenamePrefix,
}: ExportToolbarProps) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const disabled = candidates.length === 0;

  const handlePdfExport = async (): Promise<void> => {
    if (disabled || isExportingPdf) return;
    haptics.trigger('select');
    setIsExportingPdf(true);
    setExportError(null);
    try {
      await exportCandidatesAsPdf(
        candidates,
        reportTitle,
        filterSummary,
        filenamePrefix,
      );
      haptics.trigger('success');
    } catch (err) {
      haptics.trigger('error');
      setExportError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="cluster">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled}
        onClick={() => {
          haptics.trigger('select');
          exportCandidatesAsCsv(candidates, filenamePrefix, filterSummary);
        }}
      >
        <DownloadIcon size={13} />
        <span>CSV</span>
      </button>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled}
        onClick={() => {
          haptics.trigger('select');
          exportCandidatesAsJson(candidates, filterSummary, filenamePrefix);
        }}
      >
        <DownloadIcon size={13} />
        <span>JSON</span>
      </button>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled || isExportingPdf}
        onClick={() => {
          void handlePdfExport();
        }}
      >
        <DownloadIcon size={13} />
        <span>{isExportingPdf ? 'PDF...' : 'PDF'}</span>
      </button>

      {exportError && (
        <span role="alert" className="badge badge-unknown">
          {exportError}
        </span>
      )}
    </div>
  );
}

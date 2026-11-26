import type { BrandCandidate } from '../../types/brand.ts';
import { ExportToolbar } from '../export/ExportToolbar.tsx';
import { haptics } from '../../lib/haptics.ts';

export type ResultVisibilityMode = 'available-only' | 'all-checked';

interface PipelineStatusBarProps {
  isScanning: boolean;
  scannedCount: number;
  batchTarget: number;
  availableCount: number;
  takenCount: number;
  totalMatchingPool: number;
  nextOffset: number;
  currentWord: string;
  visibilityMode: ResultVisibilityMode;
  searchWithin: string;
  visibleCandidates: BrandCandidate[];
  filterSummary: string;
  onChangeVisibility: (mode: ResultVisibilityMode) => void;
  onChangeSearchWithin: (query: string) => void;
  onScanNextBatch: () => void;
  onStopScan: () => void;
  onClearResults: () => void;
}

export function PipelineStatusBar({
  isScanning,
  scannedCount,
  batchTarget,
  availableCount,
  takenCount,
  totalMatchingPool,
  nextOffset,
  currentWord,
  visibilityMode,
  searchWithin,
  visibleCandidates,
  filterSummary,
  onChangeVisibility,
  onChangeSearchWithin,
  onScanNextBatch,
  onStopScan,
  onClearResults,
}: PipelineStatusBarProps) {
  const progressPercent =
    batchTarget > 0
      ? Math.min(100, Math.round((scannedCount / batchTarget) * 100))
      : 0;

  const hasMoreInPool = nextOffset > 0 && nextOffset < totalMatchingPool;

  return (
    <section
      className="surface-card status-bar"
      aria-label="Scan Status and Exports"
    >
      <div className="status-bar-row">
        <div className="metrics-line mono">
          <span>
            Pool <strong>{totalMatchingPool.toLocaleString()}</strong>
          </span>
          <span>
            Checked <strong>{scannedCount}</strong>
          </span>
          <span>
            Available <strong>{availableCount}</strong>
          </span>
          <span>
            Taken <strong>{takenCount}</strong>
          </span>
          {isScanning && currentWord && (
            <span className="text-muted">{currentWord}.com</span>
          )}
        </div>

        <div className="cluster">
          {isScanning ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                haptics.trigger('toggleOff');
                onStopScan();
              }}
            >
              Stop
            </button>
          ) : (
            hasMoreInPool && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  haptics.trigger('select');
                  onScanNextBatch();
                }}
              >
                Next Batch
              </button>
            )
          )}

          {(availableCount > 0 || takenCount > 0) && !isScanning && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                haptics.trigger('tap');
                onClearResults();
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {(isScanning || scannedCount > 0) && (
        <div className="progress-track" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="status-bar-row">
        <div className="cluster">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-pressed={visibilityMode === 'available-only'}
            onClick={() => {
              haptics.trigger('select');
              onChangeVisibility('available-only');
            }}
          >
            Available ({availableCount})
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-pressed={visibilityMode === 'all-checked'}
            onClick={() => {
              haptics.trigger('select');
              onChangeVisibility('all-checked');
            }}
          >
            All ({availableCount + takenCount})
          </button>

          <div className="inline-search">
            <label htmlFor="filter-results-search" className="visually-hidden">
              Filter results
            </label>
            <input
              id="filter-results-search"
              name="searchWithin"
              type="search"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Filter list..."
              value={searchWithin}
              onChange={(e) => onChangeSearchWithin(e.target.value)}
            />
          </div>
        </div>

        <ExportToolbar
          candidates={visibleCandidates}
          reportTitle="Brand Name & .com Availability Report"
          filterSummary={filterSummary}
          filenamePrefix="brand-discovery"
        />
      </div>
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BrandCandidate,
  DiscoveryFilterParams,
} from './types/brand.ts';
import { streamBrandDiscovery } from './lib/apiClient.ts';
import { FilterPanel } from './components/discovery/FilterPanel.tsx';
import {
  PipelineStatusBar,
  type ResultVisibilityMode,
} from './components/discovery/PipelineStatusBar.tsx';
import { BrandResultsTable } from './components/results/BrandResultsTable.tsx';
import { QuickDomainChecker } from './components/checker/QuickDomainChecker.tsx';
import { BrandInspectorDialog } from './components/inspector/BrandInspectorDialog.tsx';
import { ExportToolbar } from './components/export/ExportToolbar.tsx';
import {
  LiquidGlassNav,
  type GlassNavItem,
} from './components/nav/LiquidGlassNav.tsx';
import {
  BookmarkIcon,
  CompassIcon,
  GlobeCheckIcon,
} from './components/ui/Icons.tsx';
import { InstallAppButton } from './components/pwa/InstallAppButton.tsx';
import { haptics } from './lib/haptics.ts';

type WorkspaceTabId = 'discovery' | 'checker' | 'shortlist';

const SHORTLIST_STORAGE_KEY = 'brandfinder.shortlist.v1';

const DEFAULT_FILTERS: DiscoveryFilterParams = {
  source: 'world-dictionary',
  startsWith: 'all',
  exactLength: null,
  minLength: 4,
  maxLength: 7,
  endingCategory: 'any',
  customEnding: '',
  containsText: '',
  conceptQuery: '',
  wordOrder: 'uncommon-first',
  minSmoothness: 55,
  onlySmoothPronunciation: true,
  batchSize: 50,
  offset: 0,
};

function loadInitialShortlist(): BrandCandidate[] {
  try {
    const raw = localStorage.getItem(SHORTLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BrandCandidate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('discovery');

  const [filters, setFilters] = useState<DiscoveryFilterParams>(DEFAULT_FILTERS);
  const [discoveredMap, setDiscoveredMap] = useState<
    Map<string, BrandCandidate>
  >(() => new Map());

  const [isScanning, setIsScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);
  const [takenCount, setTakenCount] = useState(0);
  const [totalMatchingPool, setTotalMatchingPool] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  const [visibilityMode, setVisibilityMode] =
    useState<ResultVisibilityMode>('available-only');
  const [searchWithin, setSearchWithin] = useState('');
  const [lastScannedSummary, setLastScannedSummary] = useState('');

  const [shortlist, setShortlist] = useState<BrandCandidate[]>(
    loadInitialShortlist,
  );
  const [inspectedCandidate, setInspectedCandidate] =
    useState<BrandCandidate | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const celebratedAvailableRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(shortlist));
    } catch {
      // Ignore storage quota errors
    }
  }, [shortlist]);

  const shortlistedWords = useMemo(
    () => new Set(shortlist.map((item) => item.word)),
    [shortlist],
  );

  const toggleShortlist = useCallback((candidate: BrandCandidate): void => {
    setShortlist((prev) => {
      const exists = prev.some((c) => c.word === candidate.word);
      if (exists) {
        return prev.filter((c) => c.word !== candidate.word);
      }
      return [candidate, ...prev];
    });
  }, []);

  const runScan = useCallback(
    async (scanParams: DiscoveryFilterParams, appendResults: boolean) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!appendResults) {
        setDiscoveredMap(new Map());
      }

      celebratedAvailableRef.current = false;
      setIsScanning(true);
      setScannedCount(0);
      setAvailableCount(0);
      setTakenCount(0);
      setScanError(null);

      // Batch incoming stream events per animation frame to avoid re-rendering
      // the full candidate table on every single domain result.
      let pendingCandidates: BrandCandidate[] = [];
      let pendingProgress: {
        scannedCount: number;
        availableCount: number;
        takenCount: number;
        currentWord: string;
      } | null = null;
      let rafId: number | null = null;

      const flushBufferedEvents = (): void => {
        rafId = null;
        if (pendingCandidates.length > 0) {
          const batch = pendingCandidates;
          pendingCandidates = [];
          setDiscoveredMap((prev) => {
            const next = new Map(prev);
            for (const candidate of batch) {
              next.set(candidate.word, candidate);
            }
            return next;
          });
        }
        if (pendingProgress) {
          const prog = pendingProgress;
          pendingProgress = null;
          setScannedCount(prog.scannedCount);
          setAvailableCount(prog.availableCount);
          setTakenCount(prog.takenCount);
          setCurrentWord(prog.currentWord);
        }
      };

      const scheduleFlush = (): void => {
        if (rafId === null) {
          rafId = window.requestAnimationFrame(flushBufferedEvents);
        }
      };

      try {
        await streamBrandDiscovery(scanParams, controller.signal, (event) => {
          if (event.type === 'candidate') {
            pendingCandidates.push(event.candidate);
            if (
              event.candidate.status === 'available' &&
              !celebratedAvailableRef.current
            ) {
              celebratedAvailableRef.current = true;
              haptics.trigger('success');
            }
            scheduleFlush();
          } else if (event.type === 'progress') {
            pendingProgress = {
              scannedCount: event.scannedCount,
              availableCount: event.availableCount,
              takenCount: event.takenCount,
              currentWord: event.currentWord,
            };
            scheduleFlush();
          } else if (event.type === 'done') {
            if (rafId !== null) {
              window.cancelAnimationFrame(rafId);
            }
            flushBufferedEvents();
            setTotalMatchingPool(event.totalMatchingPool);
            setNextOffset(event.nextOffset);
          } else if (event.type === 'error') {
            if (rafId !== null) {
              window.cancelAnimationFrame(rafId);
            }
            flushBufferedEvents();
            haptics.trigger('error');
            setScanError(event.message);
          }
        });
      } catch (err) {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }
        flushBufferedEvents();
        if ((err as Error).name !== 'AbortError') {
          haptics.trigger('error');
          setScanError(
            err instanceof Error ? err.message : 'Discovery scan interrupted',
          );
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setIsScanning(false);
        }
      }
    },
    [],
  );

  const formatFilterSummary = useCallback(
    (target: DiscoveryFilterParams): string => {
      const lenLabel =
        target.exactLength !== null
          ? `${target.exactLength}L`
          : `${target.minLength}-${target.maxLength}L`;
      const startLabel =
        target.startsWith === 'all'
          ? 'A-Z'
          : `Starts ${target.startsWith.toUpperCase()}`;
      return `${target.source} | ${startLabel} | ${lenLabel}`;
    },
    [],
  );

  const handleStartFreshScan = (): void => {
    const fresh = { ...filters, offset: 0 };
    setFilters(fresh);
    setLastScannedSummary(formatFilterSummary(fresh));
    void runScan(fresh, false);
  };

  const handleScanNextBatch = (): void => {
    const nextParams = { ...filters, offset: nextOffset };
    setFilters(nextParams);
    setLastScannedSummary(formatFilterSummary(nextParams));
    void runScan(nextParams, true);
  };

  const handleStopScan = (): void => {
    abortControllerRef.current?.abort();
    setIsScanning(false);
  };

  const allDiscovered = useMemo(
    () => Array.from(discoveredMap.values()),
    [discoveredMap],
  );

  const totalAvailableInList = useMemo(
    () => allDiscovered.filter((c) => c.status === 'available').length,
    [allDiscovered],
  );

  const totalTakenInList = useMemo(
    () => allDiscovered.filter((c) => c.status === 'taken').length,
    [allDiscovered],
  );

  const visibleCandidates = useMemo(() => {
    const query = searchWithin.trim().toLowerCase();
    return allDiscovered.filter((item) => {
      if (visibilityMode === 'available-only' && item.status !== 'available') {
        return false;
      }
      if (!query) return true;
      return (
        item.word.includes(query) ||
        item.languageOrigin.toLowerCase().includes(query) ||
        (item.meaning?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [allDiscovered, visibilityMode, searchWithin]);

  const activeSummary = useMemo(
    () => lastScannedSummary || formatFilterSummary(filters),
    [lastScannedSummary, formatFilterSummary, filters],
  );

  const discoveryEmptyMessage = useMemo(() => {
    if (isScanning) {
      return 'Scanning dictionary words and checking live .com availability...';
    }
    if (allDiscovered.length > 0 && visibilityMode === 'available-only') {
      return (
        `0 available .com domains in this batch (${totalTakenInList} taken). ` +
        'Click Next Batch to scan more words, or click All to inspect checked domains.'
      );
    }
    return 'Set filters above and click Scan Dictionary & .com.';
  }, [isScanning, allDiscovered.length, visibilityMode, totalTakenInList]);

  const navTabs: GlassNavItem<WorkspaceTabId>[] = useMemo(
    () => [
      {
        id: 'discovery',
        label: 'Discover',
        icon: () => <CompassIcon size={17} />,
      },
      {
        id: 'checker',
        label: 'Check',
        icon: () => <GlobeCheckIcon size={17} />,
      },
      {
        id: 'shortlist',
        label: 'Saved',
        badge: shortlist.length,
        icon: (active: boolean) => <BookmarkIcon size={17} filled={active} />,
      },
    ],
    [shortlist.length],
  );

  return (
    <div className="app-shell">
      <header className="top-header">
        <h1 className="brand-heading">Brand Finder</h1>
        <InstallAppButton />
      </header>

      <main>
        <LiquidGlassNav
          items={navTabs}
          activeId={activeTab}
          onSelect={setActiveTab}
        />

        <div
          role="tabpanel"
          aria-labelledby="tab-discovery"
          hidden={activeTab !== 'discovery'}
        >
          <div className="stack">
            <FilterPanel
              filters={filters}
              isScanning={isScanning}
              onUpdateFilters={(patch) =>
                setFilters((prev) => ({ ...prev, ...patch }))
              }
              onStartFreshScan={handleStartFreshScan}
              onResetFilters={() => setFilters(DEFAULT_FILTERS)}
            />

            <PipelineStatusBar
              isScanning={isScanning}
              scannedCount={scannedCount}
              batchTarget={filters.batchSize}
              availableCount={
                allDiscovered.length > 0 ? totalAvailableInList : availableCount
              }
              takenCount={
                allDiscovered.length > 0 ? totalTakenInList : takenCount
              }
              totalMatchingPool={totalMatchingPool}
              nextOffset={nextOffset}
              currentWord={currentWord}
              visibilityMode={visibilityMode}
              searchWithin={searchWithin}
              visibleCandidates={visibleCandidates}
              filterSummary={activeSummary}
              onChangeVisibility={setVisibilityMode}
              onChangeSearchWithin={setSearchWithin}
              onScanNextBatch={handleScanNextBatch}
              onStopScan={handleStopScan}
              onClearResults={() => {
                setDiscoveredMap(new Map());
                setScannedCount(0);
                setAvailableCount(0);
                setTakenCount(0);
                setLastScannedSummary('');
              }}
            />

            {scanError && (
              <div role="alert" className="error-banner">
                {scanError}
              </div>
            )}

            <BrandResultsTable
              caption={`Results (${visibleCandidates.length} · ${activeSummary})`}
              candidates={visibleCandidates}
              shortlistedWords={shortlistedWords}
              onToggleShortlist={toggleShortlist}
              onInspectBrand={setInspectedCandidate}
              emptyMessage={discoveryEmptyMessage}
            />
          </div>
        </div>

        <div
          role="tabpanel"
          aria-labelledby="tab-checker"
          hidden={activeTab !== 'checker'}
        >
          <QuickDomainChecker
            shortlistedWords={shortlistedWords}
            onToggleShortlist={toggleShortlist}
            onInspectBrand={setInspectedCandidate}
          />
        </div>

        <div
          role="tabpanel"
          aria-labelledby="tab-shortlist"
          hidden={activeTab !== 'shortlist'}
        >
          <div className="stack">
            <section className="surface-card status-bar-row">
              <div className="metrics-line mono">
                <span>
                  Saved <strong>{shortlist.length}</strong>
                </span>
              </div>

              <div className="cluster">
                <ExportToolbar
                  candidates={shortlist}
                  reportTitle="Saved Brand Shortlist"
                  filterSummary={`Shortlist (${shortlist.length})`}
                  filenamePrefix="brand-shortlist"
                />

                {shortlist.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      haptics.trigger('toggleOff');
                      setShortlist([]);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </section>

            <BrandResultsTable
              caption={`Saved Shortlist (${shortlist.length})`}
              candidates={shortlist}
              shortlistedWords={shortlistedWords}
              onToggleShortlist={toggleShortlist}
              onInspectBrand={setInspectedCandidate}
              emptyMessage="No saved names yet."
            />
          </div>
        </div>
      </main>

      <BrandInspectorDialog
        candidate={inspectedCandidate}
        onClose={() => setInspectedCandidate(null)}
      />
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import type { BrandCandidate } from '../../types/brand.ts';
import { runQuickDomainCheck } from '../../lib/apiClient.ts';
import { BrandResultsTable } from '../results/BrandResultsTable.tsx';
import { ExportToolbar } from '../export/ExportToolbar.tsx';
import { GlobeCheckIcon } from '../ui/Icons.tsx';
import { haptics } from '../../lib/haptics.ts';

interface QuickDomainCheckerProps {
  shortlistedWords: ReadonlySet<string>;
  onToggleShortlist: (candidate: BrandCandidate) => void;
  onInspectBrand: (candidate: BrandCandidate) => void;
}

export function QuickDomainChecker({
  shortlistedWords,
  onToggleShortlist,
  onInspectBrand,
}: QuickDomainCheckerProps) {
  const [rawInput, setRawInput] = useState('');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<BrandCandidate[]>([]);

  const parseWords = (text: string): string[] =>
    text
      .split(/[\s,;|\r\n]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const words = parseWords(rawInput);

    if (words.length === 0) {
      haptics.trigger('error');
      setErrorMsg('Enter one or more words to verify .com availability.');
      return;
    }

    haptics.trigger('select');
    setIsChecking(true);
    setErrorMsg(null);
    try {
      const response = await runQuickDomainCheck(words, forceRefresh);
      setResults(response.results);
      if (response.availableCount > 0) {
        haptics.trigger('success');
      } else {
        haptics.trigger('tap');
      }
    } catch (err) {
      haptics.trigger('error');
      setErrorMsg(err instanceof Error ? err.message : 'Domain check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const availableCount = results.filter((r) => r.status === 'available').length;
  const takenCount = results.filter((r) => r.status === 'taken').length;

  return (
    <div className="stack">
      <section className="surface-card" aria-label="Direct .com Verification">
        <search>
          <form
            action="/check-domains"
            method="POST"
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
          >
            <div className="filter-field">
              <label htmlFor="quick-words-textarea" className="field-label">
                Words or Brand Names (space, comma, or newline separated)
              </label>
              <textarea
                id="quick-words-textarea"
                name="words"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Type or paste words to check live .com availability..."
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
              />
            </div>

            <div className="filter-actions-row">
              <label htmlFor="force-refresh-toggle" className="checkbox-inline">
                <input
                  id="force-refresh-toggle"
                  name="forceRefresh"
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(e) => {
                    haptics.trigger(
                      e.target.checked ? 'toggleOn' : 'toggleOff',
                    );
                    setForceRefresh(e.target.checked);
                  }}
                />
                <span>Live Query (Bypass Cache)</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isChecking}
              >
                <GlobeCheckIcon size={15} />
                <span>{isChecking ? 'Checking...' : 'Check .com'}</span>
              </button>
            </div>

            {errorMsg && (
              <p role="alert" className="error-banner">
                {errorMsg}
              </p>
            )}
          </form>
        </search>
      </section>

      {results.length > 0 && (
        <section className="surface-card status-bar-row">
          <div className="metrics-line mono">
            <span>
              Checked <strong>{results.length}</strong>
            </span>
            <span>
              Available <strong>{availableCount}</strong>
            </span>
            <span>
              Taken <strong>{takenCount}</strong>
            </span>
          </div>

          <ExportToolbar
            candidates={results}
            reportTitle="Direct .com Verification Report"
            filterSummary={`Direct Check (${results.length} words)`}
            filenamePrefix="domain-check"
          />
        </section>
      )}

      <BrandResultsTable
        caption={`Domain Check Results (${results.length})`}
        candidates={results}
        shortlistedWords={shortlistedWords}
        onToggleShortlist={onToggleShortlist}
        onInspectBrand={onInspectBrand}
        emptyMessage="Enter any word above to verify live .com availability."
      />
    </div>
  );
}

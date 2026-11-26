import { useId, useMemo, useState } from 'react';
import type { BrandCandidate } from '../../types/brand.ts';
import {
  BookmarkIcon,
  CheckIcon,
  InspectIcon,
  SortArrowsIcon,
} from '../ui/Icons.tsx';
import { haptics } from '../../lib/haptics.ts';

type SortColumn = 'word' | 'domain' | 'status' | 'length';
type SortDirection = 'ascending' | 'descending';

interface BrandResultsTableProps {
  caption: string;
  candidates: BrandCandidate[];
  shortlistedWords: ReadonlySet<string>;
  onToggleShortlist: (candidate: BrandCandidate) => void;
  onInspectBrand: (candidate: BrandCandidate) => void;
  emptyMessage: string;
}

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const STATUS_RANK: Record<BrandCandidate['status'], number> = {
  available: 1,
  taken: 2,
  unknown: 3,
};

export function BrandResultsTable({
  caption,
  candidates,
  shortlistedWords,
  onToggleShortlist,
  onInspectBrand,
  emptyMessage,
}: BrandResultsTableProps) {
  const captionId = useId();
  const [sortCol, setSortCol] = useState<SortColumn>('status');
  const [sortDir, setSortDir] = useState<SortDirection>('ascending');
  const [sortAnnouncement, setSortAnnouncement] = useState('');

  const handleSort = (column: SortColumn, label: string): void => {
    const nextDir: SortDirection =
      sortCol === column
        ? sortDir === 'ascending'
          ? 'descending'
          : 'ascending'
        : 'ascending';

    haptics.trigger('tick');
    setSortCol(column);
    setSortDir(nextDir);
    setSortAnnouncement(
      `Sorted by ${label}, ${nextDir}, ${candidates.length} rows`,
    );
  };

  const sortedRows = useMemo(() => {
    const factor = sortDir === 'ascending' ? 1 : -1;
    const copy = [...candidates];

    copy.sort((a, b) => {
      switch (sortCol) {
        case 'length':
          return factor * (a.length - b.length);
        case 'status': {
          const diff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
          return diff !== 0
            ? factor * diff
            : b.smoothnessScore - a.smoothnessScore;
        }
        case 'domain':
          return factor * textCollator.compare(a.domain, b.domain);
        case 'word':
          return factor * textCollator.compare(a.displayName, b.displayName);
      }
    });

    return copy;
  }, [candidates, sortCol, sortDir]);

  if (candidates.length === 0) {
    return (
      <div className="surface-card empty-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-card">
      <div role="status" className="visually-hidden">
        {sortAnnouncement}
      </div>

      <div id={captionId} className="table-meta-bar mono">
        {caption}
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="table-wrapper"
      >
        <table className="brand-table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                aria-sort={sortCol === 'word' ? sortDir : undefined}
              >
                <button
                  type="button"
                  className="sort-header-btn"
                  onClick={() => handleSort('word', 'Brand Name')}
                >
                  <span>Name</span>
                  <SortArrowsIcon
                    direction={sortCol === 'word' ? sortDir : undefined}
                  />
                </button>
              </th>

              <th
                scope="col"
                aria-sort={sortCol === 'domain' ? sortDir : undefined}
              >
                <button
                  type="button"
                  className="sort-header-btn"
                  onClick={() => handleSort('domain', 'Domain')}
                >
                  <span>.com</span>
                  <SortArrowsIcon
                    direction={sortCol === 'domain' ? sortDir : undefined}
                  />
                </button>
              </th>

              <th
                scope="col"
                aria-sort={sortCol === 'status' ? sortDir : undefined}
              >
                <button
                  type="button"
                  className="sort-header-btn"
                  onClick={() => handleSort('status', 'Status')}
                >
                  <span>Status</span>
                  <SortArrowsIcon
                    direction={sortCol === 'status' ? sortDir : undefined}
                  />
                </button>
              </th>

              <th
                scope="col"
                aria-sort={sortCol === 'length' ? sortDir : undefined}
              >
                <button
                  type="button"
                  className="sort-header-btn"
                  onClick={() => handleSort('length', 'Length')}
                >
                  <span>Length</span>
                  <SortArrowsIcon
                    direction={sortCol === 'length' ? sortDir : undefined}
                  />
                </button>
              </th>

              <th scope="col">Dictionary Meaning</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((item) => {
              const isSaved = shortlistedWords.has(item.word);

              return (
                <tr
                  key={item.word}
                  className={
                    item.status === 'available' ? 'row-available' : undefined
                  }
                >
                  <th scope="row">
                    <span className="brand-name">{item.displayName}</span>
                    <span className="sub-meta mono">
                      {item.pronunciationHint}
                    </span>
                  </th>

                  <td className="mono">{item.domain}</td>

                  <td>
                    {item.status === 'available' && (
                      <span className="badge badge-available">
                        <CheckIcon size={12} />
                        <span>Available</span>
                      </span>
                    )}
                    {item.status === 'taken' && (
                      <span className="badge badge-taken">Taken</span>
                    )}
                    {item.status === 'unknown' && (
                      <span className="badge badge-unknown">Unverified</span>
                    )}
                    <span className="sub-meta">
                      {item.registrar
                        ? item.registrar.slice(0, 24)
                        : item.verificationMethod}
                    </span>
                  </td>

                  <td className="mono">
                    {item.length}L · {item.syllables}S
                  </td>

                  <td
                    className="definition-cell"
                    title={item.meaning ?? item.languageOrigin}
                  >
                    {item.meaning ?? item.languageOrigin}
                  </td>

                  <td>
                    <div className="cluster">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          haptics.trigger('tap');
                          onInspectBrand(item);
                        }}
                      >
                        <InspectIcon size={13} />
                        <span>Inspect</span>
                      </button>

                      <button
                        type="button"
                        className={
                          isSaved
                            ? 'btn btn-primary btn-sm'
                            : 'btn btn-ghost btn-sm'
                        }
                        aria-pressed={isSaved}
                        onClick={() => {
                          haptics.trigger(isSaved ? 'toggleOff' : 'success');
                          onToggleShortlist(item);
                        }}
                      >
                        <BookmarkIcon size={13} filled={isSaved} />
                        <span>{isSaved ? 'Saved' : 'Save'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import type {
  DiscoveryFilterParams,
  EndingCategory,
  LexiconSource,
  WordOrder,
} from '../../types/brand.ts';
import { GlassSelect, type GlassSelectOption } from '../ui/GlassSelect.tsx';
import {
  ChevronDownIcon,
  ResetIcon,
  SearchIcon,
} from '../ui/Icons.tsx';
import { haptics } from '../../lib/haptics.ts';

interface FilterPanelProps {
  filters: DiscoveryFilterParams;
  isScanning: boolean;
  onUpdateFilters: (patch: Partial<DiscoveryFilterParams>) => void;
  onStartFreshScan: () => void;
  onResetFilters: () => void;
}

const SOURCE_OPTIONS: GlassSelectOption[] = [
  {
    value: 'world-dictionary',
    label: 'World Dictionary',
    hint: 'Live WordNet + System Lexicon',
  },
  {
    value: 'multilingual-roots',
    label: 'Multi-Language Roots',
    hint: 'Arabic, Bangla, Greek, Latin',
  },
  {
    value: 'phonetic-formula',
    label: 'Pattern Generator',
    hint: 'A–Z + Vowel + Ending',
  },
];

const STARTS_WITH_OPTIONS: GlassSelectOption[] = [
  { value: 'all', label: 'All (A–Z)' },
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => ({
    value: l,
    label: l.toUpperCase(),
  })),
];

const LENGTH_OPTIONS: GlassSelectOption[] = [
  { value: 'custom', label: 'Custom Range' },
  { value: '4', label: '4 Letters' },
  { value: '5', label: '5 Letters' },
  { value: '6', label: '6 Letters' },
  { value: '7', label: '7 Letters' },
  { value: '8', label: '8 Letters' },
  { value: '9', label: '9 Letters' },
];

const RANGE_OPTIONS: GlassSelectOption[] = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
].map((n) => ({ value: String(n), label: `${n} Letters` }));

const ENDING_OPTIONS: GlassSelectOption[] = [
  { value: 'any', label: 'Any' },
  { value: 'smooth-liquid', label: '-le / -el / -lo / -ra' },
  { value: 'vowel-o', label: '-o / -io' },
  { value: 'vowel-a', label: '-a / -ia' },
  { value: 'classical-is', label: '-is / -sis / -es' },
  { value: 'classical-gram', label: '-gram / -um' },
  { value: 'nasal-un-m', label: '-un / -on / -m' },
];

const ORDER_OPTIONS: GlassSelectOption[] = [
  { value: 'uncommon-first', label: 'Rare First' },
  { value: 'common-first', label: 'Common First' },
  { value: 'alphabetical', label: 'A–Z' },
];

const BATCH_OPTIONS: GlassSelectOption[] = [
  { value: '25', label: '25 words' },
  { value: '50', label: '50 words' },
  { value: '100', label: '100 words' },
  { value: '160', label: '160 words' },
];

export function FilterPanel({
  filters,
  isScanning,
  onUpdateFilters,
  onStartFreshScan,
  onResetFilters,
}: FilterPanelProps) {
  const [mobileCollapsed, setMobileCollapsed] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    haptics.trigger('select');
    onStartFreshScan();
  };

  const lengthMode =
    filters.exactLength !== null ? String(filters.exactLength) : 'custom';

  return (
    <section className="surface-card" aria-label="Dictionary and Domain Filters">
      <div className="filter-header-mobile">
        <span className="field-label">Filters</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={!mobileCollapsed}
          onClick={() => {
            haptics.trigger(mobileCollapsed ? 'toggleOn' : 'toggleOff');
            setMobileCollapsed((prev) => !prev);
          }}
        >
          <span>{mobileCollapsed ? 'Show' : 'Hide'}</span>
          <ChevronDownIcon size={14} />
        </button>
      </div>

      <search className={mobileCollapsed ? 'filter-body--collapsed' : undefined}>
        <form action="/discover" method="GET" onSubmit={handleSubmit}>
          <div className="filter-grid">
            <div className="filter-field filter-field--wide">
              <GlassSelect
                id="source-select"
                label="Dictionary Source"
                value={filters.source}
                options={SOURCE_OPTIONS}
                onChange={(val) =>
                  onUpdateFilters({
                    source: val as LexiconSource,
                    offset: 0,
                  })
                }
              />
            </div>

            <div className="filter-field filter-field--wide">
              <label htmlFor="concept-seed-input" className="field-label">
                {filters.source === 'phonetic-formula'
                  ? 'Seed Word (Optional)'
                  : 'Meaning / Topic (Optional)'}
              </label>
              <input
                id="concept-seed-input"
                name="conceptQuery"
                type="text"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={
                  filters.source === 'phonetic-formula'
                    ? 'e.g. googol'
                    : 'e.g. light, star'
                }
                value={filters.conceptQuery}
                onChange={(e) =>
                  onUpdateFilters({ conceptQuery: e.target.value, offset: 0 })
                }
              />
            </div>

            <div className="filter-field">
              <GlassSelect
                id="starts-with-select"
                label="Starts With"
                value={filters.startsWith}
                options={STARTS_WITH_OPTIONS}
                onChange={(val) =>
                  onUpdateFilters({ startsWith: val, offset: 0 })
                }
              />
            </div>

            <div className="filter-field">
              <GlassSelect
                id="length-select"
                label="Letter Length"
                value={lengthMode}
                options={LENGTH_OPTIONS}
                onChange={(val) =>
                  onUpdateFilters({
                    exactLength: val === 'custom' ? null : Number(val),
                    offset: 0,
                  })
                }
              />
            </div>

            {filters.exactLength === null && (
              <>
                <div className="filter-field">
                  <GlassSelect
                    id="min-len-select"
                    label="Min Letters"
                    value={String(filters.minLength)}
                    options={RANGE_OPTIONS}
                    onChange={(val) => {
                      const nextMin = Number(val);
                      onUpdateFilters({
                        minLength: nextMin,
                        maxLength: Math.max(nextMin, filters.maxLength),
                        offset: 0,
                      });
                    }}
                  />
                </div>

                <div className="filter-field">
                  <GlassSelect
                    id="max-len-select"
                    label="Max Letters"
                    value={String(filters.maxLength)}
                    options={RANGE_OPTIONS}
                    onChange={(val) => {
                      const nextMax = Number(val);
                      onUpdateFilters({
                        maxLength: nextMax,
                        minLength: Math.min(filters.minLength, nextMax),
                        offset: 0,
                      });
                    }}
                  />
                </div>
              </>
            )}

            <div className="filter-field">
              <GlassSelect
                id="ending-cat-select"
                label="Ending Sound"
                value={filters.endingCategory}
                options={ENDING_OPTIONS}
                onChange={(val) =>
                  onUpdateFilters({
                    endingCategory: val as EndingCategory,
                    offset: 0,
                  })
                }
              />
            </div>

            <div className="filter-field">
              <label htmlFor="custom-ending-input" className="field-label">
                Exact Ending
              </label>
              <input
                id="custom-ending-input"
                name="customEnding"
                type="text"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="le, io, sis"
                value={filters.customEnding}
                onChange={(e) =>
                  onUpdateFilters({ customEnding: e.target.value, offset: 0 })
                }
              />
            </div>

            <div className="filter-field">
              <label htmlFor="contains-text-input" className="field-label">
                Contains
              </label>
              <input
                id="contains-text-input"
                name="containsText"
                type="text"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="lum, mar"
                value={filters.containsText}
                onChange={(e) =>
                  onUpdateFilters({ containsText: e.target.value, offset: 0 })
                }
              />
            </div>

            <div className="filter-field">
              <GlassSelect
                id="word-order-select"
                label="Word Order"
                value={filters.wordOrder}
                options={ORDER_OPTIONS}
                onChange={(val) =>
                  onUpdateFilters({
                    wordOrder: val as WordOrder,
                    offset: 0,
                  })
                }
              />
            </div>

            <div className="filter-field">
              <GlassSelect
                id="batch-size-select"
                label="Batch Size"
                value={String(filters.batchSize)}
                options={BATCH_OPTIONS}
                onChange={(val) =>
                  onUpdateFilters({ batchSize: Number(val) })
                }
              />
            </div>
          </div>

          <div className="filter-actions-row">
            <label htmlFor="smooth-only-check" className="checkbox-inline">
              <input
                id="smooth-only-check"
                name="onlySmoothPronunciation"
                type="checkbox"
                checked={filters.onlySmoothPronunciation}
                onChange={(e) => {
                  haptics.trigger(e.target.checked ? 'toggleOn' : 'toggleOff');
                  onUpdateFilters({
                    onlySmoothPronunciation: e.target.checked,
                    offset: 0,
                  });
                }}
              />
              <span>Smooth Pronunciation</span>
            </label>

            <div className="cluster">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={isScanning}
                onClick={() => {
                  haptics.trigger('tap');
                  onResetFilters();
                }}
              >
                <ResetIcon size={14} />
                <span>Reset</span>
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isScanning}
              >
                <SearchIcon size={15} />
                <span>
                  {isScanning ? 'Checking .com...' : 'Scan Dictionary & .com'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </search>
    </section>
  );
}

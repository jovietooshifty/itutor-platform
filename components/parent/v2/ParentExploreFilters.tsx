'use client';

/**
 * ParentExploreFilters — the sheet behind Explore's "Filters" button.
 *
 * PROVISIONAL VISUALS — NOT FRAME-VERIFIED. The Explore frames show the
 * Filters BUTTON but no sheet, so there is no design for what opens. The
 * alternative was a button that does nothing, which is worse. This is built
 * from the design system's own primitives and should be reconciled against a
 * frame when one exists.
 *
 * The CONTENT is not invented: these are exactly the filters the marketplace
 * already applies (price, rating, days, time of day, location), rendered from
 * whatever groups the caller passes. The component knows nothing about
 * marketplace types -- it takes a list of groups and reports toggles back by
 * id. That keeps the catalogue's vocabulary in one place and keeps this file
 * type-checked, which it would not be if it reached into the `@ts-nocheck`
 * marketplace module for its types.
 */

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { DsPortal } from '@/components/ui/DsPortal';
import { Button } from '@/components/ui/Button';

export interface ExploreFilterOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface ExploreFilterGroup {
  id: string;
  label: string;
  /** Multi-select groups (days, time of day) render as toggles that stack. */
  multi: boolean;
  options: ExploreFilterOption[];
}

export interface ParentExploreFiltersProps {
  open: boolean;
  groups: ExploreFilterGroup[];
  onToggle: (groupId: string, value: string) => void;
  onClear: () => void;
  onClose: () => void;
  /** Live count of what the current selection leaves, for the apply button. */
  resultCount: number;
  resultNoun: string;
  anyApplied: boolean;
}

/** "class" pluralises to "classes", not "classs". */
function plural(n: number, noun: string): string {
  if (n === 1) return noun;
  return /(s|x|z|ch|sh)$/i.test(noun) ? noun + 'es' : noun + 's';
}

export function ParentExploreFilters({
  open,
  groups,
  onToggle,
  onClear,
  onClose,
  resultCount,
  resultNoun,
  anyApplied,
}: ParentExploreFiltersProps) {
  // Escape closes. Registered only while open so the page keeps its own key
  // handling the rest of the time.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // The page behind must not scroll while the sheet is up. Restores whatever
  // was there before rather than assuming '' -- a modal may already have set it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <DsPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-ds-8">
        <button
          type="button"
          aria-label="Close filters"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-ink/40"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          className={cn(
            'relative flex max-h-[85vh] w-full max-w-[430px] flex-col md:max-w-[520px]',
            'rounded-t-ds-card md:rounded-ds-card bw-hair border-border bg-surface-card'
          )}
        >
          <div className="flex items-center justify-between gap-ds-3 bw-b-hair border-line-soft px-ds-card py-ds-3">
            <h2 className="font-display text-[20px] font-extrabold text-ink">Filters</h2>
            {anyApplied ? (
              <button
                type="button"
                onClick={onClear}
                className="font-body text-[13px] font-extrabold text-brand-edge underline cursor-pointer"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-ds-4 overflow-y-auto px-ds-card py-ds-4">
            {groups.map((group) => (
              <section key={group.id} className="flex flex-col gap-ds-2">
                <h3 className="font-body text-[13px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
                  {group.label}
                </h3>
                <div className="flex flex-wrap gap-ds-2">
                  {group.options.map((option) => (
                    <button
                      key={group.id + ':' + option.value}
                      type="button"
                      aria-pressed={option.selected}
                      onClick={() => onToggle(group.id, option.value)}
                      className={cn(
                        'rounded-ds-full bw-hair px-ds-3 py-[7px] cursor-pointer',
                        'font-body text-[13px] font-extrabold whitespace-nowrap',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
                        option.selected
                          ? 'bg-ink border-ink text-on-ink'
                          : 'bg-surface-card border-border text-ink'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="bw-t-hair border-line-soft p-ds-card">
            <Button onClick={onClose} block>
              {`Show ${resultCount} ${plural(resultCount, resultNoun)}`}
            </Button>
          </div>
        </div>
      </div>
    </DsPortal>
  );
}

export default ParentExploreFilters;

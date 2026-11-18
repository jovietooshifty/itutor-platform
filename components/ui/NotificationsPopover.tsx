'use client';

/**
 * The bell's popup on large screens (lg, 1024px and up). Below that the bell
 * still opens the full notifications page, which is the better shape on a
 * phone; the page also stays reachable by URL at every width.
 *
 * PROVISIONAL: no Figma frame draws this panel. It reuses the page's rows and
 * tokens; only the frame (anchored card, one scrolling list) is new.
 *
 * ANCHORING. AppHeader's onAction does not hand back the clicked element, so
 * the panel finds the bell by its accessible name (the same label screen
 * readers announce) and sits under its right edge. If it cannot find it, it
 * falls back to the top-right corner of the viewport.
 *
 * CLOSES on: Escape, a press outside the panel (the bell itself excluded, so
 * the bell toggles rather than closing-then-reopening), and any route change.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export const NOTIFICATIONS_POPOVER_QUERY = '(min-width: 1024px)';
const BELL_SELECTOR = 'button[aria-label="Notifications"]';

/** True when the bell should open the popup instead of navigating. */
export function prefersNotificationsPopover(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NOTIFICATIONS_POPOVER_QUERY).matches;
}

export function NotificationsPopover({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 72, right: 16 });

  // Route change closes it: following a notification, or any other nav.
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bell = document.querySelector<HTMLElement>(BELL_SELECTOR);
      if (!bell) return;
      const r = bell.getBoundingClientRect();
      setPos({ top: Math.round(r.bottom + 8), right: Math.max(16, Math.round(window.innerWidth - r.right)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const bell = document.querySelector<HTMLElement>(BELL_SELECTOR);
    bell?.setAttribute('aria-expanded', 'true');
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        bell?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || bell?.contains(t)) return;
      onClose();
    };
    // A screen narrowed past lg while open: the panel no longer fits the plan.
    const mq = window.matchMedia(NOTIFICATIONS_POPOVER_QUERY);
    const onMq = () => {
      if (!mq.matches) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    mq.addEventListener('change', onMq);
    return () => {
      bell?.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      mq.removeEventListener('change', onMq);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      tabIndex={-1}
      style={{ top: pos.top, right: pos.right, maxHeight: `calc(100dvh - ${pos.top + 16}px)` }}
      className="ds-root fixed z-50 flex w-[420px] flex-col overflow-hidden rounded-ds-card bg-surface-card bw-bold border-ink shadow-[0_12px_32px_rgba(0,0,0,0.18)] outline-none"
    >
      {children}
    </div>
  );
}

export default NotificationsPopover;

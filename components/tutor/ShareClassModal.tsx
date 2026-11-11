'use client';

// Share a class from inside the platform.
//
// This deliberately replaces the OS share sheet (navigator.share). That sheet
// is the phone's, not ours: it hands the tutor a wall of apps, looks nothing
// like iTutor, and on desktop is either absent or a Windows dialog. What a
// tutor actually needs is the two things below — a link they can paste
// anywhere, and a QR they can put on a flyer or a WhatsApp status.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Download, X, QrCode as QrIcon } from 'lucide-react';

import { PUBLIC_BASE, renderBrandedQr } from '@/lib/qr/brandedQr';

/**
 * Filenames for the downloaded QR. Strips anything a filesystem would object
 * to and collapses the runs of punctuation that class titles are full of
 * ("[TEST] Credit Scenario A — TT$120" would otherwise become a thicket of
 * dashes).
 */
function slugify(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'class';
}

export default function ShareClassModal({
  open,
  onClose,
  classId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  title: string;
}) {
  // Always the production domain, matching QrCodePanel: a link a tutor hands
  // out is scanned and clicked in the real world, so a preview or staging
  // origin leaking into it would hand students a URL they cannot reach.
  const url = `${PUBLIC_BASE}/student/explore/${classId}`;

  const [qr, setQr] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The portal target only exists in the browser.
  useEffect(() => { setMounted(true); }, []);

  // Render the QR lazily — only once the modal is actually opened, since
  // drawing it pulls in the qrcode bundle and the brand mark.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQrFailed(false);
    void renderBrandedQr(url).then((png) => {
      if (cancelled) return;
      if (png) setQr(png);
      else setQrFailed(true);
    });
    return () => { cancelled = true; };
  }, [open, url]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // Escape closes, and focus lands on the close button so the dialog is
  // reachable without a mouse.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure context, denied permission). The
      // link is on screen and selectable, so there is still a way through.
    }
  }, [url]);

  const download = useCallback(() => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `${slugify(title)}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [qr, title]);

  if (!open || !mounted) return null;

  // Portalled to <body> on purpose. The class card that owns this modal sets
  // overflow-hidden and a hover:-translate transform, and a transformed
  // ancestor becomes the containing block for position:fixed — rendering in
  // place would clip the dialog and pin it to the card instead of the screen,
  // precisely when the card is hovered, which it always is on click.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-ink">Share class</div>
            <div className="text-xs text-muted-foreground truncate" title={title}>{title}</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-ink hover:bg-muted transition"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Link */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Class link
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-3 py-2">
              <span className="flex-1 min-w-0 truncate font-mono text-xs text-muted-foreground" title={url}>
                {url}
              </span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline shrink-0"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Anyone with this link can view the class and join. They don&apos;t need an
              account to look.
            </p>
          </div>

          {/* QR */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              QR code
            </div>
            <div className="flex items-center gap-4">
              <div className="size-28 shrink-0 rounded-xl border border-border bg-white grid place-items-center overflow-hidden">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={`QR code linking to ${title}`} className="size-full object-contain" />
                ) : qrFailed ? (
                  <QrIcon className="size-7 text-muted-foreground/40" />
                ) : (
                  <div className="size-20 rounded-lg bg-muted animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  {qrFailed
                    ? 'The QR code could not be generated. The link above still works.'
                    : 'Print it on a flyer or post it — scanning opens this class.'}
                </p>
                <button
                  type="button"
                  onClick={download}
                  disabled={!qr}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-xs font-semibold text-ink hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="size-3.5" /> Download QR
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

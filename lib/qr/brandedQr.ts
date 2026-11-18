// The branded iTutor QR code: brand green on white, with the square brand mark
// in the centre. Browser-only (canvas + Image). Shared by the tutor QR panel,
// the referral share card and the campaign-code print sheets, so every QR the
// company prints looks the same.
//
// Rounded modules and eyes, the logo in a module-aligned gap at the exact
// centre (owner, 14 Nov: no sharp corners, centre the logo). Level 'H' error
// correction gives ~30% redundancy; the gap hides about 5% of the modules.

/** QR codes are scanned in the real world: always the public production domain. */
export const PUBLIC_BASE = 'https://myitutor.com';

// iTutor brand green (tailwind token `itutor-green`). Kept fully-opaque white
// behind it — contrast is what keeps the code scannable.
export const BRAND_GREEN = '#199356';

// Compact square brand mark for the centre overlay (small + square, unlike the
// wordmark logos which are too wide to sit inside a QR).
const LOGO_SRC = '/assets/logo/itutor-mark.png';

let logoPromise: Promise<HTMLImageElement | null> | null = null;

// Load the centre logo once. Resolves to null (rather than rejecting) if it
// can't load, so we fall back to a plain — still brand-green — QR.
function loadLogo(): Promise<HTMLImageElement | null> {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = LOGO_SRC;
  });
  return logoPromise;
}

// ---------------------------------------------------------------------------
// Geometry. The code is drawn from the module grid itself (not qrcode's own
// renderer), so it can have rounded modules, rounded finder "eyes" and a
// centre gap that lands exactly on module boundaries. One SVG path feeds both
// outputs: the SVG string directly, and the PNG through Path2D.
// ---------------------------------------------------------------------------

/** Quiet zone, in modules. 4 is the spec; at 2 the rounded dots failed to decode at some sizes (jsQR test, 14 Nov). */
const MARGIN = 4;
/** Dark module drawn at this fraction of its cell, with this corner radius. */
const DOT = 0.92;
const DOT_RADIUS = 0.3;

type Grid = { size: number; get: (r: number, c: number) => boolean };

type QrShape = {
  /** Width and height of the whole drawing, in modules (quiet zone included). */
  units: number;
  /** Every dark shape: dots plus the three eyes. Fill with evenodd. */
  path: string;
  /** The logo box (module units), centred and module-aligned. */
  logo: { x: number; y: number; size: number };
};

const n2 = (v: number) => Math.round(v * 1000) / 1000;

/** A rounded rectangle as an SVG subpath. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M${n2(x + rr)} ${n2(y)}h${n2(w - 2 * rr)}a${n2(rr)} ${n2(rr)} 0 0 1 ${n2(rr)} ${n2(rr)}` +
    `v${n2(h - 2 * rr)}a${n2(rr)} ${n2(rr)} 0 0 1 ${n2(-rr)} ${n2(rr)}` +
    `h${n2(-(w - 2 * rr))}a${n2(rr)} ${n2(rr)} 0 0 1 ${n2(-rr)} ${n2(-rr)}` +
    `v${n2(-(h - 2 * rr))}a${n2(rr)} ${n2(rr)} 0 0 1 ${n2(rr)} ${n2(-rr)}z`
  );
}

/** The same rectangle, wound the other way: cuts a hole under evenodd. */
function roundRectHole(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M${n2(x + rr)} ${n2(y)}a${n2(rr)} ${n2(rr)} 0 0 0 ${n2(-rr)} ${n2(rr)}` +
    `v${n2(h - 2 * rr)}a${n2(rr)} ${n2(rr)} 0 0 0 ${n2(rr)} ${n2(rr)}` +
    `h${n2(w - 2 * rr)}a${n2(rr)} ${n2(rr)} 0 0 0 ${n2(rr)} ${n2(-rr)}` +
    `v${n2(-(h - 2 * rr))}a${n2(rr)} ${n2(rr)} 0 0 0 ${n2(-rr)} ${n2(-rr)}z`
  );
}

export function qrShape(grid: Grid): QrShape {
  const n = grid.size;
  const units = n + MARGIN * 2;

  // Centre gap for the logo: an odd number of modules (so it is centred on
  // the middle module), about 22% of the width. 'H' correction recovers ~30%
  // of codewords; this hides about 5% of the modules.
  let k = Math.max(5, Math.round(n * 0.22));
  if (k % 2 === 0) k += 1;
  const g0 = (n - k) / 2; // integer, since n and k are both odd

  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const inGap = (r: number, c: number) => r >= g0 && r < g0 + k && c >= g0 && c < g0 + k;

  const parts: string[] = [];
  const inset = (1 - DOT) / 2;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!grid.get(r, c) || inFinder(r, c) || inGap(r, c)) continue;
      parts.push(roundRect(MARGIN + c + inset, MARGIN + r + inset, DOT, DOT, DOT_RADIUS));
    }
  }
  // Eyes: a 7x7 rounded ring and a 3x3 rounded centre.
  for (const [r, c] of [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ]) {
    const x = MARGIN + c;
    const y = MARGIN + r;
    parts.push(roundRect(x, y, 7, 7, 2.2) + roundRectHole(x + 1, y + 1, 5, 5, 1.4));
    parts.push(roundRect(x + 2, y + 2, 3, 3, 1));
  }

  // The logo sits half a module inside the gap, so it never touches a dot.
  return { units, path: parts.join(''), logo: { x: MARGIN + g0 + 0.5, y: MARGIN + g0 + 0.5, size: k - 1 } };
}

async function buildShape(url: string): Promise<QrShape | null> {
  const QRCode = (await import('qrcode')).default;
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
    const m = qr.modules;
    return qrShape({ size: m.size, get: (r, c) => Boolean(m.get(r, c)) });
  } catch {
    return null;
  }
}

/** The logo's drawn rectangle: fitted inside the box at its own aspect ratio. */
function fitLogo(box: { x: number; y: number; size: number }, w: number, h: number) {
  const s = box.size / Math.max(w, h);
  const dw = w * s;
  const dh = h * s;
  return { x: box.x + (box.size - dw) / 2, y: box.y + (box.size - dh) / 2, w: dw, h: dh };
}

// The mark is 81x86; drawn into a square it was squashed, and its black
// square sat off-centre. Its own aspect, rounded corners.
const LOGO_W = 81;
const LOGO_H = 86;

/** A PNG data URL of the branded QR for `url`, or null if it cannot be drawn. */
export async function renderBrandedQr(url: string, size = 512): Promise<string | null> {
  const shape = await buildShape(url);
  if (!shape) return null;
  const logo = await loadLogo();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const k = size / shape.units;
  ctx.scale(k, k);
  // White card with rounded corners (transparent outside them).
  ctx.fillStyle = '#FFFFFF';
  ctx.fill(new Path2D(roundRect(0, 0, shape.units, shape.units, 2)));
  ctx.fillStyle = BRAND_GREEN;
  ctx.fill(new Path2D(shape.path), 'evenodd');
  if (logo) {
    const r = fitLogo(shape.logo, logo.naturalWidth || LOGO_W, logo.naturalHeight || LOGO_H);
    ctx.save();
    ctx.clip(new Path2D(roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.22)));
    ctx.drawImage(logo, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

/**
 * The same code as an SVG string, for print sheets and vector downloads. The
 * logo is embedded by URL, so the file stays small and opens anywhere.
 */
export async function renderBrandedQrSvg(url: string): Promise<string | null> {
  const shape = await buildShape(url);
  if (!shape) return null;
  const u = shape.units;
  const r = fitLogo(shape.logo, LOGO_W, LOGO_H);
  const rr = n2(Math.min(r.w, r.h) * 0.22);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${u} ${u}" shape-rendering="geometricPrecision">` +
    `<defs><clipPath id="itutor-qr-logo"><rect x="${n2(r.x)}" y="${n2(r.y)}" width="${n2(r.w)}" height="${n2(r.h)}" rx="${rr}"/></clipPath></defs>` +
    `<rect width="${u}" height="${u}" rx="2" fill="#FFFFFF"/>` +
    `<path d="${shape.path}" fill="${BRAND_GREEN}" fill-rule="evenodd"/>` +
    `<image href="${PUBLIC_BASE}${LOGO_SRC}" x="${n2(r.x)}" y="${n2(r.y)}" width="${n2(r.w)}" height="${n2(r.h)}" clip-path="url(#itutor-qr-logo)" preserveAspectRatio="xMidYMid meet"/>` +
    `</svg>`
  );
}

/** Save a data URL or text as a file. */
export function downloadFile(name: string, content: string | Blob, type = 'application/octet-stream') {
  const href =
    typeof content === 'string' && content.startsWith('data:')
      ? content
      : URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!href.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

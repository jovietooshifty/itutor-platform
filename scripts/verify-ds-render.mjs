#!/usr/bin/env node
/**
 * verify-ds-render.mjs — the render-time check that tsc, next build, ESLint
 * and source review structurally cannot perform.
 *
 * WHY THIS EXISTS. The design system shipped every card, row, chip, divider
 * and toggle at `border-width: 0`. The width class was in the source and it
 * was correct; cn() is twMerge(clsx(...)), and tailwind-merge — which knows
 * only Tailwind's own class groups, never this project's config — filed
 * `border-hair` with the border COLOUR utilities and kept the last one.
 * Four green gates saw nothing, because the class was deleted at runtime by
 * a string merge. Full-page screenshots at one width saw nothing either: a
 * missing 1px border is invisible at 2x downscale, `fullPage` flattens
 * `position: sticky` so a nav that never sticks still photographs perfectly,
 * and a single narrow viewport cannot reveal a desktop layout that does not
 * exist.
 *
 * So this reads getComputedStyle out of a real browser, at two widths, and
 * scrolls the page before photographing it. Three checks:
 *
 *   1. COMPUTED BORDER WIDTH. Every `.bw-*` element must report a non-zero
 *      width on the side it claims. Any element inside `.ds-root` carrying a
 *      border colour with no width anywhere is reported as a suspected ghost
 *      border — that is the shape this bug takes.
 *   2. STICKY. `overflow: hidden` on either axis makes an element a scroll
 *      container and silently breaks sticky descendants. A probe is injected
 *      into the live document and the page is really scrolled.
 *   3. TWO WIDTHS. 390 (the frames) and 1280 (what a reviewer opens).
 *
 * Usage:
 *   node scripts/verify-ds-render.mjs                 # gallery only, no auth
 *   node scripts/verify-ds-render.mjs --parent        # + authed parent routes
 *   node scripts/verify-ds-render.mjs --shots <dir>   # write screenshots
 *   node scripts/verify-ds-render.mjs --base <url>
 *   node scripts/verify-ds-render.mjs --parent --routes /parent/my-classes,/x
 *
 * Exits non-zero on any failure, so it can gate a PR.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(name);

const BASE = flag('--base', 'http://localhost:3000').replace(/\/$/, '');
const SHOTS = flag('--shots', null);
const WANT_PARENT = has('--parent');
const ROUTES = (flag('--routes', '') || '')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);
const EMAIL = process.env.VERIFY_EMAIL || 'jovangoodluck+testparent@myitutor.com';
const PASSWORD = process.env.VERIFY_PASSWORD || 'StagingTest!Parent26';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 900 },
];

const failures = [];
const warnings = [];
const fail = (m) => { failures.push(m); console.log('  FAIL  ' + m); };
const warn = (m) => { warnings.push(m); console.log('  warn  ' + m); };
const pass = (m) => { console.log('  ok    ' + m); };
const note = (m) => { console.log('        ' + m); };

/* ── the in-page audits ────────────────────────────────────────────────── */

function auditBorders() {
  const SPEC = {
    'bw-hair': { sides: ['Top', 'Right', 'Bottom', 'Left'], px: 1 },
    'bw-bold': { sides: ['Top', 'Right', 'Bottom', 'Left'], px: 2 },
    'bw-t-hair': { sides: ['Top'], px: 1 },
    'bw-b-hair': { sides: ['Bottom'], px: 1 },
  };
  const LEGACY = ['border-hair', 'border-bold', 'border-t-hair', 'border-b-hair'];

  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
    return el.tagName.toLowerCase() + id + (cls ? '.' + cls : '');
  };

  const checked = [];
  const bad = [];
  const legacy = [];
  const ghosts = [];

  for (const el of document.querySelectorAll('*')) {
    const classes = (el.getAttribute('class') || '').split(/\s+/);
    for (const name of LEGACY) {
      if (classes.includes(name)) legacy.push({ el: describe(el), name });
    }
    for (const name of Object.keys(SPEC)) {
      if (!classes.includes(name)) continue;
      const spec = SPEC[name];
      const cs = getComputedStyle(el);
      for (const side of spec.sides) {
        const got = parseFloat(cs['border' + side + 'Width']) || 0;
        checked.push(name);
        if (got < spec.px) {
          bad.push({ el: describe(el), name, side, want: spec.px + 'px', got: got + 'px' });
        }
      }
    }
  }

  const root = document.querySelector('.ds-root');
  if (root) {
    for (const el of root.querySelectorAll('*')) {
      const classes = el.getAttribute('class') || '';
      if (!/\bborder-(border|ink|brand|danger|line-soft|transparent)\b/.test(classes)) continue;
      if (/\bborder-0\b/.test(classes)) continue;
      const cs = getComputedStyle(el);
      let total = 0;
      for (const s of ['Top', 'Right', 'Bottom', 'Left']) total += parseFloat(cs['border' + s + 'Width']) || 0;
      if (total === 0) ghosts.push({ el: describe(el) });
    }
  }

  const byClass = {};
  for (const n of checked) byClass[n] = (byClass[n] || 0) + 1;
  return { checkedCount: checked.length, byClass, bad, legacy, ghosts };
}

function auditSticky() {
  // scroll-behavior: smooth is set on html, so window.scrollTo ANIMATES and
  // scrollY reads 0 for several frames afterwards. Every measurement below
  // would be taken mid-flight. Pin it to instant for the duration.
  const prevBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';

  const html = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);

  const host = document.querySelector('.ds-root') || document.body;
  const rig = document.createElement('div');
  rig.style.cssText = 'position:relative;height:3000px';
  const probe = document.createElement('div');
  probe.style.cssText = 'position:sticky;top:0;height:10px';
  rig.appendChild(probe);
  // FIRST child, not last. A sticky element only sticks once the scroll
  // reaches its containing block; a rig appended after a long page is still
  // far below the fold at 800px and reports "did not stick" when sticky is
  // working perfectly well.
  host.insertBefore(rig, host.firstChild);

  const startY = window.scrollY;
  window.scrollTo(0, 0);
  window.scrollTo(0, 800);
  const scrolled = window.scrollY;
  const afterScroll = probe.getBoundingClientRect().top;
  window.scrollTo(0, startY);
  rig.remove();
  document.documentElement.style.scrollBehavior = prevBehavior;

  return {
    htmlOverflowX: html.overflowX,
    htmlOverflowY: html.overflowY,
    bodyOverflowX: body.overflowX,
    bodyOverflowY: body.overflowY,
    scrolled,
    afterScroll,
    sticks: scrolled > 0 ? Math.abs(afterScroll) < 2 : null,
  };
}

function auditRealSticky() {
  const prevBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';
  const out = [];
  const targets = [['header', '.ds-root header'], ['bottom nav', '.ds-root nav']];
  for (const pair of targets) {
    const label = pair[0];
    const el = document.querySelector(pair[1]);
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
    const startY = window.scrollY;
    window.scrollTo(0, 0);
    const before = el.getBoundingClientRect();
    window.scrollTo(0, 700);
    const after = el.getBoundingClientRect();
    const didScroll = window.scrollY;
    out.push({
      label,
      position: cs.position,
      didScroll,
      beforeTop: Math.round(before.top),
      afterTop: Math.round(after.top),
      afterBottom: Math.round(after.bottom),
      viewportH: window.innerHeight,
    });
    window.scrollTo(0, startY);
  }
  document.documentElement.style.scrollBehavior = prevBehavior;
  return out;
}

/* ── driver ────────────────────────────────────────────────────────────── */

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    console.log('  (bundled chromium unavailable, falling back to installed Chrome)');
    return await chromium.launch({ channel: 'chrome' });
  }
}

async function checkRoute(context, route, vp, label) {
  const page = await context.newPage();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 });
  if (!res || res.status() >= 400) {
    fail(label + ' ' + route + ' @' + vp.name + ' returned ' + (res ? res.status() : 'no response'));
    await page.close();
    return;
  }
  // WAIT FOR REAL CONTENT, NOT networkidle, AND NOT merely for the absence
  // of a skeleton. These screens are React Query clients: networkidle fires
  // while the skeleton is still up, and "no .animate-pulse on the page" is
  // true for a moment BEFORE hydration has rendered the skeleton at all, so
  // a naive absence check passes instantly against an empty shell. The first
  // two runs of this script "passed" /parent/billing that way, having
  // inspected exactly one border edge of a page that was all grey
  // placeholders.
  //
  // So: settle first, then require the DOM to hold still with no skeleton
  // for four consecutive polls before believing what is on screen.
  await page.waitForTimeout(1500);
  const settled = await page
    .waitForFunction(
      () => {
        const w = window;
        if (!w.__dsSamples) w.__dsSamples = [];
        const pulses = document.querySelectorAll('[class*="animate-pulse"]').length;
        w.__dsSamples.push(document.querySelectorAll('*').length + ':' + pulses);
        if (w.__dsSamples.length > 4) w.__dsSamples.shift();
        return pulses === 0 && w.__dsSamples.length === 4 && new Set(w.__dsSamples).size === 1;
      },
      null,
      { timeout: 30000, polling: 400 }
    )
    .then(() => true)
    .catch(() => false);
  if (!settled) {
    warn(label + ' ' + route + ' @' + vp.name + ': content never settled (skeleton still up after 30s) — findings below cover the loading state only, not the screen');
  }
  await page.waitForTimeout(400);

  const borders = await page.evaluate(auditBorders);
  if (borders.legacy.length) {
    fail(label + ' @' + vp.name + ': ' + borders.legacy.length + ' element(s) still carry an old border-* width name');
    borders.legacy.slice(0, 5).forEach((l) => note('    ' + l.name + ' on ' + l.el));
  }
  if (borders.checkedCount === 0) {
    warn(label + ' @' + vp.name + ': no .bw-* elements found — nothing was verified on this route');
  } else if (borders.bad.length) {
    fail(label + ' @' + vp.name + ': ' + borders.bad.length + ' of ' + borders.checkedCount + ' border edges render at the wrong width');
    borders.bad.slice(0, 8).forEach((b) => note('    ' + b.el + ' ' + b.name + ' border' + b.side + ' want ' + b.want + ' got ' + b.got));
  } else {
    const tally = Object.keys(borders.byClass).map((k) => k + ' x' + borders.byClass[k]).join(', ');
    pass(label + ' @' + vp.name + ': ' + borders.checkedCount + ' border edges all render at full width (' + tally + ')');
  }
  if (borders.ghosts.length) {
    warn(label + ' @' + vp.name + ': ' + borders.ghosts.length + ' element(s) inside .ds-root have a border colour but zero width');
    borders.ghosts.slice(0, 5).forEach((g) => note('    ' + g.el));
  }

  const sticky = await page.evaluate(auditSticky);
  note(label + ' @' + vp.name + ': html overflow-x ' + sticky.htmlOverflowX + '/' + sticky.htmlOverflowY +
    ', body ' + sticky.bodyOverflowX + '/' + sticky.bodyOverflowY);
  if (sticky.sticks === false) {
    fail(label + ' @' + vp.name + ': sticky probe scrolled away (top ' + sticky.afterScroll + 'px after ' + sticky.scrolled + 'px of scroll) — an ancestor is a scroll container');
  } else if (sticky.sticks === true) {
    pass(label + ' @' + vp.name + ': sticky holds at the top through ' + sticky.scrolled + 'px of scroll');
  } else {
    note(label + ' @' + vp.name + ': page too short to scroll; sticky not exercised');
  }

  const real = await page.evaluate(auditRealSticky);
  for (const r of real) {
    if (r.didScroll === 0) { note(label + ' @' + vp.name + ': ' + r.label + ' present but the page did not scroll'); continue; }
    const stuck = r.label === 'header'
      ? Math.abs(r.afterTop) < 2
      : Math.abs(r.afterBottom - r.viewportH) < 2;
    if (stuck) pass(label + ' @' + vp.name + ': real ' + r.label + ' stays put through ' + r.didScroll + 'px of scroll');
    else fail(label + ' @' + vp.name + ': real ' + r.label + ' (' + r.position + ') moved — top ' + r.beforeTop + ' to ' + r.afterTop + ', bottom ' + r.afterBottom + ' vs viewport ' + r.viewportH);
  }

  if (SHOTS) {
    mkdirSync(resolve(SHOTS), { recursive: true });
    const slug = (label + route).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    await page.screenshot({ path: resolve(SHOTS, slug + '-' + vp.name + '-top.png') });
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 700);
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(SHOTS, slug + '-' + vp.name + '-scrolled.png') });
    note(label + ' @' + vp.name + ': wrote ' + slug + '-' + vp.name + '-{top,scrolled}.png');
  }

  if (errors.length) warn(label + ' @' + vp.name + ': ' + errors.length + ' page error(s) — ' + errors[0].slice(0, 120));
  await page.close();
}

async function signIn(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const url = page.url();
  await page.close();
  if (url.indexOf('/login') !== -1) { fail('sign-in as ' + EMAIL + ' did not leave /login'); return false; }
  pass('signed in as ' + EMAIL + ' (landed on ' + new URL(url).pathname + ')');
  return true;
}

const main = async () => {
  console.log('\nverify-ds-render — ' + BASE + '\n');
  const browser = await launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });

  console.log('design-system gallery');
  for (const vp of VIEWPORTS) await checkRoute(context, '/dev/ui', vp, 'gallery');

  if (WANT_PARENT) {
    console.log('\nparent routes');
    if (await signIn(context)) {
      const routes = ROUTES.length ? ROUTES : ['/parent/dashboard', '/parent/billing', '/parent/my-classes'];
      for (const route of routes) {
        for (const vp of VIEWPORTS) await checkRoute(context, route, vp, 'parent');
      }
    }
  }

  await browser.close();

  console.log('\n' + '-'.repeat(62));
  console.log(failures.length + ' failure(s), ' + warnings.length + ' warning(s)');
  if (failures.length) { process.exit(1); }
  console.log('all render-time checks passed');
};

main().catch((e) => { console.error(e); process.exit(1); });

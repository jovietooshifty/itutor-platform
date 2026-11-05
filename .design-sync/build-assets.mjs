#!/usr/bin/env node
/**
 * Builds the one input design-sync cannot get from a repo with no dist/: a
 * compiled stylesheet. The app's CSS exists only as a Next build step, so this
 * runs the Tailwind CLI over the design system and writes build/ds.css, which
 * config.json names as cssEntry.
 *
 * This is cfg.buildCmd: re-run it before the converter on any re-sync, or the
 * sheet describes yesterday's components. Output (build/) is gitignored.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const cli = resolve(root, 'node_modules/tailwindcss/lib/cli.js');
if (!existsSync(cli)) {
  console.error(`build-assets: ${cli} not found - run npm ci at the repo root first`);
  process.exit(1);
}

mkdirSync(resolve(here, 'build'), { recursive: true });
const out = resolve(here, 'build/ds.css');

execFileSync(
  process.execPath,
  [cli, '-c', resolve(here, 'tailwind.ds.config.ts'), '-i', resolve(here, 'css/input.css'), '-o', out],
  { cwd: root, stdio: 'inherit' }
);

console.log(`build-assets: ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);

// ── Declaration files ──────────────────────────────────────────────────────
// With no dist/ there is no .d.ts tree either, and without one the converter
// cannot read any component's props: every <Name>Props came out as
// `{ [key: string]: unknown }`. That interface is the API contract the design
// agent codes against, so it would have had no idea Button takes `variant` or
// `size`. The converter looks for declarations in build/ts, dist/types, types,
// lib or dist, taking the first that exists - and `lib/` here is the app's
// own folder, which has no .d.ts, so it parsed zero files.
//
// Emitting them with tsc into dist/types (already gitignored) gives it the
// real types, derived from the source so they cannot drift from it.
//
// Scoped to ONLY dist/types: that directory is generated output and nothing
// else in the repo lives there.
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
if (!existsSync(tsc)) {
  console.error(`build-assets: ${tsc} not found - run npm ci at the repo root first`);
  process.exit(1);
}
const typesOut = resolve(root, 'dist/types');
rmSync(typesOut, { recursive: true, force: true });
execFileSync(process.execPath, [tsc, '-p', resolve(here, 'tsconfig.dts.json')], {
  cwd: root,
  stdio: 'inherit',
});
const emitted = existsSync(resolve(typesOut, 'components/ui'))
  ? readdirSync(resolve(typesOut, 'components/ui')).filter((f) => f.endsWith('.d.ts')).length
  : 0;
if (emitted === 0) {
  console.error('build-assets: tsc emitted no declaration files for components/ui');
  process.exit(1);
}
console.log(`build-assets: ${emitted} .d.ts files -> dist/types/components/ui`);

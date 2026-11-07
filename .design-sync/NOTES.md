# design-sync notes: iTutor v3

Target: Claude Design project `iTutor v3` (`ae7c7005-01c1-48ee-a58f-3a1fb262224d`), global `window.ITutorV3`.
Source: `components/ui/` (17 components). The correct design system is the
"iTutor" Design System artifact (`JTAAka3hnZ58qDKZR5hBJG`), not the org-default
"iTutor Design System", which is a snapshot of the legacy app.

## How this repo is synced (it is an app, not a library)

- **No dist/, no Storybook.** The converter synthesizes its entry from
  `components/ui/*.tsx` (`srcDir`). `--entry ./.design-sync/no-dist/index.js` is
  passed on purpose: the path does not exist, which makes the converter walk up
  to the repo's own package.json for PKG_DIR and then fall back to synthesis.
  Without `--entry` it looks in `node_modules/itutor-frontend`, which does not exist.
- **Run `buildCmd` first, every time:** `node .design-sync/build-assets.mjs`. It
  produces the two things a library's dist/ would have shipped:
  - `build/ds.css` — Tailwind compiled from `tailwind.ds.config.ts`, which
    safelists the design-system vocabulary so the design agent can use classes no
    component happens to use. Arbitrary values (`text-[28px]`) go through raw
    `content`, because `safelist` silently ignores them.
  - `dist/types/**/*.d.ts` — real declarations from tsc. Without them every
    `<Name>Props` came out as `{ [key: string]: unknown }`: the converter takes
    the first of build/ts, dist/types, types, lib, dist that exists, and the
    app's own `lib/` (no .d.ts) won.
- **`lib/utils.ts` vs `lib/utils/`.** Both exist. The converter's tsconfig-paths
  plugin tries the bare path first and handed esbuild the directory ("Cannot read
  file lib/utils: Incorrect function"). `.design-sync/tsconfig.json` pins
  `@/lib/utils` to the file ahead of the `@/*` wildcard.
- **`next/link`** (NavRow) is shimmed to a plain anchor via the same tsconfig.
- **Fonts.** Archivo is not in the repo (the app loads it with next/font/google).
  `fonts/archivo-latin-var.woff2` is that same latin file, fetched once from
  fonts.gstatic.com (OFL) and committed. `css/input.css` defines
  `--font-archivo` / `--font-atkinson`: next/font normally does, and without them
  the whole `--font-display` / `--font-sans` stacks are invalid at computed-value
  time, so every string silently falls back to the browser default.
- **`guidelinesGlob: []` is a safety setting, not a preference.** The default glob
  matched `docs/*.md` and would have uploaded 27 internal documents
  (STAGING_OAUTH_AND_SECRETS, CTO_HANDOVER, money-flow-report, RUNBOOK…) into
  the design project as "guidelines". Never remove it. `docsDir` is pinned to
  `docs/ui-foundation` (screenshots only) for the same reason.
- **`dtsPropsFor`** covers four components whose props reference named types the
  extractor leaves undefined (`HeaderAction`, `NavItem`, `Step`): AppHeader,
  BottomNav, NewUiShell, StepList. If those types change in source, update here.
- Render check uses system Chrome: `DS_CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"`.
  The cached Playwright chromium (r1228) does not match playwright 1.65 (r1254).

## Known render warns

- `[FONT_MISSING] "Atkinson Hyperlegible"` — the OLDER family, third in
  `ds-tokens.css`'s `--font-sans` stack after the shipped
  "Atkinson Hyperlegible Next". Never rendered while the shipped face loads
  (verified: both faces load from `fonts/` with 200s). Not shipped on purpose: it
  has no 800 weight, which is why the app self-hosts "Next". Accepted pending the
  owner's OK; the fix would be an edit to app CSS, not to the sync.
- `Inter` / `Space Grotesk` were also flagged and are RESOLVED: the sync's
  Tailwind config drops those legacy fallbacks from the font stacks.

## Re-sync risks

- `dtsPropsFor` bodies are hand-copied from source types and will rot if
  `NavItem`, `HeaderAction` or `Step` change.
- The DS colour allow-list in `tailwind.ds.config.ts` throws on a renamed token
  (deliberately); a NEW token is not shipped until added there.
- Archivo is a network-fetched asset frozen at Google Fonts v25.
- Toolchain: tailwindcss 3.4.19, typescript from the repo, playwright 1.65.0 in `.ds-sync/`.
- Source branch at first sync: `feat/parent-ui-v2-main-tabs-logic` (contains the
  border-width fix from PR #8). Syncing from `main` before PR #8 merges would
  upload borderless components.

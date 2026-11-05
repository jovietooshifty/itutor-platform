# Parent UI v2 — screenshot evidence

Every pair is the same route at 390px, `deviceScaleFactor: 2`, captured from
`next dev` against **staging**, signed in as the staging test parent. "before"
is `NEXT_PUBLIC_NEW_UI_ENABLED=false`, "after" is the flag on. Nothing else
differs between the two shots in a pair.

| State | Before | After | Frame |
| --- | --- | --- | --- |
| Home — new parent, no child | `dashboard-before.png` | `dashboard-after.png` | `160:2208` |
| Home — payment failed + request | `dashboard-needsaction-before.png` | `dashboard-needsaction-after.png` | `160:1828` |
| Home — all paid | `dashboard-allpaid-before.png` | `dashboard-allpaid-after.png` | `160:2057` |
| Billing — something owed | `billing-owed-before.png` | `billing-owed-after.png` | `160:4095` |
| Billing — all paid | `billing-allpaid-before.png` | `billing-allpaid-after.png` | `160:4257` |

The first pair was captured against the test parent as it really is: no child
linked, nothing enrolled. The other four needed data that did not exist, so
they were captured against `scripts/seed-parent-ui-demo.mjs` — synthetic rows
with fixed uuids, applied, photographed and reverted. Staging was verified
clean afterwards.

## Reading the "before" shots honestly

**Both Billing "before" shots say "No activity yet" even with the data in
place.** That is correct and not a failed capture. The old `/parent/billing`
reads the `notifications` table and renders an enrolment activity log; the seed
writes enrolments, bookings and sessions, not notifications. It is the same
difference the PR describes: the new screen reads `/api/parent/billing`, which
is where subscriptions actually live. Seeding notification rows to make the old
page look busier would have been faking the comparison.

**The nav in the "before" shots has seven items**, which is what prompted the
SCREEN_MAP row 2 correction. Rewards appears only when there is a credit
programme or a balance, so it is absent from the earliest capture and present
later.

## The subject tiles read SM and SP

`subjectCode()` derives two letters from the class name, and these class names
begin with the literal `[SEED]` prefix. Real classes give real initials; the
prefix is there so no one mistakes a seeded class for a tutor's own.

## Seeded classes are visible in Explore while the seed is applied

The script sets `visibility='unlisted'`, which an earlier version of this file
claimed kept them out of the marketplace. It does not: the catalogue query
excludes only `private`, so the three `[SEED]` classes appear in Explore
alongside the real ones — visible in `explore-after.png`. They are staging-only
and `--revert` removes them, but the claim was wrong and is corrected here.

## The screenshots in `protocol/` and why the old ones were not enough

Everything in `protocol/` was captured under the verification protocol adopted
after the design review, by `scripts/verify-ds-render.mjs`. The earlier
"after" shots in this folder were taken as full-page captures at one width,
and that method is structurally blind to three of the things the review
found:

- **`fullPage` flattens `position: sticky`.** A header and a bottom nav that
  never stick photograph perfectly in a full-page capture. Everything in
  `protocol/` is a viewport capture, and each route has a `-scrolled` pair
  taken after a real 700px scroll, which is the only way the difference shows.
- **One narrow viewport cannot show a desktop layout.** Every route is shot at
  **390** and **1280**. The 1280 shots are what make the missing desktop
  layout legible rather than arguable — the phone column simply centres.
- **A missing 1px border is invisible at 2x downscale.** So borders are no
  longer judged from pictures at all; `getComputedStyle` is read directly and
  the run fails on any `.bw-*` edge that is not full width.

Re-run it against a dev server:

```
node scripts/verify-ds-render.mjs --parent \
  --routes /parent/dashboard,/parent/billing,/parent/my-classes,/parent/classes \
  --shots docs/parent-ui-v2/protocol
```

Measured on this branch, every route green:

| route | border edges | sticky header / nav |
|---|---|---|
| `/dev/ui` | 202 / 202 | holds through 800px |
| `/parent/dashboard` | 65 / 65 | both hold (453px @390, 377px @1280) |
| `/parent/billing` | 49 / 49 | both hold @390 |
| `/parent/my-classes` | 45 / 45 | page shorter than the viewport |
| `/parent/classes` (Explore) | 9 / 9 | both hold through 700px |

Explore reports only 9 because it is the **old** marketplace inside the new
shell — the deferred tradeoff, not a regression. Its nine are the header rule
and the shell's own buttons.

The Past tab needs a click, so `verify-ds-render` cannot reach it; it was shot
separately with the same computed-style check (6 `.bw-*` elements, none at
zero width, at both widths).

## What these screenshots do NOT settle

**The Classes screen's visuals are provisional.** It was built from a written
description while Figma access was unavailable, so frame `160:3622` has never
been read. The selected-tab colour and the date grouping are this design
system applied by analogy, not values taken from the design. There is an
inline comment saying so in `ParentClassesV2.tsx`. Approve the behaviour from
these shots if you like; do not read them as sign-off on the appearance.

**There is still no desktop layout.** The 1280 shots show a 430px column
centred in the viewport, which is the honest current state and a known gap,
not something these captures fixed.

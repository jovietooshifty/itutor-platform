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

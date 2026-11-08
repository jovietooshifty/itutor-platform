# Teacher verification: staging handoff

Staging only. Production (Supabase ref `nfkrfciozjxrodkusrhh`) is never touched by anything here. Staging is ref `thjsdcbzlvjradczhgso`.

## What this is

One verification system for teachers, with Didit as the only identity provider.

- Teachers see a checklist (ID check, credentials, optional details) they can do in any order. Progress is saved. **Send for review** turns on when the ID check and at least one credential are done.
- A credential is a type, a title and an image. Each type shows an example and a short clue under the title field.
- Admins review at `/admin/verification-v2`: status history, who approved and when, the Didit result (pass, fail, in review), attempts, name match, every credential with its image through a short-lived signed link, and each credential's approval date. Admins can revoke (a reason from a fixed list is required) and re-approve.
- Students and parents see a Verified badge and a **Verification details** page (`/verification-details/<teacherId>`) with the teacher's real name and approved credential images. Nothing about the ID, selfie, Didit, reasons or notes.
- Status changes reach the teacher in the app only. No email.
- On every environment except production the feature is on without a flag. In production it needs `VERIFICATION_V2_ENABLED=true`.

## 1. Run the SQL (you, in the staging SQL Editor)

1. Run `docs/pre-check-notifications.sql` and read every result.
2. Run `docs/apply-verification-migrations.sql` once. It is migrations 270 to 276 in one transaction: all or nothing, safe to run twice. It drops no table and deletes no data. Migration 276 also copies every teacher already verified under the old system into the new records as **VERIFIED**, with their original date and source `legacy`, so nobody loses a badge.
3. To undo: `docs/rollback-verification-migrations.sql` (destructive: it drops the new tables).

Optional test teachers: the commented seed block at the end of the apply file (only matches `@example.test` accounts that already exist).

## 2. Environment variables (Vercel, staging)

Only these three are read. If one is missing the teacher sees "Verification setup is not finished yet." and the admin page names the missing variable (the name only, never the value).

| Variable | What |
|---|---|
| `DIDIT_API_KEY` | Didit API key. Use the **sandbox** key on staging. |
| `DIDIT_WORKFLOW_ID` | The Didit workflow to run. |
| `DIDIT_WEBHOOK_SECRET` | Shown once when you add the webhook destination in Didit. |

There is no fallback workflow id and no sandbox default in the code. Remove any `STRIPE_IDENTITY_*`, `VERIFF_*`, `IDENTITY_PRIMARY_PROVIDER`, `DIDIT_EXPECT_ENVIRONMENT`, `DIDIT_SANDBOX_SCENARIO`, `DIDIT_BASE_URL`, `DIDIT_WEBHOOK_SECRET_PREVIOUS` and `VERIFICATION_PROCESS_SECRET` values you set earlier. They are no longer read. The payments Stripe variables are unrelated and stay.

Webhook destination in Didit: `https://<staging-host>/api/webhooks/identity/didit`, event `status.updated`. The signature (`X-Signature-V2`, with `X-Signature` as the older form) is checked against the raw body and a 5 minute window, and the decision is fetched from Didit rather than trusted from the payload. The same session id is applied once.

## 3. What was removed or redirected

- `/tutor/verification` and `/tutor/verification/upload` redirect to `/tutor/verification-v2`. The old OCR upload pages and routes (`/api/verification/request`, `/api/tutor/verification/*`) are gone, and the Business page now shows the new status card.
- The Stripe Identity and Veriff providers, the Stripe Identity webhook route and their tests are gone. Didit is the only provider.
- Old tables are **not** dropped or renamed. The reviewer app, degree verification, verified subjects and the old admin queue still use `tutor_verification_requests`, `tutor_verified_subjects` and the degree tables; they are live features and need your decision before they are touched.

## 4. Check it works

1. Sign in as a test teacher, open **Get verified**. Do the steps in a different order each time; Send for review turns on only when the ID check and one credential are done.
2. Pick each credential type and confirm its example and clue show.
3. Submit, then approve as an admin. Check the badge on the teacher's profile, a class page and `/parent/tutors/<id>`, and open the Verification details page: the name and the images must be the ones uploaded.
4. Revoke with a reason: the badge disappears everywhere and the teacher gets an in-app notice. Re-approve: the badge returns.
5. `curl -X POST https://<staging-host>/api/webhooks/identity/didit -d '{}'` must answer **400**.

## 5. Not done, and why

- Renaming old tables to `*_legacy` and removing the reviewer, degree and verified-subject code: waiting for your confirmation (see section 3).
- Running the SQL and setting the three Didit variables: only you can.
- The `env-staging` domain alias is pinned to an older deployment; repoint it to the latest staging deployment in Vercel.

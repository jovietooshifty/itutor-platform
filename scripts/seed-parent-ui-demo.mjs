// =====================================================================
// seed-parent-ui-demo.mjs — synthetic parent data for UI screenshots
// =====================================================================
// Gives the STAGING test parent (jovangoodluck+testparent@myitutor.com) a
// child, two active enrolments, an upcoming session and a payment history,
// so the parent screens can be photographed in their populated states
// instead of their empty ones.
//
// Everything it writes is synthetic and clearly marked:
//   * the child is "Anaya Seed" <jovangoodluck+seedchild1@myitutor.com>
//   * the classes are named "[SEED] …" and are visibility='private', so they
//     never enter the staging catalogue — see the note on `visibility` below
//   * every row carries a FIXED uuid from the SEED table below
//
// Because the ids are fixed, --apply is idempotent and --revert is exact:
// revert deletes those ids and nothing else. It cannot touch a real row,
// because no real row has one of these ids.
//
//   node scripts/seed-parent-ui-demo.mjs                      # dry run
//   node scripts/seed-parent-ui-demo.mjs --apply              # the happy world
//   node scripts/seed-parent-ui-demo.mjs --apply --problems   # + things needing action
//   node scripts/seed-parent-ui-demo.mjs --revert             # remove it all
//   node scripts/seed-parent-ui-demo.mjs --check              # count seeded rows
//
// WHAT EACH FLAG PRODUCES
//   --apply              Home "all paid" + Billing "all paid":
//                        1 child, 2 ACTIVE enrolments, 1 upcoming session,
//                        2 paid bookings in the history.
//   --apply --problems   adds Home "payment failed + request" and Billing
//                        with something owed: 1 booking with
//                        payment_status='failed' and 1 PENDING
//                        class_join_request.
//   --revert             deletes every seeded row, in FK order.
//   --check              prints how many seeded rows exist; 0 everywhere
//                        means a revert left staging clean.
//
// SAFETY RAILS
//   * Refuses unless NEXT_PUBLIC_SUPABASE_URL is the staging project.
//   * Writes only to the fixed ids below, plus one auth user.
//   * Never calls an app API, so no email or push is sent. The auth user is
//     created with email_confirm: true, which means GoTrue issues no
//     confirmation mail — it only sends for an unconfirmed signup, an
//     invite, a magic link or a recovery, and this is none of those. The
//     profile is also stamped is_dev_account + is_test_data so the
//     onboarding-email cron skips it.
//   * --revert is the undo. Run it when the screenshots are taken.
//
// TWO THINGS THE DATABASE DOES FOR US
//   1. A trigger creates the `sessions` row from a CONFIRMED booking's
//      confirmed times. Writing our own collided with
//      sessions_booking_id_key, so we do not write it — and --revert
//      deletes sessions by booking_id rather than by an id we never owned.
//   2. The check constraints spell their values in particular cases:
//      pricing_model 'MONTHLY', group_members.status 'approved',
//      enrollment_type 'SUBSCRIPTION', enrolment payment_status 'PAID'.
//      Lower-case guesses are rejected.
// =====================================================================

import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd(), true);

const STAGING_REF = 'thjsdcbzlvjradczhgso';
const APPLY = process.argv.includes('--apply');
const PROBLEMS = process.argv.includes('--problems');
const REVERT = process.argv.includes('--revert');
const CHECK = process.argv.includes('--check');

const PARENT_EMAIL = 'jovangoodluck+testparent@myitutor.com';
const TUTOR_EMAIL = 'jovangoodluck+testtutor@myitutor.com';

const CHILD = {
  email: 'jovangoodluck+seedchild1@myitutor.com',
  password: 'StagingSeed!Child26',
  id: 'f57c06ac-97a7-4448-8cd9-b25ee9aabbdc',
  username: 'seedchild26',
  full_name: 'Anaya Seed',
  display_name: 'Anaya',
};

// Fixed ids — the whole of what this script owns.
const SEED = {
  groupMaths: 'c5d62fb4-b464-4103-9b5e-4d5143385a6c',
  groupPhysics: 'bc8bc166-c69a-4890-9585-6622cee99e52',
  // A class the child is NOT enrolled in. The pending join request has to point
  // at one: listParentClassRequests calls settleIfEnrolled, so a request for a
  // class the child already holds a seat in closes itself the moment anyone
  // looks at it, and the "wants to join" card never renders.
  groupBiology: '6d9b2f31-4c70-4a2e-9f2c-6e3a51d0c7b4',
  // A class that is OVER, so the Classes tab's Past half has something in it.
  // It needs a class of its own: the two active enrolments must stay active,
  // and an enrolment on Biology would settle the pending join request.
  groupSpanish: '0c84a7e2-55f1-4d3b-9a16-3ef0c21d8b77',
  enrolMaths: '7b090060-25f8-4898-a1f4-377be1cd7178',
  enrolPhysics: '072f35fb-ef7e-4236-ae47-cefe2c09df25',
  enrolEnded: 'b3e1d9c4-7a28-4f05-8c6d-1e29a7b4f308',
  memberMaths: '2d621976-1927-4cd3-bba4-8f3e8afa9adf',
  memberPhysics: '986ed7d4-3ef7-4a53-ad49-591cb34bd209',
  memberSpanish: 'c71f4a60-9d83-4e12-bb5a-20f6d8c3419e',
  bookingUpcoming: '64dcc18d-460b-4d47-93c4-5f2fe9b03434',
  bookingPaid: '409fbbcf-dbda-42f6-acc6-8051aacddbfc',
  bookingFailed: '53519e24-b7c7-441b-922b-db2261b9ac75',
  bookingAwaitingParent: 'd48c2b71-6e30-4a95-83f7-5c1b09e2da64',
  joinRequest: 'a1b2c3d4-0002-4000-8000-00000000f002',
};

const BOOKING_IDS = [
  SEED.bookingUpcoming,
  SEED.bookingPaid,
  SEED.bookingFailed,
  SEED.bookingAwaitingParent,
];

const day = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

async function findUserByEmail(db, target) {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
  }
}

async function report(db, parentId) {
  const rows = [
    ['profiles (child)', db.from('profiles').select('id').eq('id', CHILD.id)],
    [
      'parent_child_links',
      db.from('parent_child_links').select('id').eq('parent_id', parentId).eq('child_id', CHILD.id),
    ],
    ['groups', db
        .from('groups')
        .select('id')
        .in('id', [SEED.groupMaths, SEED.groupPhysics, SEED.groupBiology, SEED.groupSpanish])],
    [
      'group_members',
      db
        .from('group_members')
        .select('id')
        .in('id', [SEED.memberMaths, SEED.memberPhysics, SEED.memberSpanish]),
    ],
    [
      'group_enrollments',
      db
        .from('group_enrollments')
        .select('id')
        .in('id', [SEED.enrolMaths, SEED.enrolPhysics, SEED.enrolEnded]),
    ],
    ['bookings', db.from('bookings').select('id').in('id', BOOKING_IDS)],
    ['sessions', db.from('sessions').select('id').in('booking_id', BOOKING_IDS)],
    ['class_join_requests', db.from('class_join_requests').select('id').eq('id', SEED.joinRequest)],
  ];
  let total = 0;
  console.log('Seeded rows now present:');
  for (const [label, q] of rows) {
    const { data, error } = await q;
    const n = error ? '?' : data.length;
    if (!error) total += data.length;
    console.log(`  ${label.padEnd(22)} ${n}${error ? '  (' + error.message + ')' : ''}`);
  }
  const user = await findUserByEmail(db, CHILD.email);
  console.log(`  ${'auth user'.padEnd(22)} ${user ? 1 : 0}`);
  total += user ? 1 : 0;
  console.log(`\n  TOTAL ${total}${total === 0 ? '  — staging is clean' : ''}`);
  return total;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  if (!url.includes(STAGING_REF)) {
    return fail(`Refusing: ${url} is not the staging project (${STAGING_REF}).`);
  }

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const mode = CHECK
    ? 'CHECK'
    : REVERT
      ? 'REVERT'
      : APPLY
        ? PROBLEMS
          ? 'APPLY + problems'
          : 'APPLY'
        : 'dry run';
  console.log(`Project: ${url}\nMode:    ${mode}\n`);

  // ── who we attach to ──────────────────────────────────────────────────
  const { data: people } = await db
    .from('profiles')
    .select('id, email, role')
    .in('email', [PARENT_EMAIL, TUTOR_EMAIL]);

  const parent = (people ?? []).find((p) => p.email === PARENT_EMAIL);
  const tutor = (people ?? []).find((p) => p.email === TUTOR_EMAIL);
  if (!parent) return fail(`No parent profile for ${PARENT_EMAIL}. Run create-test-accounts.mjs first.`);
  if (!tutor) return fail(`No tutor profile for ${TUTOR_EMAIL}. Run create-test-accounts.mjs first.`);

  if (CHECK) {
    await report(db, parent.id);
    return;
  }

  const { data: subject } = await db
    .from('subjects')
    .select('id, label')
    .ilike('label', '%Mathematics%')
    .limit(1)
    .maybeSingle();
  if (!subject) return fail('No Mathematics subject row found.');

  console.log(`parent  ${parent.id}`);
  console.log(`tutor   ${tutor.id}`);
  console.log(`subject ${subject.id}  (${subject.label})\n`);

  // ── revert ────────────────────────────────────────────────────────────
  if (REVERT) {
    // Sessions first and by booking_id: the row belongs to a trigger, not to
    // us, so there is no fixed id to delete by.
    const { error: sessErr } = await db.from('sessions').delete().in('booking_id', BOOKING_IDS);
    console.log(`  delete sessions (by booking): ${sessErr ? 'ERROR ' + sessErr.message : 'ok'}`);

    const steps = [
      ['class_join_requests', [SEED.joinRequest]],
      ['bookings', BOOKING_IDS],
      ['group_enrollments', [SEED.enrolMaths, SEED.enrolPhysics, SEED.enrolEnded]],
      ['group_members', [SEED.memberMaths, SEED.memberPhysics, SEED.memberSpanish]],
      ['groups', [SEED.groupMaths, SEED.groupPhysics, SEED.groupBiology, SEED.groupSpanish]],
    ];
    for (const [table, ids] of steps) {
      const { error } = await db.from(table).delete().in('id', ids);
      console.log(`  delete ${table}: ${error ? 'ERROR ' + error.message : 'ok'}`);
    }

    const { error: linkErr } = await db
      .from('parent_child_links')
      .delete()
      .eq('parent_id', parent.id)
      .eq('child_id', CHILD.id);
    console.log(`  delete parent_child_links: ${linkErr ? 'ERROR ' + linkErr.message : 'ok'}`);

    const { error: profErr } = await db.from('profiles').delete().eq('id', CHILD.id);
    console.log(`  delete child profile: ${profErr ? 'ERROR ' + profErr.message : 'ok'}`);

    const existingUser = await findUserByEmail(db, CHILD.email);
    if (existingUser) {
      const { error } = await db.auth.admin.deleteUser(existingUser.id);
      console.log(`  delete auth user: ${error ? 'ERROR ' + error.message : 'ok'}`);
    } else {
      console.log('  delete auth user: none');
    }

    console.log('');
    await report(db, parent.id);
    return;
  }

  // ── the plan ──────────────────────────────────────────────────────────
  const plan = [
    `auth user + profile   ${CHILD.full_name} <${CHILD.email}> (id ${CHILD.id})`,
    `parent_child_links    ${parent.id} -> ${CHILD.id}, requires_approval=true`,
    `groups                [SEED] CSEC Mathematics  TT$180/month, private`,
    `groups                [SEED] CSEC Physics      TT$160/month, private`,
    `groups                [SEED] CSEC Biology      TT$150/month, private — no seat`,
    `groups                [SEED] CSEC Spanish      TT$140/month, private — ended`,
    `group_members ×2      ${CHILD.full_name} approved in both`,
    `group_enrollments ×2  ACTIVE, payer_id=parent, next charge in 19 and 24 days`,
    `bookings              1 CONFIRMED upcoming (paid) + 1 COMPLETED (paid)`,
    `sessions              1 SCHEDULED ${new Date(now + 2 * day).toDateString()} — written by the trigger, not by us`,
  ];
  if (PROBLEMS) {
    plan.push(
      `bookings              1 more with payment_status='failed', TT$180`,
      `bookings              1 PENDING_PARENT_APPROVAL — the 1:1 request row`,
      `group_enrollments     1 CANCELLED on [SEED] CSEC Spanish — the Past half`,
      `class_join_requests   1 PENDING for [SEED] CSEC Biology — no seat, so it does not self-settle`
    );
  }
  console.log('Would write:');
  for (const line of plan) console.log('  ' + line);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply (and --problems) to write it.');
    return;
  }
  console.log('');

  // ── child auth user + profile ─────────────────────────────────────────
  const existingUser = await findUserByEmail(db, CHILD.email);
  if (existingUser && existingUser.id !== CHILD.id) {
    return fail(
      `${CHILD.email} already exists as ${existingUser.id}, not the fixed seed id. ` +
        'Delete it by hand or change CHILD.id — refusing to guess.'
    );
  }
  if (!existingUser) {
    const { error } = await db.auth.admin.createUser({
      id: CHILD.id,
      email: CHILD.email,
      password: CHILD.password,
      // Confirmed at creation, so GoTrue sends nothing.
      email_confirm: true,
      user_metadata: { full_name: CHILD.full_name, role: 'student' },
    });
    if (error) return fail(`createUser: ${error.message}`);
    console.log('  auth user created');
  } else {
    console.log('  auth user already present');
  }

  const w = async (label, p) => {
    const { error } = await p;
    console.log(`  ${label}: ${error ? 'ERROR ' + error.message : 'ok'}`);
    if (error) process.exitCode = 1;
  };

  await w(
    'child profile',
    db.from('profiles').upsert({
      id: CHILD.id,
      email: CHILD.email,
      role: 'student',
      full_name: CHILD.full_name,
      display_name: CHILD.display_name,
      username: CHILD.username,
      form_level: 'Form 4',
      school: 'Seed Secondary School',
      billing_mode: 'parent_required',
      is_test_data: true,
      is_dev_account: true,
      terms_accepted: true,
    })
  );

  await w(
    'parent_child_links',
    db.from('parent_child_links').upsert(
      {
        parent_id: parent.id,
        child_id: CHILD.id,
        child_color: '#9333EA',
        billing_mode: 'parent_required',
        requires_approval: true,
      },
      { onConflict: 'parent_id,child_id' }
    )
  );

  const groupBase = {
    tutor_id: tutor.id,
    status: 'PUBLISHED',
    // PRIVATE, and this is load-bearing. 'unlisted' does NOT hide a class:
    // the catalogue query is .or('visibility.neq.private,visibility.is.null'),
    // so unlisted classes appear in Explore — verified by screenshot, where all
    // three [SEED] classes sat among the real ones. Staging holds real customer
    // accounts, so a fake class in the catalogue is visible to real people.
    //
    // 'private' is safe for everything this seed needs: the visibility gate in
    // GET /api/groups/[groupId] blocks ANONYMOUS viewers only, so the signed-in
    // parent still opens the class page a Classes row links to.
    visibility: 'private',
    pricing_model: 'MONTHLY',
    timezone: 'America/Port_of_Spain',
    max_students: 12,
    session_length_minutes: 60,
  };

  await w(
    'group [SEED] CSEC Mathematics',
    db.from('groups').upsert({
      ...groupBase,
      id: SEED.groupMaths,
      name: '[SEED] CSEC Mathematics',
      subject: 'Mathematics',
      description: 'Synthetic class for UI screenshots. Not a real class.',
      price_monthly: 180,
      form_level: 'Form 4',
    })
  );

  await w(
    'group [SEED] CSEC Physics',
    db.from('groups').upsert({
      ...groupBase,
      id: SEED.groupPhysics,
      name: '[SEED] CSEC Physics',
      subject: 'Physics',
      description: 'Synthetic class for UI screenshots. Not a real class.',
      price_monthly: 160,
      form_level: 'Form 4',
      require_join_requests: true,
    })
  );

  await w(
    'group [SEED] CSEC Biology',
    db.from('groups').upsert({
      ...groupBase,
      id: SEED.groupBiology,
      name: '[SEED] CSEC Biology',
      subject: 'Biology',
      description: 'Synthetic class for UI screenshots. Not a real class.',
      price_monthly: 150,
      form_level: 'Form 4',
      require_join_requests: true,
    })
  );

  await w(
    'group [SEED] CSEC Spanish',
    db.from('groups').upsert({
      ...groupBase,
      id: SEED.groupSpanish,
      name: '[SEED] CSEC Spanish',
      subject: 'Spanish',
      description: 'Synthetic class for UI screenshots. Not a real class.',
      price_monthly: 140,
      form_level: 'Form 4',
    })
  );

  await w(
    'group_members',
    db.from('group_members').upsert([
      {
        id: SEED.memberMaths,
        group_id: SEED.groupMaths,
        user_id: CHILD.id,
        status: 'approved',
        parent_id: parent.id,
      },
      {
        id: SEED.memberPhysics,
        group_id: SEED.groupPhysics,
        user_id: CHILD.id,
        status: 'approved',
        parent_id: parent.id,
      },
      {
        id: SEED.memberSpanish,
        group_id: SEED.groupSpanish,
        user_id: CHILD.id,
        // The class ended; the roster row stays, as it does in real data.
        status: 'removed',
        parent_id: parent.id,
      },
    ])
  );

  const enrolBase = {
    student_id: CHILD.id,
    status: 'ACTIVE',
    payment_status: 'PAID',
    enrollment_type: 'SUBSCRIPTION',
    payer_id: parent.id,
    billing_provider: 'stripe',
    current_period_start: iso(now - 11 * day),
    last_paid_at: iso(now - 11 * day),
  };

  await w(
    'group_enrollments',
    db.from('group_enrollments').upsert([
      {
        ...enrolBase,
        id: SEED.enrolMaths,
        group_id: SEED.groupMaths,
        plan_price_ttd: 180,
        current_period_end: iso(now + 19 * day),
        next_payment_due_at: iso(now + 19 * day),
      },
      {
        ...enrolBase,
        id: SEED.enrolPhysics,
        group_id: SEED.groupPhysics,
        plan_price_ttd: 160,
        current_period_end: iso(now + 24 * day),
        next_payment_due_at: iso(now + 24 * day),
      },
    ])
  );

  const bookingBase = {
    student_id: CHILD.id,
    tutor_id: tutor.id,
    subject_id: subject.id,
    payer_id: parent.id,
    duration_minutes: 60,
  };

  const upStart = now + 2 * day;
  await w(
    'bookings',
    db.from('bookings').upsert([
      {
        ...bookingBase,
        id: SEED.bookingUpcoming,
        status: 'CONFIRMED',
        payment_status: 'paid',
        price_ttd: 180,
        frozen_price: 180,
        requested_start_at: iso(upStart),
        requested_end_at: iso(upStart + 3_600_000),
        confirmed_start_at: iso(upStart),
        confirmed_end_at: iso(upStart + 3_600_000),
      },
      {
        ...bookingBase,
        id: SEED.bookingPaid,
        status: 'COMPLETED',
        payment_status: 'paid',
        price_ttd: 160,
        frozen_price: 160,
        requested_start_at: iso(now - 9 * day),
        requested_end_at: iso(now - 9 * day + 3_600_000),
        confirmed_start_at: iso(now - 9 * day),
        confirmed_end_at: iso(now - 9 * day + 3_600_000),
      },
    ])
  );

  if (PROBLEMS) {
    // An ENDED enrolment, so the Classes tab's Past half is not photographed
    // empty. CANCELLED + cancelled_at is what /api/parent/billing reads as
    // `cancelled: true`, which is what puts a row in Past.
    await w(
      'group_enrollments (ended)',
      db.from('group_enrollments').upsert({
        ...enrolBase,
        id: SEED.enrolEnded,
        group_id: SEED.groupSpanish,
        status: 'CANCELLED',
        plan_price_ttd: 140,
        current_period_start: iso(now - 95 * day),
        current_period_end: iso(now - 35 * day),
        next_payment_due_at: null,
        last_paid_at: iso(now - 65 * day),
        cancelled_at: iso(now - 35 * day),
        cancellation_reason: 'Seeded: the class finished.',
      })
    );

    // A 1:1 session request WAITING ON THE PARENT. listParentRequests selects
    // bookings by status, and only PENDING_PARENT_APPROVAL lands in the pending
    // queue — a plain PENDING booking (what the failed-payment row below is)
    // never appears there, which is why the first screenshots showed the group
    // request alone.
    await w(
      'bookings (awaiting parent approval)',
      db.from('bookings').upsert({
        ...bookingBase,
        id: SEED.bookingAwaitingParent,
        status: 'PENDING_PARENT_APPROVAL',
        payment_status: 'pending',
        price_ttd: 120,
        frozen_price: 120,
        requested_at: iso(now - 3 * 3_600_000),
        requested_start_at: iso(now + 3 * day),
        requested_end_at: iso(now + 3 * day + 3_600_000),
        expires_at: iso(now + 3 * day - 2 * 3_600_000),
      })
    );

    await w(
      'bookings (failed payment)',
      db.from('bookings').upsert({
        ...bookingBase,
        id: SEED.bookingFailed,
        status: 'PENDING',
        payment_status: 'failed',
        price_ttd: 180,
        frozen_price: 180,
        requested_start_at: iso(now + 4 * day),
        requested_end_at: iso(now + 4 * day + 3_600_000),
      })
    );

    await w(
      'class_join_requests (pending)',
      db.from('class_join_requests').upsert({
        id: SEED.joinRequest,
        group_id: SEED.groupBiology,
        student_id: CHILD.id,
        parent_id: parent.id,
        status: 'PENDING',
        requested_at: iso(now - 2 * 3_600_000),
      })
    );
  }

  console.log('');
  await report(db, parent.id);
  console.log(
    `\nSign in as ${PARENT_EMAIL} and open /parent/dashboard and /parent/billing.` +
      `\nUndo with:  node scripts/seed-parent-ui-demo.mjs --revert`
  );
}

main().catch((e) => fail(String(e?.message || e)));

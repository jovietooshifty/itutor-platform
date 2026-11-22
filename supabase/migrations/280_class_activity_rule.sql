-- 280: Keeping classes active (Product Sprint, 21 Nov 2026, item 4)
--      + the public/private rule made structural (item 2).
--
-- Additive except section 1, which rewrites two columns on existing rows (see
-- its note). Safe to re-run.
--
-- What the app needs from this migration, and what happens without it:
--   * class_activity_state / class_activity_exemptions: read and written only
--     by the archive-groups cron and the keep-active / restore / admin routes,
--     all with the service role. Every one of them treats a missing table as
--     "no state yet" and carries on, so the app does not break if this has not
--     been applied — but the cron then cannot record notices, so it stays in
--     DRY RUN until it can (lib/server/classActivity.ts).
--   * the notification types: without them the in-app rows are refused by
--     notifications_type_check (emails still go).

-- ---------------------------------------------------------------------------
-- 1. Public or private, nothing else
-- ---------------------------------------------------------------------------
-- The create form wrote 'unlisted' for every class a tutor marked private, and
-- the marketplace only hid 'private', so those classes were LISTED. They are
-- what the tutor asked for: private. Private classes always need the tutor's
-- approval to join, which until now only PATCH /api/classes/[id]/settings
-- enforced; the trigger makes it true whichever route writes the row.

update public.groups set visibility = 'private' where visibility = 'unlisted';
update public.groups set require_join_requests = true
 where visibility = 'private' and coalesce(require_join_requests, false) = false;

create or replace function public.groups_private_requires_approval()
returns trigger
language plpgsql
as $$
begin
  if new.visibility in ('private', 'unlisted') then
    new.require_join_requests := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_groups_private_requires_approval on public.groups;
create trigger trg_groups_private_requires_approval
  before insert or update of visibility, require_join_requests on public.groups
  for each row execute function public.groups_private_requires_approval();

-- ---------------------------------------------------------------------------
-- 2. Per-class state of the keep-active rules
-- ---------------------------------------------------------------------------
-- One row per class the rules have touched. Kept OUT of `groups` on purpose:
-- tutors can update their own groups rows under RLS, and none of this may be
-- tutor-writable (a tutor could otherwise postpone their own archive forever
-- without pressing anything, or exempt themselves).

create table if not exists public.class_activity_state (
  group_id          uuid primary key references public.groups(id) on delete cascade,
  -- When the current 30-day period began: "Keep my class active" and
  -- "Reactivate" move it to now. NULL = the class's created_at.
  clock_started_at  timestamptz,
  -- First time the rules saw an enrolled student. From then on the no-students
  -- rule never applies to this class again; the 90-day rule still does.
  had_student_at    timestamptz,
  -- The warning in progress. ONE per class, so a teacher can never get a
  -- 30-day and a 90-day warning about the same class at the same time.
  warning_rule      text check (warning_rule in ('no_students', 'inactive')),
  warned_at         timestamptz,
  reminded_at       timestamptz,
  -- Last "a student is waiting on you" nudge (pending join requests hold the
  -- archive back instead of letting it happen).
  request_nudged_at timestamptz,
  -- Set when the rules archived the class; reactivation restores
  -- previous_status ('PUBLISHED' or 'DRAFT') rather than forcing PUBLISHED.
  archived_rule     text check (archived_rule in ('no_students', 'inactive')),
  archived_at       timestamptz,
  previous_status   text,
  updated_at        timestamptz not null default now()
);

create index if not exists class_activity_state_warning_idx
  on public.class_activity_state (warning_rule) where warning_rule is not null;
create index if not exists class_activity_state_archived_idx
  on public.class_activity_state (archived_at) where archived_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Admin exemptions — a whole teacher, or one class
-- ---------------------------------------------------------------------------

create table if not exists public.class_activity_exemptions (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid references public.profiles(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  reason      text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint class_activity_exemptions_one_target
    check ((tutor_id is null) <> (group_id is null))
);

create unique index if not exists class_activity_exemptions_tutor_uq
  on public.class_activity_exemptions (tutor_id) where tutor_id is not null;
create unique index if not exists class_activity_exemptions_group_uq
  on public.class_activity_exemptions (group_id) where group_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Service role only
-- ---------------------------------------------------------------------------
-- Supabase grants anon and authenticated ALL on new tables (see 255). Revoke,
-- enable RLS, and add no policies: every read and write is the service role.

revoke all on public.class_activity_state, public.class_activity_exemptions from anon, authenticated;
alter table public.class_activity_state enable row level security;
alter table public.class_activity_exemptions enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Notification types — APPENDED to whatever the live constraint holds
-- ---------------------------------------------------------------------------
-- Every earlier migration rewrote notifications_type_check from a hand-copied
-- list, and branches have added types since 268. Rewriting it from this file
-- could silently drop one of theirs, so this reads the live list and adds to it.

do $$
declare
  v_def   text;
  v_types text[];
  v_new   text[] := array['class_activity_notice', 'class_activity_reminder', 'class_archived', 'class_join_request_nudge'];
  v_t     text;
  v_list  text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conname = 'notifications_type_check'
     and c.conrelid = 'public.notifications'::regclass;

  if v_def is null then
    raise notice '280: notifications_type_check not found; nothing to extend';
    return;
  end if;

  select coalesce(array_agg(m[1]), '{}') into v_types
    from regexp_matches(v_def, '''([^'']+)''', 'g') as m;

  foreach v_t in array v_new loop
    if not (v_t = any(v_types)) then
      v_types := v_types || v_t;
    end if;
  end loop;

  select string_agg(quote_literal(t), ', ') into v_list from unnest(v_types) as t;

  execute 'alter table public.notifications drop constraint notifications_type_check';
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s)) not valid',
    v_list
  );
end;
$$;

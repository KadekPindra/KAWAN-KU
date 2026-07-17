-- KAWAN skema §4. Ids berupa text (mis. "garuda-demo", "need:uuid").

create table if not exists people (
  id text primary key,
  team_id text not null,
  display_name text not null,
  slack_user_id text,
  joined_at timestamptz not null,
  interests jsonb not null default '[]',
  opted_in boolean not null default true,
  risk_consent boolean not null default false
);

create table if not exists screenings (
  id text primary key,
  team_id text not null,
  person_id text not null,
  cycle text not null,
  q1 int, q2 int, q3 int,
  ucla3_score int,
  lonely boolean,
  delivered_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null,
  unique (team_id, person_id, cycle)
);

create table if not exists detection_state (
  team_id text not null,
  person_id text not null,
  cycle text not null,
  lonely boolean not null,
  lonely_streak int not null,
  trend text not null,
  flagged boolean not null,
  clinical_suggest boolean not null,
  primary key (team_id, person_id, cycle)
);

create table if not exists needs (
  id text primary key,
  team_id text not null,
  source text not null,
  raw_text text not null,
  parsed jsonb,
  slots_total int not null,
  slots_open int not null,
  week text not null,
  status text not null,
  created_at timestamptz not null,
  author_person_id text,
  source_url text
);

create table if not exists pools (
  id text primary key,
  need_id text not null,
  week text not null,
  member_ids jsonb not null,
  skewed_ids jsonb not null
);

create table if not exists invites (
  id text primary key,
  pool_id text not null,
  person_id text not null,
  need_id text not null,
  delivered_at timestamptz,
  state text not null,
  claimed_at timestamptz
);

create table if not exists outcomes (
  id text primary key,
  invite_id text not null,
  person_id text not null,
  need_id text not null,
  showed_up boolean,
  created_at timestamptz not null
);

create table if not exists risk_events (
  id text primary key,
  person_id text not null,
  cycle text not null,
  source text not null,
  handed_off_at timestamptz,
  created_at timestamptz not null
);

create table if not exists institution_metrics (
  team_id text not null,
  period text not null,
  responded_count int,
  lonely_count int,
  invites_sent int,
  claim_rate double precision,
  avg_ucla3 double precision,
  primary key (team_id, period)
);

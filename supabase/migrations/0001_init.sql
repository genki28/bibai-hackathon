-- 雪かきマッチングのデータの「設計図」(表の作り方)。
-- Supabase の SQL エディタに貼り付けて実行する。何度実行しても壊れないように書いてある。
--
-- 安全のため、すべての表で RLS(行レベルセキュリティ = 行ごとの読み書きの許可)を有効にし、
-- 許可(ポリシー)は 1 つも作らない。これで、ブラウザ用の公開キーからは読み書きできない。
-- サーバーは secret キー(sb_secret_...)を使うので、RLS を通り抜けて読み書きできる。

-- ───────────────────────────────────────────
-- 雪かきの依頼(1 依頼 = 1 行)
-- 参加者(helpers)と評価(ratings)は jsonb(= JSON をそのまま入れる列)で同じ行に持つ。
-- 1 行にまとめておくと、version 列だけで「同時に書き換えた」ことに気づける(楽観ロック)。
-- ───────────────────────────────────────────
create table if not exists public.help_requests (
  id            uuid primary key,
  user_id       text not null,                         -- 依頼したお年寄りの LINE ユーザー ID
  amount        text not null check (amount in ('little', 'normal', 'lots')),
  name          text,
  address       text,
  lat           double precision,
  lng           double precision,
  depth         text,
  tools         text,
  status        text not null check (status in ('waiting', 'accepted', 'working', 'done', 'cancelled')),
  created_at    timestamptz not null,
  helpers       jsonb not null default '[]'::jsonb,     -- [{ userId, displayName, joinedAt, arrivedAt }]
  started_at    timestamptz,
  finished_at   timestamptz,
  cancelled_at  timestamptz,
  result        jsonb,                                  -- { minutes, areaM2, snowDepthM, snowKg, calories, workPoints, finishedBy }
  ratings       jsonb,                                  -- { 若者のユーザー ID: 星の数 }
  thanked_at    timestamptz,
  version       integer not null default 0,             -- 書き換えるたびに 1 増える(楽観ロック用)
  updated_at    timestamptz not null default now()
);

-- 一覧(募集中・参加受付中)を状態で探す
create index if not exists help_requests_status_idx
  on public.help_requests (status, created_at);

-- お年寄りの「自分の依頼」を探す
create index if not exists help_requests_user_idx
  on public.help_requests (user_id, created_at);

-- ランキング: 終わった依頼を、終わった時刻・いいねの時刻で集計する
create index if not exists help_requests_finished_idx
  on public.help_requests (finished_at)
  where status = 'done';
create index if not exists help_requests_thanked_idx
  on public.help_requests (thanked_at)
  where thanked_at is not null;

-- 同じ人の「まだ終わっていない依頼」は 1 つだけ(同時に 2 回送られても 2 つできない)
create unique index if not exists help_requests_one_ongoing_per_user_idx
  on public.help_requests (user_id)
  where status in ('waiting', 'accepted', 'working');

alter table public.help_requests enable row level security;

-- ───────────────────────────────────────────
-- 本人確認(デモ)の結果。マイナンバーそのものは保存しない。
-- ───────────────────────────────────────────
create table if not exists public.identity_verifications (
  user_id      text primary key,
  verified_at  timestamptz not null,
  method       text not null check (method in ('mynumber-card-mock'))
);

alter table public.identity_verifications enable row level security;

-- ───────────────────────────────────────────
-- 利用者の役割(elder = 助けてほしい / helper = 助けたい)
-- ───────────────────────────────────────────
create table if not exists public.user_roles (
  user_id     text primary key,
  role        text not null check (role in ('elder', 'helper')),
  updated_at  timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- リーダーのランダムな決め方と、ポイント(勧誘・再会)のための追加。
-- 0001_init.sql のあとに、Supabase の SQL エディタに貼り付けて実行する。何度実行しても壊れないように書いてある。
--
-- 0001 と同じく、表は RLS(行レベルセキュリティ)を有効にし、許可(ポリシー)は作らない。
-- ブラウザ用の公開キーからは読み書きできず、サーバーだけが secret キーで読み書きする。

-- ───────────────────────────────────────────
-- 依頼のリーダー。雪かきを開始した瞬間に、参加者からランダムで 1 人を決めて残す(開始前は null)。
-- リーダーの役割は「雪かきを行った範囲に丸を付ける(= 終了する)」ことだけ。
-- ───────────────────────────────────────────
alter table public.help_requests
  add column if not exists leader_user_id text;

-- ───────────────────────────────────────────
-- 招待コード(1 人 1 つ)。招待リンクには LINE のユーザー ID ではなく、このランダムなコードを入れる。
-- ───────────────────────────────────────────
create table if not exists public.invite_codes (
  user_id     text primary key,                        -- コードの持ち主(誘う人)の LINE ユーザー ID
  code        text not null unique,                    -- ランダムな招待コード(英小文字と数字 10 文字)
  created_at  timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

-- ───────────────────────────────────────────
-- 招待の記録: だれが、だれに誘われたか(誘われた人 1 人につき 1 回だけ)。
-- 誘われた人が初めて雪かきを終えたときに、勧誘ポイントが入る(計算はサーバーで行う)。
-- ───────────────────────────────────────────
create table if not exists public.referrals (
  invitee_user_id  text primary key,                   -- 誘われた人
  inviter_user_id  text not null,                      -- 誘った人
  created_at       timestamptz not null default now(),
  constraint referrals_not_self check (invitee_user_id <> inviter_user_id)
);

-- 「この人が誘った人」を探す(テスト用のデータを消すときなど)
create index if not exists referrals_inviter_idx
  on public.referrals (inviter_user_id);

alter table public.referrals enable row level security;

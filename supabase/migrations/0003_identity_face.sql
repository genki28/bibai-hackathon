-- ───────────────────────────────────────────
-- 本人確認に「顔の照合(デモ)」を足す。
--   - method に 'face-match-demo' を許す(今までの 'mynumber-card-mock' もそのまま)
--   - liveness(生きた本人かの確認をしたか)の列を足す
-- 画像や顔の特徴の数値は保存しない。結果だけ。
-- 何度実行しても壊れないように書いてある(if not exists / if exists)。
-- ───────────────────────────────────────────

alter table public.identity_verifications
  add column if not exists liveness boolean not null default false;

-- 0001 で付けた method の制約(名前は Postgres が自動で付けた identity_verifications_method_check)を付け直す
alter table public.identity_verifications
  drop constraint if exists identity_verifications_method_check;

alter table public.identity_verifications
  add constraint identity_verifications_method_check
  check (method in ('mynumber-card-mock', 'face-match-demo'));

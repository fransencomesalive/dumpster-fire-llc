-- Résumé-highlights derivation is a metered model pass (cap 3/month, like the
-- voice fingerprint) — Randall, 2026-07-07. Track it in usage_ledger by extending
-- the usage_type check constraint. Additive; no data change.

alter table public.usage_ledger drop constraint if exists usage_ledger_usage_type_check;
alter table public.usage_ledger add constraint usage_ledger_usage_type_check
  check (usage_type in ('pursuit', 'outreach_message', 'human_path', 'profile_export', 'voice_fingerprint', 'resume_highlights'));

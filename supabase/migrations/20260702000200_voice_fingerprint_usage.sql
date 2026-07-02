-- Voice-fingerprint pass is capped at 3 model calls per month (Randall, 2026-07-02).
-- Track it in usage_ledger: extend the usage_type check constraint.

alter table public.usage_ledger drop constraint if exists usage_ledger_usage_type_check;
alter table public.usage_ledger add constraint usage_ledger_usage_type_check
  check (usage_type in ('pursuit', 'outreach_message', 'human_path', 'profile_export', 'voice_fingerprint'));

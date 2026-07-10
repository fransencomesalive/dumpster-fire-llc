-- Skip ("not interested", Randall 2026-07-10): job_scan_results gains a 'dismissed' status.
-- Dismissed rows are excluded from active reads and from future scan upserts, so a skipped
-- job stays gone across scans.
-- Idempotent: drop-and-recreate the check constraint. Apply AFTER the code deploy that
-- writes 'dismissed'; confirm the constraint name against prod (\d job_scan_results) first.

alter table public.job_scan_results
  drop constraint if exists job_scan_results_status_check;

alter table public.job_scan_results
  add constraint job_scan_results_status_check
  check (status in ('active', 'actioned', 'expired', 'dismissed'));

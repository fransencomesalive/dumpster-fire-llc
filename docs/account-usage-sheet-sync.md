# Account usage sheet production sync

The production app refreshes the `Dumpster Fire Test Account Usage` Google Sheet every evening at
9 PM Mountain Time. The report uses readable Mountain Time dates and replaces the Accounts and
Summary tab values while preserving the spreadsheet's formatting and Definitions tab.

The Summary tab also contains a conversion funnel with two percentages for each stage:

- code-redeeming accounts divided by all authenticated accounts;
- completed code-redeeming profiles divided by code-redeeming accounts;
- completed code-redeeming accounts with at least one recorded message Copy divided by completed
  code-redeeming accounts;
- each stage divided by all authenticated accounts for an overall-adoption comparison.

Message Copy is read from `pursuit_tracking_events` where `source = message_copy`,
`action = outreach_sent`, and `checked = true`. A manually checked Sent state does not qualify.

## Google organization

- Google Drive folder: `Dumpster Fire`
- Google Sheet: `Dumpster Fire Test Account Usage`
- Google Cloud project display name: `Dumpster Fire`
- Google Cloud project ID: `dumpster-fire-oauth`
- Google Cloud project number: `85907681908`
- Reporting service account: `dumpster-fire-reporting@dumpster-fire-oauth.iam.gserviceaccount.com`
- Workload identity pool/provider: `vercel` / `vercel`
- Trusted production subject:
  `owner:fransencomesalive-4748s-projects:project:dumpster-fire-llc:environment:production`

Google Drive and Google Cloud are separate containers. The Drive folder organizes files people
use. The Cloud project owns the workload identity and restricted service account used by the
production sync.

## Security model

The sync uses Vercel OIDC, Google Workload Identity Federation, and service-account impersonation.
It does not create or store a Google service-account private key. The service account receives
writer access only to the account-usage spreadsheet.

## Required production configuration

1. Select the existing `dumpster-fire-oauth` Google Cloud project and record its Project ID and
   Project number.
2. Enable the Security Token Service, IAM Service Account Credentials, and Google Sheets APIs.
3. Create a service account named `dumpster-fire-reporting`.
4. Create a workload identity pool and provider, both named `vercel`, with issuer:
   `https://oidc.vercel.com/fransencomesalive-4748s-projects`
5. Set the provider's allowed audience to:
   `https://vercel.com/fransencomesalive-4748s-projects`
6. Map `google.subject` to `assertion.sub`.
7. Grant Workload Identity User on the reporting service account to this production identity:
   `owner:fransencomesalive-4748s-projects:project:dumpster-fire-llc:environment:production`
8. Share only the account-usage Sheet with the service-account email as an editor.
9. Add these Production environment variables in Vercel:
   - `GOOGLE_SHEETS_ACCOUNT_USAGE_ID`
   - `GOOGLE_CLOUD_PROJECT_NUMBER`
   - `GOOGLE_WORKLOAD_IDENTITY_POOL_ID=vercel`
   - `GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID=vercel`
   - `GOOGLE_REPORTING_SERVICE_ACCOUNT_EMAIL`
10. Redeploy and run the currently active seasonal path with Vercel's authenticated `crons run`
    command for the first manual verification.

## Schedule behavior

Vercel Cron schedules use UTC. Two distinct invocations run at 3 AM and 4 AM UTC. The handler
checks the current `America/Denver` UTC offset and accepts only the matching `summer` or `winter`
invocation. This produces one refresh per evening across daylight-saving changes; the inactive
seasonal invocation returns a successful skipped result. Vercel's authenticated manual cron runner
can execute the currently active seasonal path for production verification without weakening the
route's `CRON_SECRET` requirement.

## Verification requirement

Do not call the production sync live until the spreadsheet is shared with the service account and
all five Google environment variables are present. A complete verification records:

- an authenticated production cron invocation returning `status: updated`;
- the number of accounts returned by the route;
- the Sheet's readable `Last refreshed` value;
- unchanged Definitions content and spreadsheet formatting;
- no raw database/ISO timestamps in Accounts or Summary.

## Production verification

Verified Aug 6, 2026 against commit `751e6ee` and production deployment
`dpl_4LggZ2UWAEWnED2rRciBPxFcVFiW`:

- Vercel lists both seasonal schedules: 3 AM UTC for summer and 4 AM UTC for winter.
- The authenticated summer cron invocation returned HTTP 200 in production.
- The production write refreshed 30 account rows at Aug 6, 2026, 1:20 PM MT.
- The Summary conversion funnel reports 15 code redemptions, 8 completed profiles among those
  redemptions, and 3 completed users with a recorded message Copy.
- The Accounts header and all 30 account rows contain no raw ISO timestamps.
- The Definitions tab remained unchanged, existing header and currency formatting remained in
  place, and the `Tester Conversion Funnel` chart remained present.

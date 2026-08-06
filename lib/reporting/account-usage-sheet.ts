import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";
import { loadAllReportPages } from "../costs/unit-economics";

const REPORT_TIME_ZONE = "America/Denver";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const ACCOUNT_HEADERS = [
  "Email",
  "Email confirmed",
  "Access status",
  "Access code",
  "Access expires",
  "Profile status",
  "Role tracks",
  "Résumés",
  "Work examples",
  "Skills",
  "Job result rows",
  "Saved jobs",
  "Pursuits",
  "Pursuit status mix",
  "Contacts found",
  "Outreach drafts",
  "Outreach sent",
  "Job feedback",
  "Outreach feedback",
  "Apply Wizard uses",
  "Provider requests",
  "Input tokens",
  "Output tokens",
  "Recorded cost USD",
] as const;

type AuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

type ProfileRow = { id: string; user_id: string; status: string };
type ProfileChildRow = { id: string; profile_id: string };
type UserRow = { id: string; user_id: string };
type PursuitRow = UserRow & { status: string };
type PursuitChildRow = { id: string; pursuit_id: string; status?: string };
type FeedbackRow = { id: string; user_id: string };
type UsageRow = { id: string; user_id: string; usage_type: string; quantity: number };
type ProviderRow = {
  id: string;
  user_id: string | null;
  request_count: number;
  input_tokens: number | string;
  output_tokens: number | string;
  estimated_cost_micros: number | string;
};
type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: string;
  source: string;
  current_period_end: string | null;
};
type PlanRow = { id: string; name: string };
type GrantRow = {
  user_id: string;
  redeemed_code: string | null;
  current_period_end: string | null;
};
type TrackingEventRow = {
  id: string;
  user_id: string;
  source: string;
  action: string;
  checked: boolean;
};

export type AccountUsageSource = {
  users: AuthUser[];
  profiles: ProfileRow[];
  roleTracks: ProfileChildRow[];
  resumes: ProfileChildRow[];
  workExamples: ProfileChildRow[];
  skills: ProfileChildRow[];
  jobResults: UserRow[];
  savedJobs: UserRow[];
  pursuits: PursuitRow[];
  contacts: PursuitChildRow[];
  outreachMessages: PursuitChildRow[];
  jobFeedback: FeedbackRow[];
  outreachFeedback: FeedbackRow[];
  usage: UsageRow[];
  providerUsage: ProviderRow[];
  subscriptions: SubscriptionRow[];
  plans: PlanRow[];
  grants: GrantRow[];
  trackingEvents: TrackingEventRow[];
};

export type AccountUsageReport = {
  accounts: Array<Array<string | number | boolean>>;
  summary: Array<Array<string | number>>;
  accountCount: number;
  refreshedAt: string;
};

export type AccountUsageSheetEnv = NodeJS.ProcessEnv & {
  GOOGLE_SHEETS_ACCOUNT_USAGE_ID?: string;
  GOOGLE_CLOUD_PROJECT_NUMBER?: string;
  GOOGLE_WORKLOAD_IDENTITY_POOL_ID?: string;
  GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID?: string;
  GOOGLE_REPORTING_SERVICE_ACCOUNT_EMAIL?: string;
};

function numberValue(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function groupCount<T>(rows: T[], key: (row: T) => string) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const id = key(row);
    values.set(id, (values.get(id) ?? 0) + 1);
  }
  return values;
}

function groupSum<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const id = key(row);
    values.set(id, (values.get(id) ?? 0) + value(row));
  }
  return values;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatReportDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)} MT`;
}

function accessStatus(
  subscription: SubscriptionRow | undefined,
  planName: string | undefined,
  grant: GrantRow | undefined,
  nowMs: number,
) {
  if (!subscription) return "No access";
  const expiresAt = grant?.current_period_end ?? subscription.current_period_end;
  const expired = expiresAt ? Date.parse(expiresAt) <= nowMs : false;
  const status = expired && subscription.status === "active" ? "expired" : subscription.status;
  const source = subscription.source === "access_code" ? "code" : subscription.source;
  return `${status[0]?.toUpperCase() ?? ""}${status.slice(1)}${planName ? ` ${planName}` : ""} (${source})`;
}

function statusMix(rows: PursuitRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");
}

export function buildAccountUsageReport(
  source: AccountUsageSource,
  refreshedAt: string,
): AccountUsageReport {
  const refreshedAtMs = Date.parse(refreshedAt);
  if (!Number.isFinite(refreshedAtMs)) throw new TypeError("refreshedAt must be a valid timestamp");

  const profileByUser = new Map(source.profiles.map((row) => [row.user_id, row]));
  const roleTrackCount = groupCount(source.roleTracks, (row) => row.profile_id);
  const resumeCount = groupCount(source.resumes, (row) => row.profile_id);
  const exampleCount = groupCount(source.workExamples, (row) => row.profile_id);
  const skillCount = groupCount(source.skills, (row) => row.profile_id);
  const resultCount = groupCount(source.jobResults, (row) => row.user_id);
  const savedCount = groupCount(source.savedJobs, (row) => row.user_id);
  const pursuitsByUser = new Map<string, PursuitRow[]>();
  const pursuitUser = new Map<string, string>();
  for (const pursuit of source.pursuits) {
    pursuitUser.set(pursuit.id, pursuit.user_id);
    const rows = pursuitsByUser.get(pursuit.user_id) ?? [];
    rows.push(pursuit);
    pursuitsByUser.set(pursuit.user_id, rows);
  }
  const contactCount = groupCount(
    source.contacts.flatMap((row) => {
      const userId = pursuitUser.get(row.pursuit_id);
      return userId ? [{ ...row, userId }] : [];
    }),
    (row) => row.userId,
  );
  const outreachByUser = source.outreachMessages.flatMap((row) => {
    const userId = pursuitUser.get(row.pursuit_id);
    return userId ? [{ ...row, userId }] : [];
  });
  const draftCount = groupCount(outreachByUser.filter((row) => row.status === "draft"), (row) => row.userId);
  const sentCount = groupCount(outreachByUser.filter((row) => row.status === "sent"), (row) => row.userId);
  const jobFeedbackCount = groupCount(source.jobFeedback, (row) => row.user_id);
  const outreachFeedbackCount = groupCount(source.outreachFeedback, (row) => row.user_id);
  const applyWizardCount = groupSum(
    source.usage.filter((row) => row.usage_type === "apply_wizard"),
    (row) => row.user_id,
    (row) => row.quantity,
  );
  const attributedProvider = source.providerUsage.filter((row): row is ProviderRow & { user_id: string } => Boolean(row.user_id));
  const providerRequests = groupSum(attributedProvider, (row) => row.user_id, (row) => row.request_count);
  const inputTokens = groupSum(attributedProvider, (row) => row.user_id, (row) => numberValue(row.input_tokens));
  const outputTokens = groupSum(attributedProvider, (row) => row.user_id, (row) => numberValue(row.output_tokens));
  const costMicros = groupSum(attributedProvider, (row) => row.user_id, (row) => numberValue(row.estimated_cost_micros));
  const subscriptionByUser = new Map(source.subscriptions.map((row) => [row.user_id, row]));
  const planById = new Map(source.plans.map((row) => [row.id, row.name]));
  const grantByUser = new Map(source.grants.map((row) => [row.user_id, row]));
  const codeRedeemedUsers = new Set(
    source.subscriptions
      .filter((row) => row.source === "access_code")
      .map((row) => row.user_id),
  );
  const completedCodeUsers = new Set(
    source.profiles
      .filter((row) => row.status === "complete" && codeRedeemedUsers.has(row.user_id))
      .map((row) => row.user_id),
  );
  const copiedMessageUsers = new Set(
    source.trackingEvents
      .filter((row) => row.source === "message_copy" && row.action === "outreach_sent" && row.checked)
      .map((row) => row.user_id),
  );
  const fullSuiteUsers = new Set(
    [...completedCodeUsers].filter((userId) => copiedMessageUsers.has(userId)),
  );

  const accountRows = [...source.users]
    .sort((left, right) => (left.email ?? "").localeCompare(right.email ?? ""))
    .map((user): Array<string | number | boolean> => {
      const profile = profileByUser.get(user.id);
      const profileId = profile?.id ?? "";
      const pursuits = pursuitsByUser.get(user.id) ?? [];
      const subscription = subscriptionByUser.get(user.id);
      const grant = grantByUser.get(user.id);
      return [
        user.email ?? "Unknown email",
        Boolean(user.email_confirmed_at),
        accessStatus(subscription, planById.get(subscription?.plan_id ?? ""), grant, refreshedAtMs),
        grant?.redeemed_code ?? "",
        formatDate(grant?.current_period_end ?? subscription?.current_period_end),
        profile?.status ?? "Not started",
        roleTrackCount.get(profileId) ?? 0,
        resumeCount.get(profileId) ?? 0,
        exampleCount.get(profileId) ?? 0,
        skillCount.get(profileId) ?? 0,
        resultCount.get(user.id) ?? 0,
        savedCount.get(user.id) ?? 0,
        pursuits.length,
        statusMix(pursuits),
        contactCount.get(user.id) ?? 0,
        draftCount.get(user.id) ?? 0,
        sentCount.get(user.id) ?? 0,
        jobFeedbackCount.get(user.id) ?? 0,
        outreachFeedbackCount.get(user.id) ?? 0,
        applyWizardCount.get(user.id) ?? 0,
        providerRequests.get(user.id) ?? 0,
        inputTokens.get(user.id) ?? 0,
        outputTokens.get(user.id) ?? 0,
        Number(((costMicros.get(user.id) ?? 0) / 1_000_000).toFixed(6)),
      ];
    });

  const total = (values: Map<string, number>) => [...values.values()].reduce((sum, value) => sum + value, 0);
  const totalProviderRequests = source.providerUsage.reduce((sum, row) => sum + row.request_count, 0);
  const totalInputTokens = source.providerUsage.reduce((sum, row) => sum + numberValue(row.input_tokens), 0);
  const totalOutputTokens = source.providerUsage.reduce((sum, row) => sum + numberValue(row.output_tokens), 0);
  const totalCostUsd = source.providerUsage.reduce((sum, row) => sum + numberValue(row.estimated_cost_micros), 0) / 1_000_000;
  const activeAccess = source.users.filter((user) => accessStatus(
    subscriptionByUser.get(user.id),
    planById.get(subscriptionByUser.get(user.id)?.plan_id ?? ""),
    grantByUser.get(user.id),
    refreshedAtMs,
  ).startsWith("Active") || accessStatus(
    subscriptionByUser.get(user.id),
    planById.get(subscriptionByUser.get(user.id)?.plan_id ?? ""),
    grantByUser.get(user.id),
    refreshedAtMs,
  ).startsWith("Trialing")).length;

  const stageConversion = (count: number, prior: number) => prior > 0 ? count / prior : 0;
  const allAccountConversion = (count: number) => source.users.length > 0 ? count / source.users.length : 0;
  const summary: Array<Array<string | number>> = [
    ["Metric", "Current total", "What it means"],
    ["Accounts", source.users.length, "All authenticated Dumpster Fire accounts."],
    ["Code redemptions", codeRedeemedUsers.size, "Accounts with an access-code subscription, including legacy redemptions whose literal code was not retained."],
    ["Active access", activeAccess, "Accounts whose current entitlement is active or trialing and not expired."],
    ["Completed profiles", source.profiles.filter((row) => row.status === "complete").length, "Profiles ready to use the product."],
    ["Job result rows", source.jobResults.length, "Persisted job recommendations across all accounts, including historical rows."],
    ["Saved jobs", source.savedJobs.length, "Jobs users explicitly saved."],
    ["Pursuits", source.pursuits.length, "Jobs opened in the Apply Wizard workflow."],
    ["Contacts found", source.contacts.length, "People returned by Human Path searches."],
    ["Outreach drafts", source.outreachMessages.filter((row) => row.status === "draft").length, "Generated messages that remain drafts."],
    ["Outreach sent", source.outreachMessages.filter((row) => row.status === "sent").length, "Messages users marked as sent."],
    ["Job feedback", source.jobFeedback.length, "Job-match feedback records submitted by users."],
    ["Outreach feedback", source.outreachFeedback.length, "Outreach-message feedback records submitted by users."],
    ["Apply Wizard uses", total(applyWizardCount), "Successful new Apply Wizard pursuits recorded for quota use."],
    ["Provider requests", totalProviderRequests, "Recorded AI and contact-search provider requests, including unattributed system work."],
    ["Input tokens", totalInputTokens, "Recorded model input tokens."],
    ["Output tokens", totalOutputTokens, "Recorded model output tokens."],
    ["Recorded provider cost USD", Number(totalCostUsd.toFixed(6)), "Estimated variable provider cost captured by production telemetry."],
    ["Last refreshed", formatReportDateTime(refreshedAt), "Automatic production refresh completed at this Mountain Time."],
    [], [], [], [], [], [], [], [], [], [], [],
    ["Conversion funnel", "Accounts", "Converted from previous stage", "Converted from all accounts"],
    ["Account created", source.users.length, 1, 1],
    ["Code redeemed", codeRedeemedUsers.size, stageConversion(codeRedeemedUsers.size, source.users.length), allAccountConversion(codeRedeemedUsers.size)],
    ["Profile completed", completedCodeUsers.size, stageConversion(completedCodeUsers.size, codeRedeemedUsers.size), allAccountConversion(completedCodeUsers.size)],
    ["Message copied", fullSuiteUsers.size, stageConversion(fullSuiteUsers.size, completedCodeUsers.size), allAccountConversion(fullSuiteUsers.size)],
  ];

  return {
    accounts: [Array.from(ACCOUNT_HEADERS), ...accountRows],
    summary,
    accountCount: source.users.length,
    refreshedAt: formatReportDateTime(refreshedAt),
  };
}

async function loadAuthUsers(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch) {
  const baseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "";
  if (!baseUrl || !serviceRoleKey) throw new Error("Supabase account storage is not configured.");
  const users: AuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok) throw new Error(`Supabase Auth user list failed (${response.status}).`);
    const body = await response.json() as { users?: AuthUser[] };
    const current = body.users ?? [];
    users.push(...current);
    if (current.length < 200) return users;
  }
}

export async function loadAccountUsageSource(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: {
    repositoryRequest?: PublicProfileRepositoryRequest;
    loadUsers?: () => Promise<AuthUser[]>;
  } = {},
): Promise<AccountUsageSource> {
  let request = dependencies.repositoryRequest;
  if (!request) {
    const config = getPublicProfileRepositoryConfig(env);
    if (!config) throw new Error("Supabase account storage is not configured.");
    request = createPublicProfileRepositoryRequest(config);
  }
  const page = <T>(resource: string, params: Record<string, string>) =>
    loadAllReportPages<T>(request!, resource, params);
  const [
    users,
    profiles,
    roleTracks,
    resumes,
    workExamples,
    skills,
    jobResults,
    savedJobs,
    pursuits,
    contacts,
    outreachMessages,
    jobFeedback,
    outreachFeedback,
    usage,
    providerUsage,
    subscriptions,
    plans,
    grants,
    trackingEvents,
  ] = await Promise.all([
    dependencies.loadUsers ? dependencies.loadUsers() : loadAuthUsers(env),
    page<ProfileRow>("candidate_profiles", { select: "id,user_id,status", order: "id.asc" }),
    page<ProfileChildRow>("role_tracks", { select: "id,profile_id", archived_at: "is.null", order: "id.asc" }),
    page<ProfileChildRow>("resumes", { select: "id,profile_id", archived_at: "is.null", order: "id.asc" }),
    page<ProfileChildRow>("work_examples", { select: "id,profile_id", order: "id.asc" }),
    page<ProfileChildRow>("skill_profiles", { select: "id,profile_id", order: "id.asc" }),
    page<UserRow>("job_scan_results", { select: "id,user_id", order: "id.asc" }),
    page<UserRow>("saved_jobs", { select: "id,user_id", order: "id.asc" }),
    page<PursuitRow>("pursuits", { select: "id,user_id,status", order: "id.asc" }),
    page<PursuitChildRow>("contact_suggestions", { select: "id,pursuit_id", order: "id.asc" }),
    page<PursuitChildRow>("outreach_messages", { select: "id,pursuit_id,status", order: "id.asc" }),
    page<FeedbackRow>("job_match_feedback", { select: "id,user_id", order: "id.asc" }),
    page<FeedbackRow>("saved_message_feedback", { select: "id,user_id", order: "id.asc" }),
    page<UsageRow>("usage_ledger", { select: "id,user_id,usage_type,quantity", order: "id.asc" }),
    page<ProviderRow>("provider_usage_events", { select: "id,user_id,request_count,input_tokens,output_tokens,estimated_cost_micros", order: "id.asc" }),
    page<SubscriptionRow>("user_subscriptions", { select: "id,user_id,plan_id,status,source,current_period_end", order: "id.asc" }),
    page<PlanRow>("subscription_plans", { select: "id,name", order: "id.asc" }),
    page<GrantRow>("access_code_subscription_grants", { select: "user_id,redeemed_code,current_period_end", order: "user_id.asc" }),
    page<TrackingEventRow>("pursuit_tracking_events", {
      select: "id,user_id,source,action,checked",
      source: "eq.message_copy",
      action: "eq.outreach_sent",
      checked: "eq.true",
      order: "id.asc",
    }),
  ]);
  return {
    users, profiles, roleTracks, resumes, workExamples, skills, jobResults, savedJobs,
    pursuits, contacts, outreachMessages, jobFeedback, outreachFeedback, usage,
    providerUsage, subscriptions, plans, grants, trackingEvents,
  };
}

function requiredGoogleConfig(env: AccountUsageSheetEnv) {
  const values = {
    GOOGLE_SHEETS_ACCOUNT_USAGE_ID: env.GOOGLE_SHEETS_ACCOUNT_USAGE_ID?.trim(),
    GOOGLE_CLOUD_PROJECT_NUMBER: env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim(),
    GOOGLE_WORKLOAD_IDENTITY_POOL_ID: env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID?.trim(),
    GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID: env.GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID?.trim(),
    GOOGLE_REPORTING_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_REPORTING_SERVICE_ACCOUNT_EMAIL?.trim(),
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) throw new Error(`Google reporting is not configured: ${missing.join(", ")}.`);
  return {
    spreadsheetId: values.GOOGLE_SHEETS_ACCOUNT_USAGE_ID!,
    projectNumber: values.GOOGLE_CLOUD_PROJECT_NUMBER!,
    poolId: values.GOOGLE_WORKLOAD_IDENTITY_POOL_ID!,
    providerId: values.GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID!,
    serviceAccountEmail: values.GOOGLE_REPORTING_SERVICE_ACCOUNT_EMAIL!,
  };
}

async function googleAccessToken(
  env: AccountUsageSheetEnv,
  oidcToken: string,
  fetchImpl: typeof fetch,
) {
  if (!oidcToken) throw new Error("Vercel OIDC token is missing.");
  const config = requiredGoogleConfig(env);
  const audience = `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.poolId}/providers/${config.providerId}`;
  const exchangeResponse = await fetchImpl("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      audience,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: oidcToken,
    }).toString(),
  });
  if (!exchangeResponse.ok) throw new Error(`Google workload identity exchange failed (${exchangeResponse.status}).`);
  const exchange = await exchangeResponse.json() as { access_token?: string };
  if (!exchange.access_token) throw new Error("Google workload identity exchange returned no access token.");

  const impersonationResponse = await fetchImpl(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(config.serviceAccountEmail)}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${exchange.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: [SHEETS_SCOPE], lifetime: "3600s" }),
    },
  );
  if (!impersonationResponse.ok) throw new Error(`Google service-account impersonation failed (${impersonationResponse.status}).`);
  const impersonation = await impersonationResponse.json() as { accessToken?: string };
  if (!impersonation.accessToken) throw new Error("Google service-account impersonation returned no access token.");
  return { token: impersonation.accessToken, spreadsheetId: config.spreadsheetId };
}

type SheetMetadata = {
  sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }>;
};

function cellData(value: string | number | boolean) {
  if (typeof value === "number") return { userEnteredValue: { numberValue: value } };
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  return { userEnteredValue: { stringValue: value } };
}

function updateCellsRequest(
  metadata: SheetMetadata,
  title: string,
  values: Array<Array<string | number | boolean>>,
) {
  const sheet = metadata.sheets?.find((item) => item.properties?.title === title)?.properties;
  if (sheet?.sheetId === undefined) throw new Error(`Spreadsheet tab ${title} was not found.`);
  const currentRows = sheet.gridProperties?.rowCount ?? values.length;
  const currentColumns = sheet.gridProperties?.columnCount ?? values[0]?.length ?? 1;
  const rowCount = Math.max(currentRows, values.length);
  const columnCount = Math.max(currentColumns, values.reduce((max, row) => Math.max(max, row.length), 0));
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    values: (values[index] ?? []).map(cellData),
  }));
  return {
    updateCells: {
      rows,
      fields: "userEnteredValue",
      range: {
        sheetId: sheet.sheetId,
        startRowIndex: 0,
        endRowIndex: rowCount,
        startColumnIndex: 0,
        endColumnIndex: columnCount,
      },
    },
  };
}

export async function writeAccountUsageSheet(
  report: AccountUsageReport,
  input: { env?: AccountUsageSheetEnv; oidcToken: string; fetchImpl?: typeof fetch },
) {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const auth = await googleAccessToken(env, input.oidcToken, fetchImpl);
  const headers = { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" };
  const metadataResponse = await fetchImpl(`${SHEETS_API}/${encodeURIComponent(auth.spreadsheetId)}?fields=sheets.properties`, { headers });
  if (!metadataResponse.ok) throw new Error(`Google Sheets metadata request failed (${metadataResponse.status}).`);
  const metadata = await metadataResponse.json() as SheetMetadata;
  const requests = [
    updateCellsRequest(metadata, "Accounts", report.accounts),
    updateCellsRequest(metadata, "Summary", report.summary),
  ];
  const response = await fetchImpl(`${SHEETS_API}/${encodeURIComponent(auth.spreadsheetId)}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requests }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Sheets update failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

export function isNinePmMountain(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return false;
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return hour === "21";
}

export type AccountUsageSyncHandlerOptions = {
  env?: AccountUsageSheetEnv;
  now?: () => string;
  loadSource?: () => Promise<AccountUsageSource>;
  writeSheet?: (report: AccountUsageReport, oidcToken: string) => Promise<void>;
};

function bearerToken(request: Request) {
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}

export async function handleAccountUsageSheetSync(
  request: Request,
  options: AccountUsageSyncHandlerOptions = {},
) {
  const env = options.env ?? process.env;
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return json({ error: "Account usage sync is not configured.", missing: ["CRON_SECRET"] }, { status: 503 });
  if (bearerToken(request) !== secret) return json({ error: "Unauthorized." }, { status: 401 });

  const now = options.now?.() ?? new Date().toISOString();
  if (request.method === "GET" && !isNinePmMountain(now)) {
    return json({ status: "skipped", reason: "Not the 9 PM Mountain execution window." });
  }
  try {
    const source = await (options.loadSource ? options.loadSource() : loadAccountUsageSource(env));
    const report = buildAccountUsageReport(source, now);
    const oidcToken = request.headers.get("x-vercel-oidc-token")?.trim() || env.VERCEL_OIDC_TOKEN?.trim() || "";
    if (options.writeSheet) {
      await options.writeSheet(report, oidcToken);
    } else {
      await writeAccountUsageSheet(report, { env, oidcToken });
    }
    return json({ status: "updated", accounts: report.accountCount, refreshedAt: report.refreshedAt });
  } catch (error) {
    return json({
      error: "Could not refresh the account usage spreadsheet.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 503 });
  }
}

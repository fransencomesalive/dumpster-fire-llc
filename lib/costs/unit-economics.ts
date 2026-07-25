import type { PublicProfileRepositoryRequest } from "../public-profile/repository";

type Numeric = number | string;

export type ProviderUsageReportRow = {
  id: string;
  pursuit_id: string | null;
  provider_category: string;
  operation: string;
  request_count: number;
  outcome: string;
  estimated_cost_micros: Numeric;
  rate_card_version: string;
  created_at: string;
};

export type ContactReportRow = {
  id: string;
  pursuit_id: string;
  created_at: string;
};

export type UsageReportRow = {
  id: string;
  usage_type: string;
  quantity: number;
  created_at: string;
};

export type OutreachReportRow = {
  id: string;
  regeneration_count: number;
  created_at: string;
};

export type SubscriptionReportRow = {
  id: string;
  plan_id: string | null;
  status: string;
};

export type PlanReportRow = {
  id: string;
  name: string;
};

export type UnitEconomicsInputs = {
  from: string;
  to: string;
  providerEvents: ProviderUsageReportRow[];
  contacts: ContactReportRow[];
  usageLedger: UsageReportRow[];
  outreachMessages: OutreachReportRow[];
  subscriptions: SubscriptionReportRow[];
  plans: PlanReportRow[];
};

type AggregateMetric = {
  key: string;
  events: number;
  requests: number;
  estimatedCostMicros: string;
};

function micros(value: Numeric) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("estimated_cost_micros must be a non-negative integer");
    }
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new TypeError("estimated_cost_micros must be a non-negative integer");
  }
  return BigInt(value);
}

function aggregateProvider(
  rows: ProviderUsageReportRow[],
  keyFor: (row: ProviderUsageReportRow) => string,
): AggregateMetric[] {
  const metrics = new Map<string, {
    key: string;
    events: number;
    requests: number;
    estimatedCostMicros: bigint;
  }>();
  for (const row of rows) {
    const key = keyFor(row);
    const metric = metrics.get(key) ?? {
      key,
      events: 0,
      requests: 0,
      estimatedCostMicros: BigInt(0),
    };
    metric.events += 1;
    metric.requests += row.request_count;
    metric.estimatedCostMicros += micros(row.estimated_cost_micros);
    metrics.set(key, metric);
  }
  return [...metrics.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((metric) => ({
      ...metric,
      estimatedCostMicros: metric.estimatedCostMicros.toString(),
    }));
}

function countBy<T>(
  rows: T[],
  keyFor: (row: T) => string,
  quantityFor: (row: T) => number = () => 1,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + quantityFor(row));
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => ({ key, count }));
}

export function buildUnitEconomicsReport(input: UnitEconomicsInputs) {
  const fromMs = Date.parse(input.from);
  const toMs = Date.parse(input.to);
  if (!input.from.endsWith("Z") || !input.to.endsWith("Z")
    || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    throw new TypeError("analysis window must contain valid increasing timestamps");
  }
  const withinWindow = (createdAt: string) => {
    const at = Date.parse(createdAt);
    return Number.isFinite(at) && at >= fromMs && at < toMs;
  };
  const providerEvents = input.providerEvents.filter((row) => withinWindow(row.created_at));
  const usageLedgerRows = input.usageLedger.filter((row) => withinWindow(row.created_at));
  const outreachRows = input.outreachMessages.filter((row) => withinWindow(row.created_at));

  const firstContactAt = new Map<string, number>();
  for (const contact of input.contacts) {
    const at = Date.parse(contact.created_at);
    const current = firstContactAt.get(contact.pursuit_id);
    if (Number.isFinite(at) && (current === undefined || at < current)) {
      firstContactAt.set(contact.pursuit_id, at);
    }
  }
  const successProxyPursuits = new Set(
    [...firstContactAt.entries()]
      .filter(([, at]) => at >= fromMs && at < toMs)
      .map(([pursuitId]) => pursuitId),
  );

  let totalCostMicros = BigInt(0);
  let totalRequests = 0;
  let failedOrEmptyCostMicros = BigInt(0);
  let successfulCohortCostMicros = BigInt(0);
  let uncorrelatedCostMicros = BigInt(0);
  let outsideSuccessfulCohortCostMicros = BigInt(0);
  for (const event of providerEvents) {
    const cost = micros(event.estimated_cost_micros);
    totalCostMicros += cost;
    totalRequests += event.request_count;
    if (event.outcome === "failure" || event.outcome === "empty") {
      failedOrEmptyCostMicros += cost;
    }
    if (!event.pursuit_id) {
      uncorrelatedCostMicros += cost;
    } else if (successProxyPursuits.has(event.pursuit_id)) {
      successfulCohortCostMicros += cost;
    } else {
      outsideSuccessfulCohortCostMicros += cost;
    }
  }

  const planNames = new Map(input.plans.map((plan) => [plan.id, plan.name]));
  const entitlementCounts = countBy(
    input.subscriptions,
    (row) => `${planNames.get(row.plan_id ?? "") ?? "unknown"}:${row.status}`,
  );
  const legacyUsage = countBy(
    usageLedgerRows,
    (row) => row.usage_type,
    (row) => row.quantity,
  );
  const totalRegenerations = outreachRows.reduce(
    (sum, row) => sum + row.regeneration_count,
    0,
  );

  return {
    basis: "pre_stripe_baseline",
    analysisWindow: { from: input.from, to: input.to },
    coverage: {
      providerEvents: providerEvents.length,
      contactRowsRead: input.contacts.length,
      successfulContactBackedPursuits: successProxyPursuits.size,
      providerEventsWithoutPursuit: providerEvents.filter((row) => !row.pursuit_id).length,
    },
    providerCosts: {
      totalEstimatedCostMicros: totalCostMicros.toString(),
      totalRequests,
      failedOrEmptyEstimatedCostMicros: failedOrEmptyCostMicros.toString(),
      successfulContactBackedCohortCostMicros: successfulCohortCostMicros.toString(),
      averageCorrelatedCostPerSuccessfulContactBackedPursuitMicros:
        successProxyPursuits.size > 0
          ? (
              (successfulCohortCostMicros + BigInt(Math.floor(successProxyPursuits.size / 2)))
              / BigInt(successProxyPursuits.size)
            ).toString()
          : null,
      uncorrelatedCostMicros: uncorrelatedCostMicros.toString(),
      outsideSuccessfulCohortCostMicros: outsideSuccessfulCohortCostMicros.toString(),
      byProvider: aggregateProvider(providerEvents, (row) => row.provider_category),
      byOperation: aggregateProvider(providerEvents, (row) => row.operation),
      byOutcome: aggregateProvider(providerEvents, (row) => row.outcome),
      byRateCard: aggregateProvider(providerEvents, (row) => row.rate_card_version),
    },
    legacyUsage: {
      note: "Legacy counters do not implement the approved Apply Wizard usage definition.",
      quantities: legacyUsage,
    },
    outreach: {
      persistedMessages: outreachRows.length,
      userRequestedRegenerations: totalRegenerations,
    },
    currentEntitlements: {
      note: "Current entitlement snapshot, not paid-subscriber or historical-plan counts.",
      counts: entitlementCounts,
    },
    unavailable: [
      { metric: "paidSubscribers", reason: "No authoritative Stripe customer/invoice records exist." },
      { metric: "collectedRevenue", reason: "Plan catalog prices are not collected revenue." },
      { metric: "stripeFees", reason: "No Stripe balance-transaction or fee records exist." },
      { metric: "historicalPlanAttribution", reason: "Only the current local entitlement row exists." },
      { metric: "fixedInfrastructureAllocation", reason: "No approved fixed-cost configuration exists." },
      { metric: "grossContribution", reason: "Revenue, fees, and fixed-cost inputs are unavailable." },
    ],
    limitations: [
      "Contact-backed pursuits are a temporary pre-apply_wizard success proxy.",
      "Anthropic failures can have unknown usage and are currently recorded at zero estimated cost.",
      "Exa failure events use a conservative fallback estimate.",
      "Contact rows are a mutable current-state snapshot and are read with bounded offset pagination.",
    ],
  };
}

function query(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

export async function loadAllReportPages<T>(
  request: PublicProfileRepositoryRequest,
  resource: string,
  params: Record<string, string>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await request<T[]>(resource, {
      query: query({
        ...params,
        limit: String(pageSize),
        offset: String(offset),
      }),
    });
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadUnitEconomicsInputs(
  request: PublicProfileRepositoryRequest,
  window: { from: string; to: string },
): Promise<UnitEconomicsInputs> {
  const windowFilter = {
    and: `(created_at.gte.${window.from},created_at.lt.${window.to})`,
  };
  const [
    providerEvents,
    contacts,
    usageLedger,
    outreachMessages,
    subscriptions,
    plans,
  ] = await Promise.all([
    loadAllReportPages<ProviderUsageReportRow>(request, "provider_usage_events", {
      select: "id,pursuit_id,provider_category,operation,request_count,outcome,estimated_cost_micros,rate_card_version,created_at",
      ...windowFilter,
      order: "created_at.asc,id.asc",
    }),
    loadAllReportPages<ContactReportRow>(request, "contact_suggestions", {
      select: "id,pursuit_id,created_at",
      created_at: `lt.${window.to}`,
      order: "created_at.asc,id.asc",
    }),
    loadAllReportPages<UsageReportRow>(request, "usage_ledger", {
      select: "id,usage_type,quantity,created_at",
      ...windowFilter,
      order: "created_at.asc,id.asc",
    }),
    loadAllReportPages<OutreachReportRow>(request, "outreach_messages", {
      select: "id,regeneration_count,created_at",
      ...windowFilter,
      order: "created_at.asc,id.asc",
    }),
    loadAllReportPages<SubscriptionReportRow>(request, "user_subscriptions", {
      select: "id,plan_id,status",
      order: "id.asc",
    }),
    loadAllReportPages<PlanReportRow>(request, "subscription_plans", {
      select: "id,name",
      order: "id.asc",
    }),
  ]);
  return {
    ...window,
    providerEvents,
    contacts,
    usageLedger,
    outreachMessages,
    subscriptions,
    plans,
  };
}

import type { ApplyMode, Job } from "./types";

export type ApplyModeOption = {
  id: ApplyMode;
  label: string;
  shortLabel: string;
  proofFrame: string;
  outreachFrame: string;
  strongSignals: string[];
  weakSignals: string[];
};

export type ApplyModeScore = {
  mode: ApplyMode;
  label: string;
  score: number;
  strongMatches: string[];
  weakMatches: string[];
};

export const applyModeOptions: ApplyModeOption[] = [
  {
    id: "executive_producer",
    label: "Executive Producer",
    shortLabel: "EP",
    proofFrame: "senior production leadership, creative quality control, budgets, timelines, vendors, stakeholders, and complex launch delivery",
    outreachFrame: "I would frame this as Executive Producer work: protecting creative quality while keeping stakeholders, approvals, vendors, budgets, timelines, and delivery reality aligned.",
    strongSignals: [
      "executive producer", "senior producer", "creative producer", "integrated producer", "director of production", "head of production",
      "production director", "studio director", "brand producer", "content producer", "campaign producer", "agency", "client",
      "vendor", "budget", "timeline", "creative production", "digital production", "campaign", "launch", "experiential", "motion",
      "content", "brand", "studio", "creative quality", "stakeholder", "production planning",
    ],
    weakSignals: [
      "scrum", "agile", "engineering program", "social media calendar", "influencer", "print production", "event logistics",
      "coordinator", "traffic", "asset trafficking", "account management", "aaa game",
    ],
  },
  {
    id: "program_director",
    label: "Program Director",
    shortLabel: "PD",
    proofFrame: "program leadership, operating models, stakeholder alignment, workflow systems, AI-enabled operations, and cross-functional execution",
    outreachFrame: "I would frame this as Program Director work: creating the operating rhythm, ownership model, stakeholder clarity, and delivery system that lets important work move without process theater.",
    strongSignals: [
      "program director", "program management", "program manager", "creative operations", "design operations", "studio operations",
      "marketing operations", "content operations", "production operations", "product operations", "strategic operations", "pmo",
      "operating model", "workflow", "process design", "governance", "roadmap", "resource planning", "cross-functional",
      "stakeholder alignment", "change management", "portfolio", "ai enablement", "internal tools", "localization", "compliance",
      "ambiguous", "scaling", "systems",
    ],
    weakSignals: [
      "scrum master", "agile ceremony", "ticket", "engineering-only", "sales operations", "customer success", "hr operations",
      "finance operations", "coordinator", "trafficking", "performance marketing",
    ],
  },
  {
    id: "ai_workflow_product_ops",
    label: "AI Workflow / Product Ops",
    shortLabel: "AI Ops",
    proofFrame: "AI workflow systems, product operations, internal tools, agentic workflows, knowledge systems, project operating models, and practical AI adoption",
    outreachFrame: "I would frame this as AI Workflow / Product Ops work: turning AI/workflow ambition into usable operating behavior, clear ownership, durable project memory, and systems that teams can actually run.",
    strongSignals: [
      "ai transformation", "ai enablement", "ai adoption", "ai operations", "ai workflow", "agentic workflow", "agentic ai",
      "internal tools", "knowledge management", "project operating system", "operating system", "workflow systems", "workflow automation",
      "process modernization", "gtm automation", "product operations", "product ops", "program operations", "llm", "mcp",
      "automation", "orchestration", "project memory", "governance", "enablement", "tools",
    ],
    weakSignals: [
      "machine learning engineer", "data scientist", "research scientist", "model training", "mlops", "scrum master",
      "enterprise pmo", "paid media buying", "sales operations", "finance operations",
    ],
  },
];

export function getApplyModeOption(mode: ApplyMode) {
  return applyModeOptions.find((option) => option.id === mode) ?? applyModeOptions[0];
}

export function scoreMode(job: Job, mode: ApplyModeOption): ApplyModeScore {
  const content = [
    job.title,
    job.department,
    job.descriptionText,
    job.fitSummary,
    job.outreachAngle,
    ...job.whyItMatches,
    ...job.riskFlags,
  ].join(" ").toLowerCase();
  const strongMatches = mode.strongSignals.filter((signal) => content.includes(signal));
  const weakMatches = mode.weakSignals.filter((signal) => content.includes(signal));
  const titleBoost = mode.strongSignals.some((signal) => job.title.toLowerCase().includes(signal)) ? 18 : 0;
  const score = Math.max(0, Math.min(100, 45 + strongMatches.length * 8 + titleBoost - weakMatches.length * 10));

  return { mode: mode.id, label: mode.label, score, strongMatches, weakMatches };
}

export function recommendApplyMode(job: Job) {
  const scores = applyModeOptions
    .map((mode) => scoreMode(job, mode))
    .sort((a, b) => b.score - a.score);
  const [top, second] = scores;
  const isBlended = second && Math.abs(top.score - second.score) <= 12;

  return {
    recommendedMode: top.mode,
    isBlended,
    scores,
    summary: isBlended
      ? `This role sits between ${top.label} and ${second.label}. Start with ${top.label}, but either lens may work.`
      : `${top.label} is the stronger lens for this role.`,
  };
}

import { loadEnvConfig } from "@next/env";
import { randallPrivateMatchingConfig } from "../app/scans/matching";
import type { ProfileCompilerInput } from "../app/scans/profile-compiler";
import { compileAndSaveSearchProfile, getActiveMatchingConfig } from "../app/scans/store";

const randallProfileInput: ProfileCompilerInput = {
  resumeText: [
    "Program Director, Operations Leader, AI Workflow Systems leader, Executive Producer, and production leader.",
    "Experience includes Mission Squad Director of Product and Growth leading product development for an agentic AI platform startup, cooperative agents, private data workflows, AI and MCP tools, and brand/marketing ID.",
    "Experience includes Coinbase Base Production Lead establishing production intake systems across Product, Marketing, Legal, external partners, community initiatives, events, and marketing programs.",
    "Experience includes Aleo Executive Producer for an L2 launch and zero-knowledge proof product with chat bots, LLM, AI personality generation, distributed vendors, product teams, marketing stakeholders, and international launch efforts.",
    "Experience includes Yuga Labs creative production, Airbnb global launch production, AKQA Program Director, Swift Executive Producer, Instrument Senior Interactive Producer, CP+B Interactive Producer, and earlier art direction/production ownership.",
    "Repeated proof includes cross-functional stakeholder management, vendor management, budget ownership, resource planning, production intake, prioritization, approvals, workflow systems, process design, campaign delivery, product launches, brand launches, client-facing leadership, creative operations, studio operations, AI workflow design, agentic workflows, remote collaboration, distributed stakeholders, and ambiguous high-stakes delivery environments.",
  ].join(" "),
  profileText: [
    "Use two primary applying-as tracks: Executive Producer for senior creative/digital/brand/production ownership, and Program Director for program architecture, operating models, creative/product/design/marketing operations, AI enablement, workflow systems, launch operations, and cross-functional execution.",
    "Remote only. Target base compensation minimum is 150000 with 180000 preferred. Freelance or contract work should generally clear 125 hourly for senior scopes.",
    "Prioritize senior roles where production, operations, process, people, vendors, approvals, scope, budgets, creative quality, product/marketing/legal/design stakeholders, and executive-level delivery are the center of gravity.",
    "Avoid roles that are structurally wrong even when keywords overlap: engineering-only, technical program management, scrum master, agile ceremony ownership, customer education, customer enablement, developer education, enterprise SaaS adoption, procurement operations, brokerage operations, banking operations, sales operations, revenue operations, people or talent operations, IT/security/data/regulatory operations, social content-only production, junior/coordinator roles, and heavy onsite event or AAA game production.",
  ].join(" "),
  preferences: {
    desiredTitles: [
      "Director of Production",
      "Head of Production",
      "Executive Producer",
      "Senior Executive Producer",
      "Creative Operations Director",
      "Program Director",
      "Principal Program Manager",
      "Senior Program Manager",
      "Creative Program Director",
      "Design Program Manager",
      "Product Operations Lead",
      "AI Enablement Program Lead",
    ],
    avoidedTitles: [
      "Software Engineer",
      "Engineering Manager",
      "Technical Program Manager",
      "Technical Project Manager",
      "Scrum Master",
      "Agile Program Manager",
      "Customer Education Program Manager",
      "Customer Enablement Manager",
      "Developer Education",
      "Procurement Operations Lead",
      "Front Office Brokerage Operations Lead",
      "Banking Operations",
      "Sales Operations",
      "Revenue Operations",
      "Talent Acquisition",
      "People Operations",
      "IT Operations",
      "Security Operations",
      "Data Operations",
      "Regulatory Operations",
      "Compliance",
      "Social Media Manager",
      "Junior Producer",
      "Coordinator",
    ],
    desiredIndustries: [
      "creative agency",
      "design agency",
      "internal creative studio",
      "technology",
      "ai",
      "fintech",
      "web3",
      "crypto",
      "brand teams inside tech companies",
      "product-led companies",
    ],
    avoidedKeywords: [
      "aaa game",
      "engineering only",
      "agile ceremony",
      "jira hygiene",
      "customer education",
      "customer enablement",
      "technical education",
      "developer tools",
      "enterprise customer adoption",
      "procurement operations",
      "brokerage operations",
      "banking operations",
      "sales operations",
      "revenue operations",
      "talent operations",
      "people operations",
      "it operations",
      "security operations",
      "data operations",
      "regulatory operations",
      "performance marketing",
      "social content",
      "onsite event logistics",
      "line producer",
    ],
    roleTracks: randallPrivateMatchingConfig.resumeRoleSignals?.roleTracks ?? [],
    baseMatchingConfig: randallPrivateMatchingConfig,
    compensationFloor: 150000,
    freelanceRateFloor: 125,
    remoteOnly: true,
    doNotApplyCompanies: ["Left Field Labs"],
  },
};

async function main() {
  loadEnvConfig(process.cwd());

  const result = await compileAndSaveSearchProfile(randallProfileInput);
  const activeMatching = await getActiveMatchingConfig();
  const roleTracks = result.compiledProfile.matchingConfig.resumeRoleSignals?.roleTracks ?? [];

  console.log(JSON.stringify({
    persistence: result.persistence,
    activeMatchingSource: activeMatching.source,
    rulesVersion: result.compiledProfile.matchingConfig.rulesVersion,
    confidence: result.compiledProfile.confidence,
    missingInputs: result.compiledProfile.missingInputs,
    targetTitles: result.compiledProfile.searchProfile.targetTitles,
    roleTracks: roleTracks.map((track) => track.label),
    hardExcludedTitlePatterns: result.compiledProfile.matchingConfig.hardExcludedTitlePatterns.length,
    wrongLanePatterns: result.compiledProfile.matchingConfig.resumeRoleSignals?.wrongLanePatterns?.length ?? 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Occupation-lane classifier, ported from the refined private engine
// (app/scans/occupation-classifier.ts, tuned across the 2026-06 matching passes).
// The lane taxonomy and rules are user-agnostic; what the public engine adds is
// deriving each user's relevant lanes from their Role Tracks instead of the
// legacy hardcoded polarity list.
import type { CandidateProfileAggregate } from "../types";

export type OccupationLane =
  | "creative-writing"
  | "art-direction"
  | "visual-design"
  | "product-ux-design"
  | "ux-research"
  | "creative-strategy"
  | "creative-leadership"
  | "content-video-production"
  | "digital-production"
  | "technical-production"
  | "social-creative"
  | "creative-operations"
  | "program-project-management"
  | "product-operations"
  | "product-owner-sales-ops"
  | "research-fellowship"
  | "content-rights-licensing"
  | "strategy-operations"
  | "marketing-strategy-operations"
  | "marketing-management"
  | "marketing-analytics"
  | "sales-account-management"
  | "partnership-programs"
  | "partner-sales-operations"
  | "safety-program-operations"
  | "risk-safety-operations"
  | "technical-infrastructure-program"
  | "technical-engineering"
  | "data-it-infrastructure"
  | "people-hr"
  | "people-operations-program"
  | "legal-compliance"
  | "finance-business-operations"
  | "finance-procurement-operations"
  | "business-transformation"
  | "customer-support-success"
  | "administrative-operations"
  | "construction-architecture"
  | "global-affairs-policy"
  | "unknown";

export type OccupationClassifierInput = {
  title: string;
  department?: string;
  description: string;
  companyName: string;
};

export type OccupationClassification = {
  lane: OccupationLane;
  confidence: "high" | "medium" | "low";
  source: "title" | "title_and_tasks" | "tasks" | "metadata" | "unknown";
  evidence: string[];
  disqualifiers: string[];
  adjacentLanes: OccupationLane[];
};

type LaneRule = {
  lane: OccupationLane;
  title: RegExp[];
  task?: RegExp[];
  department?: RegExp[];
  disqualifiers?: RegExp[];
  adjacent?: OccupationLane[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesAny(value: string, patterns: RegExp[] = []) {
  return patterns.filter((pattern) => pattern.test(value)).map((pattern) => pattern.source);
}

const laneRules: LaneRule[] = [
  {
    lane: "creative-writing",
    title: [/\b(copywriter|copy writer|content writer|ux writer|brand writer|editorial)\b/],
    task: [/\b(copy|headlines|scripts|editorial|messaging|voice|tone|narrative|content strategy)\b/],
    adjacent: ["creative-strategy", "social-creative"],
  },
  {
    lane: "art-direction",
    title: [/\b(art director|associate art director|senior art director)\b/],
    task: [/\b(art direction|visual concept|campaign concept|concepting|visual system|photo shoot|shoot direction)\b/],
    adjacent: ["creative-leadership", "visual-design"],
  },
  {
    lane: "visual-design",
    title: [/\b(digital designer|graphic designer|visual designer|brand designer|motion designer|multimedia designer|designer)\b/],
    task: [/\b(visual design|brand identity|layout|typography|motion|illustration|digital assets|design system)\b/],
    disqualifiers: [/\b(product designer|ux designer|ui designer|principal designer)\b/],
    adjacent: ["art-direction", "product-ux-design"],
  },
  {
    lane: "product-ux-design",
    title: [/\b(product designer|ux designer|ui designer|interaction designer|experience designer|content designer)\b/],
    task: [/\b(user experience|interaction design|prototype|wireframe|user flows|figma|product design|design systems)\b/],
    adjacent: ["ux-research", "visual-design"],
  },
  {
    lane: "ux-research",
    title: [/\b(ux researcher|user researcher|design researcher|research ops|research operations)\b/],
    task: [/\b(user research|usability testing|interviews|research plan|survey|qualitative|quantitative|insights)\b/],
    adjacent: ["product-ux-design", "creative-strategy"],
  },
  {
    lane: "creative-strategy",
    title: [/\b(creative strategist|brand strategist|content strategist|social strategist|strategy director|strategist)\b/],
    task: [/\b(strategy|brief|insights|positioning|brand platform|go to market|audience|concept development)\b/],
    adjacent: ["creative-writing", "social-creative", "program-project-management"],
  },
  {
    lane: "creative-leadership",
    title: [/\b(creative director|associate creative director|executive creative director|group creative director|head of creative|creative lead)\b/],
    task: [/\b(creative direction|lead creative|concept|campaign|team leadership|creative review|brand system)\b/],
    adjacent: ["art-direction", "creative-strategy"],
  },
  {
    lane: "content-video-production",
    title: [/\b(broadcast producer|content producer|video producer|live streaming producer|podcast producer|executive producer|senior producer|lead producer|producer)\b/],
    task: [/\b(video|broadcast|content production|post production|shoot|edit|script|storyboard|production schedule)\b/],
    adjacent: ["digital-production", "social-creative", "creative-leadership"],
  },
  {
    lane: "digital-production",
    title: [/\b(digital producer|integrated producer|interactive producer|web producer|campaign producer|brand producer|production lead|head of production|production director)\b/],
    task: [/\b(digital production|integrated production|campaign delivery|asset delivery|web|interactive|vendor|timeline|trafficking)\b/],
    adjacent: ["creative-operations", "technical-production", "content-video-production"],
  },
  {
    lane: "technical-production",
    title: [/\b(technical producer|experiential producer|xr producer|creative technologist|interactive producer)\b/],
    task: [/\b(technical production|prototype|interactive|experiential|installation|engineering partners|creative technology)\b/],
    adjacent: ["digital-production", "technical-engineering"],
  },
  {
    lane: "social-creative",
    title: [/\b(social producer|social creative|social content|social creative lead|content creator)\b/],
    task: [/\b(social content|social creative|platform creative|tiktok|instagram|youtube|short form|creator)\b/],
    adjacent: ["creative-writing", "content-video-production"],
  },
  {
    lane: "creative-operations",
    title: [/\b(creative operations|studio operations|brand operations|content operations|production operations|design operations)\b/],
    task: [/\b(workflow|intake|resource planning|vendor management|creative review|studio operations|asset delivery|process)\b/],
    adjacent: ["program-project-management", "digital-production"],
  },
  {
    lane: "program-project-management",
    title: [/\b(program manager|project manager|program lead|program director|delivery lead|operations lead|producer program)\b/],
    task: [/\b(program|project|roadmap|stakeholder|cross functional|delivery|milestones|risk|scope|planning)\b/],
    disqualifiers: [
      /\b(technical program manager|engineering program manager|scrum master|agile)\b/,
      /\b(it operations|safety|risk operations|partner operations|bank programs|infrastructure|supply chain|hardware operations|talent acquisition|performance and talent|compensation|data acquisition|cpu|storage|wan|procurement|brokerage|ecm|dms|b2b marketing|strategy operations|strategy & operations|product design program|onboarding project manager)\b/,
    ],
    adjacent: ["creative-operations", "digital-production", "product-operations", "strategy-operations"],
  },
  {
    lane: "product-operations",
    title: [/\b(product operations manager|product ops|product operations lead)\b/],
    task: [/\b(product operations|product roadmap|product launch|product lifecycle|go to market|gtm|cross functional)\b/],
    adjacent: ["program-project-management", "product-ux-design"],
  },
  {
    lane: "product-owner-sales-ops",
    title: [/\b(crm product owner|salesforce product owner|gtm product owner)\b/],
    task: [/\b(crm|salesforce|gtm systems|sales operations|revenue operations)\b/],
  },
  {
    lane: "research-fellowship",
    title: [/\b(fellows program|fellowship|research program|adversarial model research)\b/],
    task: [/\b(research|model research|ai safety|ai security|reinforcement learning|fellowship)\b/],
    adjacent: ["program-project-management", "technical-engineering"],
  },
  {
    lane: "content-rights-licensing",
    title: [/\b(clearance|licensing|rights manager|music licensing|podcast licensing)\b/],
    task: [/\b(clearance|licensing|usage rights|rights management|podcasts|content rights|talent releases)\b/],
    adjacent: ["content-video-production", "creative-operations"],
  },
  {
    lane: "strategy-operations",
    title: [/\b(strategy operations|strategy & operations|strategic operations|supervisor strategy|gtm operations)\b/],
    task: [/\b(operating rhythm|business planning|go to market|gtm|strategic initiatives|cross functional|stakeholder alignment)\b/],
    disqualifiers: [/\b(revenue strategy|b2b marketing|growth markets|user safety|risk operations|brokerage|sanctions|business transformation)\b/],
    adjacent: ["program-project-management", "creative-strategy", "product-operations"],
  },
  {
    lane: "marketing-strategy-operations",
    title: [/\b(strategy operations lead (b2b )?marketing|strategy operations.*marketing|marketing operations|b2b marketing)\b/],
    task: [/\b(marketing operations|b2b marketing|demand generation|pipeline|growth operations|campaign operations)\b/],
  },
  {
    lane: "marketing-management",
    title: [/\b(marketing manager|partner marketing|product marketing|customer marketing|consumer marketing|field marketing|growth marketing|marketing lead|marketer)\b/],
    task: [/\b(marketing strategy|co marketing|demand generation|growth|customer acquisition|media buying|paid social|marketing campaign)\b/],
    adjacent: ["creative-strategy", "social-creative"],
  },
  {
    lane: "marketing-analytics",
    title: [/\b(marketing analytics|marketing analyst|growth analytics)\b/],
    task: [/\b(marketing analytics|attribution|measurement|growth analytics|campaign analytics|conversion analysis)\b/],
  },
  {
    lane: "sales-account-management",
    title: [/\b(account manager|account management|account executive|business development|partnership manager|client solutions|strategic account)\b/],
    task: [/\b(sales|revenue|quota|pipeline|account planning|customer relationship|client relationship|partnerships)\b/],
  },
  {
    lane: "partnership-programs",
    title: [/\b(partner manager|partner operations|program manager partner operations|revenue strategy operations lead|revenue strategy & operations lead)\b/],
    task: [/\b(partner program|partner operations|partnership strategy|partner enablement|cross functional partnerships)\b/],
    disqualifiers: [/\b(alliances director|infrastructure partnership|partnership delivery)\b/],
  },
  {
    lane: "partner-sales-operations",
    title: [/\b(alliances director|partnership delivery|onboarding project manager)\b/],
    task: [/\b(partner operations|alliances|revenue operations|sales operations|partner enablement|implementation|onboarding)\b/],
  },
  {
    lane: "safety-program-operations",
    title: [/\b(strategic operations lead user safety risk operations|program manager safety|operations enablement program manager user safety risk operations)\b/],
    task: [/\b(user safety program|safety program|risk operations program|operations enablement|cross functional safety)\b/],
    adjacent: ["program-project-management"],
  },
  {
    lane: "risk-safety-operations",
    title: [/\b(safety response|sanctions|issuing bank programs|risk operations)\b/],
    task: [/\b(safety response|risk operations|trust and safety|fraud|sanctions|compliance|bank program|regulatory)\b/],
  },
  {
    lane: "technical-infrastructure-program",
    title: [/\b(technical program manager|infrastructure partnership|ai infrastructure|hardware operations|cpu|storage|pop wan|it operations|it consultant|ecm|dms|dms saas)\b/],
    task: [/\b(infrastructure|hardware|compute|storage|network|wan|it operations|technical delivery|saas implementation|engineering program)\b/],
  },
  {
    lane: "technical-engineering",
    title: [/\b(software engineer|frontend engineer|backend engineer|full stack|developer|architect|machine learning engineer|data scientist|engineering manager)\b/],
    task: [/\b(code|software|engineering|architecture|api|backend|frontend|model training|ml systems)\b/],
  },
  {
    lane: "data-it-infrastructure",
    title: [/\b(data operations|it operations|systems analyst|data analyst|infrastructure|compute|cloud inference|network|security operations|data acquisition|data center)\b/],
    task: [/\b(data pipeline|it systems|infrastructure|storage|network|security|cloud|compute|analytics)\b/],
  },
  {
    lane: "people-hr",
    title: [/\b(talent acquisition|recruiter|people operations|hr|human resources|compensation|performance and talent|equity program)\b/],
    task: [/\b(recruiting|hiring|people process|compensation|benefits|performance management|onboarding employees)\b/],
    disqualifiers: [/\b(talent acquisition operations program manager|performance and talent program manager|compensation operations lead)\b/],
  },
  {
    lane: "people-operations-program",
    title: [/\b(talent acquisition operations program manager|performance and talent program manager|compensation operations lead)\b/],
    task: [/\b(talent acquisition|performance and talent|compensation operations|people program|hr operations)\b/],
  },
  {
    lane: "legal-compliance",
    title: [/\b(counsel|attorney|lawyer|legal|compliance|regulatory|grc|policy manager|public policy)\b/],
    task: [/\b(legal|regulatory|compliance|policy|risk governance|contract|privacy)\b/],
  },
  {
    lane: "finance-business-operations",
    title: [/\b(finance|fp&a|fp a|business operations|business strategy|strategy manager|chief of staff|sourcing|procurement|business transformation|accountant|accounting|controller|investor relations)\b/],
    task: [/\b(financial|forecast|budget model|business operations|sourcing|procurement|vendor contracts)\b/],
    disqualifiers: [/\b(procurement operations|supply chain|brokerage operations|business transformation)\b/],
  },
  {
    lane: "finance-procurement-operations",
    title: [/\b(procurement operations|supply chain|brokerage operations)\b/],
    task: [/\b(financial planning|fp&a|procurement|supply chain|brokerage|vendor contracts|forecast)\b/],
  },
  {
    lane: "business-transformation",
    title: [/\b(business transformation|transformation lead|transformation manager)\b/],
    task: [/\b(business transformation|process transformation|operating model|change management|enterprise transformation)\b/],
  },
  {
    lane: "customer-support-success",
    title: [/\b(customer support|customer success|support specialist|client success|technical account management)\b/],
    task: [/\b(ticket|support|customer issue|account support|implementation|customer success)\b/],
  },
  {
    lane: "administrative-operations",
    title: [/\b(administrative|admin assistant|file clerk|office manager|coordinator|executive assistant)\b/],
    task: [/\b(calendar|filing|administrative|clerical|office support|data entry)\b/],
  },
  {
    lane: "construction-architecture",
    title: [/\b(architectural drafter|drafter|builder chief|construction manager|architectural designer)\b/],
    task: [/\b(construction|drafting|blueprints|cad drawings|building plans|architecture)\b/],
  },
  {
    lane: "global-affairs-policy",
    title: [/\b(global affairs|growth markets|public affairs|government affairs|policy communications)\b/],
    task: [/\b(global affairs|public affairs|government relations|policy|market expansion|regional affairs)\b/],
  },
];

export function classifyOccupation(input: OccupationClassifierInput): OccupationClassification {
  const title = normalize(input.title);
  const department = normalize(input.department ?? "");
  const description = normalize(input.description);
  const scored = laneRules.map((rule) => {
    const titleMatches = matchesAny(title, rule.title);
    const taskMatches = matchesAny(description, rule.task);
    const departmentMatches = matchesAny(department, rule.department);
    const disqualifierMatches = matchesAny(title, rule.disqualifiers);
    const score = titleMatches.length * 5 + taskMatches.length * 2 + departmentMatches.length * 2 - disqualifierMatches.length * 6;

    return { rule, score, titleMatches, taskMatches, departmentMatches, disqualifierMatches };
  }).sort((first, second) => second.score - first.score);
  const winner = scored[0];

  if (!winner || winner.score <= 0) {
    return {
      lane: "unknown",
      confidence: "low",
      source: "unknown",
      evidence: [],
      disqualifiers: [],
      adjacentLanes: [],
    };
  }

  const evidence = [
    ...winner.titleMatches.map((match) => `title pattern: ${match}`),
    ...winner.taskMatches.slice(0, 4).map((match) => `task pattern: ${match}`),
    ...winner.departmentMatches.map((match) => `department pattern: ${match}`),
  ];
  const hasTitleEvidence = winner.titleMatches.length > 0;
  const hasTaskEvidence = winner.taskMatches.length > 0;
  const confidence = hasTitleEvidence && hasTaskEvidence ? "high" : hasTitleEvidence || winner.score >= 4 ? "medium" : "low";
  const source = hasTitleEvidence && hasTaskEvidence ? "title_and_tasks" : hasTitleEvidence ? "title" : hasTaskEvidence ? "tasks" : "metadata";
  const nearby = scored
    .filter((item) => item.rule.lane !== winner.rule.lane && item.score > 0)
    .map((item) => item.rule.lane);

  return {
    lane: winner.rule.lane,
    confidence,
    source,
    evidence,
    disqualifiers: winner.disqualifierMatches.map((match) => `disqualifier: ${match}`),
    adjacentLanes: Array.from(new Set([...(winner.rule.adjacent ?? []), ...nearby])).slice(0, 5),
  };
}

export type ProfileLanes = {
  // Lanes the user's Role Tracks map to directly.
  coreLanes: Set<OccupationLane>;
  // Adjacent lanes: acceptable as stretch matches, never blocked.
  stretchLanes: Set<OccupationLane>;
};

// Derive the user's relevant lanes by classifying each Role Track (name + target
// titles + responsibility text) as if it were a posting. This replaces the legacy
// engine's hardcoded polarity list with a per-user derivation.
export function profileLanesForAggregate(aggregate: CandidateProfileAggregate): ProfileLanes {
  const coreLanes = new Set<OccupationLane>();
  const stretchLanes = new Set<OccupationLane>();

  for (const track of aggregate.roleTracks) {
    const titles = [track.name, ...track.targetTitles];
    const responsibilityText = [
      ...track.keyResponsibilities,
      ...track.requiredExperiencePatterns,
      ...track.strongJobSignals,
    ].join(". ");
    for (const title of titles) {
      const classification = classifyOccupation({
        title,
        description: responsibilityText,
        companyName: "",
      });
      if (classification.lane === "unknown") continue;
      coreLanes.add(classification.lane);
      for (const adjacent of classification.adjacentLanes) stretchLanes.add(adjacent);
    }
  }

  for (const lane of coreLanes) stretchLanes.delete(lane);
  return { coreLanes, stretchLanes };
}

export type LanePolarity = "core" | "stretch" | "unknown" | "wrong_lane";

export function lanePolarityForProfile(lane: OccupationLane, lanes: ProfileLanes): LanePolarity {
  if (lane === "unknown") return "unknown";
  if (lanes.coreLanes.has(lane)) return "core";
  if (lanes.stretchLanes.has(lane)) return "stretch";
  return "wrong_lane";
}

// A job is safety-blocked when it confidently classifies into a lane the user's
// Role Tracks neither target nor sit adjacent to. Jobs whose titles directly match
// the user's target titles are never blocked (the caller enforces that); this
// exists to stop keyword-riding garbage, not to overrule explicit targets.
export function isWrongLaneForProfile(classification: OccupationClassification, lanes: ProfileLanes) {
  return lanePolarityForProfile(classification.lane, lanes) === "wrong_lane" && classification.confidence !== "low";
}

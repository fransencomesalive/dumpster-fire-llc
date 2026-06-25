// Deterministic parser for the Candidate Dossier markdown format defined in
// CANDIDATE_DOSSIER_GUIDE.md. No inference: headings and labeled lines only.
// Keep this module dependency-free so node fixtures can import it directly.

export type DossierTrack = {
  label: string;
  frame: string;
  targetTitles: string[];
  proofPoints: string[];
  notThisTrack: string[];
};

export type DossierExample = {
  name: string;
  role: string;
  story: string;
  metrics: string[];
  link: string;
  proves: string[];
  keywords: string[];
};

export type DossierSample = {
  context: string;
  text: string;
};

export type DossierResume = {
  trackLabel: string;
  bullets: string[];
};

export type DossierProofObject = {
  name: string;
  link: string;
  bestFor: string[];
  avoidFor: string[];
};

export type DossierValidation = {
  missingSections: string[];
  needsInput: string[];
  examplesWithoutMetrics: string[];
  ok: boolean;
};

export type ParsedDossier = {
  name: string;
  version: string;
  updated: string;
  positioning: string;
  links: Array<{ label: string; url: string }>;
  tracks: DossierTrack[];
  examples: DossierExample[];
  voice: string;
  rules: string[];
  banned: string[];
  samples: DossierSample[];
  resumes: DossierResume[];
  constraints: string[];
  strategy: string[];
  operatingStyle: string;
  decisionStyle: string[];
  communicationPosture: string[];
  aiMisreads: string[];
  hireReasons: string[];
  proofObjects: DossierProofObject[];
  validation: DossierValidation;
};

const REQUIRED_SECTIONS = [
  "Identity & Positioning",
  "Applying-As Tracks",
  "Work Examples",
  "Writing Style",
  "Operating Style",
  "Decision Style",
  "Communication Posture",
  "What AI Gets Wrong About Randall",
  "Why People Hire Randall",
  "Proof Objects",
  "Resume Facts",
  "Constraints",
  "Outreach Strategy",
];

function splitCsv(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function labeledValue(line: string, label: string) {
  const prefix = `${label}:`;
  if (!line.startsWith(prefix)) return null;
  return line.slice(prefix.length).trim();
}

export function parseCandidateDossier(markdown: string): ParsedDossier {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const dossier: ParsedDossier = {
    name: "",
    version: "",
    updated: "",
    positioning: "",
    links: [],
    tracks: [],
    examples: [],
    voice: "",
    rules: [],
    banned: [],
    samples: [],
    resumes: [],
    constraints: [],
    strategy: [],
    operatingStyle: "",
    decisionStyle: [],
    communicationPosture: [],
    aiMisreads: [],
    hireReasons: [],
    proofObjects: [],
    validation: { missingSections: [], needsInput: [], examplesWithoutMetrics: [], ok: false },
  };

  let section = "";
  let track: DossierTrack | null = null;
  let example: DossierExample | null = null;
  let sample: DossierSample | null = null;
  let resume: DossierResume | null = null;
  let proofObject: DossierProofObject | null = null;
  let exampleField: "metrics" | "" = "";
  let trackField: "proof" | "not" | "" = "";
  let proofField: "best" | "avoid" | "" = "";
  let identityField: "links" | "body" = "body";

  const seenSections = new Set<string>();

  const flushSubsections = () => {
    if (track) dossier.tracks.push(track);
    if (example) dossier.examples.push(example);
    if (sample) {
      sample.text = sample.text.trim();
      dossier.samples.push(sample);
    }
    if (resume) dossier.resumes.push(resume);
    if (proofObject) dossier.proofObjects.push(proofObject);
    track = null;
    example = null;
    sample = null;
    resume = null;
    proofObject = null;
    exampleField = "";
    trackField = "";
    proofField = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.includes("NEEDS INPUT")) {
      dossier.validation.needsInput.push(trimmed);
    }

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      dossier.name = trimmed.replace(/^# Candidate Dossier\s*-\s*/i, "").replace(/^# /, "").trim();
      continue;
    }

    const versionValue = labeledValue(trimmed, "version");
    if (versionValue !== null && !section) {
      dossier.version = versionValue;
      continue;
    }
    const updatedValue = labeledValue(trimmed, "updated");
    if (updatedValue !== null && !section) {
      dossier.updated = updatedValue;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushSubsections();
      section = trimmed.slice(3).trim();
      seenSections.add(section);
      identityField = "body";
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushSubsections();
      const heading = trimmed.slice(4).trim();
      const trackLabel = labeledValue(heading, "Track");
      const exampleName = labeledValue(heading, "Example");
      const sampleContext = labeledValue(heading, "Sample");
      const resumeLabel = labeledValue(heading, "Resume");
      const proofObjectName = labeledValue(heading, "Proof Object");

      if (trackLabel !== null) track = { label: trackLabel, frame: "", targetTitles: [], proofPoints: [], notThisTrack: [] };
      else if (exampleName !== null) example = { name: exampleName, role: "", story: "", metrics: [], link: "", proves: [], keywords: [] };
      else if (sampleContext !== null) sample = { context: sampleContext, text: "" };
      else if (resumeLabel !== null) resume = { trackLabel: resumeLabel, bullets: [] };
      else if (proofObjectName !== null) proofObject = { name: proofObjectName, link: "", bestFor: [], avoidFor: [] };
      continue;
    }

    if (!trimmed) {
      if (sample) sample.text += "\n";
      continue;
    }

    const bullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") ? trimmed.slice(2).trim() : null;

    if (section === "Identity & Positioning") {
      if (trimmed === "Links:") { identityField = "links"; continue; }
      if (identityField === "links" && bullet) {
        const colonIndex = bullet.indexOf(":");
        if (colonIndex > 0) {
          dossier.links.push({ label: bullet.slice(0, colonIndex).trim(), url: bullet.slice(colonIndex + 1).trim() });
        }
        continue;
      }
      dossier.positioning = [dossier.positioning, trimmed].filter(Boolean).join(" ");
      continue;
    }

    if (track) {
      const frame = labeledValue(trimmed, "Frame");
      const titles = labeledValue(trimmed, "Target titles");
      if (frame !== null) { track.frame = frame; trackField = ""; continue; }
      if (titles !== null) { track.targetTitles = splitCsv(titles); trackField = ""; continue; }
      if (trimmed === "Proof points:") { trackField = "proof"; continue; }
      if (trimmed === "Not this track:") { trackField = "not"; continue; }
      if (bullet && trackField === "proof") { track.proofPoints.push(bullet); continue; }
      if (bullet && trackField === "not") { track.notThisTrack.push(bullet); continue; }
      continue;
    }

    if (example) {
      const role = labeledValue(trimmed, "Role");
      const story = labeledValue(trimmed, "Story");
      const link = labeledValue(trimmed, "Link");
      const proves = labeledValue(trimmed, "Proves");
      const keywords = labeledValue(trimmed, "Keywords");
      if (role !== null) { example.role = role; exampleField = ""; continue; }
      if (story !== null) { example.story = story; exampleField = ""; continue; }
      if (trimmed === "Metrics:") { exampleField = "metrics"; continue; }
      if (link !== null) { example.link = link; exampleField = ""; continue; }
      if (proves !== null) { example.proves = splitCsv(proves); exampleField = ""; continue; }
      if (keywords !== null) { example.keywords = splitCsv(keywords.toLowerCase()); exampleField = ""; continue; }
      if (bullet && exampleField === "metrics") { example.metrics.push(bullet); continue; }
      if (exampleField === "" && !bullet) { example.story = [example.story, trimmed].filter(Boolean).join(" "); }
      continue;
    }

    if (sample) {
      sample.text += `${line}\n`;
      continue;
    }

    if (resume) {
      if (bullet) resume.bullets.push(bullet);
      continue;
    }

    if (proofObject) {
      const link = labeledValue(trimmed, "Link");
      if (link !== null) { proofObject.link = link; proofField = ""; continue; }
      if (trimmed === "Best for:") { proofField = "best"; continue; }
      if (trimmed === "Avoid for:") { proofField = "avoid"; continue; }
      if (bullet && proofField === "best") { proofObject.bestFor.push(bullet); continue; }
      if (bullet && proofField === "avoid") { proofObject.avoidFor.push(bullet); continue; }
      continue;
    }

    if (section === "Writing Style") {
      const voice = labeledValue(trimmed, "Voice");
      const banned = labeledValue(trimmed, "Banned");
      if (voice !== null) { dossier.voice = voice; continue; }
      if (banned !== null) { dossier.banned = splitCsv(banned); continue; }
      if (trimmed === "Rules:") continue;
      if (bullet) { dossier.rules.push(bullet); continue; }
      if (dossier.voice && !dossier.banned.length) dossier.voice = `${dossier.voice} ${trimmed}`;
      continue;
    }

    if (section === "Constraints" && bullet) { dossier.constraints.push(bullet); continue; }
    if (section === "Outreach Strategy" && bullet) { dossier.strategy.push(bullet); continue; }
    if (section === "Operating Style") { dossier.operatingStyle = [dossier.operatingStyle, trimmed].filter(Boolean).join(" "); continue; }
    if (section === "Decision Style" && bullet) { dossier.decisionStyle.push(bullet); continue; }
    if (section === "Communication Posture" && bullet) { dossier.communicationPosture.push(bullet); continue; }
    if (section === "What AI Gets Wrong About Randall" && bullet) { dossier.aiMisreads.push(bullet); continue; }
    if (section === "Why People Hire Randall" && bullet) { dossier.hireReasons.push(bullet); continue; }
  }

  flushSubsections();

  dossier.validation.missingSections = REQUIRED_SECTIONS.filter((name) => !seenSections.has(name));
  dossier.validation.examplesWithoutMetrics = dossier.examples
    .filter((item) => item.metrics.length === 0)
    .map((item) => item.name);
  dossier.validation.ok = (
    dossier.validation.missingSections.length === 0 &&
    dossier.validation.needsInput.length === 0 &&
    dossier.tracks.length > 0 &&
    dossier.examples.length > 0 &&
    dossier.samples.length > 0 &&
    dossier.resumes.length > 0
  );

  return dossier;
}

export function selectRelevantExamples(examples: DossierExample[], jobText: string, trackLabel: string, limit = 2): DossierExample[] {
  const normalizedJobText = jobText.toLowerCase();

  return examples
    .map((item) => {
      const keywordHits = item.keywords.filter((keyword) => normalizedJobText.includes(keyword)).length;
      const trackBonus = item.proves.some((label) => label.toLowerCase() === trackLabel.toLowerCase()) ? 1 : 0;
      return { item, score: keywordHits * 2 + trackBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

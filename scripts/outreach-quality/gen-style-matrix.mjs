// Cross-style v3 invariance experiment. Runs the exact frozen v3 prompt against six
// synthetic onboarding voice configurations while holding candidate evidence and jobs fixed.
// Network execution is intentionally separate from v4 and from the normal version registry.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "../../node_modules/@anthropic-ai/sdk/index.mjs";
import { generateVoiceFingerprint, renderVoiceFingerprint } from "../../lib/public-profile/voice-fingerprint.ts";
import {
  buildControlledJobs,
  createArtifactManifest,
  buildExpectedCells,
  buildOutreachPromptParts,
  contractViolations,
  evidenceSlice,
  fingerprintInputForPersona,
  messageStyleMetrics,
  parseOutreachJson,
  renderPersonaProfile,
  sha256,
  summarizeSelectionStability,
  validateCompleteMatrix,
  validateMatrixConfig,
  verifyArtifactManifest,
  workExampleBodyViolations,
} from "./cross-style-matrix.mjs";
import {
  matchInsertedWorkExample,
  verifyFrozenWorkExampleAudit,
  workExampleKey,
} from "./work-example-audit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const dataDir = resolve(here, "data");
const inputsDir = resolve(dataDir, "inputs");
const promptsDir = resolve(dataDir, "prompts");
mkdirSync(inputsDir, { recursive: true });
mkdirSync(promptsDir, { recursive: true });

const evidenceManifest = JSON.parse(readFileSync(resolve(here, "evidence-manifest.json"), "utf8"));
const evidenceFileNames = ["profile.md", "work-examples.json", "work-example-audit.json", "outreach-messages.json", "scan-jobs.json"];
const evidenceContents = Object.fromEntries(evidenceFileNames.map((name) => [name, readFileSync(resolve(here, name), "utf8")]));
for (const [name, contents] of Object.entries(evidenceContents)) {
  if (evidenceManifest.files?.[name] !== sha256(contents)) {
    throw new Error(`Evidence scratch set is incomplete or mixed at ${name}. Run pull-evidence.mjs again.`);
  }
}

const baseProfile = readFileSync(resolve(inputsDir, "v3-profile.md"), "utf8");
if (baseProfile !== evidenceContents["profile.md"]) throw new Error("Frozen v3 profile differs from the sealed evidence profile.");
const v3Prompt = readFileSync(resolve(promptsDir, "v3.txt"), "utf8");
const configText = readFileSync(resolve(dataDir, "voice-matrix-personas-v3.json"), "utf8");
const config = JSON.parse(configText);
validateMatrixConfig(config);
if (sha256(v3Prompt) !== config.shared.approvedV3PromptHash) {
  throw new Error("Frozen v3 prompt hash differs from the approved matrix input.");
}

const v3Corpus = JSON.parse(readFileSync(resolve(dataDir, "corpus-v3.json"), "utf8"));
const allJobs = JSON.parse(evidenceContents["scan-jobs.json"]);
const controlledJobs = buildControlledJobs(config, v3Corpus, allJobs);
const jobById = new Map(controlledJobs.map((job) => [job.jobId, job]));
const structuredWorkExamples = JSON.parse(evidenceContents["work-examples.json"]);
const workExampleAudit = JSON.parse(evidenceContents["work-example-audit.json"]);
const compiledWorkExamples = verifyFrozenWorkExampleAudit(workExampleAudit, structuredWorkExamples, baseProfile);
const baseEvidenceHash = sha256(evidenceSlice(baseProfile));
const expectedCells = buildExpectedCells(config);
if (expectedCells.length !== 28) throw new Error("Expected exactly 28 matrix cells.");

if (process.env.MATRIX_PREFLIGHT_ONLY === "1") {
  console.log(JSON.stringify({
    ok: true,
    matrixId: config.matrixId,
    personas: config.personas.length,
    jobs: controlledJobs.length,
    cells: expectedCells.length,
    hashes: {
      v3Prompt: sha256(v3Prompt),
      baseProfile: sha256(baseProfile),
      baseEvidence: baseEvidenceHash,
      fixtures: sha256(configText),
    },
  }, null, 2));
  process.exit(0);
}

const env = Object.fromEntries(
  readFileSync(resolve(repo, ".env.local"), "utf8").split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
    }),
);
if (!env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY in .env.local.");

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });

async function callText(system, content, maxTokens = 1024) {
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  const block = response.content.find((item) => item.type === "text");
  if (!block || !("text" in block) || !block.text.trim()) throw new Error("Model returned no text.");
  return block.text;
}

const personaRecords = [];
let fingerprintSystemText;
for (const persona of config.personas) {
  const input = fingerprintInputForPersona(config, persona);
  let fingerprintSystemHash;
  let fingerprintUserHash;
  const fingerprint = await generateVoiceFingerprint(input, {
    callModel: async ({ system, user }) => {
      if (fingerprintSystemText && fingerprintSystemText !== system) {
        throw new Error("Voice-fingerprint system prompt changed within the matrix run.");
      }
      fingerprintSystemText = system;
      fingerprintSystemHash = sha256(system);
      fingerprintUserHash = sha256(user);
      return callText(system, user);
    },
  });
  if (!fingerprint) throw new Error(`${persona.id}: fingerprint generation failed; no artifacts were written.`);
  const renderedFingerprint = renderVoiceFingerprint(fingerprint);
  const profileMarkdown = renderPersonaProfile(baseProfile, config, persona, renderedFingerprint);
  if (sha256(evidenceSlice(profileMarkdown)) !== baseEvidenceHash) {
    throw new Error(`${persona.id}: non-voice candidate evidence changed.`);
  }
  personaRecords.push({
    persona,
    input,
    fingerprint,
    renderedFingerprint,
    fingerprintSystemHash,
    fingerprintUserHash,
    profileMarkdown,
    profileHash: sha256(profileMarkdown),
    fingerprintViolations: [
      JSON.stringify(fingerprint).toLowerCase().includes(config.shared.q1Value.toLowerCase()) ? "q1_copied_into_fingerprint" : null,
      JSON.stringify(fingerprint).toLowerCase().includes(config.shared.q4Opinion.toLowerCase()) ? "q4_copied_into_fingerprint" : null,
    ].filter(Boolean),
  });
  console.log(`fingerprint: ${persona.id} ok`);
}

const cells = [];
for (const personaRecord of personaRecords) {
  const expectedForPersona = expectedCells.filter((cell) => cell.personaId === personaRecord.persona.id);
  for (const expected of expectedForPersona) {
    const job = jobById.get(expected.jobId);
    if (!job) throw new Error(`${expected.cellId}: controlled job missing.`);
    const { cachePrefix, tail } = buildOutreachPromptParts(personaRecord.profileMarkdown, job);
    const content = [
      { type: "text", text: cachePrefix, cache_control: { type: "ephemeral" } },
      { type: "text", text: tail },
    ];
    process.stdout.write(`generating ${expected.cellId} ... `);
    let parsed;
    let selection;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const raw = await callText(v3Prompt, content);
      parsed = parseOutreachJson(raw);
      if (parsed) {
        const selected = matchInsertedWorkExample(parsed.insertedExample, compiledWorkExamples);
        selection = selected ? { key: workExampleKey(selected), title: selected.title } : null;
        if (!parsed.insertedExample || selection) break;
      }
      if (attempt === 3) {
        throw new Error(`${expected.cellId}: no valid outreach after 3 attempts; no artifacts were written.`);
      }
      process.stdout.write(`retry ${attempt + 1}/3 ... `);
      parsed = undefined;
    }
    const violations = contractViolations({
      message: parsed.message,
      insertedExample: parsed.insertedExample,
      selection,
      config,
    });
    violations.push(...workExampleBodyViolations(parsed.message, parsed.insertedExample, compiledWorkExamples));
    const styleMetrics = messageStyleMetrics(parsed.message);
    const [targetMin, targetMax] = personaRecord.persona.expectations.targetCharacters;
    styleMetrics.targetCharacters = { min: targetMin, max: targetMax, pass: styleMetrics.length >= targetMin && styleMetrics.length <= targetMax };
    cells.push({
      cellId: expected.cellId,
      personaId: expected.personaId,
      jobId: expected.jobId,
      message: parsed.message,
      insertedExample: parsed.insertedExample,
      workExampleSelection: selection,
      styleMetrics,
      contractViolations: violations,
    });
    console.log(`ok (${parsed.message.length} chars${violations.length ? `; ${violations.join(",")}` : ""})`);
  }
}

validateCompleteMatrix(config, cells);
if (!fingerprintSystemText) throw new Error("Voice-fingerprint system prompt was not captured.");

const generatedAt = new Date().toISOString();
const matrixArtifact = {
  schemaVersion: 1,
  experimentId: config.matrixId,
  baseVersion: "v3",
  generatedAt,
  models: { fingerprint: "claude-opus-4-8", outreach: "claude-opus-4-8" },
  hashes: {
    v3Prompt: sha256(v3Prompt),
    baseProfile: sha256(baseProfile),
    baseEvidence: baseEvidenceHash,
    jobs: sha256(JSON.stringify(controlledJobs)),
    fixtures: sha256(configText),
    evidenceManifest: sha256(JSON.stringify(evidenceManifest)),
  },
  workExampleInventory: workExampleAudit,
  jobs: controlledJobs.map(({ description, ...summary }) => summary),
  personas: personaRecords.map(({ persona, input, fingerprint, renderedFingerprint, fingerprintSystemHash, fingerprintUserHash, profileHash, fingerprintViolations }) => ({
    id: persona.id,
    label: persona.label,
    kind: persona.kind,
    expectations: persona.expectations,
    input,
    fingerprint,
    renderedFingerprint,
    fingerprintSystemHash,
    fingerprintUserHash,
    profileHash,
    fingerprintViolations,
  })),
  selectionStability: summarizeSelectionStability(config, cells),
  cells,
};

const human = ["# Cross-style matrix (v3)", `Generated ${generatedAt}`, ""];
for (const persona of config.personas) {
  human.push(`## ${persona.label}`, "");
  for (const cell of cells.filter((item) => item.personaId === persona.id)) {
    const job = jobById.get(cell.jobId);
    human.push(
      `### ${job.company} — ${job.title}`,
      `Length: ${cell.styleMetrics.length} · Work Example: ${cell.workExampleSelection?.title || "none"} · Violations: ${cell.contractViolations.join(", ") || "none"}`,
      "",
      cell.message,
      "",
    );
  }
}

const officialFiles = [
  [resolve(dataDir, "style-matrix-v3.json"), JSON.stringify(matrixArtifact, null, 2)],
  [resolve(inputsDir, "style-matrix-v3-personas.json"), configText],
  [resolve(inputsDir, "style-matrix-v3-jobs.json"), JSON.stringify(controlledJobs, null, 2)],
  [resolve(promptsDir, "style-matrix-v3.txt"), v3Prompt],
  [resolve(promptsDir, "style-matrix-v3-fingerprint.txt"), fingerprintSystemText],
];
for (const [path, contents] of officialFiles) writeFileSync(`${path}.next`, contents);
for (const [path] of officialFiles) renameSync(`${path}.next`, path);

const feedbackPath = resolve(dataDir, "feedback-style-matrix-v3.json");
if (!existsSync(feedbackPath)) {
  writeFileSync(feedbackPath, JSON.stringify({ experimentId: config.matrixId, items: {} }, null, 2));
}
writeFileSync(resolve(here, "style-matrix-v3.md"), human.join("\n"));

const artifactFiles = Object.fromEntries(officialFiles.map(([path, contents]) => [path.slice(dataDir.length + 1), contents]));
const artifactManifest = createArtifactManifest(config.matrixId, generatedAt, artifactFiles);
writeFileSync(resolve(dataDir, "style-matrix-v3-manifest.json.next"), JSON.stringify(artifactManifest, null, 2));
renameSync(resolve(dataDir, "style-matrix-v3-manifest.json.next"), resolve(dataDir, "style-matrix-v3-manifest.json"));
const manifestReadback = JSON.parse(readFileSync(resolve(dataDir, "style-matrix-v3-manifest.json"), "utf8"));
const fileReadback = Object.fromEntries(Object.keys(manifestReadback.files).map((name) => [name, readFileSync(resolve(dataDir, name), "utf8")]));
verifyArtifactManifest(manifestReadback, fileReadback);
console.log(`\nstyle matrix complete: ${personaRecords.length}/6 fingerprints, ${cells.length}/28 messages`);

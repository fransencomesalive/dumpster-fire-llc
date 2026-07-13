import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(values) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- (none)";
}

function samples(label, values) {
  if (values.length === 0) return "";
  return `${label}:\n\n${values.map((value) => `> ${value}\nChannel: other`).join("\n\n")}`;
}

function isHash(value) {
  return /^[a-f0-9]{64}$/.test(clean(value));
}

function duplicateValues(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export function fingerprintInputForPersona(config, persona) {
  return {
    q1Value: config.shared.q1Value,
    q4Opinion: config.shared.q4Opinion,
    toneTags: [...persona.toneTags],
    avoidTags: [...persona.avoidTags],
    avoidNote: persona.avoidNote,
    soundsLikeSamples: [...persona.soundsLikeSamples],
    wantToSoundSamples: [...persona.wantToSoundSamples],
    neverSoundSamples: [...persona.neverSoundSamples],
  };
}

export function validateMatrixConfig(config) {
  const issues = [];
  if (config?.matrixId !== "voice-matrix-v3") issues.push("matrixId must be voice-matrix-v3.");
  if (config?.promptVariant !== "v3") issues.push("promptVariant must be v3.");
  if (!isHash(config?.shared?.approvedV3PromptHash)) issues.push("A pinned approved v3 prompt hash is required.");
  if (!clean(config?.shared?.q1Value) || !clean(config?.shared?.q4Opinion)) issues.push("Shared Q1 and Q4 values are required.");
  if (!Array.isArray(config?.personas) || config.personas.length !== 6) issues.push("Expected six personas.");
  const personas = Array.isArray(config?.personas) ? config.personas : [];
  const ids = personas.map((persona) => persona.id);
  if (new Set(ids).size !== ids.length) issues.push("Persona ids must be unique.");
  if (personas.filter((persona) => persona.kind === "full").length !== 4) issues.push("Expected four full personas.");
  if (personas.filter((persona) => persona.kind === "diagnostic").length !== 2) issues.push("Expected two diagnostic personas.");
  if (config?.shared?.fullJobIds?.length !== 6 || new Set(config.shared.fullJobIds).size !== 6) issues.push("Expected six unique full job ids.");
  if (config?.shared?.sentinelJobIds?.length !== 2 || new Set(config.shared.sentinelJobIds).size !== 2) issues.push("Expected two unique sentinel job ids.");
  const fullJobIds = Array.isArray(config?.shared?.fullJobIds) ? config.shared.fullJobIds : [];
  const sentinelJobIds = Array.isArray(config?.shared?.sentinelJobIds) ? config.shared.sentinelJobIds : [];
  if (sentinelJobIds.some((jobId) => !fullJobIds.includes(jobId))) issues.push("Sentinel jobs must be a subset of full jobs.");
  const jobInputHashes = config?.shared?.jobInputHashes;
  if (!jobInputHashes || Object.keys(jobInputHashes).length !== fullJobIds.length
    || fullJobIds.some((jobId) => !isHash(jobInputHashes[jobId]))) {
    issues.push("Every controlled job needs one pinned input hash.");
  }
  if (config?.shared?.hardCharacterMax !== 750) issues.push("Hard character maximum must remain 750 for the v3 matrix.");
  const expectedPrecedence = ["universal_policy", "hard_negatives", "sounds_like_me", "want_to_sound", "tone_tags"];
  if (JSON.stringify(config?.shared?.precedence) !== JSON.stringify(expectedPrecedence)) issues.push("Voice precedence does not match the approved contract.");

  for (const persona of personas) {
    if (!clean(persona.id) || !clean(persona.label)) issues.push("Every persona needs an id and label.");
    if (!['full', 'diagnostic'].includes(persona.kind)) issues.push(`${persona.id}: kind must be full or diagnostic.`);
    if (!Array.isArray(persona.toneTags) || persona.toneTags.length < 1) issues.push(`${persona.id}: at least one tone tag is required.`);
    if (!Array.isArray(persona.avoidTags)) issues.push(`${persona.id}: avoidTags must be an array.`);
    if (typeof persona.avoidNote !== "string") issues.push(`${persona.id}: avoidNote must be a string.`);
    if (!Array.isArray(persona.soundsLikeSamples) || persona.soundsLikeSamples.length < 1 || persona.soundsLikeSamples.length > 2) issues.push(`${persona.id}: expected one or two sounds-like samples.`);
    if (!Array.isArray(persona.wantToSoundSamples) || persona.wantToSoundSamples.length > 1) issues.push(`${persona.id}: expected zero or one aspirational sample.`);
    if (!Array.isArray(persona.neverSoundSamples) || persona.neverSoundSamples.length !== 1) issues.push(`${persona.id}: expected exactly one never-sound sample.`);
    const allSamples = [...(persona.soundsLikeSamples || []), ...(persona.wantToSoundSamples || []), ...(persona.neverSoundSamples || [])];
    for (const value of allSamples) {
      if (!clean(value)) issues.push(`${persona.id}: writing samples must be non-empty strings.`);
      if (clean(value).split(/\s+/).length > 200) issues.push(`${persona.id}: a writing sample exceeds 200 words.`);
    }
    const target = persona.expectations?.targetCharacters;
    if (!Array.isArray(target) || target.length !== 2
      || target.some((value) => !Number.isInteger(value))
      || target[0] < 1 || target[0] > target[1]
      || target[1] > config.shared.hardCharacterMax) {
      issues.push(`${persona.id}: target character range must be ordered integers inside the hard ceiling.`);
    }
  }

  const cellCount = personas.reduce((total, persona) => total + (persona.kind === "full" ? 6 : 2), 0);
  if (cellCount !== 28) issues.push(`Expected 28 matrix cells; found ${cellCount}.`);
  if (issues.length > 0) throw new Error(`Invalid cross-style matrix config: ${issues.join(" ")}`);
  return { personaCount: personas.length, cellCount };
}

function boundedSection(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  if (start === -1 || end === -1 || end <= start) throw new Error(`Could not bound ${startHeading}.`);
  return { before: markdown.slice(0, start), section: markdown.slice(start, end), after: markdown.slice(end) };
}

export function evidenceSlice(baseProfile) {
  const identityStart = baseProfile.indexOf("## Identity & Search");
  const guardrailStart = baseProfile.indexOf("## Guardrails", identityStart);
  if (identityStart === -1 || guardrailStart === -1) throw new Error("Base profile is missing evidence boundaries.");
  return baseProfile.slice(identityStart, guardrailStart).trim();
}

export function renderPersonaProfile(baseProfile, config, persona, renderedFingerprint) {
  const voiceBounds = boundedSection(baseProfile, "## Voice Profile", "## Identity & Search");
  const evidenceAndGuardrails = voiceBounds.after;
  const guardrailStart = evidenceAndGuardrails.indexOf("## Guardrails");
  if (guardrailStart === -1) throw new Error("Base profile is missing Guardrails.");
  const evidence = evidenceAndGuardrails.slice(0, guardrailStart).trim();
  const voice = [
    "## Voice Profile",
    clean(renderedFingerprint),
    `- What I'm the person for: ${config.shared.q1Value}`,
    `- An opinion I'll defend: ${config.shared.q4Opinion}`,
    "\nTone tags:",
    list(persona.toneTags),
    samples("Sounds like me", persona.soundsLikeSamples),
    samples("Want to sound like this", persona.wantToSoundSamples),
  ].filter(Boolean).join("\n");
  const guardrails = [
    "## Guardrails",
    samples("Never sound like this", persona.neverSoundSamples),
  ].join("\n");
  return `${voiceBounds.before}${voice}\n${evidence}\n${guardrails}\n`;
}

export function buildControlledJobs(config, v3Corpus, allJobs) {
  if (!Array.isArray(v3Corpus?.messages) || !Array.isArray(allJobs)) throw new Error("Controlled job sources must be arrays.");
  const corpusIds = v3Corpus.messages.map((message) => message.jobId);
  const jobIds = allJobs.map((job) => job.id);
  if (duplicateValues(corpusIds).length > 0) throw new Error("Duplicate job ids exist in the v3 corpus.");
  if (duplicateValues(jobIds).length > 0) throw new Error("Duplicate job ids exist in the sealed job input.");
  const corpusById = new Map(v3Corpus.messages.map((message) => [message.jobId, message]));
  const jobsById = new Map(allJobs.map((job) => [job.id, job]));
  return config.shared.fullJobIds.map((jobId) => {
    const corpus = corpusById.get(jobId);
    const job = jobsById.get(jobId);
    if (!corpus || !job || !clean(job.description)) throw new Error(`Missing controlled job input for ${jobId}.`);
    if (![job.title, job.company_name, corpus.contactRole].every(clean)) throw new Error(`Incomplete controlled job metadata for ${jobId}.`);
    if (clean(corpus.title) !== clean(job.title) || clean(corpus.company) !== clean(job.company_name)) {
      throw new Error(`Frozen corpus and sealed job metadata differ for ${jobId}.`);
    }
    const inputHash = sha256(JSON.stringify({
      jobId,
      title: job.title,
      company: job.company_name,
      description: job.description,
      contactRole: corpus.contactRole,
      contactSeniority: corpus.contactSeniority || null,
    }));
    if (inputHash !== config.shared.jobInputHashes[jobId]) throw new Error(`Controlled job input hash changed for ${jobId}.`);
    return {
      jobId,
      title: job.title,
      company: job.company_name,
      description: job.description,
      sourceUrl: job.source_url || null,
      location: job.location || null,
      remoteType: job.remote_type || null,
      fit: corpus.fit,
      contact: {
        role: corpus.contactRole,
        seniority: corpus.contactSeniority || undefined,
      },
      inputHash,
    };
  });
}

export function buildExpectedCells(config) {
  const cells = [];
  for (const persona of config.personas) {
    const jobIds = persona.kind === "full" ? config.shared.fullJobIds : config.shared.sentinelJobIds;
    for (const jobId of jobIds) cells.push({ cellId: `${persona.id}:${jobId}`, personaId: persona.id, jobId });
  }
  return cells;
}

export function buildOutreachPromptParts(profileMarkdown, job) {
  const contactLine = [
    `Role: ${job.contact.role}`,
    job.contact.seniority ? `Seniority: ${job.contact.seniority}` : undefined,
  ].filter(Boolean).join("\n");
  return {
    cachePrefix: ["## Profile", profileMarkdown.trim()].join("\n"),
    tail: [
      "## Job",
      `Title: ${job.title}`,
      `Company: ${job.company}`,
      "Description:",
      job.description.trim(),
      "",
      "## Contact",
      contactLine,
    ].join("\n"),
  };
}

export function parseOutreachJson(raw) {
  const text = clean(raw);
  if (!text.startsWith("{") || !text.endsWith("}")) return undefined;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return undefined;
    const keys = Object.keys(parsed).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["insertedExample", "message"])) return undefined;
    if (typeof parsed.message !== "string" || !parsed.message.trim()) return undefined;
    const inserted = parsed.insertedExample;
    if (inserted !== null) {
      if (!inserted || Array.isArray(inserted) || typeof inserted !== "object") return undefined;
      const insertedKeys = Object.keys(inserted).sort();
      if (insertedKeys.some((key) => !["link", "oneHitter"].includes(key))
        || !clean(inserted.oneHitter)
        || (inserted.link !== undefined && typeof inserted.link !== "string")) return undefined;
    }
    return { message: parsed.message.trim(), insertedExample: inserted };
  } catch {
    return undefined;
  }
}

export function messageStyleMetrics(message) {
  const words = message.trim().split(/\s+/).filter(Boolean);
  const sentences = message.split(/[.!?]+(?:\s|$)/).map((value) => value.trim()).filter(Boolean);
  return {
    length: message.length,
    words: words.length,
    paragraphs: message.split(/\n\s*\n/).filter((value) => value.trim()).length,
    sentences: sentences.length,
    averageSentenceWords: sentences.length > 0 ? Number((words.length / sentences.length).toFixed(1)) : 0,
    contractions: (message.match(/\b\w+'(?:t|re|ve|ll|d|m|s)\b/gi) || []).length,
    questions: (message.match(/\?/g) || []).length,
    exclamations: (message.match(/!/g) || []).length,
    links: (message.match(/https?:\/\//gi) || []).length,
    inventedNumber: /\b(\w+teen|twelve|twenty|thirty|forty|fifty|ten|nine|eight|seven|six|five|four|three|\d+)\s+(?:disconnected\s+|different\s+|orphaned\s+)?docs?\b/i.test(message) ? 1 : 0,
    concessionOpener: /straight up|i'?ll be straight|i'?ll be honest|let me be honest|up ?front|to be honest|not going to pretend/i.test(message.slice(0, 90)) ? 1 : 0,
    tellsWhatTheyWant: /^\W*you'?re (?:looking|hunting|after|chasing)|^\W*you want|^\W*you need/i.test(message.slice(0, 90)) ? 1 : 0,
    q4BragTag: /\bI do\.|I'?m not one of them|don'?t (?:quite )?(?:understand|know what)/i.test(message.slice(-140)) ? 1 : 0,
  };
}

export function workExampleBodyViolations(message, insertedExample, compiledExamples) {
  const violations = [];
  const evident = compiledExamples.filter((example) => (
    clean(example.oneHitter) && message.includes(clean(example.oneHitter))
  ) || (clean(example.link) && message.includes(clean(example.link))));
  if (!insertedExample && evident.length > 0) violations.push("unreported_work_example");
  if (insertedExample && !evident.some((example) => (
    clean(example.oneHitter) === clean(insertedExample.oneHitter)
    && clean(example.link) === clean(insertedExample.link)
  ))) violations.push("selected_example_not_obvious");
  return violations;
}

export function contractViolations({ message, insertedExample, selection, config }) {
  const violations = [];
  if (!clean(message)) violations.push("empty_message");
  if (message.length > config.shared.hardCharacterMax) violations.push("over_750_characters");
  if ((message.match(/https?:\/\//gi) || []).length > 1) violations.push("more_than_one_link");
  if (insertedExample && !selection) violations.push("unmatched_work_example");
  if (message.toLowerCase().includes(config.shared.q4Opinion.toLowerCase())) violations.push("q4_quoted_verbatim");
  if (/\b(the whole game|the whole job description|really just an? .+ problem|problem dressed as)\b/i.test(message)) violations.push("authority_framing");
  if (/\b(opinion i(?:'|’)ll defend|here(?:'|’)s (?:my )?take)\b/i.test(message)) violations.push("q4_announced");
  return violations;
}

export function summarizeSelectionStability(config, cells) {
  return config.shared.fullJobIds.map((jobId) => {
    const choices = cells
      .filter((cell) => cell.jobId === jobId && config.personas.find((persona) => persona.id === cell.personaId)?.kind === "full")
      .map((cell) => cell.workExampleSelection?.key || "none");
    const uniqueChoices = [...new Set(choices)];
    return { jobId, choices, uniqueChoices, varies: uniqueChoices.length > 1 };
  });
}

export function createArtifactManifest(experimentId, generatedAt, files) {
  return {
    experimentId,
    generatedAt,
    files: Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, sha256(contents)])),
  };
}

export function verifyArtifactManifest(manifest, files) {
  if (!manifest?.experimentId || !manifest?.generatedAt || !manifest?.files) throw new Error("Invalid style-matrix artifact manifest.");
  const expectedNames = Object.keys(manifest.files).sort();
  const actualNames = Object.keys(files).sort();
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) throw new Error("Style-matrix artifact set does not match its manifest.");
  for (const name of expectedNames) {
    if (!isHash(manifest.files[name]) || sha256(files[name]) !== manifest.files[name]) {
      throw new Error(`Style-matrix artifact hash mismatch at ${name}.`);
    }
  }
  return true;
}

export function validateCompleteMatrix(config, cells) {
  const expected = buildExpectedCells(config);
  const expectedIds = expected.map((cell) => cell.cellId).sort();
  const actualIds = cells.map((cell) => cell.cellId).sort();
  if (cells.length !== 28 || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error("Cross-style matrix is incomplete or contains duplicate/unexpected cells.");
  }
  for (const cell of cells) {
    if (!clean(cell.message)) throw new Error(`${cell.cellId}: empty message.`);
    if (cell.insertedExample && !cell.workExampleSelection?.key) throw new Error(`${cell.cellId}: unmatched Work Example metadata.`);
  }
  return true;
}

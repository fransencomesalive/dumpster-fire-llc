import assert from "node:assert/strict";
import { extractPostingSectionsLLM, parsePostingModelJson } from "../lib/scan/sources/llm-extract-posting";

// parsePostingModelJson — clean JSON
const clean = parsePostingModelJson('{"responsibilities":["Own the roadmap","Lead discovery"],"requiredExperience":["5+ years product"]}');
assert.deepEqual(clean.responsibilities, ["Own the roadmap", "Lead discovery"]);
assert.deepEqual(clean.requiredExperience, ["5+ years product"]);

// Tolerates code fences + preamble
const fenced = parsePostingModelJson('Here you go:\n```json\n{"responsibilities":["Drive launches"],"requiredExperience":[]}\n```');
assert.deepEqual(fenced.responsibilities, ["Drive launches"]);
assert.deepEqual(fenced.requiredExperience, []);

// Strips bullet markers, drops too-short, dedupes, caps at 6
const messy = parsePostingModelJson(JSON.stringify({
  responsibilities: ["- Own delivery", "• Own delivery", "no", "Run cross-functional programs end to end", "A", "B", "C", "D", "E", "F", "G"].map((s) => `${s} of the work`),
  requiredExperience: 42,
}));
assert.ok(messy.responsibilities.length <= 6);
assert.ok(messy.responsibilities.every((item) => !item.startsWith("-") && !item.startsWith("•")));
assert.deepEqual(messy.requiredExperience, []);

// Garbage / empty
assert.deepEqual(parsePostingModelJson(undefined), { responsibilities: [], requiredExperience: [] });
assert.deepEqual(parsePostingModelJson("not json at all"), { responsibilities: [], requiredExperience: [] });

async function main() {
  // Injected callModel
  const viaModel = await extractPostingSectionsLLM(
    { title: "Producer", companyName: "Studio X", description: "Lead big projects." },
    { callModel: async ({ system, user }) => {
      assert.ok(system.includes("JSON"));
      assert.ok(user.includes("Producer") && user.includes("Studio X"));
      return '{"responsibilities":["Lead big projects from brief to delivery"],"requiredExperience":["Agency production background"]}';
    } },
  );
  assert.deepEqual(viaModel.responsibilities, ["Lead big projects from brief to delivery"]);
  assert.deepEqual(viaModel.requiredExperience, ["Agency production background"]);

  // No key / unavailable model -> empty (graceful)
  const unavailable = await extractPostingSectionsLLM(
    { title: "x", companyName: "y", description: "z" },
    { callModel: async () => undefined },
  );
  assert.deepEqual(unavailable, { responsibilities: [], requiredExperience: [] });

  console.log("llm extract posting: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

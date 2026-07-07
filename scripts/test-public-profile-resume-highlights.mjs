import assert from "node:assert/strict";
import {
  generateResumeHighlights,
  deriveResumeHighlightsForAggregate,
} from "../lib/public-profile/resume-highlights.ts";

// Parse + trim + drop empties + cap at 6, strongest first.
{
  const callModel = async () => JSON.stringify({
    highlights: ["  Cut deploy time 40%  ", "Managed a team of 8", "", "Director of Eng at Acme", "e", "f", "g"],
  });
  const out = await generateResumeHighlights({ resumeName: "R", parsedText: "resume text" }, { callModel });
  assert.deepEqual(out, ["Cut deploy time 40%", "Managed a team of 8", "Director of Eng at Acme", "e", "f", "g"]);
}

// Empty parsedText never calls the model and returns undefined (preserve cache).
{
  let called = false;
  const callModel = async () => { called = true; return "{}"; };
  const out = await generateResumeHighlights({ resumeName: "R", parsedText: "   " }, { callModel });
  assert.equal(out, undefined);
  assert.equal(called, false);
}

// Model unavailable (undefined) degrades to undefined.
assert.equal(
  await generateResumeHighlights({ resumeName: "R", parsedText: "text" }, { callModel: async () => undefined }),
  undefined,
);

// Model ran but found nothing quotable -> [] (a real answer, distinct from undefined).
assert.deepEqual(
  await generateResumeHighlights({ resumeName: "R", parsedText: "text" }, { callModel: async () => JSON.stringify({ highlights: [] }) }),
  [],
);

// Malformed / non-JSON output -> undefined.
assert.equal(
  await generateResumeHighlights({ resumeName: "R", parsedText: "text" }, { callModel: async () => "not json" }),
  undefined,
);

// Aggregate pass: only résumés with text; omits résumés the model returned undefined for.
{
  const aggregate = {
    resumes: [
      { id: "r1", name: "A", parsedText: "text a", highlights: [] },
      { id: "r2", name: "B", parsedText: "", highlights: ["cached"] },
    ],
  };
  const map = await deriveResumeHighlightsForAggregate(aggregate, { callModel: async () => JSON.stringify({ highlights: ["stat from a"] }) });
  assert.ok(map instanceof Map);
  assert.deepEqual(map.get("r1"), ["stat from a"]);
  assert.equal(map.has("r2"), false);
}

// No résumés with text -> undefined (caller reuses cached highlights).
assert.equal(
  await deriveResumeHighlightsForAggregate(
    { resumes: [{ id: "r1", name: "A", parsedText: "", highlights: [] }] },
    { callModel: async () => "{}" },
  ),
  undefined,
);

console.log("public profile resume-highlights: all assertions passed");

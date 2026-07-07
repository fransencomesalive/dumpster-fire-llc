import assert from "node:assert/strict";
import { generateResumeParse } from "../lib/public-profile/resume-parse.ts";

const call = (payload) => ({ callModel: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)) });

// Clean parse.
{
  const v = await generateResumeParse("b64", call({ parsingQuality: "complete", extractedText: "Program Director…" }));
  assert.deepEqual(v, { parsingQuality: "complete", extractedText: "Program Director…", issue: undefined, suggestion: undefined });
}

// Weak parse carries issue + suggestion.
{
  const v = await generateResumeParse("b64", call({
    parsingQuality: "weak",
    extractedText: "garbled but present",
    issue: "Heavy multi-column layout.",
    suggestion: "Re-export as a single-column PDF, or paste the text.",
  }));
  assert.equal(v.parsingQuality, "weak");
  assert.equal(v.issue, "Heavy multi-column layout.");
  assert.equal(v.suggestion, "Re-export as a single-column PDF, or paste the text.");
}

// Failed parse: empty text.
{
  const v = await generateResumeParse("b64", call({ parsingQuality: "failed", extractedText: "", issue: "Scanned images.", suggestion: "Paste the text." }));
  assert.equal(v.parsingQuality, "failed");
  assert.equal(v.extractedText, "");
}

// Contradictory "complete" with no text is normalized to failed.
{
  const v = await generateResumeParse("b64", call({ parsingQuality: "complete", extractedText: "   " }));
  assert.equal(v.parsingQuality, "failed");
  assert.equal(v.extractedText, "");
}

// Invalid parsingQuality -> undefined.
assert.equal(await generateResumeParse("b64", call({ parsingQuality: "great", extractedText: "x" })), undefined);

// Malformed / non-JSON -> undefined.
assert.equal(await generateResumeParse("b64", call("not json")), undefined);

// Model unavailable (undefined) -> undefined (caller falls back to paste).
assert.equal(await generateResumeParse("b64", { callModel: async () => undefined }), undefined);

console.log("public profile resume-parse: all assertions passed");

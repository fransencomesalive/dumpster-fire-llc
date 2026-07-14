import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(resolve(tmpdir(), "outreach-review-"));
const testData = resolve(root, "data");
cpSync(resolve(here, "data"), testData, { recursive: true });

const port = 44000 + (process.pid % 1000);
const child = spawn(process.execPath, [resolve(here, "review-server.mjs")], {
  env: { ...process.env, PORT: String(port), OUTREACH_QUALITY_DATA_DIR: testData },
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/api/state`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("Review server did not start.");
}

try {
  await waitForServer();

  const head = await fetch(`http://localhost:${port}`, { method: "HEAD" });
  assert.equal(head.status, 200);
  const page = await (await fetch(`http://localhost:${port}`)).text();
  assert.match(page, /Fixture voice adherence/);
  assert.match(page, /Prescriptive feedback/);

  let state = await (await fetch(`http://localhost:${port}/api/state`)).json();
  assert.equal(state.matrices.v3.cells.length, 28);
  assert.deepEqual(state.matrixErrors, {});

  const matrixPath = resolve(testData, "style-matrix-v3.json");
  const originalMatrix = readFileSync(matrixPath, "utf8");
  writeFileSync(matrixPath, `${originalMatrix}\n`);
  state = await (await fetch(`http://localhost:${port}/api/state`)).json();
  assert.equal(state.matrices.v3, undefined);
  assert.match(state.matrixErrors.v3, /hash mismatch/i);
  writeFileSync(matrixPath, originalMatrix);

  const cellId = "minimal-direct:39b61911-7535-4a1f-864b-a0ddca52cecd";
  const blindSaved = await fetch(`http://localhost:${port}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ versionId: "matrix-blind:v3", jobId: cellId, blindGuess: "warm-peer" }),
  });
  assert.equal(blindSaved.status, 200);

  const saved = await fetch(`http://localhost:${port}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      versionId: "matrix:v3",
      jobId: cellId,
      comment: "Focused test feedback.",
      ratings: {
        voiceAdherence: 8,
        factualGrounding: 9,
        evidenceRelevance: 7,
        respectFit: 8,
        sendability: 6,
      },
    }),
  });
  assert.equal(saved.status, 200);
  const feedback = JSON.parse(readFileSync(resolve(testData, "feedback-style-matrix-v3.json"), "utf8"));
  assert.equal(feedback.items[cellId].comment, "Focused test feedback.");
  assert.equal(feedback.items[cellId].blindGuess, "warm-peer");
  assert.equal(feedback.items[cellId].ratings.voiceAdherence, 8);
  assert.equal(feedback.items[cellId].ratings.sendability, 6);

  state = await (await fetch(`http://localhost:${port}/api/state`)).json();
  assert.equal(state.matrixFeedback.v3.items[cellId].ratings.factualGrounding, 9);
  console.log("outreach-quality matrix review server: all assertions passed");
} finally {
  child.kill("SIGTERM");
  rmSync(root, { recursive: true, force: true });
}

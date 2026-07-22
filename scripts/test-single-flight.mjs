import assert from "node:assert/strict";
import { runSingleFlight } from "../lib/public-profile/single-flight.ts";

const state = { active: false };
let calls = 0;
let releaseFirst;
const blocked = new Promise((resolve) => {
  releaseFirst = resolve;
});

const first = runSingleFlight(state, async () => {
  calls += 1;
  await blocked;
  return "first";
});
const overlapping = await runSingleFlight(state, async () => {
  calls += 1;
  return "overlap";
});

assert.equal(overlapping.started, false);
assert.equal(calls, 1);
assert.equal(state.active, true);

releaseFirst();
assert.deepEqual(await first, { started: true, value: "first" });
assert.equal(state.active, false);

const next = await runSingleFlight(state, async () => {
  calls += 1;
  return "next";
});
assert.deepEqual(next, { started: true, value: "next" });
assert.equal(calls, 2);

console.log("single flight: all assertions passed");

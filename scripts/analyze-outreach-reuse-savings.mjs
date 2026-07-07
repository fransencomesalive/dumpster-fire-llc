// Outreach cost-model harness (Phase 5 item 3).
//
// Question (Randall): does SAVING + REUSING generated outreach messages produce a
// SIGNIFICANT model-cost saving? If it's negligible, reuse is a worse product than
// fresh generation — near-duplicate reused content reads as a stale/cheap backend the
// user is paying for. This quantifies the saving so the decision is made on numbers.
//
// It also models the alternative lever the code doesn't use yet: PROMPT CACHING the
// profile.md prefix (identical across all of a user's outreach), which captures most of
// the same input-cost saving with ZERO product-quality downside.
//
// Pricing: Claude Opus 4.8 (claude-opus-4-8), the model the generator calls.
// Source: claude-api skill, cached 2026-06-24. Input $5.00 / 1M, output $25.00 / 1M.
// Prompt caching: cache READ ~0.1x input, cache WRITE 1.25x input (5-min TTL).
const USD_PER_1M_INPUT = 5.0;
const USD_PER_1M_OUTPUT = 25.0;
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

// --- Token sizes (modeled) --------------------------------------------------
// The outreach prompt = system prompt + the WHOLE compiled profile.md + job + contact.
// profile.md dominates and varies per user; the rest is small and roughly fixed.
// These are transparent estimates, not measured with count_tokens (no API key offline).
// Sweep profile.md to see sensitivity. system≈300 measured from the real systemPrompt.
const TOK = {
  system: 300, // static outreach systemPrompt
  profileMd: 3000, // compiled profile.md (voice block + all sections) — the big term
  job: 500, // job title + company + description
  contact: 60, // name + role + seniority
  output: 300, // one short outreach message (max_tokens is 1024; real ~150-350)
};

const usd = (n) => `$${n.toFixed(4)}`;
const usdc = (n) => `$${n.toFixed(2)}`;

function inputTokens() {
  return TOK.system + TOK.profileMd + TOK.job + TOK.contact;
}

// Cost of ONE fresh generation, no caching.
function costFresh() {
  const inCost = (inputTokens() / 1e6) * USD_PER_1M_INPUT;
  const outCost = (TOK.output / 1e6) * USD_PER_1M_OUTPUT;
  return inCost + outCost;
}

// Cost of ONE generation when the system+profile.md prefix is already cached (a cache
// READ), i.e. the 2nd..Nth message in a burst for the same user/profile version.
function costCachedRead() {
  const cachedPrefix = TOK.system + TOK.profileMd;
  const freshInput = TOK.job + TOK.contact;
  const inCost =
    (cachedPrefix / 1e6) * USD_PER_1M_INPUT * CACHE_READ_MULT +
    (freshInput / 1e6) * USD_PER_1M_INPUT;
  const outCost = (TOK.output / 1e6) * USD_PER_1M_OUTPUT;
  return inCost + outCost;
}

// The FIRST cached generation pays a write premium on the prefix.
function costCachedWrite() {
  const cachedPrefix = TOK.system + TOK.profileMd;
  const freshInput = TOK.job + TOK.contact;
  const inCost =
    (cachedPrefix / 1e6) * USD_PER_1M_INPUT * CACHE_WRITE_MULT +
    (freshInput / 1e6) * USD_PER_1M_INPUT;
  const outCost = (TOK.output / 1e6) * USD_PER_1M_OUTPUT;
  return inCost + outCost;
}

const fresh = costFresh();

console.log("=== Cost of ONE outreach generation (Opus 4.8) ===");
console.log(`  input tokens/gen : ${inputTokens()} (profile.md = ${TOK.profileMd})`);
console.log(`  fresh (no cache) : ${usd(fresh)}  (~${usdc(fresh)})`);
console.log(`  cached-read gen  : ${usd(costCachedRead())}`);
console.log(`  cache read saves : ${usd(fresh - costCachedRead())}/gen (${Math.round((1 - costCachedRead() / fresh) * 100)}% cheaper)`);
console.log();

// --- Lever A: SAVE + REUSE messages (deterministic cache, 0 model calls on hit) -----
// A reuse HIT = a prior message for (profileVersion, roleTrack, contactType, jobBucket)
// exists, so we skip the Claude call entirely. Saving = hits * costFresh.
console.log("=== Lever A: message reuse — $ saved / user / month ===");
console.log("  (a reuse HIT skips one whole generation; saving = hitRate x volume x costFresh)");
const volumes = [10, 30, 60]; // Pro-tier outreach messages / user / month
const hitRates = [0.2, 0.4, 0.6];
process.stdout.write("  vol \\ hit ");
hitRates.forEach((h) => process.stdout.write(`   ${Math.round(h * 100)}%  `));
console.log();
for (const v of volumes) {
  process.stdout.write(`   ${String(v).padStart(3)}     `);
  for (const h of hitRates) {
    const saved = v * h * fresh;
    process.stdout.write(` ${usdc(saved).padStart(6)} `);
  }
  console.log();
}
console.log();

// --- Lever B: PROMPT CACHING the profile.md prefix within a burst -------------------
// No reuse, no stale content: every message is freshly generated, but the identical
// system+profile.md prefix is cached, so messages 2..N in a burst pay cache-read rates.
console.log("=== Lever B: prompt-cache the profile.md prefix — $ saved / user / month ===");
console.log("  (all messages still freshly generated; only the shared prefix is cached)");
for (const v of volumes) {
  // 1 write + (v-1) reads vs v fresh. (Assumes a burst hits the 5-min cache window;
  // spread-out generations re-warm, costing more writes — this is the optimistic bound.)
  const cachedTotal = costCachedWrite() + (v - 1) * costCachedRead();
  const freshTotal = v * fresh;
  const saved = freshTotal - cachedTotal;
  console.log(`   vol ${String(v).padStart(3)}:  fresh ${usdc(freshTotal)}  cached ${usdc(cachedTotal)}  saved ${usdc(saved)} (${Math.round((saved / freshTotal) * 100)}%)`);
}
console.log();

// --- Verdict ------------------------------------------------------------------------
console.log("=== Read-out ===");
console.log(`  One outreach message costs ~${usdc(fresh)}. Even at 60 msgs/mo and a 60% reuse`);
console.log(`  hit rate, message reuse saves ~${usdc(60 * 0.6 * fresh)}/user/mo — negligible, and it`);
console.log(`  ships near-duplicate content (fails the "significant savings" bar).`);
console.log(`  Prompt-caching the profile.md prefix saves a similar or larger share with`);
console.log(`  every message still freshly generated — no stale content. That's the lever.`);

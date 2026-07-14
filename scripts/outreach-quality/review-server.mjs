// Message Gen Refinement — local review console. Zero-dependency Node http server.
// Reads the frozen version artifacts in ./data, serves a single review page, and
// persists Randall's per-message feedback back to data/feedback-<version>.json.
//
// Siloed by construction: no app/ route, no prod path. DS *flavor* only (tokens
// inlined below), no dependency on the design system, no DS card obligation.
//
//   node scripts/outreach-quality/review-server.mjs   # prints a localhost URL
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyArtifactManifest } from "./cross-style-matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.OUTREACH_QUALITY_DATA_DIR
  ? resolve(process.env.OUTREACH_QUALITY_DATA_DIR)
  : resolve(here, "data");
const PORT = process.env.PORT ? Number(process.env.PORT) : 4137;

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

// Cross-style matrix artifacts. A matrix is available for review only after every frozen
// file declared by its manifest has been read back and verified.
function loadMatrices() {
  const matrices = {};
  const matrixErrors = {};
  for (const f of readdirSync(dataDir)) {
    const m = f.match(/^style-matrix-(.+)\.json$/);
    if (!m || f.endsWith("-manifest.json")) continue;
    const id = m[1];
    try {
      const manifest = JSON.parse(readFileSync(resolve(dataDir, `style-matrix-${id}-manifest.json`), "utf8"));
      const files = Object.fromEntries(
        Object.keys(manifest.files || {}).map((name) => [name, readFileSync(resolve(dataDir, name), "utf8")]),
      );
      verifyArtifactManifest(manifest, files);
      const data = JSON.parse(files[f]);
      if (!Array.isArray(data.cells)) throw new Error("Matrix has no cells.");
      matrices[id] = data;
    } catch (error) {
      matrixErrors[id] = error instanceof Error ? error.message : "Matrix verification failed.";
    }
  }
  return { matrices, matrixErrors };
}

function loadState() {
  const versions = readJson(resolve(dataDir, "versions.json"), []);
  const corpora = {};
  const feedback = {};
  for (const v of versions) {
    corpora[v.id] = readJson(resolve(dataDir, `corpus-${v.id}.json`), { messages: [] });
    feedback[v.id] = readJson(resolve(dataDir, `feedback-${v.id}.json`), { versionId: v.id, items: {} });
  }
  const { matrices, matrixErrors } = loadMatrices();
  const matrixFeedback = Object.fromEntries(Object.keys(matrices).map((id) => [
    id,
    readJson(resolve(dataDir, `feedback-style-matrix-${id}.json`), { experimentId: matrices[id].experimentId, items: {} }),
  ]));
  return { versions, corpora, feedback, matrices, matrixFeedback, matrixErrors };
}

function saveFeedback(versionId, jobId, patch) {
  const matrixId = versionId.startsWith("matrix:")
    ? versionId.slice(7)
    : versionId.startsWith("matrix-blind:")
      ? versionId.slice(13)
      : undefined;
  const safeId = matrixId || versionId;
  if (!/^[a-zA-Z0-9_-]+$/.test(safeId)) throw new Error("Invalid feedback target.");
  if (matrixId && !loadMatrices().matrices[matrixId]) throw new Error("Verified matrix not found.");
  const path = matrixId
    ? resolve(dataDir, `feedback-style-matrix-${matrixId}.json`)
    : resolve(dataDir, `feedback-${versionId}.json`);
  const current = readJson(path, matrixId ? { experimentId: `voice-matrix-${matrixId}`, items: {} } : { versionId, items: {} });
  const prev = current.items[jobId] || {};
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  current.items[jobId] = {
    ...prev,
    ...definedPatch,
    ratings: { ...(prev.ratings || {}), ...(patch.ratings || {}) },
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(current, null, 2));
  return current.items[jobId];
}

function body(req) {
  return new Promise((res) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { res(JSON.parse(d || "{}")); } catch { res({}); } });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (req.method === "HEAD" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    res.writeHead(204); res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(loadState()));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const b = await body(req);
    if (!b.versionId || !b.jobId) { res.writeHead(400); res.end('{"error":"versionId + jobId required"}'); return; }
    let saved;
    try {
      saved = saveFeedback(b.versionId, b.jobId, {
        comment: typeof b.comment === "string" ? b.comment : undefined,
        ratings: b.ratings && typeof b.ratings === "object" ? b.ratings : undefined,
        priority: typeof b.priority === "number" ? b.priority : undefined,
        blindGuess: typeof b.blindGuess === "string" ? b.blindGuess : undefined,
      });
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Feedback save failed." }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, item: saved }));
    return;
  }
  res.writeHead(404); res.end("not found");
});

if (!existsSync(dataDir) || !readdirSync(dataDir).some((f) => f.startsWith("corpus-"))) {
  console.error(`No corpora found in ${dataDir}. Run the generator first:`);
  console.error(`  PROMPT_VARIANT=baseline node scripts/outreach-quality/gen-baseline.mjs`);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`Message Gen Refinement console → http://localhost:${PORT}`);
});

// ---------------------------------------------------------------------------
// The page. DS flavor only (tokens inlined). All UI logic client-side; state
// comes from /api/state, feedback autosaves to /api/feedback.
const PAGE = /* html */ `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Message Gen Refinement</title>
<style>
  :root{
    --paper:#F3E8D2; --paper-deep:#EAD9BC; --paper-edge:#DFC9A6;
    --ink:#241F1A; --ink-soft:#4A4038; --ink-faint:#8A7B6A;
    --tomato:#E0512E; --teal:#1F9E96; --mustard:#E0A52F; --bluebird:#2A6AA0; --rose:#E2998C;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:"Inter",system-ui,-apple-system,sans-serif;line-height:1.5}
  header{position:sticky;top:0;z-index:10;background:var(--paper-deep);
    border-bottom:2px solid var(--ink);padding:14px 20px}
  h1{margin:0;font-size:18px;letter-spacing:.02em;text-transform:uppercase;font-weight:800}
  .sub{color:var(--ink-soft);font-size:12px;margin-top:2px}
  .controls{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:10px}
  select{font:inherit;padding:6px 10px;border:2px solid var(--ink);border-radius:8px;
    background:var(--paper);color:var(--ink);font-weight:600}
  .save-flash{font-size:12px;color:var(--teal);font-weight:700;opacity:0;transition:opacity .2s}
  .save-flash.on{opacity:1}
  main{max-width:1180px;margin:0 auto;padding:20px}
  .changelog{background:var(--paper-deep);border:2px solid var(--ink);border-radius:12px;
    padding:14px 16px;margin-bottom:18px}
  .changelog h2{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em}
  .changelog ul{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--ink-soft)}
  .scorecard{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
  .chip{font-size:11px;font-weight:700;padding:4px 9px;border-radius:20px;
    border:1.5px solid var(--ink);background:var(--paper)}
  .card{display:grid;grid-template-columns:1fr 300px;gap:0;border:2px solid var(--ink);
    border-radius:14px;overflow:hidden;margin-bottom:20px;background:var(--paper-deep)}
  .left{padding:16px 18px;border-right:2px solid var(--ink);background:var(--paper)}
  .right{padding:16px 16px;background:var(--paper-deep)}
  .overview{font-size:12px;color:var(--ink-soft);display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  .fit{font-weight:800;text-transform:uppercase;letter-spacing:.04em;font-size:10px;
    padding:2px 8px;border-radius:20px;border:1.5px solid var(--ink)}
  .fit.good{background:var(--teal);color:var(--paper)}
  .fit.medium{background:var(--mustard);color:var(--ink)}
  .fit.stretch{background:var(--rose);color:var(--ink)}
  .fit.poor{background:var(--tomato);color:var(--paper)}
  .co{font-weight:800}
  a.posting{color:var(--bluebird);font-weight:700;text-decoration:none;border-bottom:1.5px solid var(--bluebird)}
  .message{white-space:pre-wrap;background:var(--paper-deep);border:1.5px solid var(--paper-edge);
    border-radius:10px;padding:12px 14px;margin:10px 0;font-size:14.5px;line-height:1.55}
  .inserted{font-size:11.5px;color:var(--ink-faint);font-style:italic;margin-bottom:10px}
  label.fld{display:block;font-size:11px;font-weight:800;text-transform:uppercase;
    letter-spacing:.04em;color:var(--ink-soft);margin:12px 0 4px}
  textarea{width:100%;min-height:88px;font:inherit;font-size:13.5px;padding:10px;
    border:2px solid var(--ink);border-radius:10px;background:var(--paper);resize:vertical}
  .meters{margin-bottom:6px}
  .meter{display:flex;align-items:center;gap:8px;font-size:11px;margin:5px 0;color:var(--ink-soft)}
  .meter .name{flex:0 0 118px;font-weight:700}
  .bar{flex:1;height:8px;border:1.5px solid var(--ink);border-radius:6px;background:var(--paper);overflow:hidden}
  .bar > span{display:block;height:100%;background:var(--ink)}
  .flag{font-weight:800}
  .flag.hit{color:var(--tomato)}
  .flag.ok{color:var(--teal)}
  .rating{margin:9px 0}
  .rating .rlabel{display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;margin-bottom:2px}
  .rating .rlabel .val{color:var(--teal)}
  input[type=range]{width:100%;accent-color:var(--teal)}
  input[type=range].prio{accent-color:var(--tomato)}
  .prio-wrap .rlabel .val{color:var(--tomato)}
  .prior{margin-top:12px;border-top:1.5px dashed var(--paper-edge);padding-top:8px}
  .prior summary{font-size:11px;font-weight:800;text-transform:uppercase;color:var(--ink-faint);cursor:pointer}
  .prior .pcomment{font-size:12.5px;color:var(--ink-soft);white-space:pre-wrap;margin-top:6px;
    background:var(--paper);border:1.5px solid var(--paper-edge);border-radius:8px;padding:8px}
  .prior .pratings{font-size:11px;color:var(--ink-faint);margin-top:5px}
  .empty{padding:40px;text-align:center;color:var(--ink-faint)}
  @media (max-width:820px){
    header{padding:12px 10px}
    main{padding:10px}
    .controls,.controls label{min-width:0;width:100%}
    select{width:100%;max-width:100%}
    .card{grid-template-columns:1fr}
    .left{border-right:none;border-bottom:2px solid var(--ink)}
  }
  /* cross-style matrix */
  .persona{border:2px solid var(--ink);border-radius:12px;margin-bottom:18px;overflow:hidden;background:var(--paper-deep)}
  .persona > h3{margin:0;padding:10px 14px;font-size:13px;text-transform:uppercase;letter-spacing:.03em;
    background:var(--ink);color:var(--paper)}
  .persona .pmeta{font-size:11px;color:var(--paper);opacity:.85;font-weight:600;text-transform:none;letter-spacing:0}
  .mcell{padding:12px 14px;border-top:1.5px solid var(--paper-edge)}
  .mcell:first-of-type{border-top:none}
  .mhead{font-size:12px;color:var(--ink-soft);display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
  .mviol{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  .vchip{font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:16px;border:1.5px solid var(--ink)}
  .vchip.bad{background:var(--tomato);color:var(--paper)}
  .vchip.good{background:var(--teal);color:var(--paper)}
  .vchip.review{background:var(--mustard);color:var(--ink)}
  .len.over{color:var(--tomato);font-weight:800}
  .stab{background:var(--paper-deep);border:2px solid var(--ink);border-radius:12px;padding:14px 16px;margin-bottom:18px}
  .stab h2{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.04em}
  .mreview{display:grid;grid-template-columns:1fr 300px;gap:16px;margin-top:12px;padding-top:12px;border-top:1.5px dashed var(--paper-edge)}
  .mreview .rating{margin:7px 0}
  @media (max-width:820px){
    .stab,.persona,.mcell,.message,.mreview>div{min-width:0;max-width:100%}
    .chip,.vchip,.mhead span,.stab div,.message{overflow-wrap:anywhere}
    .mreview{grid-template-columns:1fr}
    input[type=range]{min-width:0}
  }
</style></head><body>
<header>
  <h1>Message Gen Refinement</h1>
  <div class="sub">Outreach corpus review · prescriptive feedback autosaves per message</div>
  <div class="controls">
    <label style="font-size:12px;font-weight:700">Version
      <select id="ver"></select>
    </label>
    <span id="flash" class="save-flash">saved</span>
  </div>
</header>
<main id="app"><div class="empty">Loading…</div></main>
<script>
const RATINGS = [
  ["soundsLikeMe","Sounds like me"],
  ["humility","Right humility"],
  ["fitHonesty","Fit honesty"],
  ["wouldSend","Would send as-is"],
];
const MATRIX_RATINGS = [
  ["voiceAdherence","Fixture voice adherence"],
  ["factualGrounding","Factual grounding"],
  ["evidenceRelevance","Job and evidence relevance"],
  ["respectFit","Respect and fit handling"],
  ["sendability","Sendability and naturalness"],
];
const MATRIX_REVIEW_FLAGS = new Set(["selected_example_not_obvious"]);
const METERS = [
  ["nauticalTic","Nautical tic","count"],
  ["heroPresent","P.H.R.E.D. present","flag"],
  ["inventedNumber","Invented number","flag"],
  ["concessionOpener","Concession opener","flag"],
  ["tellsWhatTheyWant","Tells-them-what","flag"],
  ["q4BragTag","Q4 brag tag","flag"],
  ["exampleLinkMissing","Example link missing","flag"],
  ["length","Length","len"],
];
let STATE=null, CUR=null;

async function load(){
  STATE = await (await fetch("/api/state")).json();
  const sel = document.getElementById("ver");
  const matrixIds = Object.keys(STATE.matrices||{});
  let opts = STATE.versions.map(v=>'<option value="'+v.id+'">'+esc(v.label)+'</option>').join("");
  if(matrixIds.length){
    opts += '<optgroup label="Cross-style matrix">'+
      matrixIds.map(id=>'<option value="matrix-blind:'+esc(id)+'">Blind voice check ('+esc(id)+')</option>'+
        '<option value="matrix:'+esc(id)+'">Labeled matrix review ('+esc(id)+')</option>').join("")+
      '</optgroup>';
  }
  sel.innerHTML = opts;
  sel.onchange = ()=>{ CUR=sel.value; render(); };
  CUR = matrixIds.length
    ? "matrix-blind:"+matrixIds[matrixIds.length-1]
    : (STATE.versions.length ? STATE.versions[STATE.versions.length-1].id : null);
  sel.value = CUR;
  render();
}
function esc(s){return (s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function prevVersionId(id){ const i=STATE.versions.findIndex(v=>v.id===id); return i>0?STATE.versions[i-1].id:null; }

function meterRow(key,label,kind,metrics){
  if(!(key in metrics)){
    // corpus generated before this metric existed — don't fake a "clear"
    return '<div class="meter"><span class="name">'+label+'</span>'+
      '<span style="color:var(--ink-faint)">n/a</span></div>';
  }
  const v = metrics[key] ?? 0;
  if(kind==="flag"){
    const hit = v>0;
    return '<div class="meter"><span class="name">'+label+'</span>'+
      '<span class="flag '+(hit?"hit":"ok")+'">'+(hit?"⚑ present":"clear")+'</span></div>';
  }
  if(kind==="count"){
    const pct = Math.min(100, v*33);
    return '<div class="meter"><span class="name">'+label+'</span>'+
      '<span class="bar"><span style="width:'+pct+'%"></span></span><span>'+v+'</span></div>';
  }
  // length
  const pct = Math.min(100, Math.round(v/1400*100));
  return '<div class="meter"><span class="name">'+label+'</span>'+
    '<span class="bar"><span style="width:'+pct+'%"></span></span><span>'+v+'</span></div>';
}

function render(){
  const app=document.getElementById("app");
  if(!CUR){ app.innerHTML='<div class="empty">No versions yet. Generate a corpus first.</div>'; return; }
  if(CUR.startsWith("matrix-blind:")){ renderBlindMatrix(CUR.slice(13)); return; }
  if(CUR.startsWith("matrix:")){ renderMatrix(CUR.slice(7)); return; }
  const ver = STATE.versions.find(v=>v.id===CUR);
  const corpus = STATE.corpora[CUR] || {messages:[]};
  const fb = (STATE.feedback[CUR]||{items:{}}).items;
  const prevId = prevVersionId(CUR);
  const prevFb = prevId ? (STATE.feedback[prevId]||{items:{}}).items : {};

  // corpus scorecard: roll up flag meters
  const roll = {};
  for(const [k,,kind] of METERS){
    if(kind==="len") continue;
    const known = corpus.messages.filter(m=>m.metrics && k in m.metrics);
    roll[k] = known.length ? {hits: known.reduce((a,m)=>a+((m.metrics[k]||0)>0?1:0),0), known: known.length} : null;
  }
  const avgLen = Math.round(corpus.messages.reduce((a,m)=>a+(m.metrics?.length||0),0)/(corpus.messages.length||1));

  let html = '<div class="changelog"><h2>Changelog · '+esc(ver.label)+'</h2><ul>'+
    (ver.changeNotes||[]).map(n=>'<li>'+esc(n)+'</li>').join("")+'</ul>'+
    '<div class="scorecard">'+
      METERS.filter(m=>m[2]!=="len").map(([k,label])=>'<span class="chip">'+label+': '+(roll[k]?roll[k].hits+'/'+roll[k].known:'n/a')+'</span>').join("")+
      '<span class="chip">avg length: '+avgLen+'</span>'+
    '</div></div>';

  html += corpus.messages.map(m=>{
    const f = fb[m.jobId]||{};
    const r = f.ratings||{};
    const pf = prevFb[m.jobId];
    const posting = m.sourceUrl ? '<a class="posting" href="'+esc(m.sourceUrl)+'" target="_blank" rel="noopener">view posting ↗</a>' : '<span style="color:var(--ink-faint)">no link</span>';
    const meters = '<div class="meters">'+METERS.map(([k,l,kind])=>meterRow(k,l,kind,m.metrics||{})).join("")+'</div>';
    const ratings = RATINGS.map(([k,l])=>{
      const val = r[k]??5;
      return '<div class="rating"><div class="rlabel"><span>'+l+'</span><span class="val" id="v_'+m.jobId+'_'+k+'">'+val+'</span></div>'+
        '<input type="range" min="0" max="10" value="'+val+'" oninput="onRate(\\''+m.jobId+'\\',\\''+k+'\\',this.value)"></div>';
    }).join("");
    const prioVal = f.priority??5;
    const prio = '<div class="rating prio-wrap"><div class="rlabel"><span>Priority to fix</span><span class="val" id="v_'+m.jobId+'_priority">'+prioVal+'</span></div>'+
      '<input type="range" class="prio" min="0" max="10" value="'+prioVal+'" oninput="onPrio(\\''+m.jobId+'\\',this.value)"></div>';
    let prior="";
    if(pf){
      const pr=pf.ratings||{};
      prior='<details class="prior"><summary>Prior round ('+esc(prevId)+')</summary>'+
        (pf.comment?'<div class="pcomment">'+esc(pf.comment)+'</div>':'<div class="pratings">no comment</div>')+
        '<div class="pratings">'+RATINGS.map(([k,l])=>l+': '+(pr[k]??"–")).join(" · ")+' · Priority: '+(pf.priority??"–")+'</div></details>';
    }
    return '<div class="card"><div class="left">'+
        '<div class="overview"><span class="fit '+m.fit+'">'+m.fit+'</span>'+
          '<span class="co">'+esc(m.company)+'</span><span>·</span><span>'+esc(m.title)+'</span>'+
          '<span>·</span>'+posting+'<span>·</span><span>'+(m.metrics?.length||0)+' chars</span></div>'+
        '<div style="font-size:11px;color:var(--ink-faint)">to: '+esc(m.contactRole)+'</div>'+
        '<div class="message">'+esc(m.message)+'</div>'+
        (m.insertedExample?'<div class="inserted">inserted example: '+esc(m.insertedExample.oneHitter)+(m.insertedExample.link?" — "+esc(m.insertedExample.link):"")+'</div>':'')+
        '<label class="fld">Prescriptive feedback</label>'+
        '<textarea placeholder="What to change and why. Be specific." onchange="onComment(\\''+m.jobId+'\\',this.value)" oninput="dirty()">'+esc(f.comment||"")+'</textarea>'+
      '</div><div class="right">'+meters+
        '<label class="fld">Your ratings</label>'+ratings+prio+prior+
      '</div></div>';
  }).join("");
  app.innerHTML = html;
}

function renderMatrix(id){
  const app=document.getElementById("app");
  const mx = (STATE.matrices||{})[id];
  if(!mx){ app.innerHTML='<div class="empty">Matrix '+esc(id)+' not found.</div>'; return; }
  const jobById = {}; (mx.jobs||[]).forEach(j=>{ jobById[j.jobId]=j; });
  const cells = mx.cells||[];
  const fb = ((STATE.matrixFeedback||{})[id]||{items:{}}).items;
  const hardViolations = c => (c.contractViolations||[]).filter(v=>!MATRIX_REVIEW_FLAGS.has(v));
  const reviewFlags = c => (c.contractViolations||[]).filter(v=>MATRIX_REVIEW_FLAGS.has(v));
  const hardClean = cells.filter(c=>hardViolations(c).length===0).length;
  const lens = cells.map(c=>c.styleMetrics?.length||0);
  const avgLen = Math.round(lens.reduce((a,b)=>a+b,0)/(lens.length||1));
  const targetPass = cells.filter(c=>c.styleMetrics?.targetCharacters?.pass===true).length;
  const invented = cells.filter(c=>(c.styleMetrics?.inventedNumber||0)>0).length;
  const concessions = cells.filter(c=>(c.styleMetrics?.concessionOpener||0)>0).length;
  const reviewed = cells.filter(c=>MATRIX_RATINGS.every(([key])=>Number.isFinite(fb[c.cellId]?.ratings?.[key]))).length;

  // selection-stability rollup: how many jobs pick the same evidence across every voice
  const stab = mx.selectionStability||[];
  const invariant = stab.filter(s=>!s.varies).length;
  const stabRows = stab.map(s=>{
    const j = jobById[s.jobId];
    const label = j ? esc(j.company)+' — '+esc(j.title) : esc(s.jobId).slice(0,8);
    const choices = (s.uniqueChoices||[]).map(c=>c==="none"?"none":esc(String(c)).slice(0,22));
    const cls = s.varies ? "vchip bad" : "vchip good";
    return '<div style="font-size:12px;margin:4px 0"><span class="'+cls+'">'+(s.varies?"varies":"stable")+'</span> '+
      label+' <span style="color:var(--ink-faint)">→ '+choices.join(" · ")+'</span></div>';
  }).join("");

  const hardTally={}, reviewTally={};
  for(const c of cells){
    for(const v of hardViolations(c)) hardTally[v]=(hardTally[v]||0)+1;
    for(const v of reviewFlags(c)) reviewTally[v]=(reviewTally[v]||0)+1;
  }
  const hardChips = Object.entries(hardTally).sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>'<span class="chip">'+esc(k)+': '+v+'</span>').join("") || '<span class="chip">no hard failures</span>';
  const reviewChips = Object.entries(reviewTally).sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>'<span class="chip">review flag · '+esc(k)+': '+v+'</span>').join("") || '<span class="chip">no review flags</span>';

  let html = '<div class="stab"><h2>Cross-style matrix · '+esc(id)+'</h2>'+
    '<div class="scorecard">'+
      '<span class="chip">'+cells.length+' cells</span>'+
      '<span class="chip" id="reviewed-count">reviewed: '+reviewed+'/'+cells.length+'</span>'+
      '<span class="chip">hard checks clear: '+hardClean+'/'+cells.length+'</span>'+
      '<span class="chip">avg length: '+avgLen+'</span>'+
      '<span class="chip">persona target: '+targetPass+'/'+cells.length+'</span>'+
      '<span class="chip">selection stable: '+invariant+'/'+stab.length+' jobs</span>'+
    '</div>'+
    '<div style="margin-top:12px">'+hardChips+reviewChips+'</div>'+
    '<div class="scorecard"><span class="chip">invented-number signal: '+invented+'</span><span class="chip">concession-opener signal: '+concessions+'</span></div>'+
    '<h2 style="margin-top:16px">Evidence selection across voices</h2>'+stabRows+
  '</div>';

  for(const p of (mx.personas||[])){
    const pcells = cells.filter(c=>c.personaId===p.id);
    if(!pcells.length) continue;
    const tgt = (p.expectations&&p.expectations.targetCharacters)||[];
    html += '<div class="persona"><h3>'+esc(p.label||p.id)+
      ' <span class="pmeta">'+esc(p.kind||"")+(tgt.length?' · target '+tgt[0]+'–'+tgt[1]+' chars':'')+'</span></h3>'+
      pcells.map(c=>{
        const j = jobById[c.jobId]||{};
        const f = fb[c.cellId]||{};
        const r = f.ratings||{};
        const len = c.styleMetrics?.length||0;
        const targetMiss = c.styleMetrics?.targetCharacters?.pass===false;
        const hard = hardViolations(c);
        const flags = reviewFlags(c);
        const vchips = '<div class="mviol">'+
          (hard.length ? hard.map(v=>'<span class="vchip bad">'+esc(v)+'</span>').join("") : '<span class="vchip good">hard checks clear</span>')+
          flags.map(v=>'<span class="vchip review">review · '+esc(v)+'</span>').join("")+
          ((c.styleMetrics?.inventedNumber||0)>0?'<span class="vchip review">review · invented-number signal</span>':'')+
          ((c.styleMetrics?.concessionOpener||0)>0?'<span class="vchip review">review · concession opener</span>':'')+
          '</div>';
        const sel = c.workExampleSelection ? esc(c.workExampleSelection.title||c.workExampleSelection.key) : "none";
        const ratings = MATRIX_RATINGS.map(([k,l])=>{
          const hasRating = Number.isFinite(r[k]);
          const val = hasRating ? r[k] : 5;
          return '<div class="rating"><div class="rlabel"><span>'+l+'</span><span class="val" id="v_'+c.cellId+'_'+k+'">'+(hasRating?val:"unrated")+'</span></div>'+
            '<input type="range" min="0" max="10" value="'+val+'" oninput="onRate(\\''+c.cellId+'\\',\\''+k+'\\',this.value)"></div>';
        }).join("");
        return '<div class="mcell">'+
          '<div class="mhead"><span class="co">'+esc(j.company||"")+'</span><span>·</span><span>'+esc(j.title||c.jobId)+'</span>'+
            '<span>·</span><span class="len'+(targetMiss?" over":"")+'">'+len+' chars'+(targetMiss?' · outside persona target':'')+'</span>'+
            '<span>·</span><span>example: '+sel+'</span></div>'+
          '<div class="message">'+esc(c.message)+'</div>'+vchips+
          '<div class="mreview"><div><label class="fld">Prescriptive feedback</label>'+
            '<textarea placeholder="What to change and why. Be specific." onchange="onComment(\\''+c.cellId+'\\',this.value)" oninput="dirty()">'+esc(f.comment||"")+'</textarea></div>'+
            '<div><label class="fld">Your ratings</label>'+ratings+'</div></div>'+
        '</div>';
      }).join("")+
    '</div>';
  }
  app.innerHTML = html;
}

function renderBlindMatrix(id){
  const app=document.getElementById("app");
  const mx=(STATE.matrices||{})[id];
  if(!mx){ app.innerHTML='<div class="empty">Matrix '+esc(id)+' not found.</div>'; return; }
  const feedback=((STATE.matrixFeedback||{})[id]||{items:{}}).items;
  const fullPersonas=(mx.personas||[]).filter(p=>p.kind==="full");
  const personaById=Object.fromEntries(fullPersonas.map(p=>[p.id,p]));
  const jobs=(mx.jobs||[]).filter((_,index)=>index===1||index===(mx.jobs||[]).length-1);
  const orders=[[2,0,3,1],[1,3,0,2]];
  const blindCells=[];
  for(const [jobIndex,job] of jobs.entries()){
    const source=(mx.cells||[]).filter(c=>c.jobId===job.jobId&&personaById[c.personaId]);
    const ordered=orders[jobIndex].map(index=>source[index]).filter(Boolean);
    ordered.forEach((cell,index)=>blindCells.push({job,cell,label:String.fromCharCode(65+index)}));
  }
  const completed=blindCells.filter(({cell})=>feedback[cell.cellId]?.blindGuess).length;
  const correct=blindCells.filter(({cell})=>feedback[cell.cellId]?.blindGuess===cell.personaId).length;
  const reveal=completed===blindCells.length;
  let html='<div class="stab"><h2>Blind voice identification · '+esc(id)+'</h2>'+
    '<p style="font-size:13px;color:var(--ink-soft)">For each message, choose the voice you think produced it. The actual persona labels are hidden until all eight guesses are saved.</p>'+
    '<div class="scorecard"><span class="chip" id="blind-count">guessed: '+completed+'/'+blindCells.length+'</span>'+
    (reveal?'<span class="chip">correct: '+correct+'/'+blindCells.length+'</span>':'')+'</div></div>';
  for(const job of jobs){
    const rows=blindCells.filter(item=>item.job.jobId===job.jobId);
    html+='<div class="persona"><h3>'+esc(job.company)+' · '+esc(job.title)+'</h3>'+rows.map(({cell,label})=>{
      const saved=feedback[cell.cellId]?.blindGuess||"";
      const options=['<option value="">Choose a voice</option>'].concat(fullPersonas.map(p=>
        '<option value="'+esc(p.id)+'"'+(saved===p.id?' selected':'')+'>'+esc(p.label)+'</option>')).join("");
      return '<div class="mcell"><div class="mhead"><span class="co">Message '+label+'</span>'+
        (reveal?'<span class="vchip '+(saved===cell.personaId?'good':'bad')+'">actual: '+esc(personaById[cell.personaId].label)+'</span>':'')+'</div>'+
        '<div class="message">'+esc(cell.message)+'</div><label class="fld" for="blind_'+esc(cell.cellId)+'">Which voice wrote this?</label>'+
        '<select id="blind_'+esc(cell.cellId)+'" onchange="onBlindGuess(\\''+cell.cellId+'\\',this.value)">'+options+'</select></div>';
    }).join("")+'</div>';
  }
  app.innerHTML=html;
}

let saveT=null;
function flash(){ const f=document.getElementById("flash"); f.classList.add("on"); clearTimeout(saveT); saveT=setTimeout(()=>f.classList.remove("on"),1200); }
function dirty(){}
async function save(jobId, patch){
  const body={versionId:CUR,jobId,...patch};
  await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  // keep local mirror so version-switch + prior-round stay current without reload
  const matrixId=CUR.startsWith("matrix:")?CUR.slice(7):(CUR.startsWith("matrix-blind:")?CUR.slice(13):null);
  const items=matrixId
    ? ((STATE.matrixFeedback[matrixId]=STATE.matrixFeedback[matrixId]||{items:{}}).items)
    : ((STATE.feedback[CUR]=STATE.feedback[CUR]||{items:{}}).items);
  const prev=items[jobId]||{}; items[jobId]={...prev,...patch,ratings:{...(prev.ratings||{}),...(patch.ratings||{})}};
  if(CUR.startsWith("matrix:")){
    const matrixId=CUR.slice(7);
    const cells=(STATE.matrices[matrixId]||{cells:[]}).cells;
    const reviewed=cells.filter(c=>MATRIX_RATINGS.every(([key])=>Number.isFinite(items[c.cellId]?.ratings?.[key]))).length;
    const count=document.getElementById("reviewed-count");
    if(count) count.textContent="reviewed: "+reviewed+"/"+cells.length;
  }
  flash();
}
function onComment(jobId,val){ save(jobId,{comment:val}); }
function onRate(jobId,key,val){ document.getElementById("v_"+jobId+"_"+key).textContent=val; save(jobId,{ratings:{[key]:Number(val)}}); }
function onPrio(jobId,val){ document.getElementById("v_"+jobId+"_priority").textContent=val; save(jobId,{priority:Number(val)}); }
async function onBlindGuess(cellId,val){ if(val){ await save(cellId,{blindGuess:val}); renderBlindMatrix(CUR.slice(13)); } }

load();
</script>
</body></html>`;

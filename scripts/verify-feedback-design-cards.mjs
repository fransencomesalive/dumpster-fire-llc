import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const widths = [320, 375, 390, 1280, 1440];
const cards = [
  {
    name: "match-card",
    path: resolve("design-system/components/match-card.html"),
    flip: "#matchCardFlip",
    front: "#matchCardFront",
    back: "#matchCardBack",
    trigger: "[data-flip-open]",
    other: "#matchCardOther",
    note: "#matchCardBack .seInput",
    save: "#matchCardBack [data-save]",
    close: "#matchCardBack [data-flip-close]",
  },
  {
    name: "apply-wizard",
    path: resolve("design-system/components/apply-wizard.html"),
    flip: "#wizardFeedbackFlip",
    front: "#wizardFeedbackFront",
    back: "#wizardFeedbackBack",
    trigger: "[data-feedback-open]",
    other: "#wiz-fb-se",
    note: "#wizardFeedbackBack .seInput",
    save: "#wizardFeedbackBack [data-feedback-save]",
    close: "#wizardFeedbackBack [data-feedback-close]",
  },
];

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function waitForDebugPort(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome DevTools port did not become ready.");
}

async function connectToTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    socket,
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function ready(client) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(client, "document.readyState === 'complete'")) return;
    await delay(50);
  }
  throw new Error("Card did not finish loading.");
}

const userDataDir = await mkdtemp(join(tmpdir(), "feedback-card-chrome-"));
const outputDir = await mkdtemp(join(tmpdir(), "feedback-card-proof-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--allow-file-access-from-files",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

try {
  await waitForDebugPort(port);
  const client = await connectToTarget(port);
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  for (const card of cards) {
    for (const width of widths) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await client.send("Emulation.setEmulatedMedia", { features: [] });
      await client.send("Page.navigate", { url: pathToFileURL(card.path).href });
      await ready(client);
      await delay(120);

      const initial = await evaluate(client, `(() => {
        const flip = document.querySelector(${JSON.stringify(card.flip)});
        const trigger = flip?.querySelector(${JSON.stringify(card.trigger)});
        const save = document.querySelector(${JSON.stringify(card.save)});
        flip?.scrollIntoView({ block: 'center' });
        return {
          found: Boolean(flip && trigger && save),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          saveDisabled: Boolean(save?.disabled),
          expanded: trigger?.getAttribute('aria-expanded'),
        };
      })()`);
      assert.equal(initial.found, true, `${card.name} controls missing at ${width}px`);
      assert.ok(initial.overflow <= 0, `${card.name} overflows by ${initial.overflow}px at ${width}px`);
      assert.equal(initial.saveDisabled, true, `${card.name} Save must start disabled at ${width}px`);
      assert.equal(initial.expanded, "false", `${card.name} trigger must start collapsed at ${width}px`);

      await evaluate(client, `document.querySelector(${JSON.stringify(card.flip)}).querySelector(${JSON.stringify(card.trigger)}).click()`);
      await delay(240);
      const opened = await evaluate(client, `(() => {
        const flip = document.querySelector(${JSON.stringify(card.flip)});
        const front = document.querySelector(${JSON.stringify(card.front)});
        const back = document.querySelector(${JSON.stringify(card.back)});
        const other = document.querySelector(${JSON.stringify(card.other)});
        other.click();
        return {
          flipped: flip.classList.contains('isFlipped'),
          frontHidden: front.getAttribute('aria-hidden'),
          backHidden: back.getAttribute('aria-hidden'),
          noteDisabled: document.querySelector(${JSON.stringify(card.note)}).disabled,
          saveDisabled: document.querySelector(${JSON.stringify(card.save)}).disabled,
          activeId: document.activeElement?.id || '',
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      })()`);
      assert.equal(opened.flipped, true, `${card.name} did not flip at ${width}px`);
      assert.equal(opened.frontHidden, "true", `${card.name} front stayed exposed at ${width}px`);
      assert.equal(opened.backHidden, "false", `${card.name} back stayed hidden at ${width}px`);
      assert.equal(opened.noteDisabled, false, `${card.name} Other did not activate the note at ${width}px`);
      assert.equal(opened.saveDisabled, false, `${card.name} Other did not activate Save at ${width}px`);
      assert.ok(opened.overflow <= 0, `${card.name} feedback face overflows by ${opened.overflow}px at ${width}px`);

      const box = await evaluate(client, `(() => {
        const rect = document.querySelector(${JSON.stringify(card.flip)}).getBoundingClientRect();
        return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
      })()`);
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { ...box, scale: 1 },
      });
      await writeFile(join(outputDir, `${card.name}-${width}.png`), Buffer.from(screenshot.data, "base64"));

      await evaluate(client, `document.querySelector(${JSON.stringify(card.close)}).click()`);
      const closed = await evaluate(client, `(() => ({
        flipped: document.querySelector(${JSON.stringify(card.flip)}).classList.contains('isFlipped'),
        noteDisabled: document.querySelector(${JSON.stringify(card.note)}).disabled,
        otherChecked: document.querySelector(${JSON.stringify(card.other)}).checked,
        saveDisabled: document.querySelector(${JSON.stringify(card.save)}).disabled,
      }))()`);
      assert.equal(closed.flipped, false, `${card.name} did not close at ${width}px`);
      assert.equal(closed.noteDisabled, true, `${card.name} note did not reset at ${width}px`);
      assert.equal(closed.otherChecked, false, `${card.name} Other did not reset at ${width}px`);
      assert.equal(closed.saveDisabled, true, `${card.name} Save did not reset at ${width}px`);
    }

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await client.send("Page.navigate", { url: pathToFileURL(card.path).href });
    await ready(client);
    await evaluate(client, `document.querySelector(${JSON.stringify(card.flip)}).querySelector(${JSON.stringify(card.trigger)}).click()`);
    const reduced = await evaluate(client, `getComputedStyle(document.querySelector(${JSON.stringify(card.flip)})).transform`);
    assert.equal(reduced, "none", `${card.name} did not remove rotation for reduced motion`);
  }

  client.socket.close();
  console.log(`feedback design-card verification passed; screenshots: ${outputDir}`);
} finally {
  chrome.kill("SIGTERM");
  await rm(userDataDir, { recursive: true, force: true });
}

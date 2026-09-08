import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/refresh-queue.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { RefreshQueue } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("slow initial load finishes even when polling and new filters arrive", async () => {
  const queue = new RefreshQueue();
  const results = [];
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const first = queue.run(async () => {
    results.push("loading");
    await response;
    results.push("ticket displayed");
  });
  await queue.run(async () => { results.push("old filters"); });
  await queue.run(async () => { results.push("latest filters"); });
  assert.deepEqual(results, ["loading"]);
  release();
  await first;
  assert.deepEqual(results, ["loading", "ticket displayed", "latest filters"]);
});

test("logout cancels queued requests", async () => {
  const queue = new RefreshQueue();
  let release;
  let pendingRan = false;
  const first = queue.run(() => new Promise(resolve => { release = resolve; }));
  await queue.run(async () => { pendingRan = true; });
  queue.cancelPending();
  release();
  await first;
  assert.equal(pendingRan, false);
});

test("an error does not prevent a subsequent retry", async () => {
  const queue = new RefreshQueue();
  await assert.rejects(queue.run(async () => { throw new Error("offline"); }), /offline/);
  let retried = false;
  await queue.run(async () => { retried = true; });
  assert.equal(retried, true);
});

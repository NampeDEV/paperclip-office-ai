import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = path.join(repoRoot, "scripts", "run-vitest-stable.mjs");

test("dry-run partitions suites before Vitest is installed", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "paperclip-no-vitest-"));
  const preload = path.join(tempRoot, "without-vitest.cjs");
  writeFileSync(preload, `const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request.startsWith('vitest')) throw new Error('Vitest is not installed');
  return resolve.call(this, request, ...args);
};`);
  try {
    const result = spawnSync(process.execPath, ["--require", preload, script, "--mode", "general", "--group", "general-server", "--dry-run"], {
      cwd: repoRoot, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(JSON.parse(result.stdout));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("stable Vitest launcher invokes Vitest directly without pnpm exec", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "paperclip-vitest-launcher-"));
  const pnpmCli = path.join(tempRoot, "pnpm-test.cjs");
  const preload = path.join(tempRoot, "capture-vitest.cjs");
  const calls = path.join(tempRoot, "calls.jsonl");
  writeFileSync(
    pnpmCli,
    'throw new Error("pnpm exec must not be invoked by the Vitest launcher");',
  );
  writeFileSync(
    preload,
    `const { appendFileSync, writeFileSync } = require("node:fs");
const [entrypoint, ...args] = process.argv.slice(1);
if (entrypoint.endsWith("vitest.mjs")) {
  appendFileSync(process.env.VITEST_LAUNCHER_CALLS, JSON.stringify({ entrypoint, args }) + "\\n");
  if (args[0] === "list") {
    const output = args.find((arg) => arg.startsWith("--json="));
    writeFileSync(output.slice("--json=".length), JSON.stringify([{
      projectName: "@paperclipai/server",
      file: "server/src/__tests__/chat-channels.integration.test.ts",
      name: "launcher regression case",
      location: { line: 1, column: 1 },
    }]));
  }
  process.exit(0);
}
`,
  );

  try {
    const result = spawnSync(
      process.execPath,
      [script, "--mode", "general", "--group", "general-chat", "--shard-index", "0", "--shard-count", "1"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          npm_execpath: pnpmCli,
          NODE_OPTIONS: `--require=${preload}`,
          VITEST_LAUNCHER_CALLS: calls,
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const invocations = readFileSync(calls, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(invocations.length, 3, "chat sharding should collect twice and run once");
    assert.ok(invocations.every(({ entrypoint }) => entrypoint.endsWith("vitest.mjs")));
    assert.deepEqual(invocations.map(({ args }) => args[0]), [
      "list",
      "list",
      "run",
    ]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

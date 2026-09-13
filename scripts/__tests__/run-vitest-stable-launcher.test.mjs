import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = path.join(repoRoot, "scripts", "run-vitest-stable.mjs");

test("stable Vitest launcher runs through the pnpm CLI from npm_execpath", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "paperclip-vitest-launcher-"));
  const pnpmCli = path.join(tempRoot, "pnpm-test.cjs");
  const calls = path.join(tempRoot, "calls.jsonl");
  writeFileSync(
    pnpmCli,
    `const { appendFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.PNPM_LAUNCHER_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "exec" && args[1] === "vitest" && args[2] === "list") {
  const output = args.find((arg) => arg.startsWith("--json="));
  writeFileSync(output.slice("--json=".length), JSON.stringify([{
    projectName: "@paperclipai/server",
    file: "server/src/__tests__/chat-channels.integration.test.ts",
    name: "launcher regression case",
    location: { line: 1, column: 1 },
  }]));
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
          PNPM_LAUNCHER_CALLS: calls,
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const invocations = readFileSync(calls, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(invocations.length, 3, "chat sharding should collect twice and run once");
    assert.deepEqual(invocations.map((args) => args.slice(0, 3)), [
      ["exec", "vitest", "list"],
      ["exec", "vitest", "list"],
      ["exec", "vitest", "run"],
    ]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

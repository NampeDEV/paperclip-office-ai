import assert from "node:assert/strict";
import test from "node:test";

import {
  isProductionSourceFile,
  listFiles,
  parseAllowlist,
} from "./check-token-gates.mjs";

test("parseAllowlist accepts LF and CRLF checkouts", () => {
  const css = [
    "/*",
    " * allow ui/src/pages/Example.tsx — documented exception",
    " */",
  ].join("\n");
  const expected = [{ path: "ui/src/pages/Example.tsx", reason: "documented exception" }];

  assert.deepEqual(parseAllowlist(css), expected);
  assert.deepEqual(parseAllowlist(css.replaceAll("\n", "\r\n")), expected);
});

test("scans production UI source and excludes test-only fixtures", () => {
  assert.equal(isProductionSourceFile("Component.tsx"), true);
  assert.equal(isProductionSourceFile("Component.test.tsx"), false);
  assert.equal(isProductionSourceFile("Component.spec.ts"), false);

  const files = listFiles().map((filePath) => filePath.replaceAll("\\", "/"));
  assert.ok(files.some((filePath) => filePath.endsWith("/IssueColumns.tsx")));
  assert.ok(files.every((filePath) => !/\.(?:test|spec)\.(?:tsx?|jsx?)$/.test(filePath)));
});

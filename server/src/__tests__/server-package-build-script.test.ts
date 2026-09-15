import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageJsonPath = fileURLToPath(
  new URL("../../package.json", import.meta.url),
);
const runnerShimPath = fileURLToPath(
  new URL("../vendor/paperclip-runner/index.ts", import.meta.url),
);
const evidenceClassifierPath = fileURLToPath(
  new URL("../services/native-runtime/evidence-classifier.ts", import.meta.url),
);
const workspaceDiffReprojectionPath = fileURLToPath(
  new URL("../services/provider-trace-workspace-diff-reprojection.ts", import.meta.url),
);

describe("server package build script", () => {
  it("builds the compiled package entry during prepack", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.prepack).toBe(
      "pnpm run prepare:ui-dist && pnpm run build",
    );
  });

  it("copies static runtime asset directories into dist", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const buildScript = packageJson.scripts?.build ?? "";

    const copyCommand = buildScript.match(/node -e "([^"]+)"/)?.[1];
    expect(copyCommand).toBeDefined();
    const root = mkdtempSync(path.join(tmpdir(), "paperclip-build-assets-"));
    const cwd = path.join(root, "server");
    const copies = [
      ["src/onboarding-assets", "dist/onboarding-assets"],
      ["src/built-ins", "dist/built-ins"],
      ["src/services/scripts", "dist/services/scripts"],
      ["../packages/paperclip-runner/dist", "dist/vendor/paperclip-runner"],
    ];
    try {
      for (const [source] of copies) {
        mkdirSync(path.resolve(cwd, source!, "nested"), { recursive: true });
        writeFileSync(path.resolve(cwd, source!, "nested/.asset"), source!);
      }
      execFileSync(process.execPath, ["-e", copyCommand!], { cwd });
      for (const [source, destination] of copies) {
        expect(readFileSync(path.resolve(cwd, destination!, "nested/.asset"), "utf8")).toBe(source);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("vendors the private runner runtime without a production workspace dependency", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(
      packageJson.dependencies?.["@paperclipai/paperclip-runner"],
    ).toBeUndefined();
    expect(packageJson.devDependencies?.["@paperclipai/paperclip-runner"]).toBe(
      "workspace:*",
    );
    expect(packageJson.scripts?.["prepare:runner-vendor"]).toBe(
      "pnpm --filter @paperclipai/paperclip-runner build",
    );
    expect(packageJson.scripts?.build).toContain(
      "['../packages/paperclip-runner/dist','dist/vendor/paperclip-runner']",
    );
  });

  it("verifies vendored runner dependencies are mirrored before building", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    // See scripts/verify-runner-vendor-dependencies.mjs: packages/paperclip-runner
    // is vendored with a recursive copy of its compiled dist/, so every runtime
    // dependency it imports must also be a direct dependency of server. This
    // check derives that requirement from an esbuild scan of the vendored
    // entry points instead of relying on a human to have kept a hand-copied
    // list in sync (the smol-toml incident in #13110/#13116).
    expect(packageJson.scripts?.build).toContain(
      "node scripts/verify-runner-vendor-dependencies.mjs",
    );
  });

  it("loads runner source when the source server starts before workspace builds", () => {
    const shim = readFileSync(runnerShimPath, "utf8");

    expect(shim).toContain(
      '"../../../../packages/paperclip-runner/src/index.ts"',
    );
    expect(shim).not.toContain(
      'export * from "@paperclipai/paperclip-runner"',
    );
  });

  it("routes source-mode runtime imports through the runner shim", () => {
    for (const consumerPath of [
      evidenceClassifierPath,
      workspaceDiffReprojectionPath,
    ]) {
      const consumer = readFileSync(consumerPath, "utf8");

      expect(consumer).toContain('vendor/paperclip-runner/index.js"');
      expect(consumer).not.toContain('from "@paperclipai/paperclip-runner"');
    }
  });
});

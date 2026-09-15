import { constants } from "node:fs";
import {
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stageNativeRunnerAttachmentBytes } from "./native-runner-file-handoff.js";

const control = vi.hoisted(() => ({ redirectedPath: null as string | null }));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: (...args: Parameters<typeof actual.open>) => {
      if (
        control.redirectedPath &&
        /(?:^|[\\/])\.paperclip-inbound(?:[\\/]|$)/u.test(
          String(args[0]),
        )
      ) {
        return actual.open(control.redirectedPath, constants.O_RDWR);
      }
      return actual.open(...args);
    },
  };
});

describe("confined native attachment staging", () => {
  it("stages an inspectable empty file and cleans it idempotently", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(tmpdir(), "native-empty-stage-"),
    );
    const stage = await stageNativeRunnerAttachmentBytes({
      workspaceRoot,
      body: Buffer.alloc(0),
    });
    expect(
      await readFile(path.join(workspaceRoot, stage.workspaceRelativePath)),
    ).toEqual(Buffer.alloc(0));
    await stage.cleanup();
    await stage.cleanup();
  });

  it("never truncates an outside inode when an open is redirected before validation", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(tmpdir(), "native-stage-raced-open-"),
    );
    const outside = path.join(
      await mkdtemp(path.join(tmpdir(), "native-stage-outside-")),
      "keep.txt",
    );
    await writeFile(outside, "untouched external bytes");
    const slot = await stageNativeRunnerAttachmentBytes({
      workspaceRoot,
      body: Buffer.from("initial"),
    });
    await slot.cleanup();
    control.redirectedPath = outside;
    try {
      await expect(
        stageNativeRunnerAttachmentBytes({
          workspaceRoot,
          body: Buffer.from("new"),
        }),
      ).rejects.toThrow("path_denied");
    } finally {
      control.redirectedPath = null;
    }
    expect(await readFile(outside, "utf8")).toBe("untouched external bytes");
    expect(
      (await stat(path.join(workspaceRoot, slot.workspaceRelativePath))).size,
    ).toBe(0);
  });

  it.skipIf(process.platform !== "win32")(
    "rejects an outside-root junction before staging bytes",
    async () => {
      const workspaceRoot = await mkdtemp(
        path.join(tmpdir(), "native-stage-junction-root-"),
      );
      const outsideRoot = await mkdtemp(
        path.join(tmpdir(), "native-stage-junction-outside-"),
      );
      await symlink(
        outsideRoot,
        path.join(workspaceRoot, ".paperclip-inbound"),
        "junction",
      );

      await expect(
        stageNativeRunnerAttachmentBytes({
          workspaceRoot,
          body: Buffer.from("must stay inside the workspace"),
        }),
      ).rejects.toThrow("paperclip_runner_attachment_staging_path_denied");
      expect(await readdir(outsideRoot)).toEqual([]);
    },
  );
});

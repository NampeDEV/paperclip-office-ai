import { describe, expect, it } from "vitest";
import type { CatalogTeamInstallOptions } from "../types/teams-catalog.js";
import { catalogTeamInstallSchema } from "./teams-catalog.js";

describe("catalog team install validator", () => {
  it("accepts a trimmed optional idempotency key without changing existing install fields", () => {
    const options: CatalogTeamInstallOptions = {
      collisionStrategy: "skip",
      idempotencyKey: "office-first-install",
    };

    expect(catalogTeamInstallSchema.parse({
      ...options,
      idempotencyKey: "  office-first-install  ",
    })).toEqual({
      collisionStrategy: "skip",
      idempotencyKey: "office-first-install",
    });
  });

  it("rejects blank and oversized idempotency keys", () => {
    expect(() => catalogTeamInstallSchema.parse({ idempotencyKey: "   " })).toThrow();
    expect(() => catalogTeamInstallSchema.parse({ idempotencyKey: "x".repeat(201) })).toThrow();
  });

  it("keeps sensitive values and adapter configuration outside keyed receipts", () => {
    expect(() => catalogTeamInstallSchema.parse({
      idempotencyKey: "keyed-install",
      secretValues: { "agent:planner:OPENAI_API_KEY": "not-stored" },
    })).toThrow();
    expect(() => catalogTeamInstallSchema.parse({
      idempotencyKey: "keyed-install",
      adapterOverrides: {
        planner: { adapterType: "codex_local", adapterConfig: { apiKey: "not-stored" } },
      },
    })).toThrow();
  });
});

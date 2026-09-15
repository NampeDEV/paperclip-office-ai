import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  catalogTeamInstallReceipts,
  companies,
  createDb,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "@paperclipai/db";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
}));

const mockCompanyPortabilityService = vi.hoisted(() => ({
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));

const mockCompanySkillService = vi.hoisted(() => ({
  installFromCatalog: vi.fn(),
  importFromSource: vi.fn(),
}));

vi.mock("../services/agents.js", () => ({
  agentService: () => mockAgentService,
}));

vi.mock("../services/company-portability.js", () => ({
  companyPortabilityService: () => mockCompanyPortabilityService,
}));

vi.mock("../services/company-skills.js", () => ({
  companySkillService: () => mockCompanySkillService,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
}));

const { teamsCatalogService } = await import("../services/teams-catalog.js");

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe.sequential : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres teams catalog idempotency tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("teams catalog install idempotency", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-teams-catalog-idempotency-");
    db = createDb(tempDb.connectionString);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyPortabilityService.previewImport.mockResolvedValue({ errors: [], warnings: [] });
    mockCompanySkillService.installFromCatalog.mockResolvedValue({ warnings: [] });
    mockCompanySkillService.importFromSource.mockResolvedValue({ warnings: [] });
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Catalog receipt company",
      issuePrefix: `R${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  function importResult(companyId: string, warnings: string[] = []) {
    return {
      company: { id: companyId, name: "Catalog receipt company", action: "unchanged" as const },
      agents: [{ slug: "ceo", id: randomUUID(), action: "created" as const, name: "CEO", reason: null }],
      skills: [],
      projects: [],
      routines: [],
      envInputs: [],
      warnings,
    };
  }

  it("allows one concurrent importer and persists an exact success replay", async () => {
    const companyId = await seedCompany();
    const service = teamsCatalogService(db);
    let releaseImport!: (result: ReturnType<typeof importResult>) => void;
    mockCompanyPortabilityService.importBundle.mockImplementationOnce(
      () => new Promise<ReturnType<typeof importResult>>((resolve) => {
        releaseImport = resolve;
      }),
    );
    const options = {
      idempotencyKey: "planner-executor-reviewer-first-install",
      collisionStrategy: "skip" as const,
    };

    const first = service.installCatalogTeam(companyId, "core-exec-team", options);
    await vi.waitFor(() => expect(mockCompanyPortabilityService.importBundle).toHaveBeenCalledTimes(1));

    await expect(service.installCatalogTeam(companyId, "core-exec-team", options))
      .rejects.toMatchObject({ status: 409 });
    expect(mockCompanyPortabilityService.importBundle).toHaveBeenCalledTimes(1);

    releaseImport(importResult(companyId, ["provider completed"]));
    const firstResult = await first;
    expect(firstResult.warnings).toEqual(expect.arrayContaining(["provider completed"]));

    const replay = await service.installCatalogTeam(companyId, "core-exec-team", options);
    expect(replay).toEqual(firstResult);
    expect(mockCompanyPortabilityService.importBundle).toHaveBeenCalledTimes(1);

    const receipt = await db
      .select()
      .from(catalogTeamInstallReceipts)
      .where(and(
        eq(catalogTeamInstallReceipts.companyId, companyId),
        eq(catalogTeamInstallReceipts.idempotencyKey, options.idempotencyKey),
      ))
      .then((rows) => rows[0]);
    expect(receipt?.status).toBe("succeeded");
  });

  it("rejects sensitive keyed inputs before claiming a durable receipt", async () => {
    const companyId = await seedCompany();
    const service = teamsCatalogService(db);

    await expect(service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "secret-input-key",
      secretValues: { "agent:planner:OPENAI_API_KEY": "not-stored" },
    })).rejects.toMatchObject({ status: 422 });
    await expect(service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "adapter-config-key",
      adapterOverrides: {
        planner: { adapterType: "codex_local", adapterConfig: { apiKey: "not-stored" } },
      },
    })).rejects.toMatchObject({ status: 422 });

    const receipts = await db
      .select()
      .from(catalogTeamInstallReceipts)
      .where(eq(catalogTeamInstallReceipts.companyId, companyId));
    expect(receipts).toEqual([]);
  });

  it("rejects a reused key whose non-secret options differ", async () => {
    const companyId = await seedCompany();
    const service = teamsCatalogService(db);
    mockCompanyPortabilityService.importBundle.mockResolvedValueOnce(importResult(companyId));

    await service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "options-bound-key",
      collisionStrategy: "skip",
    });

    await expect(service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "options-bound-key",
      collisionStrategy: "rename",
    })).rejects.toMatchObject({ status: 409 });
    expect(mockCompanyPortabilityService.importBundle).toHaveBeenCalledTimes(1);
  });

  it("leaves failed and ambiguous claims closed to blind retries", async () => {
    const companyId = await seedCompany();
    const service = teamsCatalogService(db);
    mockCompanyPortabilityService.previewImport.mockResolvedValueOnce({
      errors: ["safe import rejected"],
      warnings: [],
    });

    await expect(service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "preflight-failure-key",
    })).rejects.toMatchObject({ status: 422 });
    await expect(service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "preflight-failure-key",
    })).rejects.toMatchObject({ status: 409 });
    expect(mockCompanyPortabilityService.importBundle).not.toHaveBeenCalled();

    mockCompanyPortabilityService.previewImport.mockResolvedValue({ errors: [], warnings: [] });
    mockCompanyPortabilityService.importBundle.mockRejectedValueOnce(new Error("import interrupted"));
    await expect(service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "ambiguous-import-key",
    })).rejects.toThrow("import interrupted");
    await expect(service.installCatalogTeam(companyId, "core-exec-team", {
      idempotencyKey: "ambiguous-import-key",
    })).rejects.toMatchObject({ status: 409 });
    expect(mockCompanyPortabilityService.importBundle).toHaveBeenCalledTimes(1);

    const receipts = await db
      .select({ key: catalogTeamInstallReceipts.idempotencyKey, status: catalogTeamInstallReceipts.status })
      .from(catalogTeamInstallReceipts)
      .where(eq(catalogTeamInstallReceipts.companyId, companyId));
    expect(receipts).toEqual(expect.arrayContaining([
      { key: "preflight-failure-key", status: "failed" },
      { key: "ambiguous-import-key", status: "ambiguous" },
    ]));
  });
});

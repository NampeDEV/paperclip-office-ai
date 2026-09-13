import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  assets,
  companies,
  createDb,
  officeScenes,
} from "@paperclipai/db";
import {
  BUNDLED_OFFICE_SCENE_IMAGE_HEIGHT,
  BUNDLED_OFFICE_SCENE_IMAGE_WIDTH,
  saveOfficeSceneSchema,
} from "@paperclipai/shared";
import type { StorageService } from "../storage/types.js";
import { errorHandler } from "../middleware/index.js";
import { officeRoutes } from "../routes/office.js";
import { officeSceneService, readOfficeSceneRasterMetadata } from "../services/office.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;
type Db = ReturnType<typeof createDb>;

function sceneInput(overrides: Record<string, unknown> = {}) {
  return {
    revision: 0,
    name: "Office",
    backgroundAssetId: null,
    imageWidth: BUNDLED_OFFICE_SCENE_IMAGE_WIDTH,
    imageHeight: BUNDLED_OFFICE_SCENE_IMAGE_HEIGHT,
    seats: [{
      id: randomUUID(),
      label: "Planner",
      agentId: null,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      zIndex: 1,
    }],
    ...overrides,
  };
}

function boardActor(companyIds: string[]): Express.Request["actor"] {
  return {
    type: "board",
    userId: "office-board",
    source: "session",
    companyIds,
    memberships: companyIds.map((companyId) => ({ companyId, membershipRole: "owner", status: "active" })),
    isInstanceAdmin: false,
  };
}

function agentActor(companyId: string): Express.Request["actor"] {
  return {
    type: "agent",
    agentId: randomUUID(),
    companyId,
    source: "agent_key",
  };
}

function storageFixture() {
  const objects = new Map<string, Buffer>();
  return {
    provider: "local",
    putFile: vi.fn(async (input: {
      originalFilename: string | null;
      contentType: string;
      body: Buffer;
    }) => {
      const objectKey = `office/${randomUUID()}`;
      objects.set(objectKey, Buffer.from(input.body));
      return {
        provider: "local",
        objectKey,
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        byteSize: input.body.length,
        sha256: createHash("sha256").update(input.body).digest("hex"),
      };
    }),
    getObject: vi.fn(async (_companyId: string, objectKey: string) => {
      const body = objects.get(objectKey);
      if (!body) throw new Error("Object not found");
      return { stream: Readable.from([body]), contentLength: body.length };
    }),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
    setObject(objectKey: string, body: Buffer) {
      objects.set(objectKey, body);
    },
  } as unknown as StorageService & { setObject(objectKey: string, body: Buffer): void };
}

function appFor(db: Db, actor: Express.Request["actor"], storage = storageFixture()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", officeRoutes(db, storage));
  app.use(errorHandler);
  return { app, storage };
}

describe("office scene validation", () => {
  it("rejects out-of-bounds, duplicate, and URL-based scene data", () => {
    const outOfBounds = sceneInput({
      seats: [{ ...sceneInput().seats[0], x: 0.9, width: 0.2 }],
    });
    const firstSeat = sceneInput().seats[0]!;
    const duplicateSeat = sceneInput({ seats: [firstSeat, { ...firstSeat, label: "Second" }] });
    const agentId = randomUUID();
    const duplicateAgent = sceneInput({
      seats: [
        { ...firstSeat, agentId },
        { ...firstSeat, id: randomUUID(), label: "Second", agentId },
      ],
    });

    expect(saveOfficeSceneSchema.safeParse(outOfBounds).success).toBe(false);
    expect(saveOfficeSceneSchema.safeParse(duplicateSeat).success).toBe(false);
    expect(saveOfficeSceneSchema.safeParse(duplicateAgent).success).toBe(false);
    expect(saveOfficeSceneSchema.safeParse({ ...sceneInput(), backgroundUrl: "https://example.test/office.png" }).success).toBe(false);
  });

  it("uses display dimensions for EXIF-oriented JPEG backgrounds", async () => {
    const jpeg = await sharp({
      create: { width: 3, height: 2, channels: 3, background: "black" },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    await expect(readOfficeSceneRasterMetadata(jpeg)).resolves.toMatchObject({
      contentType: "image/jpeg",
      imageWidth: 2,
      imageHeight: 3,
    });
  });
});

describeEmbeddedPostgres("office scene routes and storage", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-office-scene-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(officeScenes);
    await db.delete(assets);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function company(name: string) {
    return db
      .insert(companies)
      .values({ name, issuePrefix: `OF${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}` })
      .returning()
      .then((rows) => rows[0]!);
  }

  it("stores one scene atomically and rejects stale, foreign agent, and foreign asset writes", async () => {
    const primary = await company("Office Primary");
    const foreign = await company("Office Foreign");
    const [primaryAgent] = await db.insert(agents).values({
      companyId: primary.id,
      name: "Planner",
      role: "general",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    }).returning();
    const [foreignAgent] = await db.insert(agents).values({
      companyId: foreign.id,
      name: "Foreign Planner",
      role: "general",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    }).returning();
    const [foreignAsset] = await db.insert(assets).values({
      companyId: foreign.id,
      provider: "local",
      objectKey: `office/${randomUUID()}`,
      contentType: "image/png",
      byteSize: 1,
      sha256: "a".repeat(64),
    }).returning();
    const scenes = officeSceneService(db, storageFixture());
    const initial = await scenes.save(primary.id, sceneInput({
      seats: [{ ...sceneInput().seats[0], agentId: primaryAgent!.id }],
    }));
    expect(initial.created).toBe(true);
    expect(initial.scene.revision).toBe(1);

    const updated = await scenes.save(primary.id, sceneInput({
      revision: initial.scene.revision,
      name: "Updated Office",
      seats: [{ ...sceneInput().seats[0], agentId: primaryAgent!.id }],
    }));
    expect(updated.scene.revision).toBe(2);
    await expect(scenes.save(primary.id, sceneInput({ revision: 1 }))).rejects.toMatchObject({ status: 409 });
    await expect(scenes.save(primary.id, sceneInput({
      revision: updated.scene.revision,
      backgroundAssetId: foreignAsset!.id,
    }))).rejects.toMatchObject({ status: 422 });
    await expect(scenes.save(primary.id, sceneInput({
      revision: updated.scene.revision,
      seats: [{ ...sceneInput().seats[0], agentId: foreignAgent!.id }],
    }))).rejects.toMatchObject({ status: 422 });
  });

  it("allows exactly one create and update for each compared revision", async () => {
    const primary = await company("Office Compare And Swap");
    const scenes = officeSceneService(db, storageFixture());
    const creations = await Promise.allSettled([
      scenes.save(primary.id, sceneInput({ name: "First create" })),
      scenes.save(primary.id, sceneInput({ name: "Second create" })),
    ]);
    const created = creations.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof scenes.save>>> => result.status === "fulfilled");
    const rejectedCreates = creations.filter((result) => result.status === "rejected");
    expect(created).toHaveLength(1);
    expect(rejectedCreates).toHaveLength(1);
    expect(rejectedCreates[0]!.reason).toMatchObject({ status: 409 });

    const revision = created[0]!.value.scene.revision;
    const updates = await Promise.allSettled([
      scenes.save(primary.id, sceneInput({ revision, name: "First update" })),
      scenes.save(primary.id, sceneInput({ revision, name: "Second update" })),
    ]);
    expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejectedUpdates = updates.filter((result) => result.status === "rejected");
    expect(rejectedUpdates).toHaveLength(1);
    expect(rejectedUpdates[0]!.reason).toMatchObject({ status: 409 });
  });

  it("derives saved background dimensions and rejects truncated stored rasters", async () => {
    const primary = await company("Office Stored Background");
    const storage = storageFixture();
    const scenes = officeSceneService(db, storage);
    const png = await sharp({
      create: { width: 3, height: 2, channels: 3, background: "black" },
    }).png().toBuffer();
    const stored = await storage.putFile({
      companyId: primary.id,
      namespace: "assets/office-backgrounds",
      originalFilename: "office.png",
      contentType: "image/png",
      body: png,
    });
    const [background] = await db.insert(assets).values({
      companyId: primary.id,
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
    }).returning();

    await expect(scenes.save(primary.id, sceneInput({
      backgroundAssetId: background!.id,
      imageWidth: 2,
      imageHeight: 3,
    }))).rejects.toMatchObject({ status: 422 });

    const saved = await scenes.save(primary.id, sceneInput({
      backgroundAssetId: background!.id,
      imageWidth: 3,
      imageHeight: 2,
    }));
    expect(saved.scene.backgroundAssetId).toBe(background!.id);

    const truncatedKey = `office/${randomUUID()}`;
    const truncated = png.subarray(0, 62);
    await expect(sharp(truncated).metadata()).resolves.toMatchObject({ width: 3, height: 2 });
    storage.setObject(truncatedKey, truncated);
    const [truncatedAsset] = await db.insert(assets).values({
      companyId: primary.id,
      provider: "local",
      objectKey: truncatedKey,
      contentType: "image/png",
      byteSize: truncated.length,
      sha256: createHash("sha256").update(truncated).digest("hex"),
    }).returning();
    await expect(scenes.save(primary.id, sceneInput({
      revision: saved.scene.revision,
      backgroundAssetId: truncatedAsset!.id,
      imageWidth: 3,
      imageHeight: 2,
    }))).rejects.toMatchObject({ status: 422 });
  });

  it("enforces company access and board-only mutation, then stores verified raster uploads", async () => {
    const primary = await company("Office Accessible");
    const foreign = await company("Office Hidden");
    const primaryApp = appFor(db, boardActor([primary.id]));
    const foreignRead = await request(primaryApp.app).get(`/api/companies/${foreign.id}/office-scene`);
    expect(foreignRead.status).toBe(403);

    const agentApp = appFor(db, agentActor(primary.id));
    const agentWrite = await request(agentApp.app)
      .put(`/api/companies/${primary.id}/office-scene`)
      .send(sceneInput());
    expect(agentWrite.status).toBe(403);

    const png = await sharp({
      create: { width: 3, height: 2, channels: 3, background: "black" },
    }).png().toBuffer();
    const uploaded = await request(primaryApp.app)
      .post(`/api/companies/${primary.id}/office-scene/background`)
      .attach("file", png, { filename: "office.png", contentType: "image/png" });
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    expect(uploaded.body).toMatchObject({ imageWidth: 3, imageHeight: 2 });
    expect((primaryApp.storage as { putFile: ReturnType<typeof vi.fn> }).putFile).toHaveBeenCalledWith(expect.objectContaining({
      companyId: primary.id,
      contentType: "image/png",
      namespace: "assets/office-backgrounds",
    }));

    const agentUpload = await request(agentApp.app)
      .post(`/api/companies/${primary.id}/office-scene/background`)
      .attach("file", png, { filename: "office.png", contentType: "image/png" });
    expect(agentUpload.status).toBe(403);

    const saved = await request(primaryApp.app)
      .put(`/api/companies/${primary.id}/office-scene`)
      .send(sceneInput({
        backgroundAssetId: uploaded.body.assetId,
        imageWidth: uploaded.body.imageWidth,
        imageHeight: uploaded.body.imageHeight,
      }));
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const read = await request(primaryApp.app).get(`/api/companies/${primary.id}/office-scene`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id: saved.body.id, revision: 1, backgroundAssetId: uploaded.body.assetId });

    const activities = await db.select({ action: activityLog.action }).from(activityLog);
    expect(activities.map((activity) => activity.action)).toEqual(expect.arrayContaining([
      "office_scene.background_uploaded",
      "office_scene.created",
    ]));
    const rejected = await request(primaryApp.app)
      .put(`/api/companies/${primary.id}/office-scene`)
      .send(sceneInput());
    expect(rejected.status).toBe(409);
    const afterRejected = await db.select({ action: activityLog.action }).from(activityLog);
    expect(afterRejected).toHaveLength(activities.length);
  });
});

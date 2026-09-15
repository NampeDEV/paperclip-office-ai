import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import { officeSceneScopeQuerySchema, saveOfficeSceneSchema } from "@paperclipai/shared";
import type { StorageService } from "../storage/types.js";
import { validate } from "../middleware/validate.js";
import { assetService, logActivity } from "../services/index.js";
import {
  MAX_OFFICE_SCENE_BACKGROUND_BYTES,
  officeSceneService,
  readOfficeSceneRasterMetadata,
} from "../services/office.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export { MAX_OFFICE_SCENE_BACKGROUND_BYTES } from "../services/office.js";

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
};

async function runSingleFileUpload(upload: ReturnType<typeof multer>, req: Request, res: Response) {
  await new Promise<void>((resolve, reject) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function officeRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const scenes = officeSceneService(db, storage);
  const assets = assetService(db);
  const backgroundUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_OFFICE_SCENE_BACKGROUND_BYTES, files: 1 },
  });

  async function uploadSceneRaster(
    req: Request,
    res: Response,
    input: {
      namespace: string;
      action: "office_scene.background_uploaded" | "office_scene.character_uploaded";
      label: "Background" | "Character art";
    },
  ) {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    try {
      await runSingleFileUpload(backgroundUpload, req, res);
    } catch (error) {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `${input.label} is larger than the 5 MiB limit` });
          return;
        }
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }

    const file = (req as Request & { file?: UploadedFile }).file;
    if (!file || file.buffer.length === 0) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }
    const metadata = await readOfficeSceneRasterMetadata(file.buffer);
    const actor = getActorInfo(req);
    const stored = await storage.putFile({
      companyId,
      namespace: input.namespace,
      originalFilename: file.originalname || null,
      contentType: metadata.contentType,
      body: file.buffer,
    });
    const asset = await assets.create(companyId, {
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action: input.action,
      entityType: "asset",
      entityId: asset.id,
      details: {
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        imageWidth: metadata.imageWidth,
        imageHeight: metadata.imageHeight,
      },
    });
    res.status(201).json({
      assetId: asset.id,
      imageWidth: metadata.imageWidth,
      imageHeight: metadata.imageHeight,
    });
  }

  router.get("/companies/:companyId/office-scene", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = officeSceneScopeQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid Office scene scope", details: query.error.flatten() });
      return;
    }
    res.json(await scenes.get(companyId, query.data.projectId ?? null));
  });

  router.put("/companies/:companyId/office-scene", validate(saveOfficeSceneSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const result = await scenes.save(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action: result.created ? "office_scene.created" : "office_scene.updated",
      entityType: "office_scene",
      entityId: result.scene.id,
      details: {
        revision: result.scene.revision,
        projectId: result.scene.projectId,
        backgroundAssetId: result.scene.backgroundAssetId,
        seatCount: result.scene.seats.length,
        characterCount: result.scene.characters.length,
      },
    });
    res.status(result.created ? 201 : 200).json(result.scene);
  });

  router.post("/companies/:companyId/office-scene/background", async (req, res) =>
    uploadSceneRaster(req, res, {
      namespace: "assets/office-backgrounds",
      action: "office_scene.background_uploaded",
      label: "Background",
    }));

  router.post("/companies/:companyId/office-scene/character", async (req, res) =>
    uploadSceneRaster(req, res, {
      namespace: "assets/office-characters",
      action: "office_scene.character_uploaded",
      label: "Character art",
    }));

  return router;
}

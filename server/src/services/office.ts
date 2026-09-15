import { and, eq, inArray, isNull } from "drizzle-orm";
import sharp from "sharp";
import { agents, assets, officeScenes, projects, type Db } from "@paperclipai/db";
import {
  OFFICE_SCENE_MAX_IMAGE_DIMENSION,
  OFFICE_SCENE_MAX_IMAGE_PIXELS,
  type SaveOfficeScene,
} from "@paperclipai/shared";
import { HttpError, conflict, unprocessable } from "../errors.js";
import type { StorageService } from "../storage/types.js";

export const MAX_OFFICE_SCENE_BACKGROUND_BYTES = 5 * 1024 * 1024;

const OFFICE_BACKGROUND_CONTENT_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function canonicalContentType(contentType: string) {
  const normalized = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

export async function readOfficeSceneRasterMetadata(body: Buffer) {
  if (body.length === 0 || body.length > MAX_OFFICE_SCENE_BACKGROUND_BYTES) {
    throw unprocessable("Background is larger than the 5 MiB limit");
  }

  try {
    const image = sharp(body, {
      limitInputPixels: OFFICE_SCENE_MAX_IMAGE_PIXELS,
      failOn: "error",
    });
    const metadata = await image.metadata();
    const contentType = metadata.format ? OFFICE_BACKGROUND_CONTENT_TYPES[metadata.format] : undefined;
    const pageCount = metadata.pages ?? 1;
    const imageWidth = metadata.autoOrient.width ?? metadata.width;
    const imageHeight = metadata.autoOrient.height ?? metadata.height;
    if (
      !contentType ||
      !imageWidth ||
      !imageHeight ||
      pageCount > 1 ||
      imageWidth > OFFICE_SCENE_MAX_IMAGE_DIMENSION ||
      imageHeight > OFFICE_SCENE_MAX_IMAGE_DIMENSION ||
      imageWidth * imageHeight * pageCount > OFFICE_SCENE_MAX_IMAGE_PIXELS
    ) {
      throw unprocessable("Background must be a bounded PNG, JPEG, WebP, or GIF image");
    }

    // `metadata()` can read only headers. Stats forces Sharp to decode the full
    // image so a truncated object cannot be accepted as a valid background.
    await image.stats();
    return { contentType, imageWidth, imageHeight };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unprocessable("Background must be a valid PNG, JPEG, WebP, or GIF image");
  }
}

async function readStoredOfficeSceneRaster(
  storage: StorageService,
  companyId: string,
  asset: { objectKey: string; byteSize: number },
) {
  if (asset.byteSize > MAX_OFFICE_SCENE_BACKGROUND_BYTES) {
    throw unprocessable("Background is larger than the 5 MiB limit");
  }

  try {
    const object = await storage.getObject(companyId, asset.objectKey);
    if (object.contentLength !== undefined && object.contentLength > MAX_OFFICE_SCENE_BACKGROUND_BYTES) {
      object.stream.destroy();
      throw unprocessable("Background is larger than the 5 MiB limit");
    }

    const chunks: Buffer[] = [];
    let byteSize = 0;
    for await (const chunk of object.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteSize += buffer.length;
      if (byteSize > MAX_OFFICE_SCENE_BACKGROUND_BYTES) {
        object.stream.destroy();
        throw unprocessable("Background is larger than the 5 MiB limit");
      }
      chunks.push(buffer);
    }
    if (byteSize !== asset.byteSize) {
      throw unprocessable("Background asset bytes do not match its stored metadata");
    }
    return readOfficeSceneRasterMetadata(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unprocessable("Background asset could not be read from storage");
  }
}

export function officeSceneService(db: Db, storage: StorageService) {
  const sceneScope = (projectId: string | null) => (
    projectId === null ? isNull(officeScenes.projectId) : eq(officeScenes.projectId, projectId)
  );

  async function assertProjectScope(companyId: string, projectId: string | null) {
    if (projectId === null) return;
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!project) throw unprocessable("Project scope must belong to this company");
  }

  async function readOwnedRasterAsset(companyId: string, assetId: string, label: string) {
    const asset = await db
      .select({
        contentType: assets.contentType,
        objectKey: assets.objectKey,
        byteSize: assets.byteSize,
      })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    const declaredContentType = asset ? canonicalContentType(asset.contentType) : null;
    if (!asset || !Object.values(OFFICE_BACKGROUND_CONTENT_TYPES).includes(declaredContentType!)) {
      throw unprocessable(`${label} must be a supported raster image in this company`);
    }
    return {
      asset,
      declaredContentType,
      metadata: await readStoredOfficeSceneRaster(storage, companyId, asset),
    };
  }

  async function assertSceneReferences(companyId: string, input: SaveOfficeScene) {
    await assertProjectScope(companyId, input.projectId);

    if (input.backgroundAssetId) {
      const { declaredContentType, metadata } = await readOwnedRasterAsset(
        companyId,
        input.backgroundAssetId,
        "Background asset",
      );
      if (
        metadata.contentType !== declaredContentType ||
        metadata.imageWidth !== input.imageWidth ||
        metadata.imageHeight !== input.imageHeight
      ) {
        throw unprocessable("Background asset dimensions or type do not match the scene");
      }
    }

    // Character art is decorative only. It is independently positioned and
    // must be an owned, fully decodable raster before a scene can reference it.
    for (const assetId of new Set(input.characters.map((character) => character.assetId))) {
      await readOwnedRasterAsset(companyId, assetId, "Character asset");
    }

    const agentIds = input.seats.flatMap((seat) => (seat.agentId ? [seat.agentId] : []));
    if (agentIds.length === 0) return;
    const matchingAgents = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), inArray(agents.id, agentIds)));
    if (matchingAgents.length !== agentIds.length) {
      throw unprocessable("Every seated agent must belong to this company");
    }
  }

  return {
    async get(companyId: string, projectId: string | null = null) {
      await assertProjectScope(companyId, projectId);
      const scopedScene = await db
        .select()
        .from(officeScenes)
        .where(and(
          eq(officeScenes.companyId, companyId),
          eq(officeScenes.isActive, true),
          sceneScope(projectId),
        ))
        .then((rows) => rows[0] ?? null);
      if (scopedScene || projectId === null) return scopedScene;
      return db
        .select()
        .from(officeScenes)
        .where(and(
          eq(officeScenes.companyId, companyId),
          eq(officeScenes.isActive, true),
          isNull(officeScenes.projectId),
        ))
        .then((rows) => rows[0] ?? null);
    },

    async save(companyId: string, input: SaveOfficeScene) {
      await assertSceneReferences(companyId, input);
      const now = new Date();
      const values = {
        name: input.name,
        backgroundAssetId: input.backgroundAssetId,
        imageWidth: input.imageWidth,
        imageHeight: input.imageHeight,
        seats: input.seats,
        characters: input.characters,
        isActive: true,
        updatedAt: now,
      };

      if (input.revision === 0) {
        const [scene] = await db
          .insert(officeScenes)
          .values({ ...values, companyId, projectId: input.projectId, revision: 1 })
          .onConflictDoNothing()
          .returning();
        if (!scene) throw conflict("Office scene already exists for this scope. Reload and try again.");
        return { scene, created: true };
      }

      const [scene] = await db
        .update(officeScenes)
        .set({ ...values, revision: input.revision + 1 })
        .where(and(
          eq(officeScenes.companyId, companyId),
          eq(officeScenes.isActive, true),
          sceneScope(input.projectId),
          eq(officeScenes.revision, input.revision),
        ))
        .returning();
      if (!scene) throw conflict("Office scene changed in this scope. Reload and try again.");
      return { scene, created: false };
    },
  };
}

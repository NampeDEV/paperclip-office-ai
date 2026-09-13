import { z } from "zod";

export const BUNDLED_OFFICE_SCENE_IMAGE_WIDTH = 1672;
export const BUNDLED_OFFICE_SCENE_IMAGE_HEIGHT = 941;
export const OFFICE_SCENE_MAX_IMAGE_DIMENSION = 16_384;
export const OFFICE_SCENE_MAX_IMAGE_PIXELS = 50_000_000;
export const OFFICE_SCENE_MAX_SEATS = 100;
export const OFFICE_SCENE_MAX_CHARACTERS = 100;

const normalizedCoordinateSchema = z.number().finite().min(0).max(1);

export const officeSeatSchema = z
  .object({
    id: z.string().guid(),
    label: z.string().trim().min(1).max(120),
    agentId: z.string().guid().nullable(),
    x: normalizedCoordinateSchema,
    y: normalizedCoordinateSchema,
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
    zIndex: z.number().int().min(0).max(1_000),
  })
  .strict()
  .superRefine((seat, ctx) => {
    if (seat.x + seat.width > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "Seat must remain inside the normalized image bounds",
      });
    }
    if (seat.y + seat.height > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "Seat must remain inside the normalized image bounds",
      });
    }
  });

export const officeSeatsSchema = z
  .array(officeSeatSchema)
  .max(OFFICE_SCENE_MAX_SEATS)
  .superRefine((seats, ctx) => {
    const seatIds = new Set<string>();
    const agentIds = new Set<string>();
    for (const [index, seat] of seats.entries()) {
      if (seatIds.has(seat.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: "Seat ids must be unique within a scene",
        });
      }
      seatIds.add(seat.id);
      if (seat.agentId && agentIds.has(seat.agentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "agentId"],
          message: "An agent can occupy only one seat in a scene",
        });
      }
      if (seat.agentId) agentIds.add(seat.agentId);
    }
  });

export const officeCharacterSchema = z
  .object({
    id: z.string().guid(),
    assetId: z.string().guid(),
    x: normalizedCoordinateSchema,
    y: normalizedCoordinateSchema,
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
    zIndex: z.number().int().min(0).max(1_000),
  })
  .strict()
  .superRefine((character, ctx) => {
    if (character.x + character.width > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "Character must remain inside the normalized image bounds",
      });
    }
    if (character.y + character.height > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "Character must remain inside the normalized image bounds",
      });
    }
  });

export const officeCharactersSchema = z
  .array(officeCharacterSchema)
  .max(OFFICE_SCENE_MAX_CHARACTERS)
  .superRefine((characters, ctx) => {
    const ids = new Set<string>();
    for (const [index, character] of characters.entries()) {
      if (ids.has(character.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: "Character ids must be unique within a scene",
        });
      }
      ids.add(character.id);
    }
  });

const imageDimensionSchema = z.number().int().positive().max(OFFICE_SCENE_MAX_IMAGE_DIMENSION);

export const saveOfficeSceneSchema = z
  .object({
    projectId: z.string().guid().nullable(),
    revision: z.number().int().min(0),
    name: z.string().trim().min(1).max(200),
    backgroundAssetId: z.string().guid().nullable(),
    imageWidth: imageDimensionSchema,
    imageHeight: imageDimensionSchema,
    seats: officeSeatsSchema,
    characters: officeCharactersSchema,
  })
  .strict()
  .superRefine((scene, ctx) => {
    if (scene.imageWidth * scene.imageHeight > OFFICE_SCENE_MAX_IMAGE_PIXELS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["imageHeight"],
        message: "Image dimensions exceed the maximum pixel count",
      });
    }
    if (
      scene.backgroundAssetId === null &&
      (scene.imageWidth !== BUNDLED_OFFICE_SCENE_IMAGE_WIDTH || scene.imageHeight !== BUNDLED_OFFICE_SCENE_IMAGE_HEIGHT)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["imageWidth"],
        message: `Bundled office art is ${BUNDLED_OFFICE_SCENE_IMAGE_WIDTH}x${BUNDLED_OFFICE_SCENE_IMAGE_HEIGHT}`,
      });
    }
  });

export const officeSceneScopeQuerySchema = z.object({
  projectId: z.string().guid().optional(),
});

export const officeSceneBackgroundUploadResponseSchema = z
  .object({
    assetId: z.string().guid(),
    imageWidth: imageDimensionSchema,
    imageHeight: imageDimensionSchema,
  })
  .strict();

export type OfficeSeat = z.infer<typeof officeSeatSchema>;
export type OfficeCharacter = z.infer<typeof officeCharacterSchema>;
export type SaveOfficeScene = z.infer<typeof saveOfficeSceneSchema>;
export type OfficeSceneBackgroundUploadResponse = z.infer<typeof officeSceneBackgroundUploadResponseSchema>;

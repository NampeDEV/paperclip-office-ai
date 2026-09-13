import type {
  OfficeScene,
  OfficeSceneBackgroundUploadResponse,
  OfficeSeat,
  SaveOfficeScene,
} from "@paperclipai/shared";
import { api } from "./client";

export type {
  OfficeScene,
  OfficeSceneBackgroundUploadResponse,
  OfficeSeat,
  SaveOfficeScene,
};

export const officeQueryKeys = {
  scene: (companyId: string) => ["office", companyId, "scene"] as const,
};

export const officeApi = {
  getScene: (companyId: string) =>
    api.get<OfficeScene | null>(`/companies/${encodeURIComponent(companyId)}/office-scene`),
  saveScene: (companyId: string, scene: SaveOfficeScene) =>
    api.put<OfficeScene>(`/companies/${encodeURIComponent(companyId)}/office-scene`, scene),
  uploadBackground: async (companyId: string, file: File) => {
    // Copy the file before the async request so clipboard-backed files do not
    // disappear before fetch starts streaming the multipart body.
    const safeFile = new File([await file.arrayBuffer()], file.name, { type: file.type });
    const form = new FormData();
    form.append("file", safeFile);
    return api.postForm<OfficeSceneBackgroundUploadResponse>(
      `/companies/${encodeURIComponent(companyId)}/office-scene/background`,
      form,
    );
  },
};

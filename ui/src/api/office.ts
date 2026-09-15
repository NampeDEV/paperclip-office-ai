import type {
  OfficeCharacter,
  OfficeScene,
  OfficeSceneBackgroundUploadResponse,
  OfficeSeat,
  SaveOfficeScene,
} from "@paperclipai/shared";
import { api } from "./client";

export type {
  OfficeCharacter,
  OfficeScene,
  OfficeSceneBackgroundUploadResponse,
  OfficeSeat,
  SaveOfficeScene,
};

export const officeQueryKeys = {
  scenes: (companyId: string) => ["office", companyId, "scene"] as const,
  scene: (companyId: string, projectId: string | null = null) =>
    [...officeQueryKeys.scenes(companyId), projectId ?? "__company__"] as const,
};

export const officeApi = {
  getScene: (companyId: string, projectId: string | null = null) => {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    const query = params.toString();
    return api.get<OfficeScene | null>(
      `/companies/${encodeURIComponent(companyId)}/office-scene${query ? `?${query}` : ""}`,
    );
  },
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
  uploadCharacter: async (companyId: string, file: File) => {
    const safeFile = new File([await file.arrayBuffer()], file.name, { type: file.type });
    const form = new FormData();
    form.append("file", safeFile);
    return api.postForm<OfficeSceneBackgroundUploadResponse>(
      `/companies/${encodeURIComponent(companyId)}/office-scene/character`,
      form,
    );
  },
};

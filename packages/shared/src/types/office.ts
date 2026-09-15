export interface OfficeSeat {
  id: string;
  label: string;
  agentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** Decorative art positioned independently from agent, task, and run state. */
export interface OfficeCharacter {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface OfficeScene {
  id: string;
  companyId: string;
  /** Null identifies the company-wide fallback scene. */
  projectId: string | null;
  name: string;
  backgroundAssetId: string | null;
  imageWidth: number;
  imageHeight: number;
  isActive: boolean;
  revision: number;
  seats: OfficeSeat[];
  characters: OfficeCharacter[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SaveOfficeScene {
  /** The exact fallback or project scope this compare-and-swap write targets. */
  projectId: string | null;
  revision: number;
  name: string;
  backgroundAssetId: string | null;
  imageWidth: number;
  imageHeight: number;
  seats: OfficeSeat[];
  characters: OfficeCharacter[];
}

export interface OfficeSceneBackgroundUploadResponse {
  assetId: string;
  imageWidth: number;
  imageHeight: number;
}

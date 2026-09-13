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

export interface OfficeScene {
  id: string;
  companyId: string;
  name: string;
  backgroundAssetId: string | null;
  imageWidth: number;
  imageHeight: number;
  isActive: boolean;
  revision: number;
  seats: OfficeSeat[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SaveOfficeScene {
  revision: number;
  name: string;
  backgroundAssetId: string | null;
  imageWidth: number;
  imageHeight: number;
  seats: OfficeSeat[];
}

export interface OfficeSceneBackgroundUploadResponse {
  assetId: string;
  imageWidth: number;
  imageHeight: number;
}

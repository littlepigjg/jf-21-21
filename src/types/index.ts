export interface Frame {
  id: string;
  imageData: ImageData;
  delay: number;
  width: number;
  height: number;
  disposalMethod: number;
}

export interface Caption {
  id: string;
  text: string;
  frameRange: [number, number];
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  align: 'left' | 'center' | 'right';
}

export interface CropConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportConfig {
  colors: number;
  quality: number;
  fps: number;
  dither: boolean;
  repeat: number;
  width: number;
  height: number;
}

export interface EditorState {
  frames: Frame[];
  selectedFrameIndex: number;
  captions: Caption[];
  crop: CropConfig;
  exportConfig: ExportConfig;
  isPlaying: boolean;
  playbackSpeed: number;
  currentFrameIndex: number;
  canvasWidth: number;
  canvasHeight: number;
}

export type ChangeType = 'add' | 'update' | 'delete' | 'move';

export interface FrameChange {
  type: ChangeType;
  id?: string;
  index?: number;
  fromIndex?: number;
  toIndex?: number;
  frame?: SerializableFrame;
  updates?: Partial<Frame>;
}

export interface CaptionChange {
  type: ChangeType;
  id?: string;
  caption?: Caption;
  updates?: Partial<Caption>;
}

export interface ConfigChange {
  crop?: Partial<CropConfig>;
  exportConfig?: Partial<ExportConfig>;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface ChangeSet {
  id: string;
  version: number;
  timestamp: number;
  deviceId: string;
  frameChanges: FrameChange[];
  captionChanges: CaptionChange[];
  configChanges: ConfigChange;
  checksum: string;
}

export interface SerializableFrame {
  id: string;
  imageDataUrl: string;
  delay: number;
  width: number;
  height: number;
  disposalMethod: number;
}

export interface ProjectSnapshot {
  projectId: string;
  version: number;
  timestamp: number;
  deviceId: string;
  frames: SerializableFrame[];
  captions: Caption[];
  crop: CropConfig;
  exportConfig: ExportConfig;
  canvasWidth: number;
  canvasHeight: number;
  checksum: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'uploading' | 'downloading' | 'conflict' | 'error' | 'offline';

export interface SyncState {
  projectId: string;
  deviceId: string;
  currentVersion: number;
  lastSyncVersion: number;
  lastSyncTime: number | null;
  status: SyncStatus;
  progress: number;
  totalChanges: number;
  syncedChanges: number;
  error: string | null;
  pendingChanges: ChangeSet[];
  lastServerSnapshot: ProjectSnapshot | null;
  autoSync: boolean;
  hasConflict: boolean;
}

export interface CloudStorageProvider {
  uploadSnapshot: (snapshot: ProjectSnapshot) => Promise<void>;
  downloadSnapshot: (projectId: string) => Promise<ProjectSnapshot | null>;
  uploadChangeSet: (changeSet: ChangeSet & { projectId: string }) => Promise<void>;
  downloadChangeSets: (projectId: string, fromVersion: number) => Promise<ChangeSet[]>;
  getLatestVersion: (projectId: string) => Promise<number>;
  isAvailable: () => Promise<boolean>;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  lastActive: number;
}

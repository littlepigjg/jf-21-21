import type {
  CloudStorageProvider,
  ChangeSet,
  ProjectSnapshot,
  EditorState,
  SyncStatus,
} from '@/types';
import type { Frame, Caption, CropConfig, ExportConfig } from '@/types';
import {
  diffFrames,
  diffCaptions,
  diffConfig,
  frameToSerializable,
  computeChecksum,
  generateChangeSetId,
  getEditorSnapshot,
} from '@/utils/diffEngine';
import { applyChangeSet } from '@/utils/patchEngine';
import { defaultCloudProvider } from '@/services/cloudStorageProvider';

export type SyncEvent =
  | { type: 'status'; status: SyncStatus }
  | { type: 'progress'; progress: number; synced: number; total: number }
  | { type: 'error'; error: string }
  | { type: 'conflict'; localSnapshot: ProjectSnapshot; remoteSnapshot: ProjectSnapshot }
  | {
      type: 'remoteChanges';
      changes: ChangeSet[];
      appliedState: {
        frames: Frame[];
        captions: Caption[];
        crop: CropConfig;
        exportConfig: ExportConfig;
        canvasWidth: number;
        canvasHeight: number;
      };
      newVersion: number;
    }
  | { type: 'syncComplete'; version: number };

export type SyncListener = (event: SyncEvent) => void;

export class CloudSyncService {
  private provider: CloudStorageProvider;
  private projectId: string;
  private deviceId: string;
  private listeners: Set<SyncListener> = new Set();
  private lastSyncState: EditorState | null = null;
  private currentVersion: number = 0;
  private isSyncing: boolean = false;
  private pendingChangeSets: ChangeSet[] = [];
  private hasLocalChanges: boolean = false;

  constructor(projectId: string, deviceId: string, provider?: CloudStorageProvider) {
    this.projectId = projectId;
    this.deviceId = deviceId;
    this.provider = provider || defaultCloudProvider;
  }

  addListener(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SyncEvent) {
    this.listeners.forEach((l) => l(event));
  }

  getProjectId(): string {
    return this.projectId;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  getCurrentVersion(): number {
    return this.currentVersion;
  }

  hasPendingChanges(): boolean {
    return this.pendingChangeSets.length > 0 || this.hasLocalChanges;
  }

  setLastSyncState(state: EditorState) {
    this.lastSyncState = this.cloneEditorState(state);
    this.hasLocalChanges = false;
  }

  private cloneEditorState(state: EditorState): EditorState {
    return {
      ...state,
      frames: state.frames.map((f) => ({ ...f })),
      captions: state.captions.map((c) => ({ ...c })),
      crop: { ...state.crop },
      exportConfig: { ...state.exportConfig },
    };
  }

  detectLocalChanges(currentState: EditorState): ChangeSet | null {
    if (!this.lastSyncState) return null;

    const frameChanges = diffFrames(this.lastSyncState.frames, currentState.frames);
    const captionChanges = diffCaptions(this.lastSyncState.captions, currentState.captions);
    const configChanges = diffConfig(
      this.lastSyncState.crop,
      currentState.crop,
      this.lastSyncState.exportConfig,
      currentState.exportConfig,
      this.lastSyncState.canvasWidth,
      currentState.canvasWidth,
      this.lastSyncState.canvasHeight,
      currentState.canvasHeight
    );

    const hasChanges =
      frameChanges.length > 0 ||
      captionChanges.length > 0 ||
      Object.keys(configChanges).length > 0;

    if (!hasChanges) return null;

    const snapshot = getEditorSnapshot(currentState);
    const changeSet: ChangeSet = {
      id: generateChangeSetId(),
      version: this.currentVersion + 1,
      timestamp: Date.now(),
      deviceId: this.deviceId,
      frameChanges,
      captionChanges,
      configChanges,
      checksum: computeChecksum(snapshot),
    };

    this.hasLocalChanges = true;
    return changeSet;
  }

  createSnapshot(state: EditorState): ProjectSnapshot {
    return {
      projectId: this.projectId,
      version: this.currentVersion,
      timestamp: Date.now(),
      deviceId: this.deviceId,
      frames: state.frames.map(frameToSerializable),
      captions: state.captions.map((c) => ({ ...c })),
      crop: { ...state.crop },
      exportConfig: { ...state.exportConfig },
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      checksum: computeChecksum(getEditorSnapshot(state)),
    };
  }

  async sync(currentState: EditorState): Promise<{
    success: boolean;
    newVersion: number;
    remoteChangesApplied: boolean;
    appliedState?: {
      frames: Frame[];
      captions: Caption[];
      crop: CropConfig;
      exportConfig: ExportConfig;
      canvasWidth: number;
      canvasHeight: number;
    };
  }> {
    if (this.isSyncing) {
      return { success: false, newVersion: this.currentVersion, remoteChangesApplied: false };
    }

    this.isSyncing = true;
    this.emit({ type: 'status', status: 'syncing' });

    const localChangeSet: { current: ChangeSet | null } = { current: null };

    try {
      const available = await this.provider.isAvailable();
      if (!available) {
        this.emit({ type: 'status', status: 'offline' });
        this.emit({ type: 'error', error: '云服务不可用' });
        return { success: false, newVersion: this.currentVersion, remoteChangesApplied: false };
      }

      this.emit({ type: 'status', status: 'downloading' });
      const latestRemoteVersion = await this.provider.getLatestVersion(this.projectId);

      let appliedState:
        | {
            frames: Frame[];
            captions: Caption[];
            crop: CropConfig;
            exportConfig: ExportConfig;
            canvasWidth: number;
            canvasHeight: number;
          }
        | undefined;
      let remoteChangesApplied = false;

      if (latestRemoteVersion > this.currentVersion) {
        const remoteChanges = await this.provider.downloadChangeSets(
          this.projectId,
          this.currentVersion
        );

        if (remoteChanges.length > 0) {
          let workingState = {
            frames: currentState.frames,
            captions: currentState.captions,
            crop: currentState.crop,
            exportConfig: currentState.exportConfig,
            canvasWidth: currentState.canvasWidth,
            canvasHeight: currentState.canvasHeight,
          };

          this.emit({
            type: 'progress',
            progress: 0,
            synced: 0,
            total: remoteChanges.length,
          });

          for (let i = 0; i < remoteChanges.length; i++) {
            const changeSet = remoteChanges[i];
            if (changeSet.deviceId !== this.deviceId) {
              workingState = await applyChangeSet(
                workingState.frames,
                workingState.captions,
                workingState.crop,
                workingState.exportConfig,
                workingState.canvasWidth,
                workingState.canvasHeight,
                changeSet
              );
              remoteChangesApplied = true;
            }
            this.currentVersion = changeSet.version;
            this.emit({
              type: 'progress',
              progress: Math.round(((i + 1) / remoteChanges.length) * 50),
              synced: i + 1,
              total: remoteChanges.length,
            });
          }

          if (remoteChangesApplied) {
            appliedState = workingState;
            this.emit({
              type: 'remoteChanges',
              changes: remoteChanges,
              appliedState: workingState,
              newVersion: this.currentVersion,
            });
          }
        }
      }

      localChangeSet.current = this.detectLocalChanges(currentState);
      if (localChangeSet.current || this.pendingChangeSets.length > 0) {
        this.emit({ type: 'status', status: 'uploading' });

        const allChanges = [...this.pendingChangeSets];
        if (localChangeSet.current) {
          localChangeSet.current.version = this.currentVersion + 1;
          allChanges.push(localChangeSet.current);
        }

        this.emit({
          type: 'progress',
          progress: 50,
          synced: 0,
          total: allChanges.length,
        });

        for (let i = 0; i < allChanges.length; i++) {
          const changeSet = allChanges[i];
          changeSet.version = this.currentVersion + 1;
          await this.provider.uploadChangeSet({
            ...changeSet,
            projectId: this.projectId,
          });
          this.currentVersion = changeSet.version;
          this.emit({
            type: 'progress',
            progress: 50 + Math.round(((i + 1) / allChanges.length) * 50),
            synced: i + 1,
            total: allChanges.length,
          });
        }

        const finalSnapshot = this.createSnapshot({
          ...currentState,
          ...appliedState,
        });
        finalSnapshot.version = this.currentVersion;
        await this.provider.uploadSnapshot(finalSnapshot);

        this.pendingChangeSets = [];
        this.hasLocalChanges = false;
      }

      this.lastSyncState = this.cloneEditorState({
        ...currentState,
        ...appliedState,
      });

      this.emit({ type: 'status', status: 'idle' });
      this.emit({ type: 'syncComplete', version: this.currentVersion });

      return {
        success: true,
        newVersion: this.currentVersion,
        remoteChangesApplied,
        appliedState,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : '同步失败';
      this.emit({ type: 'status', status: 'error' });
      this.emit({ type: 'error', error });

      if (localChangeSet.current) {
        this.pendingChangeSets.push(localChangeSet.current);
      }

      return { success: false, newVersion: this.currentVersion, remoteChangesApplied: false };
    } finally {
      this.isSyncing = false;
    }
  }

  async forceUploadSnapshot(state: EditorState): Promise<boolean> {
    this.emit({ type: 'status', status: 'uploading' });
    try {
      const snapshot = this.createSnapshot(state);
      snapshot.version = ++this.currentVersion;
      await this.provider.uploadSnapshot(snapshot);
      this.lastSyncState = this.cloneEditorState(state);
      this.pendingChangeSets = [];
      this.hasLocalChanges = false;
      this.emit({ type: 'status', status: 'idle' });
      this.emit({ type: 'syncComplete', version: this.currentVersion });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : '上传快照失败';
      this.emit({ type: 'status', status: 'error' });
      this.emit({ type: 'error', error });
      return false;
    }
  }

  async pullFromCloud(): Promise<ProjectSnapshot | null> {
    this.emit({ type: 'status', status: 'downloading' });
    try {
      const snapshot = await this.provider.downloadSnapshot(this.projectId);
      if (snapshot) {
        this.currentVersion = snapshot.version;
      }
      this.emit({ type: 'status', status: 'idle' });
      return snapshot;
    } catch (err) {
      const error = err instanceof Error ? err.message : '拉取云端数据失败';
      this.emit({ type: 'status', status: 'error' });
      this.emit({ type: 'error', error });
      return null;
    }
  }
}

export function generateDeviceId(): string {
  let deviceId = localStorage.getItem('gif_studio_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('gif_studio_device_id', deviceId);
  }
  return deviceId;
}

export function getOrCreateProjectId(): string {
  let projectId = localStorage.getItem('gif_studio_project_id');
  if (!projectId) {
    projectId = 'proj_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('gif_studio_project_id', projectId);
  }
  return projectId;
}

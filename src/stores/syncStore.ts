import { create } from 'zustand';
import type { SyncStatus, ProjectSnapshot, ChangeSet, Frame, Caption, CropConfig, ExportConfig } from '@/types';
import {
  CloudSyncService,
  generateDeviceId,
  getOrCreateProjectId,
  type SyncEvent,
} from '@/services/cloudSyncService';

interface AppliedState {
  frames: Frame[];
  captions: Caption[];
  crop: CropConfig;
  exportConfig: ExportConfig;
  canvasWidth: number;
  canvasHeight: number;
}

interface SyncStore {
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
  showSyncDialog: boolean;
  syncService: CloudSyncService | null;
  lastAppliedRemoteState: AppliedState | null;
  pendingRemoteApply: boolean;

  initSyncService: () => void;
  setShowSyncDialog: (show: boolean) => void;
  setAutoSync: (enabled: boolean) => void;
  triggerSync: (editorState: Parameters<CloudSyncService['sync']>[0]) => Promise<void>;
  triggerForceUpload: (editorState: Parameters<CloudSyncService['forceUploadSnapshot']>[0]) => Promise<void>;
  triggerPull: () => Promise<ProjectSnapshot | null>;
  resetPendingRemoteApply: () => void;
  dismissError: () => void;
  applyRemoteChanges: () => AppliedState | null;
  getSyncService: () => CloudSyncService;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  projectId: '',
  deviceId: '',
  currentVersion: 0,
  lastSyncVersion: 0,
  lastSyncTime: null,
  status: 'idle',
  progress: 0,
  totalChanges: 0,
  syncedChanges: 0,
  error: null,
  pendingChanges: [],
  lastServerSnapshot: null,
  autoSync: true,
  hasConflict: false,
  showSyncDialog: false,
  syncService: null,
  lastAppliedRemoteState: null,
  pendingRemoteApply: false,

  initSyncService: () => {
    if (get().syncService) return;

    const projectId = getOrCreateProjectId();
    const deviceId = generateDeviceId();
    const service = new CloudSyncService(projectId, deviceId);

    const handleEvent = (event: SyncEvent) => {
      switch (event.type) {
        case 'status':
          set({ status: event.status });
          break;
        case 'progress':
          set({
            progress: event.progress,
            syncedChanges: event.synced,
            totalChanges: event.total,
          });
          break;
        case 'error':
          set({ error: event.error });
          break;
        case 'conflict':
          set({ hasConflict: true });
          break;
        case 'remoteChanges':
          set({
            lastAppliedRemoteState: event.appliedState,
            pendingRemoteApply: true,
            currentVersion: event.newVersion,
          });
          break;
        case 'syncComplete':
          set({
            currentVersion: event.version,
            lastSyncVersion: event.version,
            lastSyncTime: Date.now(),
            progress: 100,
            error: null,
          });
          break;
      }
    };

    service.addListener(handleEvent);

    set({
      projectId,
      deviceId,
      syncService: service,
    });
  },

  setShowSyncDialog: (show) => set({ showSyncDialog: show }),

  setAutoSync: (enabled) => set({ autoSync: enabled }),

  triggerSync: async (editorState) => {
    const service = get().getSyncService();
    const result = await service.sync(editorState);
    if (!result.success) {
      set({ status: 'error' });
    }
  },

  triggerForceUpload: async (editorState) => {
    const service = get().getSyncService();
    await service.forceUploadSnapshot(editorState);
  },

  triggerPull: async () => {
    const service = get().getSyncService();
    const snapshot = await service.pullFromCloud();
    if (snapshot) {
      set({ lastServerSnapshot: snapshot });
    }
    return snapshot;
  },

  resetPendingRemoteApply: () => {
    set({ pendingRemoteApply: false, lastAppliedRemoteState: null });
  },

  dismissError: () => set({ error: null }),

  applyRemoteChanges: () => {
    const state = get();
    const applied = state.lastAppliedRemoteState;
    set({ pendingRemoteApply: false, lastAppliedRemoteState: null });
    return applied;
  },

  getSyncService: () => {
    let service = get().syncService;
    if (!service) {
      get().initSyncService();
      service = get().syncService!;
    }
    return service;
  },
}));

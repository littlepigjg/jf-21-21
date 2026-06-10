import type { CloudStorageProvider, ProjectSnapshot, ChangeSet } from '@/types';

const DB_NAME = 'gif_studio_cloud';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const CHANGESET_STORE = 'changesets';

export class LocalIndexedDBProvider implements CloudStorageProvider {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private simulateLatency = 300;

  constructor(simulateLatency = 300) {
    this.simulateLatency = simulateLatency;
  }

  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) {
      await this.initPromise;
      if (this.db) return this.db;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const snapshotStore = db.createObjectStore(SNAPSHOT_STORE, {
            keyPath: 'projectId',
          });
          snapshotStore.createIndex('version', 'version', { unique: false });
          snapshotStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(CHANGESET_STORE)) {
          const changeStore = db.createObjectStore(CHANGESET_STORE, {
            keyPath: 'id',
          });
          changeStore.createIndex('projectId', 'projectId', { unique: false });
          changeStore.createIndex('version', 'version', { unique: false });
          changeStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    await this.initPromise;
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  private delay<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), this.simulateLatency));
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.initDB();
      return true;
    } catch {
      return false;
    }
  }

  async uploadSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    const db = await this.initDB();
    await this.delay(undefined);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const request = store.put(snapshot);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async downloadSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
    const db = await this.initDB();
    await this.delay(undefined);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const request = store.get(projectId);
      request.onsuccess = () => resolve((request.result as ProjectSnapshot) || null);
      request.onerror = () => reject(request.error);
    });
  }

  async uploadChangeSet(changeSet: ChangeSet & { projectId: string }): Promise<void> {
    const db = await this.initDB();
    await this.delay(undefined);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHANGESET_STORE, 'readwrite');
      const store = tx.objectStore(CHANGESET_STORE);
      const request = store.put(changeSet);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async downloadChangeSets(projectId: string, fromVersion: number): Promise<ChangeSet[]> {
    const db = await this.initDB();
    await this.delay(undefined);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHANGESET_STORE, 'readonly');
      const store = tx.objectStore(CHANGESET_STORE);
      const projectIndex = store.index('projectId');
      const request = projectIndex.getAll(projectId);

      request.onsuccess = () => {
        const all = (request.result as (ChangeSet & { projectId: string })[]) || [];
        const filtered = all
          .filter((cs) => cs.version > fromVersion)
          .sort((a, b) => a.version - b.version);
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getLatestVersion(projectId: string): Promise<number> {
    const snapshot = await this.downloadSnapshot(projectId);
    return snapshot?.version ?? 0;
  }
}

export const defaultCloudProvider = new LocalIndexedDBProvider(200);

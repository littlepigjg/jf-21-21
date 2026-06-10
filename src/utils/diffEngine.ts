import type {
  Frame,
  Caption,
  CropConfig,
  ExportConfig,
  FrameChange,
  CaptionChange,
  ConfigChange,
  SerializableFrame,
  EditorState,
} from '@/types';
import { imageDataToDataURL } from '@/utils/imageUtils';
import { generateId } from '@/utils/imageUtils';

export function frameToSerializable(frame: Frame): SerializableFrame {
  return {
    id: frame.id,
    imageDataUrl: imageDataToDataURL(frame.imageData),
    delay: frame.delay,
    width: frame.width,
    height: frame.height,
    disposalMethod: frame.disposalMethod,
  };
}

export function computeChecksum(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function diffFrames(oldFrames: Frame[], newFrames: Frame[]): FrameChange[] {
  const changes: FrameChange[] = [];
  const oldIds = new Set(oldFrames.map((f) => f.id));
  const newIds = new Set(newFrames.map((f) => f.id));

  for (let i = 0; i < newFrames.length; i++) {
    const newFrame = newFrames[i];
    if (!oldIds.has(newFrame.id)) {
      changes.push({
        type: 'add',
        index: i,
        frame: frameToSerializable(newFrame),
      });
    }
  }

  for (let i = 0; i < oldFrames.length; i++) {
    const oldFrame = oldFrames[i];
    if (!newIds.has(oldFrame.id)) {
      changes.push({
        type: 'delete',
        id: oldFrame.id,
      });
    }
  }

  const oldIndexMap = new Map(oldFrames.map((f, i) => [f.id, i]));
  const newIndexMap = new Map(newFrames.map((f, i) => [f.id, i]));

  for (const newFrame of newFrames) {
    const oldIndex = oldIndexMap.get(newFrame.id);
    const newIndex = newIndexMap.get(newFrame.id);
    if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
      const alreadyMoved = changes.some(
        (c) => c.type === 'move' && (c.fromIndex === oldIndex || c.toIndex === newIndex)
      );
      if (!alreadyMoved) {
        changes.push({
          type: 'move',
          fromIndex: oldIndex,
          toIndex: newIndex,
        });
      }
    }
  }

  for (const newFrame of newFrames) {
    const oldFrame = oldFrames.find((f) => f.id === newFrame.id);
    if (oldFrame) {
      const updates: Partial<Frame> = {};
      if (oldFrame.delay !== newFrame.delay) updates.delay = newFrame.delay;
      if (oldFrame.disposalMethod !== newFrame.disposalMethod)
        updates.disposalMethod = newFrame.disposalMethod;
      if (
        oldFrame.imageData.width !== newFrame.imageData.width ||
        oldFrame.imageData.height !== newFrame.imageData.height ||
        !imageDataEquals(oldFrame.imageData, newFrame.imageData)
      ) {
        return [
          {
            type: 'update',
            id: newFrame.id,
            frame: frameToSerializable(newFrame),
          },
        ];
      }
      if (Object.keys(updates).length > 0) {
        changes.push({
          type: 'update',
          id: newFrame.id,
          updates,
        });
      }
    }
  }

  return changes;
}

function imageDataEquals(a: ImageData, b: ImageData): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.data.length !== b.data.length) return false;
  const step = Math.max(1, Math.floor(a.data.length / 1000));
  for (let i = 0; i < a.data.length; i += step) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

export function diffCaptions(oldCaptions: Caption[], newCaptions: Caption[]): CaptionChange[] {
  const changes: CaptionChange[] = [];
  const oldIds = new Set(oldCaptions.map((c) => c.id));
  const newIds = new Set(newCaptions.map((c) => c.id));

  for (const newCaption of newCaptions) {
    if (!oldIds.has(newCaption.id)) {
      changes.push({
        type: 'add',
        caption: newCaption,
      });
    }
  }

  for (const oldCaption of oldCaptions) {
    if (!newIds.has(oldCaption.id)) {
      changes.push({
        type: 'delete',
        id: oldCaption.id,
      });
    }
  }

  for (const newCaption of newCaptions) {
    const oldCaption = oldCaptions.find((c) => c.id === newCaption.id);
    if (oldCaption) {
      const updates: Partial<Caption> = {};
      (Object.keys(newCaption) as (keyof Caption)[]).forEach((key) => {
        const oldVal = oldCaption[key];
        const newVal = newCaption[key];
        if (Array.isArray(oldVal) && Array.isArray(newVal)) {
          if (oldVal.length !== newVal.length || oldVal.some((v, i) => v !== newVal[i])) {
            (updates as Record<string, unknown>)[key] = newVal;
          }
        } else if (oldVal !== newVal) {
          (updates as Record<string, unknown>)[key] = newVal;
        }
      });
      if (Object.keys(updates).length > 0) {
        changes.push({
          type: 'update',
          id: newCaption.id,
          updates,
        });
      }
    }
  }

  return changes;
}

export function diffConfig(
  oldCrop: CropConfig,
  newCrop: CropConfig,
  oldExport: ExportConfig,
  newExport: ExportConfig,
  oldCanvasWidth: number,
  newCanvasWidth: number,
  oldCanvasHeight: number,
  newCanvasHeight: number
): ConfigChange {
  const changes: ConfigChange = {};

  const cropUpdates: Partial<CropConfig> = {};
  (Object.keys(newCrop) as (keyof CropConfig)[]).forEach((key) => {
    if (oldCrop[key] !== newCrop[key]) {
      (cropUpdates as Record<string, unknown>)[key] = newCrop[key];
    }
  });
  if (Object.keys(cropUpdates).length > 0) {
    changes.crop = cropUpdates;
  }

  const exportUpdates: Partial<ExportConfig> = {};
  (Object.keys(newExport) as (keyof ExportConfig)[]).forEach((key) => {
    if (oldExport[key] !== newExport[key]) {
      (exportUpdates as Record<string, unknown>)[key] = newExport[key];
    }
  });
  if (Object.keys(exportUpdates).length > 0) {
    changes.exportConfig = exportUpdates;
  }

  if (oldCanvasWidth !== newCanvasWidth) changes.canvasWidth = newCanvasWidth;
  if (oldCanvasHeight !== newCanvasHeight) changes.canvasHeight = newCanvasHeight;

  return changes;
}

export function getEditorSnapshot(state: EditorState) {
  return {
    frames: state.frames.map((f) => f.id),
    captions: state.captions.map((c) => c.id),
    crop: state.crop,
    exportConfig: state.exportConfig,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
  };
}

export function generateChangeSetId(): string {
  return generateId() + Date.now().toString(36);
}

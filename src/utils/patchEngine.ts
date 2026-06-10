import type {
  Frame,
  Caption,
  CropConfig,
  ExportConfig,
  ChangeSet,
  SerializableFrame,
} from '@/types';
import { dataURLToImageData } from '@/utils/imageUtils';

export async function serializableFrameToFrame(
  serializable: SerializableFrame
): Promise<Frame> {
  const imageData = await dataURLToImageData(
    serializable.imageDataUrl,
    serializable.width,
    serializable.height
  );
  return {
    id: serializable.id,
    imageData,
    delay: serializable.delay,
    width: serializable.width,
    height: serializable.height,
    disposalMethod: serializable.disposalMethod,
  };
}

export async function applyFrameChanges(
  frames: Frame[],
  changeSet: ChangeSet
): Promise<Frame[]> {
  let result = [...frames];

  for (const change of changeSet.frameChanges) {
    switch (change.type) {
      case 'add':
        if (change.frame && change.index !== undefined) {
          const newFrame = await serializableFrameToFrame(change.frame);
          if (change.index >= 0 && change.index <= result.length) {
            result.splice(change.index, 0, newFrame);
          } else {
            result.push(newFrame);
          }
        }
        break;
      case 'delete':
        if (change.id) {
          result = result.filter((f) => f.id !== change.id);
        }
        break;
      case 'move':
        if (
          change.fromIndex !== undefined &&
          change.toIndex !== undefined &&
          change.fromIndex >= 0 &&
          change.fromIndex < result.length &&
          change.toIndex >= 0 &&
          change.toIndex <= result.length
        ) {
          const [removed] = result.splice(change.fromIndex, 1);
          result.splice(change.toIndex, 0, removed);
        }
        break;
      case 'update':
        if (change.id) {
          const idx = result.findIndex((f) => f.id === change.id);
          if (idx !== -1) {
            if (change.frame) {
              const updatedFrame = await serializableFrameToFrame(change.frame);
              result[idx] = updatedFrame;
            } else if (change.updates) {
              result[idx] = { ...result[idx], ...change.updates };
            }
          }
        }
        break;
    }
  }

  return result;
}

export function applyCaptionChanges(
  captions: Caption[],
  changeSet: ChangeSet
): Caption[] {
  let result = [...captions];

  for (const change of changeSet.captionChanges) {
    switch (change.type) {
      case 'add':
        if (change.caption) {
          result.push({ ...change.caption });
        }
        break;
      case 'delete':
        if (change.id) {
          result = result.filter((c) => c.id !== change.id);
        }
        break;
      case 'update':
        if (change.id && change.updates) {
          const idx = result.findIndex((c) => c.id === change.id);
          if (idx !== -1) {
            result[idx] = { ...result[idx], ...change.updates };
          }
        }
        break;
    }
  }

  return result;
}

export function applyConfigChanges(
  crop: CropConfig,
  exportConfig: ExportConfig,
  canvasWidth: number,
  canvasHeight: number,
  changeSet: ChangeSet
): {
  crop: CropConfig;
  exportConfig: ExportConfig;
  canvasWidth: number;
  canvasHeight: number;
} {
  const result = {
    crop: { ...crop },
    exportConfig: { ...exportConfig },
    canvasWidth,
    canvasHeight,
  };

  if (changeSet.configChanges.crop) {
    result.crop = { ...result.crop, ...changeSet.configChanges.crop };
  }
  if (changeSet.configChanges.exportConfig) {
    result.exportConfig = { ...result.exportConfig, ...changeSet.configChanges.exportConfig };
  }
  if (changeSet.configChanges.canvasWidth !== undefined) {
    result.canvasWidth = changeSet.configChanges.canvasWidth;
  }
  if (changeSet.configChanges.canvasHeight !== undefined) {
    result.canvasHeight = changeSet.configChanges.canvasHeight;
  }

  return result;
}

export async function applyChangeSet(
  frames: Frame[],
  captions: Caption[],
  crop: CropConfig,
  exportConfig: ExportConfig,
  canvasWidth: number,
  canvasHeight: number,
  changeSet: ChangeSet
): Promise<{
  frames: Frame[];
  captions: Caption[];
  crop: CropConfig;
  exportConfig: ExportConfig;
  canvasWidth: number;
  canvasHeight: number;
}> {
  const newFrames = await applyFrameChanges(frames, changeSet);
  const newCaptions = applyCaptionChanges(captions, changeSet);
  const configResult = applyConfigChanges(
    crop,
    exportConfig,
    canvasWidth,
    canvasHeight,
    changeSet
  );

  return {
    frames: newFrames,
    captions: newCaptions,
    ...configResult,
  };
}

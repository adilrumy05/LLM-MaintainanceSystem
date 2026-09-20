// services/photo.js
//
// Capture or pick a photo and prepare it for /api/query.
//
// Size is bounded by PIXELS, not JPEG quality: a quality setting alone does not
// cap file size, and a full-resolution phone photo is several megabytes. The
// long edge is capped at 1280 px, which keeps nameplate text readable for the
// vision model while landing well under the server's 4 MB decoded limit.
// Re-encoding also converts iPhone HEIC to JPEG.

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MAX_PHOTOS = 4;
const MAX_EDGE = 1280;
const MAX_DECODED_BYTES = 4 * 1024 * 1024;

const decodedBytes = (base64) => Math.floor((base64.length * 3) / 4);

async function encode(uri, width, height, compress) {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width || 0, height || 0) > MAX_EDGE || !width || !height) {
    context.resize((width || 0) >= (height || 0) ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  return image.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
}

async function prepare(asset) {
  let saved = await encode(asset.uri, asset.width, asset.height, 0.8);
  if (decodedBytes(saved.base64) > MAX_DECODED_BYTES) {
    saved = await encode(asset.uri, asset.width, asset.height, 0.5);
  }
  if (decodedBytes(saved.base64) > MAX_DECODED_BYTES) {
    throw new Error('That photo is too large to send. Try again from a little further away.');
  }
  return { uri: saved.uri, base64: saved.base64, width: saved.width, height: saved.height };
}

/**
 * @param {'camera'|'library'} source
 * @param {object} [options]
 * @param {number} [options.limit]  how many more photos may be added (library only)
 * @returns {Promise<Array<{ uri: string, base64: string, width: number, height: number }>>}
 *   empty when the user cancels. The camera returns one photo; the library
 *   allows picking several at once.
 * @throws Error with a message the app can show, e.g. permission denied.
 */
export async function capturePhotos(source, { limit = MAX_PHOTOS } = {}) {
  const useCamera = source === 'camera' && Platform.OS !== 'web';

  const permission = useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      useCamera
        ? 'Camera access is off. Allow it in Settings to photograph equipment.'
        : 'Photo library access is off. Allow it in Settings to choose a photo.'
    );
  }

  const options = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
  const result = useCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync({
        ...options,
        allowsMultipleSelection: limit > 1,
        selectionLimit: Math.max(1, limit),
        orderedSelection: true,
      });
  if (result.canceled || !result.assets?.length) return [];

  // One at a time: each re-encode holds a full-resolution image in memory.
  const photos = [];
  for (const asset of result.assets.slice(0, Math.max(1, limit))) {
    photos.push(await prepare(asset));
  }
  return photos;
}

import { Platform } from 'react-native';
import * as Picker from 'expo-image-picker';
import { capturePhotos } from '../services/photo';
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));
const originalOS = Platform.OS;
afterEach(() => { Platform.OS = originalOS; jest.resetAllMocks(); });
test('web cannot substitute a gallery photo for required camera evidence', async () => {
  Platform.OS = 'web';
  await expect(capturePhotos('camera', { cameraOnly: true })).rejects.toThrow('mobile app');
  expect(Picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(Picker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
});
test('required evidence rejects gallery selection on mobile', async () => {
  Platform.OS = 'android';
  await expect(capturePhotos('library', { cameraOnly: true })).rejects.toThrow('mobile app');
  expect(Picker.launchImageLibraryAsync).not.toHaveBeenCalled();
});
test('camera cancellation produces no evidence', async () => {
  Platform.OS = 'android';
  Picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  Picker.launchCameraAsync.mockResolvedValue({ canceled: true });
  await expect(capturePhotos('camera', { cameraOnly: true })).resolves.toEqual([]);
  expect(Picker.launchCameraAsync).toHaveBeenCalledTimes(1);
  expect(Picker.launchImageLibraryAsync).not.toHaveBeenCalled();
});
test('permission denial does not open a picker', async () => {
  Platform.OS = 'ios';
  Picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(capturePhotos('camera', { cameraOnly: true })).rejects.toThrow('Camera access');
  expect(Picker.launchCameraAsync).not.toHaveBeenCalled();
});

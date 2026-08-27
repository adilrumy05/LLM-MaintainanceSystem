// hooks/useVoiceRecording.js
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import { Directory, Paths } from 'expo-file-system';

// Workaround for expo-audio bug: recorder.uri after stop() can point to a
// zero-byte/broken placeholder instead of the real recording. Documented on
// Android specifically — gated to Android only, since the lookup path
// doesn't exist on iOS.
async function getActualRecordingUri(createdAt) {
  try {
    const files = new Directory(Paths.cache, 'Audio').list();
    if (!files.length) return null;
    const fileInfos = files.map((file) => file.info());
    const validFiles = fileInfos.filter((f) => f.size && f.size > 0);
    if (validFiles.length === 0) return null;

    const targetTime = createdAt.getTime();
    let closest = null;
    let minDiff = Infinity;
    for (const file of validFiles) {
      if (!file.creationTime || !file.uri) continue;
      const diff = Math.abs(file.creationTime - targetTime);
      if (diff < minDiff) {
        closest = file;
        minDiff = diff;
      }
    }
    return closest?.uri?.slice(0, -1) ?? null;
  } catch (e) {
    console.error('[useVoiceRecording] fallback lookup failed:', e);
    return null;
  }
}

export function useVoiceRecording() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [error, setError] = useState(null);
  const hasPreparedAudioMode = useRef(false);

  const ensurePermission = useCallback(async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      setPermissionGranted(granted);
      return granted;
    } catch (e) {
      setError(e.message || 'Could not request microphone permission');
      setPermissionGranted(false);
      return false;
    }
  }, []);

  const prepareAudioMode = useCallback(async () => {
    if (hasPreparedAudioMode.current) return;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      hasPreparedAudioMode.current = true;
    } catch (e) {
      setError(e.message || 'Could not configure audio mode');
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    const granted = permissionGranted ?? (await ensurePermission());
    if (!granted) {
      setError('Microphone permission denied');
      return false;
    }
    await prepareAudioMode();
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch (e) {
      setError(e.message || 'Could not start recording');
      return false;
    }
  }, [permissionGranted, ensurePermission, prepareAudioMode, recorder]);

  const stopRecording = useCallback(async () => {
    try {
      const stoppedAt = new Date();
      await recorder.stop();

      // Give the OS a moment to finish writing the file (iOS finalizes the
      // m4a container's duration metadata slightly after stop() resolves).
      await new Promise((resolve) => setTimeout(resolve, 300));

      let uri = recorder.uri || null;

      if (Platform.OS === 'android') {
        const actualUri = await getActualRecordingUri(stoppedAt);
        if (actualUri) uri = actualUri;
      }

      return uri;
    } catch (e) {
      setError(e.message || 'Could not stop recording');
      return null;
    }
  }, [recorder]);

  return {
    isRecording: recorderState.isRecording,
    durationMillis: recorderState.durationMillis || 0,
    permissionGranted,
    error,
    startRecording,
    stopRecording,
    ensurePermission,
  };
}
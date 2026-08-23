// hooks/useVoiceRecording.js
//
// Push-to-talk voice recording (Option 1 from the plan: tap mic, speak,
// tap again, get transcribed text). Uses `expo-audio` — works inside
// Expo Go, no custom dev build needed.

import { useCallback, useRef, useState } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';

export function useVoiceRecording() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100); // poll every 100ms
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
      await recorder.stop();
      return recorder.uri || null;
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
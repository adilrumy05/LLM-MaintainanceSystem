// components/MicButton.jsx
//
// Combines two triggers over the same recording hook:
//   A. Hold-to-record — press and hold, release to transcribe. Primary.
//   D. Shake-to-talk — shake to start, shake again to stop. Hands-free bonus.
//
// A shake mid-hold is ignored; hold is disabled while a shake-recording
// is active — the two triggers can't interfere with each other.

import React, { useRef, useState } from 'react';
import { TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useShakeTrigger } from '../hooks/useShakeTrigger';
import { transcribeAudio } from '../services/api';

export default function MicButton({ onTranscript, disabled, style }) {
  const { isRecording, error, startRecording, stopRecording } = useVoiceRecording();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingModeRef = useRef(null); // null | 'hold' | 'shake'

  const showError = (msg) => {
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('Voice Input', msg);
    }
  };

  const finishAndTranscribe = async () => {
    const uri = await stopRecording();
    recordingModeRef.current = null;
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(uri);
      if (text?.trim()) {
        onTranscript?.(text.trim());
      } else {
        showError('Could not hear anything — try again closer to the mic.');
      }
    } catch (e) {
      showError(e.message || 'Transcription failed. Check your connection.');
    }
    setIsTranscribing(false);
  };

  const handlePressIn = async () => {
    if (disabled || isTranscribing || isRecording) return;
    const started = await startRecording();
    if (started) {
      recordingModeRef.current = 'hold';
    } else if (error) {
      showError(error);
    }
  };

  const handlePressOut = async () => {
    if (recordingModeRef.current !== 'hold') return;
    await finishAndTranscribe();
  };

  useShakeTrigger(
    async () => {
      if (disabled || isTranscribing) return;

      if (!isRecording) {
        const started = await startRecording();
        if (started) {
          recordingModeRef.current = 'shake';
        } else if (error) {
          showError(error);
        }
        return;
      }

      if (recordingModeRef.current === 'shake') {
        await finishAndTranscribe();
      }
    },
    { enabled: !disabled && !isTranscribing }
  );

  return (
    <TouchableOpacity
      style={style}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || isTranscribing}
    >
      {isTranscribing ? (
        <ActivityIndicator size="small" color={C.primary} />
      ) : (
        <Ionicons
          name={isRecording ? 'stop-circle' : 'mic-outline'}
          size={20}
          color={isRecording ? C.red : C.primary}
        />
      )}
    </TouchableOpacity>
  );
}
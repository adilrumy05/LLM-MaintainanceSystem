// components/MicButton.jsx
//
// Tap-to-talk: tap once to start recording, tap again to stop and transcribe.
import React, { useRef, useState } from 'react';
import { TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { transcribeAudio } from '../services/api';

export default function MicButton({ onTranscript, disabled, style }) {
  const { isRecording, error, startRecording, stopRecording } = useVoiceRecording();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const isRecordingRef = useRef(false);

  const showError = (msg) => {
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('Voice Input', msg);
    }
  };

  const finishAndTranscribe = async () => {
    const uri = await stopRecording();
    isRecordingRef.current = false;
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

  const handlePress = async () => {
    if (disabled || isTranscribing) return;

    if (!isRecordingRef.current) {
      const started = await startRecording();
      if (started) {
        isRecordingRef.current = true;
      } else if (error) {
        showError(error);
      }
      return;
    }

    await finishAndTranscribe();
  };

  return (
    <TouchableOpacity
      style={style}
      onPress={handlePress}
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
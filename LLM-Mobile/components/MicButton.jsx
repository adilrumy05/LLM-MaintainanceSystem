// components/MicButton.jsx
//
// Tap-to-talk: tap once to start recording, tap again to stop and transcribe.
// Press and hold to start hands-free instead (when onHandsFree is given), so
// one button covers both ways of asking by voice.
import React, { useRef, useState } from 'react';
import { TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { C } from '../theme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { transcribeAudio } from '../services/api';

// The hold is not visible on the button, so the first tap explains it once.
export const HOLD_HINT_KEY = 'micHoldHintShown';
export const HOLD_HINT = 'Tip: press and hold the mic for hands-free.';

async function showHoldHintOnce() {
  try {
    if (await AsyncStorage.getItem(HOLD_HINT_KEY)) return;
    await AsyncStorage.setItem(HOLD_HINT_KEY, '1');
  } catch {
    return;
  }
  Toast.show({ type: 'info', text1: HOLD_HINT, text2: 'It listens, answers aloud and waits for your next question.' });
}

export default function MicButton({ onTranscript, onHandsFree, disabled, style }) {
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
        if (onHandsFree) showHoldHintOnce();
      } else if (error) {
        showError(error);
      }
      return;
    }

    await finishAndTranscribe();
  };

  // Not while dictating: the hold would leave that recording running.
  const handleLongPress = () => {
    if (!onHandsFree || disabled || isTranscribing || isRecordingRef.current) return;
    onHandsFree();
  };

  return (
    <TouchableOpacity
      style={style}
      onPress={handlePress}
      onLongPress={onHandsFree ? handleLongPress : undefined}
      delayLongPress={450}
      disabled={disabled || isTranscribing}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? 'Stop dictating' : 'Voice input'}
      accessibilityHint={onHandsFree ? 'Tap to dictate a question. Press and hold for hands-free.' : 'Tap to dictate a question.'}
      accessibilityState={{ disabled: !!(disabled || isTranscribing) }}
      accessibilityActions={onHandsFree ? [{ name: 'activate' }, { name: 'longpress', label: 'Start hands-free' }] : undefined}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? handleLongPress() : handlePress())}
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

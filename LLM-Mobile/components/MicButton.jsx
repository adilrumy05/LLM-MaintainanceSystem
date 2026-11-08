// components/MicButton.jsx
//
// The one voice button. Tapping it opens a small panel to choose dictation
// (speak, then check the text before sending) or hands-free (the app listens,
// answers aloud and waits for the next question). A one-time tip about holding
// the button was easy to miss or forget, so the choice is now shown each time.
// Holding the button still goes straight to hands-free, and while dictating a
// tap stops the recording. Without onHandsFree, a tap dictates straight away.
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, ActivityIndicator, Alert, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { transcribeAudio } from '../services/api';

export default function MicButton({ onTranscript, onHandsFree, disabled, style }) {
  const { isRecording, error, startRecording, stopRecording } = useVoiceRecording();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const isRecordingRef = useRef(false);
  const insets = useSafeAreaInsets();

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

  const startDictation = async () => {
    const started = await startRecording();
    if (started) {
      isRecordingRef.current = true;
    } else if (error) {
      showError(error);
    }
  };

  const handlePress = async () => {
    if (disabled || isTranscribing) return;
    if (isRecordingRef.current) {
      await finishAndTranscribe();
      return;
    }
    if (onHandsFree) {
      setChoosing(true);
      return;
    }
    await startDictation();
  };

  // Not while dictating: the hold would leave that recording running.
  const handleLongPress = () => {
    if (!onHandsFree || disabled || isTranscribing || isRecordingRef.current) return;
    onHandsFree();
  };

  const chooseDictation = () => {
    setChoosing(false);
    startDictation();
  };

  const chooseHandsFree = () => {
    setChoosing(false);
    onHandsFree?.();
  };

  return (
    <>
      <TouchableOpacity
        style={style}
        onPress={handlePress}
        onLongPress={onHandsFree ? handleLongPress : undefined}
        delayLongPress={450}
        disabled={disabled || isTranscribing}
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop dictating' : 'Voice input'}
        accessibilityHint={isRecording ? 'Stops recording and puts the text in the message box.'
          : onHandsFree ? 'Choose dictation or hands-free.' : 'Tap to dictate a question.'}
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

      <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
        <Pressable style={s.backdrop} onPress={() => setChoosing(false)} accessibilityLabel="Close voice options">
          <Pressable style={[s.panel, { marginBottom: insets.bottom + 84 }]} onPress={() => {}}>
            <Text style={s.title}>Ask by voice</Text>
            <TouchableOpacity style={s.option} onPress={chooseDictation} accessibilityRole="button" accessibilityLabel="Dictate">
              <View style={s.icon}><Ionicons name="mic-outline" size={20} color={C.primary} /></View>
              <View style={s.optionText}>
                <Text style={s.optionTitle}>Dictate</Text>
                <Text style={s.optionSub}>Speak, then check the text before sending. Tap the mic again to stop.</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.option} onPress={chooseHandsFree} accessibilityRole="button" accessibilityLabel="Hands-free">
              <View style={s.icon}><Ionicons name="headset-outline" size={20} color={C.primary} /></View>
              <View style={s.optionText}>
                <Text style={s.optionTitle}>Hands-free</Text>
                <Text style={s.optionSub}>Talk without touching the phone. It answers aloud and waits for your next question.</Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  panel:       { marginHorizontal: 16, padding: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, gap: 6 },
  title:       { fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 2, letterSpacing: 0.3 },
  option:      { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  icon:        { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  optionText:  { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  optionSub:   { fontSize: 12, color: C.textMuted, lineHeight: 16, marginTop: 2 },
});

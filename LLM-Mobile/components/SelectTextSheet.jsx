// Select part of an answer, then copy it or reply to it.
//
// iOS cannot select part of a <Text> (facebook/react-native#13938), but a
// read-only multiline TextInput supports drag-handle selection and reports the
// range - verified on an iPhone in Expo Go in the Sprint 5 selection spike. The
// same sheet is used on every platform so the behaviour is consistent.

import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { FEATURES } from '../constants/featureFlags';

export default function SelectTextSheet({ visible, text, onClose, onCopy, onReply }) {
  const [range, setRange] = useState({ start: 0, end: 0 });

  // A new message resets the selection.
  useEffect(() => { if (visible) setRange({ start: 0, end: 0 }); }, [visible, text]);

  const selected = range.end > range.start ? text.slice(range.start, range.end) : '';
  const hasSelection = selected.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Select text</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <Ionicons name="close-outline" size={26} color={C.text} />
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>
            {Platform.OS === 'web' ? 'Drag to select part of the answer.' : 'Long-press, then drag the handles to select part of the answer.'}
          </Text>

          <TextInput
            value={text}
            editable={false}
            multiline
            scrollEnabled
            onSelectionChange={(e) => setRange(e.nativeEvent.selection)}
            style={s.text}
            accessibilityLabel="Answer text"
          />

          <Text style={s.count} numberOfLines={2}>
            {hasSelection ? `Selected: “${selected.trim().slice(0, 80)}${selected.trim().length > 80 ? '…' : ''}”` : 'Nothing selected'}
          </Text>

          <View style={s.row}>
            <TouchableOpacity
              style={[s.btn, !hasSelection && s.btnDisabled]}
              disabled={!hasSelection}
              onPress={() => onCopy(selected)}
              accessibilityRole="button"
              accessibilityLabel="Copy selection"
              accessibilityState={{ disabled: !hasSelection }}
            >
              <Ionicons name="copy-outline" size={16} color={C.primary} />
              <Text style={s.btnText}>Copy selection</Text>
            </TouchableOpacity>
            {FEATURES.CHAT_QUOTE && (
              <TouchableOpacity
                style={[s.btn, s.btnPrimary, !hasSelection && s.btnDisabled]}
                disabled={!hasSelection}
                onPress={() => onReply(selected)}
                accessibilityRole="button"
                accessibilityLabel="Reply to selection"
                accessibilityState={{ disabled: !hasSelection }}
              >
                <Ionicons name="return-down-forward-outline" size={16} color="#fff" />
                <Text style={[s.btnText, { color: '#fff' }]}>Reply to this</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, gap: 10, maxHeight: '85%' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:       { fontSize: 17, fontWeight: '700', color: C.text },
  hint:        { fontSize: 12, color: C.textMuted },
  text:        { fontSize: 15, lineHeight: 22, color: C.text, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, padding: 12, maxHeight: 360, textAlignVertical: 'top' },
  count:       { fontSize: 12, color: C.primary, fontWeight: '600' },
  row:         { flexDirection: 'row', gap: 10 },
  btn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.primary, backgroundColor: C.card },
  btnPrimary:  { backgroundColor: C.primary },
  btnDisabled: { opacity: 0.4 },
  btnText:     { fontSize: 14, fontWeight: '700', color: C.primary },
});

// The passage the next question is about, shown above the input so the
// technician can see - and remove - what will be sent with it.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

export default function QuoteChip({ text, onRemove }) {
  if (!text) return null;
  return (
    <View style={s.chip} accessibilityLabel={`Replying to: ${text}`}>
      <View style={s.bar} />
      <View style={{ flex: 1 }}>
        <Text style={s.label}>Replying to</Text>
        <Text style={s.text} numberOfLines={2}>“{text}”</Text>
      </View>
      <TouchableOpacity onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove quote" hitSlop={10}>
        <Ionicons name="close-circle" size={20} color={C.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8, padding: 8, borderRadius: 12, backgroundColor: C.primaryLight },
  bar:   { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.primary },
  label: { fontSize: 11, fontWeight: '700', color: C.primary },
  text:  { fontSize: 12, color: C.text },
});

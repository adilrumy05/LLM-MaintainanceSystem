import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { DETAIL_OPTIONS, normaliseDetail } from '../utils/responseDetail';

export default function DetailChip({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = normaliseDetail(value);
  const label = DETAIL_OPTIONS.find(option => option.value === selected).label;
  return <>
    <TouchableOpacity style={[s.chip, disabled && s.disabled]} onPress={() => setOpen(true)} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={`Response detail: ${label}`} accessibilityState={{ disabled }}>
      <Ionicons name="options-outline" size={14} color={C.primary} />
      <Text style={s.chipText}>{label}</Text>
      <Ionicons name="chevron-down" size={12} color={C.primary} />
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.heading}>
            <Text style={s.title}>Response detail</Text>
            <TouchableOpacity onPress={() => setOpen(false)} style={s.close} accessibilityRole="button" accessibilityLabel="Close response detail">
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>Applies to your next question. Earlier answers stay as they are. This changes how much is explained, not your skill level.</Text>
          {DETAIL_OPTIONS.map(option => <TouchableOpacity key={option.value}
            style={[s.option, option.value === selected && s.selected]}
            accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.value === selected }}
            onPress={() => { onChange(option.value); setOpen(false); }}>
            <View style={s.optionText}>
              <Text style={s.label}>{option.label}</Text>
              <Text style={s.description}>{option.description}</Text>
            </View>
            <Ionicons name={option.value === selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.primary} />
          </TouchableOpacity>)}
        </View>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, borderWidth: 1, borderColor: C.primary, paddingHorizontal: 10, minHeight: 36 },
  chipText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, padding: 20, paddingBottom: 36, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { color: C.textMuted, fontSize: 13, lineHeight: 19 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, minHeight: 64 },
  selected: { backgroundColor: C.primaryLight, borderColor: C.primary },
  optionText: { flex: 1 },
  label: { fontSize: 15, color: C.text, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 18, color: C.textSub, marginTop: 4 },
});

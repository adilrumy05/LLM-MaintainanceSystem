import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

const POINTS = [
  'Animations are drawn from the manual, for step-by-step answers only.',
  'An animation may not be produced. If the manual does not give enough detail, you will be told what is missing.',
  'The drawings are schematic and not to scale. The manual is still the reference.',
  'Each animation costs a few cents and takes 10 to 30 seconds, so leave this off when you do not need it.',
];

// Off by default. The first time it is turned on, the notice below is shown
// and must be accepted; after that the chip simply switches.
export default function AnimateChip({ value, introSeen, onChange, disabled = false }) {
  const [introOpen, setIntroOpen] = useState(false);
  const press = () => {
    if (value) onChange(false);
    else if (introSeen) onChange(true);
    else setIntroOpen(true);
  };
  return <>
    <TouchableOpacity style={[s.chip, value && s.chipOn, disabled && s.disabled]} onPress={press} disabled={disabled}
      accessibilityRole="switch" accessibilityLabel="Animate step-by-step answers" accessibilityState={{ checked: !!value, disabled }}>
      <Ionicons name={value ? 'film' : 'film-outline'} size={14} color={value ? '#fff' : C.primary} />
      <Text style={[s.chipText, value && s.chipTextOn]}>{value ? 'Animate: on' : 'Animate: off'}</Text>
    </TouchableOpacity>
    <Modal visible={introOpen} transparent animationType="slide" onRequestClose={() => setIntroOpen(false)}>
      <View style={s.overlay}>
        <View style={s.sheet} accessibilityViewIsModal>
          <Text style={s.title}>Before you turn on animations</Text>
          {POINTS.map(point => <View key={point} style={s.point}>
            <Text style={s.bullet}>•</Text><Text style={s.pointText}>{point}</Text>
          </View>)}
          <View style={s.buttons}>
            <TouchableOpacity style={s.button} onPress={() => setIntroOpen(false)} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={s.buttonText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.button, s.buttonPrimary]} onPress={() => { setIntroOpen(false); onChange(true); }}
              accessibilityRole="button" accessibilityLabel="Turn on animations">
              <Text style={[s.buttonText, s.buttonTextPrimary]}>Turn on</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, borderWidth: 1, borderColor: C.primary, paddingHorizontal: 10, minHeight: 36 },
  chipOn: { backgroundColor: C.primary },
  chipText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  disabled: { opacity: 0.45 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, padding: 20, paddingBottom: 36, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  point: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 14, lineHeight: 20, color: C.primary, fontWeight: '800' },
  pointText: { flex: 1, fontSize: 14, lineHeight: 20, color: C.text },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: C.primary },
  buttonText: { fontSize: 14, fontWeight: '700', color: C.primary },
  buttonTextPrimary: { color: '#fff' },
});

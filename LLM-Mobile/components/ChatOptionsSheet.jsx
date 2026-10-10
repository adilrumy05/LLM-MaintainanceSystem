// Everything that changes how the next question is asked or answered, in one
// sheet, so the chat screen itself stays clear: animations, response detail,
// the manual filter, hands-free and reporting a problem.
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { offeredDetails, normaliseDetail } from '../utils/responseDetail';

// Always shown under the Animate switch, on or off.
export const ANIMATE_NOTE = 'Draws step-by-step answers from the manual. An animation may not be produced if the manual lacks detail. '
  + 'Drawings are schematic, not to scale. Each one costs a few cents and takes 10 to 30 seconds.';

function Row({ icon, title, subtitle, right, onPress, disabled, accessibilityRole = 'button', accessibilityLabel, accessibilityState }) {
  return <TouchableOpacity style={[s.row, disabled && s.disabled]} onPress={onPress} disabled={disabled}
    accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel || title} accessibilityState={{ disabled: !!disabled, ...accessibilityState }}>
    <View style={s.rowIcon}><Ionicons name={icon} size={18} color={C.primary} /></View>
    <View style={s.rowText}>
      <Text style={s.rowTitle}>{title}</Text>
      {!!subtitle && <Text style={s.rowSubtitle}>{subtitle}</Text>}
    </View>
    {right}
  </TouchableOpacity>;
}

const Switch = ({ on }) => <View style={[s.switch, on && s.switchOn]}><View style={[s.knob, on && s.knobOn]} /></View>;

/**
 * @param {object} props
 * @param {object|null} props.animate   { value, onChange }, or null when animations are switched off
 * @param {object|null} props.detail    { value, onChange }, or null when response detail is switched off
 * @param {boolean} props.settingsDisabled  saved settings not loaded yet, or hands-free is running
 * @param {object} props.filter         { label, onOpen, onClear }; label is null with no filter
 * @param {object} props.handsFree      { active, disabled, onToggle }
 * @param {Function} props.onReport
 */
export default function ChatOptionsSheet({ visible, onClose, animate, detail, settingsDisabled = false, filter, handsFree, onReport }) {
  const selected = detail ? normaliseDetail(detail.value) : null;
  const closeThen = action => () => { onClose(); action(); };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} onPress={onClose} accessibilityLabel="Close chat options" accessibilityRole="button" />
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.heading}>
            <Text style={s.title}>Chat options</Text>
            <TouchableOpacity onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={s.done}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.body}>
            {animate && <Row icon={animate.value ? 'film' : 'film-outline'} title="Animate step-by-step answers" subtitle={ANIMATE_NOTE}
              right={<Switch on={!!animate.value} />} onPress={() => animate.onChange(!animate.value)} disabled={settingsDisabled}
              accessibilityRole="switch" accessibilityState={{ checked: !!animate.value }} />}

            {detail && <View style={s.group}>
              <Text style={s.groupTitle}>Response detail</Text>
              <Text style={s.groupHint}>How much each answer explains. Applies to your next question, not your skill level.</Text>
              {offeredDetails().map(option => <TouchableOpacity key={option.value} style={[s.option, option.value === selected && s.optionOn, settingsDisabled && s.disabled]}
                disabled={settingsDisabled} onPress={() => detail.onChange(option.value)}
                accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.value === selected, disabled: settingsDisabled }}>
                <View style={s.rowText}>
                  <Text style={s.rowTitle}>{option.label}</Text>
                  <Text style={s.rowSubtitle}>{option.description}</Text>
                </View>
                <Ionicons name={option.value === selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={C.primary} />
              </TouchableOpacity>)}
            </View>}

            <Row icon="filter-outline" title="Manual filter" subtitle={filter.label || 'All models (no filter)'}
              accessibilityLabel="Choose manual filter" onPress={closeThen(filter.onOpen)}
              right={filter.label
                ? <TouchableOpacity onPress={filter.onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear manual filter">
                  <Ionicons name="close-circle" size={20} color={C.textMuted} />
                </TouchableOpacity>
                : <Ionicons name="chevron-forward" size={18} color={C.textMuted} />} />

            <Row icon="headset-outline" title={handsFree.active ? 'Stop hands-free' : 'Start hands-free'}
              subtitle="Ask by voice and hear the answer, without touching the phone."
              onPress={closeThen(handsFree.onToggle)} disabled={handsFree.disabled} />

            <Row icon="bug-outline" title="Report a problem" subtitle="Tell the team about a wrong answer or a fault in the app."
              onPress={closeThen(onReport)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdrop:   { flex: 1 },
  sheet:      { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingBottom: 28 },
  heading:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  title:      { fontSize: 18, fontWeight: '700', color: C.text },
  close:      { minWidth: 56, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  done:       { fontSize: 15, fontWeight: '700', color: C.primary },
  body:       { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, minHeight: 56 },
  rowIcon:    { width: 34, height: 34, borderRadius: 17, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rowText:    { flex: 1 },
  rowTitle:   { fontSize: 14, fontWeight: '700', color: C.text },
  rowSubtitle:{ fontSize: 12, lineHeight: 17, color: C.textSub, marginTop: 2 },
  disabled:   { opacity: 0.45 },
  switch:     { width: 44, height: 26, borderRadius: 13, backgroundColor: '#d1d5db', padding: 3, justifyContent: 'center' },
  switchOn:   { backgroundColor: C.primary },
  knob:       { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  knobOn:     { alignSelf: 'flex-end' },
  group:      { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, gap: 6 },
  groupTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  groupHint:  { fontSize: 12, lineHeight: 17, color: C.textSub, marginBottom: 2 },
  option:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder },
  optionOn:   { backgroundColor: C.primaryLight, borderColor: C.primary },
});

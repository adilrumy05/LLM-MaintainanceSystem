import { View, Text, StyleSheet } from 'react-native';
import ProcedureViewer from './ProcedureViewer';
import { C } from '../theme';

// Use the existing step controls so photo evidence and timers retain their
// behaviour. Navigation and completion are independent in this list.
export default function ChecklistViewer({ steps, state, onChange, onTimerComplete }) {
  const saved = state || { currentStep: 0, completedSteps: [] };
  const completed = new Set((saved.completedSteps || []).filter(index =>
    Number.isInteger(index) && index >= 0 && index < steps.length));
  const count = completed.size;
  return (
    <View>
      <Text style={s.title}>Step-by-step checklist</Text>
      <Text style={s.progress} accessibilityLiveRegion="polite">{count}/{steps.length} completed</Text>
      <View style={s.track} accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: steps.length, now: count }}>
        <View style={[s.fill, { width: `${steps.length ? count / steps.length * 100 : 0}%` }]} />
      </View>
      <Text style={s.hint}>Tick items as you go. Continue at your own pace.</Text>
      {steps.map((_, index) => (
        <View key={index} style={s.item}>
          <ProcedureViewer steps={steps} embedded
            state={{ ...saved, currentStep: index }}
            onChange={next => onChange({ ...next, currentStep: saved.currentStep || 0 })}
            onTimerComplete={onTimerComplete} />
        </View>
      ))}
      {steps.length > 0 && count === steps.length && (
        <Text style={s.progress}>All items completed</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 10 },
  progress: { fontSize: 13, fontWeight: '700', color: C.primary, marginBottom: 8 },
  track: { height: 7, borderRadius: 8, backgroundColor: '#ede9fe', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.primary, borderRadius: 8 },
  hint: { fontSize: 12, lineHeight: 18, color: C.textMuted, marginTop: 8, marginBottom: 10 },
  item: { marginBottom: 12 },
});

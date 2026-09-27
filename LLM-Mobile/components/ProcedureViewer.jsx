import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { WARNING_COLORS } from '../constants/warningColors';

export default function ProcedureViewer({ steps, state, onChange }) {
  const safeState = state || { currentStep: 0, completedSteps: [], overviewOpen: false };
  const current = Math.min(Math.max(safeState.currentStep || 0, 0), Math.max(steps.length - 1, 0));
  const completedSteps = Array.isArray(safeState.completedSteps) ? safeState.completedSteps : [];
  const step = steps[current];
  const warn = WARNING_COLORS[step.warningLevel] || WARNING_COLORS.none;
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;
  const currentCompleted = completedSteps.includes(current);
  const completedCount = completedSteps.length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const allCompleted = steps.length > 0 && completedCount === steps.length;

  const patchState = (patch) => onChange({ ...safeState, ...patch });
  const toggleCurrentStep = () => {
    const nextCompleted = currentCompleted
      ? completedSteps.filter(i => i !== current)
      : [...completedSteps, current].sort((a, b) => a - b);
    patchState({ completedSteps: nextCompleted });
  };
  const goToStep = (index) => patchState({ currentStep: index, overviewOpen: false });

  return (
    <View style={s.stepViewer}>
      <View style={s.procedureTopRow}>
        <View>
          <Text style={s.procedureEyebrow}>GUIDED PROCEDURE</Text>
          <Text style={s.procedureProgressText}>{completedCount} of {steps.length} completed</Text>
        </View>
        <View style={s.procedurePercentPill}>
          <Text style={s.procedurePercentText}>{progressPercent}%</Text>
        </View>
      </View>

      <View style={s.procedureProgressTrack}>
        <View style={[s.procedureProgressFill, { width: `${progressPercent}%` }]} />
      </View>

      {allCompleted && (
        <View style={s.procedureCompleteBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#15803d" />
          <View style={{ flex: 1 }}>
            <Text style={s.procedureCompleteTitle}>Procedure completed</Text>
            <Text style={s.procedureCompleteSub}>All {steps.length} maintenance steps have been marked complete.</Text>
          </View>
        </View>
      )}

      <View style={s.stepHeaderRow}>
        <Text style={s.stepCounter}>Step {current + 1} of {steps.length}</Text>
        {currentCompleted && (
          <View style={s.stepCompletedPill}>
            <Ionicons name="checkmark" size={12} color="#15803d" />
            <Text style={s.stepCompletedPillText}>Completed</Text>
          </View>
        )}
      </View>

      <View style={[s.stepCard, { borderColor: warn.border }]}>
        {warn.icon && (
          <View style={[s.stepWarningBanner, { backgroundColor: warn.bg }]}>
            <Ionicons name={warn.icon} size={14} color={warn.text} />
            <Text style={[s.stepWarningText, { color: warn.text }]}>
              {step.warningLevel === 'critical' ? ' CRITICAL' : ' CAUTION'}
            </Text>
          </View>
        )}
        <Text style={s.stepTitle}>{step.title}</Text>
        <Text style={s.stepDescription}>{step.description}</Text>
        {step.toolsRequired?.length > 0 && (
          <View style={s.stepToolsRow}>
            <Ionicons name="build-outline" size={13} color={C.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={s.stepToolsLabel}>Tools required</Text>
              <Text style={s.stepToolsText}>{step.toolsRequired.join(', ')}</Text>
            </View>
          </View>
        )}
        <TouchableOpacity style={[s.stepCompleteAction, currentCompleted && s.stepCompleteActionChecked]} onPress={toggleCurrentStep} activeOpacity={0.8}>
          <View style={[s.stepCheckbox, currentCompleted && s.stepCheckboxChecked]}>
            {currentCompleted && <Ionicons name="checkmark" size={15} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.stepCompleteActionTitle, currentCompleted && s.stepCompleteActionTitleChecked]}>
              {currentCompleted ? 'Step completed' : step.warningLevel === 'critical' ? 'I confirm this critical step is complete' : 'Mark this step as complete'}
            </Text>
            {!currentCompleted && <Text style={s.stepCompleteActionSub}>Confirm after you have performed this instruction.</Text>}
          </View>
        </TouchableOpacity>
      </View>

      <View style={s.stepNavRow}>
        <TouchableOpacity style={[s.stepNavBtn, isFirst && s.stepNavBtnDisabled]} onPress={() => patchState({ currentStep: Math.max(0, current - 1) })} disabled={isFirst}>
          <Ionicons name="chevron-back-outline" size={16} color={isFirst ? C.textMuted : C.primary} />
          <Text style={[s.stepNavText, isFirst && { color: C.textMuted }]}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.stepNavBtn, (!currentCompleted || isLast) && s.stepNavBtnDisabled]} onPress={() => patchState({ currentStep: Math.min(steps.length - 1, current + 1) })} disabled={!currentCompleted || isLast}>
          <Text style={[s.stepNavText, (!currentCompleted || isLast) && { color: C.textMuted }]}>{isLast ? 'Final Step' : 'Next'}</Text>
          {!isLast && <Ionicons name="chevron-forward-outline" size={16} color={!currentCompleted ? C.textMuted : C.primary} />}
        </TouchableOpacity>
      </View>

      {!currentCompleted && !isLast && (
        <View style={s.nextHintRow}>
          <Ionicons name="information-circle-outline" size={13} color={C.textMuted} />
          <Text style={s.nextHintText}>Complete the current step to continue.</Text>
        </View>
      )}

      <TouchableOpacity style={s.overviewToggle} onPress={() => patchState({ overviewOpen: !safeState.overviewOpen })} activeOpacity={0.8}>
        <View style={s.overviewToggleLeft}>
          <Ionicons name="list-outline" size={15} color={C.primary} />
          <Text style={s.overviewToggleText}>View all steps</Text>
        </View>
        <View style={s.overviewToggleRight}>
          <Text style={s.overviewCountText}>{completedCount}/{steps.length}</Text>
          <Ionicons name={safeState.overviewOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={15} color={C.textMuted} />
        </View>
      </TouchableOpacity>

      {safeState.overviewOpen && (
        <View style={s.overviewList}>
          {steps.map((overviewStep, index) => {
            const done = completedSteps.includes(index);
            const active = index === current;
            return (
              <TouchableOpacity key={index} style={[s.overviewItem, active && s.overviewItemActive, index === steps.length - 1 && { borderBottomWidth: 0 }]} onPress={() => goToStep(index)} activeOpacity={0.75}>
                <View style={[s.overviewStatusIcon, done && s.overviewStatusIconDone]}>
                  {done ? <Ionicons name="checkmark" size={12} color="#fff" /> : <Text style={s.overviewStatusNumber}>{index + 1}</Text>}
                </View>
                <Text style={[s.overviewItemTitle, done && s.overviewItemTitleDone, active && { color: C.primary }]} numberOfLines={2}>{overviewStep.title}</Text>
                {active && <Text style={s.overviewCurrentLabel}>CURRENT</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  stepViewer:               { marginTop: 2 },
  procedureTopRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  procedureEyebrow:         { fontSize: 9, fontWeight: '800', letterSpacing: 0.9, color: '#7c3aed', marginBottom: 2 },
  procedureProgressText:    { fontSize: 12, fontWeight: '700' },
  procedurePercentPill:     { minWidth: 46, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#ede9fe', alignItems: 'center' },
  procedurePercentText:     { fontSize: 11, fontWeight: '800', color: '#7c3aed' },
  procedureProgressTrack:   { height: 7, borderRadius: 999, backgroundColor: '#ede9fe', overflow: 'hidden', marginBottom: 14 },
  procedureProgressFill:    { height: '100%', borderRadius: 999, backgroundColor: '#7c3aed' },
  procedureCompleteBanner:  { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, padding: 10, marginBottom: 12 },
  procedureCompleteTitle:   { fontSize: 12, fontWeight: '800', color: '#166534' },
  procedureCompleteSub:     { fontSize: 10, lineHeight: 14, color: '#15803d', marginTop: 1 },
  stepHeaderRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  stepCounter:              { fontSize: 11, color: '#6b7280', fontWeight: '700' },
  stepCompletedPill:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#f0fdf4' },
  stepCompletedPillText:    { fontSize: 9, fontWeight: '800', color: '#15803d' },
  stepCard:                 { borderWidth: 1, borderRadius: 14, padding: 13, backgroundColor: '#fff' },
  stepWarningBanner:        { flexDirection: 'row', alignItems: 'center', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 9, alignSelf: 'flex-start' },
  stepWarningText:          { fontSize: 10, fontWeight: '800' },
  stepTitle:                { fontSize: 15, fontWeight: '800', marginBottom: 7 },
  stepDescription:          { fontSize: 13, lineHeight: 19 },
  stepToolsRow:             { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: '#e5e7eb' },
  stepToolsLabel:           { fontSize: 9, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  stepToolsText:            { fontSize: 11, lineHeight: 16 },
  stepCompleteAction:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13, padding: 11, borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 11, backgroundColor: '#faf9ff' },
  stepCompleteActionChecked:{ borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  stepCheckbox:             { width: 23, height: 23, borderRadius: 7, borderWidth: 2, borderColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepCheckboxChecked:      { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  stepCompleteActionTitle:  { fontSize: 11, fontWeight: '800' },
  stepCompleteActionTitleChecked: { color: '#166534' },
  stepCompleteActionSub:    { fontSize: 9, lineHeight: 13, color: '#6b7280', marginTop: 2 },
  stepNavRow:               { flexDirection: 'row', justifyContent: 'space-between', marginTop: 11, gap: 8 },
  stepNavBtn:               { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#7c3aed', borderRadius: 10, paddingVertical: 8 },
  stepNavBtnDisabled:       { borderColor: '#e5e7eb', backgroundColor: '#fafafa', opacity: 0.65 },
  stepNavText:              { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  nextHintRow:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 7 },
  nextHintText:             { fontSize: 9, color: '#6b7280' },
  overviewToggle:           { marginTop: 13, paddingVertical: 10, paddingHorizontal: 2, borderTopWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overviewToggleLeft:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overviewToggleRight:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  overviewToggleText:       { fontSize: 11, fontWeight: '800', color: '#7c3aed' },
  overviewCountText:        { fontSize: 10, fontWeight: '700', color: '#6b7280' },
  overviewList:             { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 11, overflow: 'hidden' },
  overviewItem:             { minHeight: 47, paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  overviewItemActive:       { backgroundColor: '#ede9fe' },
  overviewStatusIcon:       { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  overviewStatusIconDone:   { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  overviewStatusNumber:     { fontSize: 9, fontWeight: '800', color: '#6b7280' },
  overviewItemTitle:        { flex: 1, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  overviewItemTitleDone:    { color: '#6b7280' },
  overviewCurrentLabel:     { fontSize: 8, fontWeight: '900', letterSpacing: 0.5, color: '#7c3aed' },
});
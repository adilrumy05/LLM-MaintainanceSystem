import { View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { markdownStyles, makeMarkdownRules } from '../constants/markdownConfig';
import ProcedureViewer from './ProcedureViewer';
import SourceItem from './SourceItem';
import ProcedureTimer from './ProcedureTimer';
import { StyleSheet } from 'react-native';
import { C } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native';

export default function BotMessage({ item, updateMessage, onTimerComplete }) {
  const hasSteps  = item.isProcedural && item.steps?.length > 0;
  const viewMode  = hasSteps ? (item.procedureView || 'procedure') : 'text';
  const procedureState = item.procedureState || { currentStep: 0, completedSteps: [], overviewOpen: false };
  const markdownRules  = makeMarkdownRules(s.tableScroll);

  const setViewMode = (nextView) =>
    updateMessage(item.id, m => ({ ...m, procedureView: nextView }));

  const setProcedureState = (nextState) =>
    updateMessage(item.id, m => ({ ...m, procedureState: nextState }));

  return (
    <View style={s.bubbleBot}>
      {hasSteps && (
        <View style={s.viewToggleRow}>
          <View style={[s.viewToggleBtn, viewMode === 'procedure' && s.viewToggleBtnActive]}>
            <Ionicons name="navigate-circle-outline" size={14} color={viewMode === 'procedure' ? C.primary : C.textMuted} />
            <Text style={[s.viewToggleText, viewMode === 'procedure' && s.viewToggleTextActive]} onPress={() => setViewMode('procedure')}>Procedure</Text>
          </View>
          <View style={[s.viewToggleBtn, viewMode === 'text' && s.viewToggleBtnActive]}>
            <Ionicons name="document-text-outline" size={13} color={viewMode === 'text' ? C.primary : C.textMuted} />
            <Text style={[s.viewToggleText, viewMode === 'text' && s.viewToggleTextActive]} onPress={() => setViewMode('text')}>Full Text</Text>
          </View>
        </View>
      )}

      {hasSteps && viewMode === 'procedure'
        ? <ProcedureViewer steps={item.steps} state={procedureState} onChange={setProcedureState} />
        : <Markdown style={markdownStyles} rules={markdownRules} mergeStyle>{item.text}</Markdown>
      }

      {/* Timers sit outside the Procedure/Full Text toggle: a mandated wait
          applies to the job regardless of how the answer is being read. */}
      {item.timers?.length > 0 && (
        <View style={s.timersBox}>
          {item.timers.map((t) => (
            <ProcedureTimer key={t.id} timer={t} onComplete={onTimerComplete} />
          ))}
        </View>
      )}

      {item.sources?.length > 0 && (
        <View style={s.sourcesBox}>
          <View style={s.sourcesLabelRow}>
            <Ionicons name="attach-outline" size={10} color="#7c3aed" />
            <Text style={s.sourcesLabel}> SOURCES</Text>
          </View>
          {item.sources.map((src, i) => <SourceItem key={i} source={src} />)}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bubbleBot:        { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, maxWidth: '88%' },
  timersBox:        { marginTop: 4 },
  sourcesBox:       { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: '#ddd6fe' },
  sourcesLabelRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sourcesLabel:     { fontSize: 9, fontWeight: '700', color: '#7c3aed', letterSpacing: 1 },
  tableScroll:      { marginVertical: 8 },
  viewToggleRow:    { flexDirection: 'row', gap: 6, marginBottom: 12, padding: 3, borderRadius: 10, backgroundColor: C.bg },
  viewToggleBtn:    { flex: 1, minHeight: 31, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  viewToggleBtnActive: { backgroundColor: C.card, borderWidth: 1, borderColor: '#ddd6fe' },
  viewToggleText:   { fontSize: 11, color: C.textMuted, fontWeight: '700' },
  viewToggleTextActive: { color: C.primary, fontWeight: '800' },
});
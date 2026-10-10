import { View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { markdownStyles, makeMarkdownRules } from '../constants/markdownConfig';
import ProcedureViewer from './ProcedureViewer';
import SourceItem from './SourceItem';
import ProcedureTimer from './ProcedureTimer';
import { StyleSheet } from 'react-native';
import { C } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity } from 'react-native';
import { actionLabel } from '../utils/chatActions';
import { FEATURES } from '../constants/featureFlags';
import { answerView, answerViews, displayedAnswerText, detailFallbackMessage, answerDetailLabel } from '../utils/responseDetail';

const ACTION_ICONS = { retake: 'camera-outline', add_photo: 'add-circle-outline', retry: 'refresh-outline' };

// Replies that need the technician ("which model?", retake, retry) carry
// `actions`. They must stay visible: without them a photo that needs model
// confirmation leaves the conversation with no way forward.
export default function BotMessage({ item, updateMessage, onAction, actionsDisabled = false, onCopy, onSelectText, onTimerComplete }) {
  const hasSteps  = item.isProcedural && item.steps?.length > 0;
  const viewMode = answerView(item, FEATURES.EFFORT_LEVELS);
  const views = answerViews(item, FEATURES.EFFORT_LEVELS);
  const detailLabel = answerDetailLabel(item, FEATURES.EFFORT_LEVELS);
  const procedureState = item.procedureState || { currentStep: 0, completedSteps: [], overviewOpen: false };
  const markdownRules  = makeMarkdownRules(s.tableScroll);

  const setViewMode = (nextView) =>
    updateMessage(item.id, m => ({ ...m, procedureView: nextView }));

  const setProcedureState = (nextState) =>
    updateMessage(item.id, m => ({ ...m, procedureState: nextState }));

  // Timers belong ON the step that mandates the wait, so in procedure view the
  // step cards own them. The loose box below is kept for Full Text, and as a
  // fallback for the case where the answer carried a marker but the extractor
  // failed to attach it to any step — losing the timer entirely would be worse
  // than showing it detached.
  const stepsOwnTimers = hasSteps && item.steps.some(
    st => (Number(st.timerSeconds ?? st.timer_seconds) || 0) > 0
  );
  const showLooseTimers =
    item.timers?.length > 0 && !(viewMode === 'procedure' && stepsOwnTimers);

  return (
    <View style={[s.bubbleBot, (views.length > 1 || item.sources?.length > 0) && s.bubbleBotWide]}>
      {detailLabel && <Text style={s.detailLabel}>{detailLabel}</Text>}
      {views.length > 1 && (
        <View style={s.viewToggleRow}>
          {views.map(view => (
            <TouchableOpacity key={view.value} style={[s.viewToggleBtn, viewMode === view.value && s.viewToggleBtnActive]}
              onPress={() => setViewMode(view.value)} accessibilityRole="button"
              accessibilityLabel={`Show ${view.label.toLowerCase()} answer`} accessibilityState={{ selected: viewMode === view.value }}>
              <Text style={[s.viewToggleText, viewMode === view.value && s.viewToggleTextActive]}>{view.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {FEATURES.EFFORT_LEVELS && item.detailFallback && (
        <Text style={s.fallbackNote}>{detailFallbackMessage(item.detailFallback)}</Text>
      )}

      {hasSteps && viewMode === 'procedure'
        ? <ProcedureViewer
            steps={item.steps}
            state={procedureState}
            onChange={setProcedureState}
            onTimerComplete={onTimerComplete}
          />
        : <Markdown style={markdownStyles} rules={markdownRules} mergeStyle>{viewMode === 'full' ? item.fullText : item.text}</Markdown>
      }

      {/* Full Text has no step cards to host a countdown, so the timers are
          listed here instead. */}
      {showLooseTimers && (
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

      {(onCopy || onSelectText) && !!item.text?.trim() && (
        <View style={s.toolRow}>
          {onCopy && (
            <TouchableOpacity style={s.toolBtn} onPress={() => onCopy(viewMode === 'full' ? { ...item, text: item.fullText } : item)} accessibilityRole="button" accessibilityLabel="Copy answer" hitSlop={6}>
              <Ionicons name="copy-outline" size={14} color={C.textMuted} />
              <Text style={s.toolText}>Copy</Text>
            </TouchableOpacity>
          )}
          {onSelectText && (
            <TouchableOpacity style={s.toolBtn} onPress={() => onSelectText(item, displayedAnswerText(item, FEATURES.EFFORT_LEVELS))} accessibilityRole="button" accessibilityLabel="Select text to copy or reply to" hitSlop={6}>
              <Ionicons name="text-outline" size={14} color={C.textMuted} />
              <Text style={s.toolText}>Select text</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {onAction && item.actions?.length > 0 && !item.actionsUsed && (
        <View style={s.actionsRow}>
          {item.actions.map((a, i) => {
            const isChoice = a.type === 'confirm_model' || a.type === 'use_photo_model';
            return (
              <TouchableOpacity
                key={i}
                style={[s.actionChip, !isChoice && s.actionChipAlt, actionsDisabled && s.actionChipDisabled]}
                onPress={() => onAction(a)}
                disabled={actionsDisabled}
                accessibilityRole="button"
                accessibilityLabel={actionLabel(a)}
                accessibilityState={{ disabled: actionsDisabled }}
              >
                {ACTION_ICONS[a.type] && <Ionicons name={ACTION_ICONS[a.type]} size={13} color={C.primary} />}
                <Text style={s.actionChipText}>{actionLabel(a)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  detailLabel:      { color: C.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  bubbleBot:        { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, maxWidth: '88%' },
  timersBox:        { marginTop: 4 },
  sourcesBox:       { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: '#ddd6fe' },
  sourcesLabelRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sourcesLabel:     { fontSize: 9, fontWeight: '700', color: '#7c3aed', letterSpacing: 1 },
  // A manual answer takes the full bubble width. Left to size itself, a bubble
  // holding only a bulleted list collapses to a narrow column.
  bubbleBotWide:    { width: '88%' },
  tableScroll:      { marginVertical: 8 },
  viewToggleRow:    { flexDirection: 'row', gap: 6, marginBottom: 12, padding: 3, borderRadius: 10, backgroundColor: C.bg },
  viewToggleBtn:    { flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  viewToggleBtnActive: { backgroundColor: C.card, borderWidth: 1, borderColor: '#ddd6fe' },
  viewToggleText:   { fontSize: 11, color: C.textMuted, fontWeight: '700' },
  viewToggleTextActive: { color: C.primary, fontWeight: '800' },
  toolRow:          { flexDirection: 'row', gap: 14, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: C.cardBorder },
  toolBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  toolText:         { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  fallbackNote:     { color: C.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  actionsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  actionChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: C.primaryLight, borderWidth: 1, borderColor: '#ddd6fe' },
  actionChipAlt:    { backgroundColor: C.card },
  actionChipDisabled: { opacity: 0.5 },
  actionChipText:   { color: C.primary, fontSize: 12, fontWeight: '700' },
});

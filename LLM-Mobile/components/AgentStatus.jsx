import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../app/theme';

const AGENTS = [
  { name: 'Data Retrieval Agent',    status: 'Searching manuals…',  icon: '📚', color: C.blue   },
  { name: 'Safety Validation Agent', status: 'Checking protocols…', icon: '🛡', color: C.green  },
  { name: 'Recommendation Agent',    status: 'Generating plan…',    icon: '🧠', color: C.primary },
];

export default function AgentStatus() {
  const [currentStep, setCurrentStep] = useState(0);
  const [pct, setPct]                 = useState(18);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setCurrentStep(prev => (prev < AGENTS.length ? prev + 1 : prev));
    }, 1600);
    const pctTimer = setInterval(() => {
      setPct(prev => Math.min(prev + Math.random() * 8, 92));
    }, 400);
    return () => { clearInterval(stepTimer); clearInterval(pctTimer); };
  }, []);

  const getState = (idx) => {
    if (idx < currentStep)  return 'done';
    if (idx === currentStep) return 'active';
    return 'queued';
  };

  const stateBadgeStyle = (state) => ({
    done:   { bg: C.greenBg,    text: C.green   },
    active: { bg: C.blueBg,     text: C.blue    },
    queued: { bg: C.primaryLight, text: C.textMuted },
  }[state]);

  return (
    <View style={s.container}>
      <Text style={s.header}>Multi-Agent Collaboration Pipeline</Text>

      {AGENTS.map((agent, idx) => {
        const state = getState(idx);
        const badge = stateBadgeStyle(state);
        const isDone   = state === 'done';
        const isActive = state === 'active';

        return (
          <View key={agent.name} style={[
            s.agentRow,
            isActive && s.agentRowActive,
            isDone   && s.agentRowDone,
          ]}>
            {/* Icon */}
            <View style={[s.iconBox, {
              backgroundColor: isDone   ? C.greenBg :
                               isActive ? C.blueBg  : C.primaryLight,
            }]}>
              <Text style={{ fontSize: 16 }}>{agent.icon}</Text>
            </View>

            {/* Info */}
            <View style={s.agentInfo}>
              <Text style={s.agentName}>{agent.name}</Text>
              <Text style={[s.agentStatus, {
                color: isDone   ? C.green    :
                       isActive ? C.blue     : C.textMuted,
              }]}>
                {isDone   && '✓ Complete'}
                {isActive && agent.status}
                {state === 'queued' && 'Awaiting previous agent…'}
              </Text>
            </View>

            {/* Badge */}
            <View style={[s.badge, { backgroundColor: badge.bg }]}>
              <Text style={[s.badgeText, { color: badge.text }]}>
                {isDone ? 'Done' : isActive ? 'Active' : 'Queued'}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Progress bar */}
      <View style={s.progressWrap}>
        <View style={s.progressLabel}>
          <Text style={s.progressText}>Processing query…</Text>
          <Text style={s.progressText}>{Math.round(pct)}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>
      </View>
      <Text style={s.hint}>Estimated response: 1–2 min · Please do not navigate away</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.cardBorder, elevation: 2 },
  header:          { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 14, letterSpacing: 0.3 },
  agentRow:        { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8, backgroundColor: C.bg, borderWidth: 1, borderColor: C.cardBorder },
  agentRowActive:  { borderColor: C.blue, backgroundColor: C.blueBg },
  agentRowDone:    { borderColor: '#bbf7d0', backgroundColor: C.greenBg },
  iconBox:         { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  agentInfo:       { flex: 1 },
  agentName:       { color: C.text, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  agentStatus:     { fontSize: 11 },
  badge:           { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:       { fontSize: 10, fontWeight: '700' },
  progressWrap:    { marginTop: 14 },
  progressLabel:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressText:    { color: C.textSub, fontSize: 11 },
  progressTrack:   { height: 6, backgroundColor: C.primaryLight, borderRadius: 4 },
  progressFill:    { height: 6, backgroundColor: C.primary, borderRadius: 4 },
  hint:            { color: C.textMuted, fontSize: 10, textAlign: 'center', marginTop: 8 },
});
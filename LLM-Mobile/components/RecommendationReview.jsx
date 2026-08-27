import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../app/theme';

const STEPS = [
  {
    title: 'Power-down & Lockout/Tagout',
    desc: 'Isolate Unit #403 from power. Apply LOTO tags per OSHA 29 CFR 1910.147.',
    simplDesc: 'Turn off and lock out the machine so it cannot start. Put a tag on it.',
    tag: 'CRITICAL SAFETY', tagColor: C.red, tagBg: C.redBg, difficulty: 'high',
  },
  {
    title: 'Positioning & Support',
    desc: 'Position maintenance platform. Secure engine on support cradle.',
    simplDesc: 'Set up the work platform and make sure the engine is held steady.',
    tag: 'STANDARD', tagColor: C.textMuted, tagBg: C.bg, difficulty: 'low',
  },
  {
    title: 'Panel Fastener Removal',
    desc: 'Remove 12× M8 hex bolts (torque: 25 Nm). Store in labelled tray.',
    simplDesc: 'Remove the 12 bolts holding the panel. Keep them in a labelled tray.',
    tag: null, difficulty: 'medium',
  },
  {
    title: 'Cover Lift-off & Inspection',
    desc: 'Lift cover with 2-person assist. Inspect seals and gaskets for wear.',
    simplDesc: 'Lift the cover with another person helping. Look for any damaged seals.',
    tag: null, difficulty: 'medium',
  },
];

const DIFFICULTY = {
  high:   { label: 'High difficulty',   color: C.red,    bg: C.redBg    },
  medium: { label: 'Medium difficulty', color: '#d97706', bg: '#fef3c7' },
  low:    { label: 'Low difficulty',    color: C.green,  bg: C.greenBg  },
};

const ROLE_COLORS = {
  admin:        C.primary,
  expert:       C.blue,
  intermediate: C.green,
  beginner:     C.orange,
};

export default function RecommendationReview({ recommendation, onApprove, onReject, role = 'expert' }) {
  const [showReasoning, setShowReasoning] = useState(false);
  if (!recommendation || !recommendation.sources) return null;

  const isAdmin         = role === 'admin';
  const isExpert        = role === 'expert';
  const isJunior        = role === 'beginner';
  const isIntermediate  = role === 'intermediate';
  const needsGuidance   = isJunior || isIntermediate;
  const canApprove      = !isJunior;
  const canSeeReasoning = isAdmin || isExpert;
  const roleColor       = ROLE_COLORS[role] || C.primary;

  if (!recommendation || !recommendation.sources) return null;
  return (
    <View style={s.container}>

      {/* Role pill */}
      <View style={s.roleRow}>
        <View style={[s.rolePill, { borderColor: roleColor }]}>
          <Text style={[s.rolePillText, { color: roleColor }]}>{role} view</Text>
        </View>
      </View>

      {/* AI badge */}
      <View style={s.aiBadge}>
        <Ionicons name="sparkles-outline" size={16} color={C.primaryText} style={{ marginRight: 8 }} />
        <Text style={s.aiBadgeText}>AI recommendation generated · Review all steps before deciding</Text>
      </View>

      {/* Beginner banner */}
      {isJunior && (
        <View style={[s.banner, { borderColor: C.blue, backgroundColor: C.blueBg, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }]}>
          <Ionicons name="bulb-outline" size={14} color={C.blue} style={{ marginTop: 1 }} />
          <Text style={[s.bannerText, { color: C.blue, flex: 1 }]}>
            <Text style={{ fontWeight: '700' }}>Beginner tip:</Text> Read every step carefully before touching anything. If unsure, stop and contact a senior technician.
          </Text>
        </View>
      )}

      {/* Intermediate banner */}
      {isIntermediate && (
        <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fef9c3', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }]}>
          <Ionicons name="warning-outline" size={14} color="#d97706" style={{ marginTop: 1 }} />
          <Text style={[s.bannerText, { color: '#d97706', flex: 1 }]}>
            <Text style={{ fontWeight: '700' }}>Safety reminder:</Text> Verify LOTO is applied before proceeding. Consult an Expert for any HIGH difficulty steps.
          </Text>
        </View>
      )}

      {/* Steps */}
      <Text style={s.sectionLabel}>DISASSEMBLY PROCEDURE</Text>
      {STEPS.map((step, i) => (
        <View key={i} style={s.stepRow}>
          <View style={s.stepNum}>
            <Text style={s.stepNumText}>{i + 1}</Text>
          </View>
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{step.title}</Text>
            <Text style={s.stepDesc}>{isJunior ? step.simplDesc : step.desc}</Text>
            <View style={s.tagRow}>
              {step.tag && (
                <View style={[s.tag, { backgroundColor: step.tagBg, borderColor: step.tagColor }]}>
                  {step.tagColor === C.red && (
                    <Ionicons name="warning-outline" size={11} color={step.tagColor} style={{ marginRight: 3 }} />
                  )}
                  <Text style={[s.tagText, { color: step.tagColor }]}>{step.tag}</Text>
                </View>
              )}
              {needsGuidance && (
                <View style={[s.tag, { backgroundColor: DIFFICULTY[step.difficulty].bg }]}>
                  <Text style={[s.tagText, { color: DIFFICULTY[step.difficulty].color }]}>
                    {DIFFICULTY[step.difficulty].label}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ))}

      <View style={s.divider} />

      {/* Sources */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <Ionicons name="attach-outline" size={11} color={C.textMuted} />
        <Text style={[s.sectionLabel, { marginBottom: 0 }]}>SOURCE CITATIONS</Text>
      </View>
      {recommendation.sources.map((src, i) => (
        <View key={i} style={s.citationCard}>
          <Text style={s.citationTitle}>{src.title}</Text>
          <Text style={s.citationMeta}>Page {src.page}, Section {src.section}</Text>
          <Text style={s.citationLink}>View Source Document →</Text>
        </View>
      ))}

      {/* Reasoning — admin and expert only */}
      {canSeeReasoning && (
        <>
          <View style={s.divider} />
          <View style={s.reasoningHeader}>
            <Text style={s.sectionLabel}>AGENT REASONING PATH</Text>
            <TouchableOpacity onPress={() => setShowReasoning(!showReasoning)}>
              <Text style={s.expandBtn}>{showReasoning ? 'Collapse ↑' : 'Expand ↓'}</Text>
            </TouchableOpacity>
          </View>
          {showReasoning && (
            <View style={s.reasoningBox}>
              {[
                ['library-outline', 'Data Retrieval Agent',      'Found procedure 5.2 · 3 relevant documents'],
                ['shield-checkmark-outline', 'Safety Validation Agent',   'LOTO required · OSHA compliant · Verified'],
                ['stats-chart-outline', 'Priority Adjustment Agent', 'Task classified HIGH · Overdue 2 days'],
              ].map(([icon, name, detail]) => (
                <View key={name} style={s.reasoningItem}>
                  <Ionicons name={icon} size={14} color={C.textSub} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.reasoningName}>{name}</Text>
                    <Text style={s.reasoningDetail}>{detail}</Text>
                  </View>
                  <View style={s.verifiedBadge}>
                    <Ionicons name="checkmark-outline" size={10} color={C.green} style={{ marginRight: 2 }} />
                    <Text style={s.verifiedText}>Verified</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <View style={s.divider} />

      {/* HITL Buttons */}
      {canApprove ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
            <Ionicons name="people-outline" size={11} color={C.textMuted} />
            <Text style={[s.sectionLabel, { marginBottom: 0 }]}>HUMAN-IN-THE-LOOP DECISION</Text>
          </View>
          <TouchableOpacity style={[s.approveBtn, s.btnRow]} onPress={onApprove}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.approveBtnText}>Approve & Log</Text>
          </TouchableOpacity>
          {(isAdmin || isExpert) && (
            <TouchableOpacity style={[s.revisionBtn, s.btnRow]}>
              <Ionicons name="create-outline" size={16} color="#d97706" style={{ marginRight: 6 }} />
              <Text style={s.revisionBtnText}>Request Revision</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.rejectBtn, s.btnRow]} onPress={onReject}>
            <Ionicons name="close-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.rejectBtnText}>Override / Reject</Text>
          </TouchableOpacity>
          <View style={[s.auditNotice, s.btnRow]}>
            <Ionicons name="lock-closed-outline" size={12} color={C.primaryText} style={{ marginRight: 6 }} />
            <Text style={s.auditText}>This action will be recorded in the audit trail</Text>
          </View>
        </View>
      ) : (
        <View style={s.lockedBox}>
          <Ionicons name="lock-closed-outline" size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
          <Text style={s.lockedTitle}>Approval not available at your access level</Text>
          <Text style={s.lockedSub}>Share this recommendation with an Intermediate Technician or above to approve.</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:       { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.cardBorder, elevation: 2 },
  roleRow:         { alignItems: 'flex-end', marginBottom: 10 },
  rolePill:        { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  rolePillText:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  aiBadge:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, borderRadius: 10, padding: 10, marginBottom: 14 },
  aiBadgeText:     { color: C.primaryText, fontSize: 12, fontWeight: '600', flex: 1 },
  banner:          { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  bannerText:      { fontSize: 12, lineHeight: 18 },
  sectionLabel:    { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  stepRow:         { flexDirection: 'row', marginBottom: 12 },
  stepNum:         { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2 },
  stepNumText:     { color: C.primaryText, fontSize: 12, fontWeight: '700' },
  stepContent:     { flex: 1 },
  stepTitle:       { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  stepDesc:        { color: C.textSub, fontSize: 12, lineHeight: 18 },
  tagRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag:             { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  tagText:         { fontSize: 10, fontWeight: '700' },
  divider:         { height: 1, backgroundColor: C.cardBorder, marginVertical: 14 },
  citationCard:    { backgroundColor: C.inputBg, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder },
  citationTitle:   { color: C.text, fontSize: 12, fontWeight: '700' },
  citationMeta:    { color: C.textMuted, fontSize: 11, marginTop: 2 },
  citationLink:    { color: C.primary, fontSize: 11, marginTop: 4, fontWeight: '600' },
  reasoningHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  expandBtn:       { color: C.blue, fontSize: 11, fontWeight: '700' },
  reasoningBox:    { backgroundColor: C.inputBg, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.cardBorder },
  reasoningItem:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  reasoningName:   { color: C.text, fontSize: 12, fontWeight: '700' },
  reasoningDetail: { color: C.textSub, fontSize: 11, marginTop: 2 },
  verifiedBadge:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenBg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  verifiedText:    { color: C.green, fontSize: 10, fontWeight: '700' },
  btnRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  approveBtn:      { backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  approveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  revisionBtn:     { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  revisionBtnText: { color: '#d97706', fontWeight: '700', fontSize: 14 },
  rejectBtn:       { backgroundColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  rejectBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  auditNotice:     { backgroundColor: C.primaryLight, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 4 },
  auditText:       { color: C.primaryText, fontSize: 11, fontWeight: '600' },
  lockedBox:       { backgroundColor: C.inputBg, borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.cardBorder },
  lockedTitle:     { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  lockedSub:       { color: C.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
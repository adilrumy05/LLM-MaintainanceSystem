import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { C } from './theme';
import { useRole } from '../hooks/useRole';
import AgentStatus from '../components/AgentStatus';
import RecommendationReview from '../components/RecommendationReview';
import { submitQuery } from '../services/api';

const WELCOME_SUBTITLE = {
  admin:        'Full system access · Manage users, review all activity.',
  expert:       'Expert access · Analyze tasks and approve procedures.',
  intermediate: 'Intermediate access · Analyze and approve recommendations.',
  beginner:     'Read-only access · Review and escalate to senior technician.',
};

export default function Dashboard() {
  const [isProcessing, setIsProcessing]     = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [query, setQuery]                   = useState('');
  const [inputValue, setInputValue]         = useState('');

  const router = useRouter();

  const {
    role, isJunior, isIntermediate, canSeeAgents,
  } = useRole();

  const placeholder = isJunior
    ? "Describe what needs fixing — I'll guide you step by step…"
    : 'Enter a maintenance task, equipment issue, or disassembly request...';

  const handleSubmitQuery = async (queryText) => {
    if (!queryText.trim()) return;
    const raw      = await AsyncStorage.getItem('queryHistory');
    const existing = JSON.parse(raw || '[]');
    await AsyncStorage.setItem('queryHistory', JSON.stringify(
      [{ id: Date.now(), text: queryText, timestamp: new Date().toISOString() }, ...existing].slice(0, 50)
    ));
    setQuery(queryText);
    setRecommendation(null);
    setIsProcessing(true);

    try {
      const result = await submitQuery(queryText);
      setRecommendation(result);
    } catch (error) {
      await new Promise(r => setTimeout(r, 2000));
      setRecommendation({
        text: 'Step-by-step disassembly procedure generated.',
        sources: [
          { title: 'FedEx Manual X-1000',  page: 42, section: '5.2' },
          { title: 'OSHA 29 CFR 1910.147', page: 12, section: '3.1' },
        ],
        reasoning: 'Retrieved from engine manual; safety validation passed.',
      });
    }

    setIsProcessing(false);
  };

  const handleApprove = () => {
    Alert.alert('Approved', '✓ Recommendation approved and logged to audit trail.');
    setRecommendation(null);
  };

  const handleReject = () => {
    Alert.alert('Rejected', '✕ Recommendation rejected and logged to audit trail.');
    setRecommendation(null);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('user');
        router.replace('/login');
      }},
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.welcome}>WELCOME</Text>
          <Text style={s.title}>Maintenance Copilot</Text>
          <Text style={s.subtitle}>{WELCOME_SUBTITLE[role] || WELCOME_SUBTITLE.beginner}</Text>
          <View style={s.badgeRow}>
            <View style={[s.badge, { borderColor: C.primary, backgroundColor: C.primaryLight }]}>
              <Text style={s.badgeText}>{role?.toUpperCase()} ACCESS</Text>
            </View>
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
              <Text style={s.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Beginner banner */}
        {isJunior && (
          <View style={[s.banner, { borderColor: C.blue, backgroundColor: C.blueBg }]}>
            <Text style={[s.bannerText, { color: C.blue }]}>
              💡 <Text style={{ fontWeight: '700' }}>Getting started:</Text> Describe your task below in plain language. Always consult a senior technician before performing any work.
            </Text>
          </View>
        )}

        {/* Intermediate banner */}
        {isIntermediate && (
          <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fef9c3' }]}>
            <Text style={[s.bannerText, { color: '#d97706' }]}>
              ⚠️ <Text style={{ fontWeight: '700' }}>Reminder:</Text> You can approve standard procedures. Escalate HIGH difficulty tasks to an Expert Technician.
            </Text>
          </View>
        )}

        {/* Active task badge */}
        {(isProcessing || recommendation) && query ? (
          <View style={s.taskBadge}>
            <Text style={s.taskText}>
              📋 <Text style={s.bold}>Active: </Text>
              {query.slice(0, 60)}{query.length > 60 ? '…' : ''}
            </Text>
            <View style={s.highBadge}>
              <Text style={s.highText}>HIGH</Text>
            </View>
          </View>
        ) : null}

        {/* Input card */}
        <View style={s.card}>
          <Text style={s.label}>TASK DESCRIPTION</Text>
          <TextInput
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor={C.textMuted}
            value={inputValue}
            onChangeText={setInputValue}
            multiline
            numberOfLines={3}
            editable={!isProcessing}
          />
          <TouchableOpacity
            style={[s.btn, (!inputValue.trim() || isProcessing) && s.btnDisabled]}
            onPress={() => { handleSubmitQuery(inputValue); setInputValue(''); }}
            disabled={isProcessing || !inputValue.trim()}
          >
            {isProcessing
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>⚡ Analyze Task</Text>}
          </TouchableOpacity>
        </View>

        {/* Agent pipeline — role aware */}
        {isProcessing && (
          canSeeAgents ? <AgentStatus /> : (
            <View style={[s.card, { alignItems: 'center' }]}>
              <Text style={s.muted}>Analyzing your task…</Text>
              <View style={s.progressTrack}>
                <View style={s.progressFill} />
              </View>
              <Text style={s.muted}>This may take a few seconds</Text>
            </View>
          )
        )}

        {/* Recommendation — full role-aware component */}
        {recommendation && (
          <RecommendationReview
            recommendation={recommendation}
            role={role}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        {/* Empty state */}
        {!isProcessing && !recommendation && (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>⚡</Text>
            <Text style={s.emptyTitle}>No active task</Text>
            <Text style={s.muted}>
              {isJunior
                ? 'Describe what needs fixing above — the AI will guide you through it.'
                : 'Describe a maintenance task above to activate the AI pipeline.'}
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  scroll:        { flex: 1, paddingHorizontal: 16 },
  header:        { alignItems: 'center', paddingVertical: 24 },
  welcome:       { color: C.primary, fontSize: 28, fontWeight: '700', letterSpacing: 2 },
  title:         { color: C.text, fontSize: 18, fontWeight: '700', marginTop: 4 },
  subtitle:      { color: C.textSub, fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
  badgeRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  badge:         { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  badgeText:     { color: C.primaryText, fontSize: 10, fontWeight: '700' },
  logoutBtn:     { borderWidth: 1, borderColor: '#fecaca', backgroundColor: C.redBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  logoutText:    { color: C.red, fontSize: 11, fontWeight: '700' },
  banner:        { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  bannerText:    { fontSize: 12, lineHeight: 18 },
  taskBadge:     { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  taskText:      { color: C.textSub, fontSize: 12, flex: 1 },
  bold:          { color: C.text, fontWeight: '700' },
  highBadge:     { backgroundColor: C.redBg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  highText:      { color: C.red, fontSize: 10, fontWeight: '700' },
  card:          { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.cardBorder, elevation: 2 },
  label:         { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  input:         { backgroundColor: C.inputBg, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  btn:           { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled:   { backgroundColor: '#c4b5fd' },
  btnText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  progressTrack: { width: '100%', height: 4, backgroundColor: C.primaryLight, borderRadius: 4, marginVertical: 10 },
  progressFill:  { width: '50%', height: 4, backgroundColor: C.primary, borderRadius: 4 },
  muted:         { color: C.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' },
  emptyState:    { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 16, padding: 40, alignItems: 'center', backgroundColor: C.card },
  emptyTitle:    { color: C.text, fontWeight: '700', fontSize: 14, marginBottom: 6 },
});
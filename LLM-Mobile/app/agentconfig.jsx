import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Switch, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

// ─── Agent definitions ────────────────────────────────────────────────────────
const AGENTS = [
  {
    key:         'retrieval',
    name:        'Data Retrieval Agent',
    description: 'Searches Qdrant vector DB for relevant manual chunks using semantic similarity.',
    icon:        'search-outline',
    color:       '#2563eb',
    bg:          '#eff6ff',
    endpoint:    'RAG · Port 8001',
  },
  {
    key:         'safety',
    name:        'Safety Validation Agent',
    description: 'Cross-checks AI recommendations against known safety protocols before output.',
    icon:        'shield-checkmark-outline',
    color:       '#16a34a',
    bg:          '#f0fdf4',
    endpoint:    'LLM · OpenRouter',
  },
  {
    key:         'recommendation',
    name:        'Recommendation Agent',
    description: 'Generates step-by-step maintenance plans from retrieved context and user query.',
    icon:        'flash-outline',
    color:       '#7c3aed',
    bg:          '#ede9fe',
    endpoint:    'LLM · OpenRouter',
  },
  {
    key:         'alert',
    name:        'Alert Agent',
    description: 'Monitors query severity and fires real-time alerts to the Activity feed.',
    icon:        'notifications-outline',
    color:       '#dc2626',
    bg:          '#fef2f2',
    endpoint:    'Firebase · Firestore',
  },
  {
    key:         'hitl',
    name:        'HITL Review Agent',
    description: 'Flags sessions for human-in-the-loop approval based on role and confidence score.',
    icon:        'people-outline',
    color:       '#d97706',
    bg:          '#fffbeb',
    endpoint:    'Firebase · audit_logs',
  },
  {
    key:         'knowledge',
    name:        'Knowledge Agent',
    description: 'Manages document embeddings and syncs the Qdrant vector store with uploaded PDFs.',
    icon:        'library-outline',
    color:       '#0891b2',
    bg:          '#ecfeff',
    endpoint:    'Qdrant · Port 6333',
  },
];

// ─── System services ──────────────────────────────────────────────────────────
const SERVICES = [
  { key: 'backend',  label: 'Node.js Backend',  detail: 'Express · Port 8000',      icon: 'server-outline'   },
  { key: 'rag',      label: 'RAG Service',       detail: 'FastAPI · Port 8001',      icon: 'git-network-outline' },
  { key: 'qdrant',   label: 'Vector DB',         detail: 'Qdrant · Port 6333',       icon: 'cube-outline'     },
  { key: 'firebase', label: 'Firebase',          detail: 'Firestore · rbacfyp',      icon: 'cloud-outline'    },
  { key: 'llm',      label: 'LLM Provider',      detail: 'OpenRouter · Gemma 3 27B', icon: 'hardware-chip-outline' },
];

export default function AgentConfig() {
  const [loading, setLoading]         = useState(true);
  const [agentEnabled, setAgentEnabled] = useState(
    Object.fromEntries(AGENTS.map(a => [a.key, true]))
  );
  const [serviceStatus, setServiceStatus] = useState(
    Object.fromEntries(SERVICES.map(s => [s.key, 'checking']))
  );
  const [expanded, setExpanded]       = useState(null);
  const router                        = useRouter();

  useFocusEffect(useCallback(() => {
    checkAdminAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const checkAdminAndLoad = async () => {
    const raw  = await AsyncStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    if (user?.role !== 'admin') { router.replace('/dashboard'); return; }
    simulateServiceCheck();
  };

  // Simulate service status checks (replace with real pings if endpoints are reachable)
  const simulateServiceCheck = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setServiceStatus({
      backend:  'online',
      rag:      'online',
      qdrant:   'online',
      firebase: 'online',
      llm:      'online',
    });
    setLoading(false);
  };

  const toggleAgent = (key) => {
    setAgentEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allOnline   = Object.values(serviceStatus).every(s => s === 'online');
  const enabledCount = Object.values(agentEnabled).filter(Boolean).length;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ─── Header ────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back-outline" size={20} color={C.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>AI Agent Config</Text>
            <Text style={s.pageSub}>System agents &amp; settings · Admin only</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={simulateServiceCheck}>
            <Ionicons name="refresh-outline" size={18} color={C.primary} />
          </TouchableOpacity>
        </View>

        <View style={s.body}>

          {/* ─── System Health Banner ─────────────────────────── */}
          <View style={[s.healthBanner, { backgroundColor: allOnline ? '#f0fdf4' : '#fef2f2', borderColor: allOnline ? '#86efac' : '#fca5a5' }]}>
            {loading
              ? <ActivityIndicator size="small" color={C.primary} />
              : <Ionicons name={allOnline ? 'checkmark-circle-outline' : 'warning-outline'} size={20} color={allOnline ? '#16a34a' : '#dc2626'} />
            }
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[s.healthTitle, { color: allOnline ? '#16a34a' : '#dc2626' }]}>
                {loading ? 'Checking system status…' : allOnline ? 'All systems operational' : 'Some services unavailable'}
              </Text>
              <Text style={s.healthSub}>{enabledCount} of {AGENTS.length} agents active</Text>
            </View>
          </View>

          {/* ─── LLM Model Info ───────────────────────────────── */}
          <Text style={s.sectionLabel}>LLM CONFIGURATION</Text>
          <View style={s.card}>
            <View style={s.modelRow}>
              <View style={[s.modelIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="hardware-chip-outline" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modelName}>google/gemma-3-27b-it:free</Text>
                <Text style={s.modelSub}>via OpenRouter API</Text>
              </View>
              <View style={s.onlinePill}>
                <View style={s.onlineDot} />
                <Text style={s.onlineText}>Live</Text>
              </View>
            </View>
            <View style={s.divider} />
            <View style={s.configGrid}>
              <ConfigItem label="Max Tokens"   value="1,000"      />
              <ConfigItem label="Temperature"  value="Default"    />
              <ConfigItem label="Context"      value="RAG + Chat" />
              <ConfigItem label="Timeout"      value="120s"       />
            </View>
          </View>

          {/* ─── Service Status ───────────────────────────────── */}
          <Text style={s.sectionLabel}>SERVICE STATUS</Text>
          <View style={s.card}>
            {SERVICES.map((svc, i) => (
              <View key={svc.key} style={[s.serviceRow, i < SERVICES.length - 1 && s.serviceBorder]}>
                <Ionicons name={svc.icon} size={16} color={C.textSub} style={{ width: 22 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.serviceLabel}>{svc.label}</Text>
                  <Text style={s.serviceDetail}>{svc.detail}</Text>
                </View>
                {loading
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <View style={[s.statusPill, { backgroundColor: serviceStatus[svc.key] === 'online' ? '#f0fdf4' : '#fef2f2' }]}>
                      <View style={[s.statusDot, { backgroundColor: serviceStatus[svc.key] === 'online' ? '#16a34a' : '#dc2626' }]} />
                      <Text style={[s.statusText, { color: serviceStatus[svc.key] === 'online' ? '#16a34a' : '#dc2626' }]}>
                        {serviceStatus[svc.key] === 'online' ? 'Online' : 'Offline'}
                      </Text>
                    </View>
                }
              </View>
            ))}
          </View>

          {/* ─── Agent Pipeline ───────────────────────────────── */}
          <Text style={s.sectionLabel}>AGENT PIPELINE</Text>
          {AGENTS.map((agent, i) => (
            <TouchableOpacity
              key={agent.key}
              style={[s.agentCard, !agentEnabled[agent.key] && s.agentCardDisabled]}
              onPress={() => setExpanded(expanded === agent.key ? null : agent.key)}
              activeOpacity={0.8}
            >
              <View style={s.agentTop}>
                {/* Step number */}
                <View style={[s.stepBadge, { backgroundColor: agentEnabled[agent.key] ? agent.bg : C.cardBorder }]}>
                  <Text style={[s.stepText, { color: agentEnabled[agent.key] ? agent.color : C.textMuted }]}>{i + 1}</Text>
                </View>

                {/* Icon */}
                <View style={[s.agentIcon, { backgroundColor: agentEnabled[agent.key] ? agent.bg : C.bg }]}>
                  <Ionicons name={agent.icon} size={18} color={agentEnabled[agent.key] ? agent.color : C.textMuted} />
                </View>

                {/* Name + endpoint */}
                <View style={{ flex: 1 }}>
                  <Text style={[s.agentName, !agentEnabled[agent.key] && { color: C.textMuted }]}>{agent.name}</Text>
                  <Text style={s.agentEndpoint}>{agent.endpoint}</Text>
                </View>

                {/* Toggle */}
                <Switch
                  value={agentEnabled[agent.key]}
                  onValueChange={() => toggleAgent(agent.key)}
                  trackColor={{ false: C.cardBorder, true: agent.color + '55' }}
                  thumbColor={agentEnabled[agent.key] ? agent.color : '#ccc'}
                />
              </View>

              {/* Expanded description */}
              {expanded === agent.key && (
                <View style={[s.agentExpanded, { borderTopColor: agent.bg }]}>
                  <Text style={s.agentDesc}>{agent.description}</Text>
                  <View style={[s.endpointTag, { backgroundColor: agent.bg }]}>
                    <Ionicons name="link-outline" size={12} color={agent.color} />
                    <Text style={[s.endpointTagText, { color: agent.color }]}> {agent.endpoint}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* ─── Pipeline Flow ────────────────────────────────── */}
          <Text style={s.sectionLabel}>PIPELINE FLOW</Text>
          <View style={s.card}>
            <View style={s.flowRow}>
              <FlowStep icon="chatbubble-outline"        label="User Query"   color={C.primary} />
              <Ionicons name="chevron-forward-outline" size={14} color={C.textMuted} />
              <FlowStep icon="search-outline"            label="Retrieval"    color="#2563eb"  />
              <Ionicons name="chevron-forward-outline" size={14} color={C.textMuted} />
              <FlowStep icon="flash-outline"             label="LLM"          color="#7c3aed"  />
              <Ionicons name="chevron-forward-outline" size={14} color={C.textMuted} />
              <FlowStep icon="shield-checkmark-outline"  label="Safety"       color="#16a34a"  />
              <Ionicons name="chevron-forward-outline" size={14} color={C.textMuted} />
              <FlowStep icon="people-outline"            label="HITL"         color="#d97706"  />
            </View>
          </View>

          {/* ─── RAG Config ───────────────────────────────────── */}
          <Text style={s.sectionLabel}>RAG CONFIGURATION</Text>
          <View style={s.card}>
            <View style={s.configGrid}>
              <ConfigItem label="Vector DB"      value="Qdrant"              />
              <ConfigItem label="DB Port"        value="6333"                />
              <ConfigItem label="Embed Model"    value="sentence-transformers" />
              <ConfigItem label="Chunk Size"     value="512 tokens"          />
              <ConfigItem label="Top-K Results"  value="5"                   />
              <ConfigItem label="Collections"    value="Manuals"             />
            </View>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ConfigItem({ label, value }) {
  return (
    <View style={s.configItem}>
      <Text style={s.configLabel}>{label}</Text>
      <Text style={s.configValue}>{value}</Text>
    </View>
  );
}

function FlowStep({ icon, label, color }) {
  return (
    <View style={s.flowStep}>
      <View style={[s.flowIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={s.flowLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: C.bg },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 10 },
  backBtn:          { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  pageTitle:        { color: C.text, fontSize: 20, fontWeight: '700' },
  pageSub:          { color: C.textSub, fontSize: 11, marginTop: 1 },
  refreshBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  body:             { paddingHorizontal: 16 },
  sectionLabel:     { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
  card:             { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16 },

  // Health banner
  healthBanner:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 16 },
  healthTitle:      { fontSize: 13, fontWeight: '700' },
  healthSub:        { fontSize: 11, color: C.textMuted, marginTop: 2 },

  // Model
  modelRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modelIcon:        { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modelName:        { color: C.text, fontSize: 13, fontWeight: '700' },
  modelSub:         { color: C.textMuted, fontSize: 11, marginTop: 1 },
  onlinePill:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  onlineDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a', marginRight: 4 },
  onlineText:       { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  divider:          { height: 1, backgroundColor: C.cardBorder, marginVertical: 14 },

  // Config grid
  configGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  configItem:       { width: '47%', backgroundColor: C.bg, borderRadius: 10, padding: 10 },
  configLabel:      { color: C.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 2 },
  configValue:      { color: C.text, fontSize: 12, fontWeight: '700' },

  // Services
  serviceRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  serviceBorder:    { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  serviceLabel:     { color: C.text, fontSize: 12, fontWeight: '600' },
  serviceDetail:    { color: C.textMuted, fontSize: 10, marginTop: 1 },
  statusPill:       { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot:        { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusText:       { fontSize: 11, fontWeight: '700' },

  // Agents
  agentCard:        { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, marginBottom: 10, overflow: 'hidden' },
  agentCardDisabled:{ opacity: 0.6 },
  agentTop:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  stepBadge:        { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  stepText:         { fontSize: 11, fontWeight: '700' },
  agentIcon:        { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  agentName:        { color: C.text, fontSize: 12, fontWeight: '700' },
  agentEndpoint:    { color: C.textMuted, fontSize: 10, marginTop: 1 },
  agentExpanded:    { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12, gap: 8 },
  agentDesc:        { color: C.textSub, fontSize: 12, lineHeight: 18 },
  endpointTag:      { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  endpointTagText:  { fontSize: 11, fontWeight: '600' },

  // Pipeline flow
  flowRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flowStep:         { alignItems: 'center', gap: 6 },
  flowIcon:         { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  flowLabel:        { color: C.textMuted, fontSize: 9, fontWeight: '600' },
});
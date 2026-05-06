import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

const STATUS_CONFIG = {
  pending_review: { label: 'Pending Review', color: '#d97706', bg: '#fef9c3', iconName: 'time-outline'             },
  approved:       { label: 'Approved',       color: C.green,  bg: C.greenBg,  iconName: 'checkmark-circle-outline' },
  rejected:       { label: 'Rejected',       color: C.red,    bg: C.redBg,    iconName: 'close-circle-outline'     },
};

export default function MySessions() {
  const [sessions, setSessions]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedSession, setSelected]  = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [user, setUser]                 = useState(null);

  useFocusEffect(
    useCallback(() => {
      let unsubscribe;
      const load = async () => {
        setLoading(true);
        const raw = await AsyncStorage.getItem('user');
        const u   = raw ? JSON.parse(raw) : null;
        setUser(u);
        if (!u) { setLoading(false); return; }

        const userId  = u.uid || u.id || u.email || 'anonymous_user';
        const logsRef = collection(db, 'audit_logs');
        const q       = query(logsRef, where('user_id', '==', userId), orderBy('last_updated', 'desc'));

        unsubscribe = onSnapshot(q, (snapshot) => {
          setSessions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        }, (err) => {
          console.error('MySessions error:', err);
          setLoading(false);
        });
      };
      load();
      return () => { if (unsubscribe) unsubscribe(); };
    }, [])
  );

  const getStatusCfg = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.pending_review;

  const totalQueries  = sessions.reduce((acc, s) => acc + (s.messages?.length || 0), 0);
  const approvedCount = sessions.filter(s => s.status === 'approved').length;
  const pendingCount  = sessions.filter(s => s.status === 'pending_review').length;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ─── Header ──────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.pageTitle}>My Sessions</Text>
            <Text style={s.pageSub}>Your personal query history</Text>
          </View>
          <View style={s.liveRow}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>Live</Text>
          </View>
        </View>

        {/* ─── Stats ───────────────────────────────────────────────── */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderColor: C.primary }]}>
            <Ionicons name="chatbubbles-outline" size={20} color={C.primary} />
            <Text style={[s.statValue, { color: C.primary }]}>{sessions.length}</Text>
            <Text style={s.statLabel}>Sessions</Text>
          </View>
          <View style={[s.statCard, { borderColor: C.blue }]}>
            <Ionicons name="search-outline" size={20} color={C.blue} />
            <Text style={[s.statValue, { color: C.blue }]}>{totalQueries}</Text>
            <Text style={s.statLabel}>Queries</Text>
          </View>
          <View style={[s.statCard, { borderColor: C.green }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={C.green} />
            <Text style={[s.statValue, { color: C.green }]}>{approvedCount}</Text>
            <Text style={s.statLabel}>Approved</Text>
          </View>
          <View style={[s.statCard, { borderColor: '#d97706' }]}>
            <Ionicons name="time-outline" size={20} color="#d97706" />
            <Text style={[s.statValue, { color: '#d97706' }]}>{pendingCount}</Text>
            <Text style={s.statLabel}>Pending</Text>
          </View>
        </View>

        {/* ─── Info Banner ─────────────────────────────────────────── */}
        <View style={s.infoBanner}>
          <Ionicons name="information-circle-outline" size={14} color={C.primaryText} />
          <Text style={s.infoText}> Sessions are reviewed by an admin before your recommendations are actioned.</Text>
        </View>

        <View style={s.listWrap}>
          {loading ? (
            <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
          ) : sessions.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="chatbubbles-outline" size={40} color={C.textMuted} style={{ marginBottom: 10 }} />
              <Text style={s.emptyTitle}>No Sessions Yet</Text>
              <Text style={s.muted}>Go to Dashboard and ask your first question.</Text>
            </View>
          ) : (
            sessions.map((session, idx) => {
              const cfg         = getStatusCfg(session.status);
              const firstMsg    = session.messages?.[0];
              const preview     = firstMsg?.user_prompt?.slice(0, 60) || 'No messages';
              const msgCount    = session.messages?.length || 0;
              return (
                <TouchableOpacity
                  key={session.id}
                  style={s.sessionCard}
                  onPress={() => { setSelected(session); setModalVisible(true); }}
                >
                  {/* Card number + status */}
                  <View style={s.cardTop}>
                    <View style={s.sessionNumBadge}>
                      <Text style={s.sessionNum}>#{sessions.length - idx}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.iconName} size={11} color={cfg.color} />
                      <Text style={[s.statusText, { color: cfg.color }]}> {cfg.label}</Text>
                    </View>
                  </View>

                  {/* Preview */}
                  <Text style={s.previewText} numberOfLines={2}>{preview}...</Text>

                  {/* Footer */}
                  <View style={s.cardFooter}>
                    <View style={s.cardFooterItem}>
                      <Ionicons name="chatbubble-outline" size={12} color={C.textMuted} />
                      <Text style={s.cardFooterText}> {msgCount} {msgCount === 1 ? 'query' : 'queries'}</Text>
                    </View>
                    <View style={s.cardFooterItem}>
                      <Ionicons name="time-outline" size={12} color={C.textMuted} />
                      <Text style={s.cardFooterText}> {session.last_updated}</Text>
                    </View>
                    <Ionicons name="chevron-forward-outline" size={14} color={C.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ─── Session Detail Modal ────────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={s.modalContainer}>

          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Session Detail</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={s.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalContent}>
            {selectedSession && (
              <>
                {/* Status pill */}
                {(() => {
                  const cfg = getStatusCfg(selectedSession.status);
                  return (
                    <View style={[s.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
                      <Ionicons name={cfg.iconName} size={14} color={cfg.color} />
                      <Text style={[s.statusPillText, { color: cfg.color }]}> Status: {cfg.label}</Text>
                    </View>
                  );
                })()}

                {/* Review note */}
                {selectedSession.status === 'pending_review' && (
                  <View style={s.reviewNote}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={C.primaryText} />
                    <Text style={s.reviewNoteText}> This session is awaiting admin review. No action required from you.</Text>
                  </View>
                )}
                {selectedSession.status === 'rejected' && (
                  <View style={[s.reviewNote, { backgroundColor: C.redBg, borderColor: '#fecaca' }]}>
                    <Ionicons name="close-circle-outline" size={14} color={C.red} />
                    <Text style={[s.reviewNoteText, { color: C.red }]}> This session was rejected by an admin. Please consult your supervisor.</Text>
                  </View>
                )}
                {selectedSession.status === 'approved' && (
                  <View style={[s.reviewNote, { backgroundColor: C.greenBg, borderColor: '#86efac' }]}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={C.green} />
                    <Text style={[s.reviewNoteText, { color: C.green }]}> This session was approved by an admin.</Text>
                  </View>
                )}

                {/* Chat transcript */}
                {selectedSession.messages?.length > 0 && (
                  <View style={s.transcriptBox}>
                    <Text style={s.transcriptHeader}>Your Queries</Text>
                    {selectedSession.messages.map((msg, i) => (
                      <View key={i} style={s.msgBlock}>
                        {/* User question */}
                        <View style={s.questionRow}>
                          <View style={s.questionIcon}>
                            <Ionicons name="person-outline" size={14} color={C.primary} />
                          </View>
                          <View style={s.questionBubble}>
                            <Text style={s.questionLabel}>You asked · {msg.timestamp}</Text>
                            <Text style={s.questionText}>{msg.user_prompt}</Text>
                          </View>
                        </View>

                        {/* AI answer */}
                        <View style={s.answerBox}>
                          <View style={s.answerHeader}>
                            <Ionicons name="flash-outline" size={12} color={C.primary} />
                            <Text style={s.answerLabel}> AI Response</Text>
                          </View>
                          <Text style={s.answerText}>{msg.ai_response}</Text>

                          {/* Sources */}
                          {msg.sources_used?.length > 0 && (
                            <View style={s.sourcesBox}>
                              <View style={s.sourcesRow}>
                                <Ionicons name="attach-outline" size={11} color="#7c3aed" />
                                <Text style={s.sourcesLabel}> Sources</Text>
                              </View>
                              {msg.sources_used.map((src, j) => (
                                <Text key={j} style={s.sourceItem}>
                                  • {src.filename}{src.page ? ` — p.${src.page}` : ''}
                                </Text>
                              ))}
                            </View>
                          )}
                        </View>

                        {i < selectedSession.messages.length - 1 && <View style={s.msgDivider} />}
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: C.bg },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  pageTitle:       { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub:         { color: C.textSub, fontSize: 12, marginTop: 2 },
  liveRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  liveText:        { color: C.green, fontSize: 12, fontWeight: '700' },

  statsRow:        { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  statCard:        { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'center', gap: 2 },
  statValue:       { fontSize: 20, fontWeight: '700' },
  statLabel:       { fontSize: 9, color: C.textMuted, fontWeight: '600' },

  infoBanner:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: C.primaryLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.cardBorder },
  infoText:        { color: C.primaryText, fontSize: 11, flex: 1, lineHeight: 16 },

  listWrap:        { paddingHorizontal: 16 },
  emptyState:      { alignItems: 'center', paddingVertical: 60, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder },
  emptyTitle:      { color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  muted:           { color: C.textMuted, fontSize: 12, textAlign: 'center' },

  sessionCard:     { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 14, marginBottom: 12, elevation: 1 },
  cardTop:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sessionNumBadge: { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sessionNum:      { color: C.primary, fontSize: 11, fontWeight: '700' },
  statusBadge:     { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:      { fontSize: 10, fontWeight: '700' },
  previewText:     { color: C.text, fontSize: 13, lineHeight: 18, marginBottom: 10 },
  cardFooter:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardFooterItem:  { flexDirection: 'row', alignItems: 'center' },
  cardFooterText:  { color: C.textMuted, fontSize: 11 },

  modalContainer:  { flex: 1, backgroundColor: C.bg },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.cardBorder, backgroundColor: C.card },
  modalTitle:      { fontSize: 18, fontWeight: '700', color: C.text },
  closeBtn:        { color: C.primary, fontSize: 16, fontWeight: '600' },
  modalContent:    { flex: 1, padding: 16 },

  statusPill:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  statusPillText:  { fontSize: 13, fontWeight: '700' },

  reviewNote:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 10, padding: 10, marginBottom: 16 },
  reviewNoteText:  { color: C.primaryText, fontSize: 12, flex: 1, lineHeight: 16 },

  transcriptBox:   { gap: 0 },
  transcriptHeader:{ fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  msgBlock:        { marginBottom: 4 },
  msgDivider:      { height: 1, backgroundColor: C.cardBorder, marginVertical: 16 },

  questionRow:     { flexDirection: 'row', gap: 10, marginBottom: 8 },
  questionIcon:    { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  questionBubble:  { flex: 1, backgroundColor: C.primaryLight, borderRadius: 12, padding: 12 },
  questionLabel:   { fontSize: 10, fontWeight: '700', color: C.primary, marginBottom: 4, textTransform: 'uppercase' },
  questionText:    { color: C.text, fontSize: 13, lineHeight: 18 },

  answerBox:       { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, padding: 12, marginLeft: 4 },
  answerHeader:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  answerLabel:     { fontSize: 10, fontWeight: '700', color: C.textSub, textTransform: 'uppercase' },
  answerText:      { color: C.text, fontSize: 13, lineHeight: 18 },

  sourcesBox:      { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: C.cardBorder },
  sourcesRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sourcesLabel:    { fontSize: 9, fontWeight: '700', color: '#7c3aed', letterSpacing: 1 },
  sourceItem:      { fontSize: 11, color: '#6d28d9', marginBottom: 2 },
});
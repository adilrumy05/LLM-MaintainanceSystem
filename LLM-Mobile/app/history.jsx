import { useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  Modal, ActivityIndicator, Alert, Platform, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { API_BASE_URL } from '@env';
import { useUser } from './_layout';

const STATUS_CONFIG = {
  pending_review: { label: 'Pending Review', color: '#d97706', bg: '#fef9c3', iconName: 'time-outline'             },
  approved:       { label: 'Approved',       color: C.green,  bg: C.greenBg,  iconName: 'checkmark-circle-outline' },
  rejected:       { label: 'Rejected',       color: C.red,    bg: C.redBg,    iconName: 'close-circle-outline'     },
};

export default function History() {
  const { user }                          = useUser();
  const [logs, setLogs]                   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [selectedLog, setSelectedLog]     = useState(null);
  const [modalVisible, setModalVisible]   = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch]               = useState('');
  const router                            = useRouter();

  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (user.role !== 'admin') { router.replace('/dashboard'); return; }

      let unsubscribe;
      if (!hasLoadedRef.current) setLoading(true);

      const q = query(
        collection(db, 'audit_logs'),
        orderBy('last_updated', 'desc'),
        limit(30),
      );
      unsubscribe = onSnapshot(q, (snapshot) => {
        setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        hasLoadedRef.current = true;
        setLoading(false);
      }, (error) => {
        console.error('Snapshot error:', error);
        setLoading(false);
      });

      return () => { if (unsubscribe) unsubscribe(); };
    }, [user, router])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  };

  const openLogDetails = (log) => { setSelectedLog(log); setModalVisible(true); };

  const handleHITL = async (action) => {
    if (!selectedLog) return;
    const label = action === 'approve' ? 'Approve' : 'Reject';
    const doAction = async () => {
      setActionLoading(true);
      try {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        const reviewer  = user?.email || user?.uid || 'admin';
        const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
        await updateDoc(doc(db, 'audit_logs', selectedLog.id), {
          status: newStatus, reviewed_by: reviewer, reviewed_at: timestamp, last_updated: timestamp,
        });
        fetch(`${API_BASE_URL}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: selectedLog.log_id, userId: selectedLog.user_id, reviewedBy: reviewer, reviewedAt: timestamp }),
        }).catch(e => console.warn(e));
        setSelectedLog(prev => ({ ...prev, status: newStatus, reviewed_by: reviewer, reviewed_at: timestamp }));
        if (Platform.OS === 'web') {
          window.alert(`Session ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} — recorded in audit log.`);
        } else {
          Alert.alert(`Session ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`, `This session has been ${newStatus} and recorded in the audit log.`);
        }
      } catch (err) {
        console.error('Status update error:', err);
        if (Platform.OS === 'web') {
          window.alert('Failed to update status.');
        } else {
          Alert.alert('Error', 'Failed to update status.');
        }
      }
      setActionLoading(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to ${label.toLowerCase()} this AI session?`)) doAction();
    } else {
      Alert.alert(`${label} Session`, `Are you sure you want to ${label.toLowerCase()} this AI session?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: action === 'reject' ? 'destructive' : 'default', onPress: doAction },
      ]);
    }
  };

  const getStatusCfg = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.pending_review;
  const isAdmin      = user?.role === 'admin';
  const isPending    = selectedLog?.status === 'pending_review';

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(log =>
      log.user_id?.toLowerCase().includes(q) ||
      log.log_id?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  const renderItem = ({ item: log }) => {
    const cfg = getStatusCfg(log.status);
    return (
      <TouchableOpacity style={s.logCard} onPress={() => openLogDetails(log)}>
        <View style={s.cardHeader}>
          <Text style={s.logIdText} numberOfLines={1}>Session: {log.log_id?.substring(0, 20)}...</Text>
          <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.iconName} size={10} color={cfg.color} />
            <Text style={[s.statusBadgeText, { color: cfg.color }]}> {cfg.label}</Text>
          </View>
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardDetail}><Text style={s.bold}>User: </Text>{log.user_id}</Text>
          <Text style={s.cardDetail}><Text style={s.bold}>Messages: </Text>{log.messages?.length || 0}</Text>
          <Text style={s.cardDetail}><Text style={s.bold}>Updated: </Text>{log.last_updated}</Text>
          {log.reviewed_by && <Text style={s.cardDetail}><Text style={s.bold}>Reviewed by: </Text>{log.reviewed_by}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <View>
      <View style={s.headerRow}>
        <View>
          <Text style={s.pageTitle}>Audit History</Text>
          <Text style={s.pageSub}>Live database records · tap to review</Text>
        </View>
      </View>
      <View style={s.legendRow}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <View key={key} style={[s.legendBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.iconName} size={11} color={cfg.color} />
            <Text style={[s.legendText, { color: cfg.color }]}> {cfg.label}</Text>
          </View>
        ))}
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by user or session ID..."
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle-outline" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const ListEmpty = () => {
    if (loading) {
      return <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />;
    }
    return (
      <View style={s.emptyState}>
        <Ionicons name="server-outline" size={40} color={C.textMuted} style={{ marginBottom: 10 }} />
        <Text style={s.emptyTitle}>{search ? 'No results found' : 'No Audit Logs'}</Text>
        <Text style={s.muted}>{search ? 'Try a different search term.' : 'Logs will appear here after queries are made.'}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filteredLogs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={<View style={{ height: 40 }} />}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />}
      />
      {/* Modal unchanged */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Session Review</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={s.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
          <FlatList
            style={s.modalContent}
            data={selectedLog?.messages || []}
            keyExtractor={(_, i) => String(i)}
            ListHeaderComponent={selectedLog ? (
              <View style={s.detailsBox}>
                <Text style={s.sectionLabel}>SESSION INFO</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Session ID: </Text>{selectedLog.log_id}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>User: </Text>{selectedLog.user_id}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Last Updated: </Text>{selectedLog.last_updated}</Text>
                {selectedLog.reviewed_by && <Text style={s.detailItem}><Text style={s.bold}>Reviewed by: </Text>{selectedLog.reviewed_by} at {selectedLog.reviewed_at}</Text>}
                {(() => { const cfg = getStatusCfg(selectedLog.status); return <View style={[s.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}><Ionicons name={cfg.iconName} size={14} color={cfg.color} /><Text style={[s.statusPillText, { color: cfg.color }]}>  Status: {cfg.label}</Text></View>; })()}
                {(selectedLog.messages?.length > 0) && <Text style={[s.sectionLabel, { marginTop: 16 }]}>CHAT TRANSCRIPT</Text>}
              </View>
            ) : null}
            renderItem={({ item: msg, index: i }) => (
              <View key={i} style={{ marginBottom: 20, paddingHorizontal: 16 }}>
                <View style={s.bubbleUser}><View style={s.bubbleHeaderRow}><Ionicons name="person-outline" size={12} color={C.textSub} /><Text style={s.bubbleLabel}> User · {msg.timestamp}</Text></View><Text style={s.bubbleText}>{msg.user_prompt}</Text></View>
                <View style={s.bubbleAi}><View style={s.bubbleHeaderRow}><Ionicons name="flash-outline" size={12} color={C.textSub} /><Text style={s.bubbleLabel}> AI Response</Text></View><Text style={s.bubbleText}>{msg.ai_response}</Text>{msg.sources_used?.length > 0 && <View style={s.sourcesBox}><View style={s.bubbleHeaderRow}><Ionicons name="attach-outline" size={11} color="#7c3aed" /><Text style={s.sourcesLabel}> SOURCES</Text></View>{msg.sources_used.map((src, j) => <Text key={j} style={s.sourceItem}>• {src.filename}{src.page ? ` — p.${src.page}` : ''}</Text>)}</View>}</View>
              </View>
            )}
            ListEmptyComponent={<View style={{ height: 8 }} />}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
          {isAdmin && (
            <View style={s.modalFooter}>
              {isPending ? (
                <>
                  <View style={s.footerLabelRow}><Ionicons name="shield-checkmark-outline" size={14} color={C.textSub} /><Text style={s.footerLabel}> Human-in-the-Loop Review Required</Text></View>
                  <View style={s.footerBtns}>
                    <TouchableOpacity style={[s.rejectBtn, actionLoading && s.btnDisabled]} onPress={() => handleHITL('reject')} disabled={actionLoading}>{actionLoading ? <ActivityIndicator color="#fff" size="small" /> : <View style={s.btnInner}><Ionicons name="close-circle-outline" size={16} color="#fff" /><Text style={s.rejectBtnText}> Reject Session</Text></View>}</TouchableOpacity>
                    <TouchableOpacity style={[s.approveBtn, actionLoading && s.btnDisabled]} onPress={() => handleHITL('approve')} disabled={actionLoading}>{actionLoading ? <ActivityIndicator color="#fff" size="small" /> : <View style={s.btnInner}><Ionicons name="checkmark-circle-outline" size={16} color="#fff" /><Text style={s.approveBtnText}> Approve Session</Text></View>}</TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={[s.alreadyReviewed, { backgroundColor: getStatusCfg(selectedLog?.status).bg }]}><Ionicons name={getStatusCfg(selectedLog?.status).iconName} size={16} color={getStatusCfg(selectedLog?.status).color} /><Text style={[s.alreadyReviewedText, { color: getStatusCfg(selectedLog?.status).color }]}> This session has already been {selectedLog?.status}.</Text></View>
              )}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: C.bg },
  scroll:             { paddingHorizontal: 16 },
  headerRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  pageTitle:          { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub:            { color: C.textSub, fontSize: 12, marginTop: 2 },
  legendRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  legendBadge:        { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  legendText:         { fontSize: 10, fontWeight: '700' },
  searchWrap:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, gap: 8 },
  searchInput:        { flex: 1, fontSize: 13, color: C.text },
  emptyState:         { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 16, padding: 60, alignItems: 'center', marginTop: 16, backgroundColor: C.card },
  emptyTitle:         { color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  muted:              { color: C.textMuted, fontSize: 12, textAlign: 'center' },
  logCard:            { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, padding: 14, marginBottom: 12, elevation: 2 },
  cardHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  logIdText:          { color: C.primary, fontSize: 12, fontWeight: '700', flex: 1, marginRight: 8 },
  statusBadge:        { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText:    { fontSize: 10, fontWeight: '700' },
  cardBody:           { gap: 4 },
  cardDetail:         { color: C.text, fontSize: 12 },
  bold:               { fontWeight: '700' },
  modalContainer:     { flex: 1, backgroundColor: C.bg },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.cardBorder, backgroundColor: C.card },
  modalTitle:         { fontSize: 18, fontWeight: '700', color: C.text },
  closeBtnText:       { color: C.primary, fontSize: 16, fontWeight: '600' },
  modalContent:       { flex: 1 },
  detailsBox:         { backgroundColor: C.card, padding: 16, margin: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder },
  sectionLabel:       { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1, marginBottom: 10 },
  detailItem:         { color: C.text, fontSize: 13, marginBottom: 8 },
  statusPill:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10, justifyContent: 'center' },
  statusPillText:     { fontSize: 13, fontWeight: '700' },
  bubbleUser:         { backgroundColor: '#e0f2fe', padding: 14, borderRadius: 12, marginBottom: 8 },
  bubbleAi:           { backgroundColor: C.card, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder },
  bubbleHeaderRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  bubbleLabel:        { fontSize: 10, fontWeight: '700', color: C.textSub, textTransform: 'uppercase' },
  bubbleText:         { fontSize: 13, color: C.text, lineHeight: 20 },
  sourcesBox:         { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: C.cardBorder },
  sourcesLabel:       { fontSize: 9, fontWeight: '700', color: '#7c3aed', letterSpacing: 1, marginBottom: 4 },
  sourceItem:         { fontSize: 11, color: '#6d28d9', marginBottom: 2 },
  modalFooter:        { padding: 16, borderTopWidth: 1, borderTopColor: C.cardBorder, backgroundColor: C.card },
  footerLabelRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  footerLabel:        { fontSize: 11, fontWeight: '700', color: C.textSub, letterSpacing: 0.5 },
  footerBtns:         { flexDirection: 'row', gap: 10 },
  approveBtn:         { flex: 1, backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  approveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  rejectBtn:          { flex: 1, backgroundColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  rejectBtnText:      { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnInner:           { flexDirection: 'row', alignItems: 'center' },
  btnDisabled:        { opacity: 0.5 },
  alreadyReviewed:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 14 },
  alreadyReviewedText:{ fontSize: 13, fontWeight: '700' },
});
import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig'; // Your teammate's Firebase setup
import { C } from '../theme';

// Update this to match your computer's IP address (same as in your api.js)
const BACKEND_URL = 'http://172.20.10.4:8000'; 

export default function History() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal & Detail State
  const [selectedLog, setSelectedLog] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [fetchingTranscript, setFetchingTranscript] = useState(false);

  useEffect(() => { 
    fetchAuditLogs(); 
  }, []);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
    } catch (error) {
      console.error("Error fetching logs:", error);
      Alert.alert("Error", "Failed to connect to Firebase Audit Database.");
    }
    setLoading(false);
  };

  const openLogDetails = (log) => {
    setSelectedLog(log);
    setTranscript(null); // Clear any previous transcript
    setModalVisible(true);
  };

  const retrieveReport = async (pointer) => {
    setFetchingTranscript(true);
    try {
      // The pointer is "chat_transcripts/transcript-123.json". We just want the filename.
      const filename = pointer.split('/').pop();
      const response = await fetch(`${BACKEND_URL}/api/transcript?path=${filename}`);
      
      if (!response.ok) throw new Error("Failed to fetch transcript from server.");
      
      const data = await response.json();
      setTranscript(data);
    } catch (error) {
      console.error("Transcript Error:", error);
      Alert.alert("Error", "Could not retrieve the chat transcript from the server.");
    }
    setFetchingTranscript(false);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.pageTitle}>Audit History</Text>
            <Text style={s.pageSub}>Live database records</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={fetchAuditLogs}>
            <Text style={s.refreshBtnText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
        ) : logs.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🗄️</Text>
            <Text style={s.emptyTitle}>Database Empty</Text>
            <Text style={s.muted}>No audit logs found in Firebase.</Text>
          </View>
        ) : (
          logs.map(log => (
            <TouchableOpacity key={log.id} style={s.logCard} onPress={() => openLogDetails(log)}>
              <View style={s.cardHeader}>
                <Text style={s.logIdText}>ID: {log.log_id.substring(0, 13)}...</Text>
                <Text style={s.timestampText}>{log.timestamp}</Text>
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardDetail}><Text style={s.bold}>User:</Text> {log.user_id}</Text>
                <Text style={s.cardDetail}><Text style={s.bold}>Action:</Text> {log.action}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* --- DETAIL MODAL --- */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Log Details</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalContent}>
            {selectedLog && (
              <View style={s.detailsBox}>
                <Text style={s.detailItem}><Text style={s.bold}>Log ID:</Text> {selectedLog.log_id}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Time:</Text> {selectedLog.timestamp}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>User ID:</Text> {selectedLog.user_id}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Action:</Text> {selectedLog.action}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Status:</Text> {selectedLog.status}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Pointer:</Text> {selectedLog.chat_pointer}</Text>
              </View>
            )}

            {/* Render the chat transcript if it has been fetched */}
            {transcript && (
              <View style={s.transcriptBox}>
                <Text style={s.transcriptHeader}>Chat Transcript</Text>
                <View style={s.bubbleUser}>
                  <Text style={s.bubbleLabel}>User Prompt:</Text>
                  <Text style={s.bubbleText}>{transcript.user_prompt}</Text>
                </View>
                <View style={s.bubbleAi}>
                  <Text style={s.bubbleLabel}>AI Response:</Text>
                  <Text style={s.bubbleText}>{transcript.ai_response}</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bottom Right Retrieve Button */}
          <View style={s.modalFooter}>
            {!transcript && selectedLog?.chat_pointer && (
              <TouchableOpacity 
                style={s.retrieveBtn} 
                onPress={() => retrieveReport(selectedLog.chat_pointer)}
                disabled={fetchingTranscript}
              >
                {fetchingTranscript ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.retrieveBtnText}>Retrieve Report</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  pageTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub: { color: C.textSub, fontSize: 12, marginTop: 2 },
  refreshBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshBtnText: { color: C.text, fontSize: 12, fontWeight: '600' },
  emptyState: { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 16, padding: 60, alignItems: 'center', marginTop: 16, backgroundColor: C.card },
  emptyTitle: { color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  muted: { color: C.textMuted, fontSize: 12, textAlign: 'center' },
  
  // List Item Styles
  logCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, padding: 14, marginBottom: 12, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 8, marginBottom: 8 },
  logIdText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  timestampText: { color: C.textMuted, fontSize: 11 },
  cardBody: { gap: 4 },
  cardDetail: { color: C.text, fontSize: 13 },
  bold: { fontWeight: '700' },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: C.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: C.text },
  closeBtnText: { color: C.red, fontSize: 16, fontWeight: '600' },
  modalContent: { flex: 1, padding: 20 },
  detailsBox: { backgroundColor: C.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, marginBottom: 20 },
  detailItem: { color: C.text, fontSize: 14, marginBottom: 8 },
  
  // Transcript Styles
  transcriptBox: { marginTop: 10, paddingBottom: 40 },
  transcriptHeader: { fontSize: 16, fontWeight: 'bold', color: C.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  bubbleUser: { backgroundColor: '#e0f2fe', padding: 14, borderRadius: 12, marginBottom: 12 },
  bubbleAi: { backgroundColor: '#f1f5f9', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  bubbleLabel: { fontSize: 11, fontWeight: 'bold', color: '#475569', marginBottom: 6, textTransform: 'uppercase' },
  bubbleText: { fontSize: 14, color: '#0f172a', lineHeight: 20 },

  // Footer Styles
  modalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'flex-end', backgroundColor: C.card },
  retrieveBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retrieveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});
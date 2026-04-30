import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebaseConfig'; 
import { C } from '../theme';

export default function History() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal & Detail State
  const [selectedLog, setSelectedLog] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useFocusEffect(
      useCallback(() => { 
        let unsubscribe; // We need to store this to clean up the listener

        const setupLiveListener = async () => {
          setLoading(true);

          try {
            // 1. Get the current user from local storage EVERY time the screen opens
            const userJson = await AsyncStorage.getItem('user');
            const user = userJson ? JSON.parse(userJson) : null;
            
            const userId = user?.uid || user?.id || user?.email || "anonymous_user";
            const userRole = user?.role || 'beginner';

            // 2. Build the query based on their freshly fetched role
            const logsRef = collection(db, 'audit_logs');
            let q;

            if (userRole === 'admin') {
              // Admins see everything
              q = query(logsRef, orderBy('last_updated', 'desc'));
            } else {
              // Regular users only see their own logs
              q = query(
                logsRef, 
                where('user_id', '==', userId), 
                orderBy('last_updated', 'desc')
              );
            }
            
            // 3. Open the live connection
            unsubscribe = onSnapshot(q, (snapshot) => {
              const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setLogs(data);
              setLoading(false);
            }, (error) => {
              console.error("Error with real-time logs:", error);
              Alert.alert("Error", "Lost connection to Firebase live updates.");
              setLoading(false);
            });

          } catch (err) {
            console.error("Failed to load user auth state:", err);
            setLoading(false);
          }
        };

        setupLiveListener();

        // Cleanup: This disconnects the old listener when the user leaves the screen!
        return () => {
          if (unsubscribe) unsubscribe();
        };
      }, [])
    );

  const openLogDetails = (log) => {
    setSelectedLog(log);
    setModalVisible(true);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.pageTitle}>Audit History</Text>
            <Text style={s.pageSub}>Live database records</Text>
          </View>
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
                <Text style={s.logIdText}>ID: {log.log_id.substring(0, 15)}...</Text>
                <Text style={s.timestampText}>{log.last_updated}</Text>
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
                <Text style={s.detailItem}><Text style={s.bold}>Session ID:</Text> {selectedLog.log_id}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Last Updated:</Text> {selectedLog.last_updated}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>User ID:</Text> {selectedLog.user_id}</Text>
                <Text style={s.detailItem}><Text style={s.bold}>Status:</Text> {selectedLog.status}</Text>
              </View>
            )}

            {/* Render the chat array! */}
            {selectedLog && selectedLog.messages && (
              <View style={s.transcriptBox}>
                <Text style={s.transcriptHeader}>Chat Transcript</Text>
                {selectedLog.messages.map((msg, index) => (
                  <View key={index} style={{ marginBottom: 20 }}>
                    <View style={s.bubbleUser}>
                      <Text style={s.bubbleLabel}>User ({msg.timestamp}):</Text>
                      <Text style={s.bubbleText}>{msg.user_prompt}</Text>
                    </View>
                    <View style={s.bubbleAi}>
                      <Text style={s.bubbleLabel}>AI Response:</Text>
                      <Text style={s.bubbleText}>{msg.ai_response}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
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
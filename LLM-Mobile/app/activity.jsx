import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { C } from '../theme';

const TYPE_CONFIG = {
  alert:    { label: 'Alert',    labelColor: C.red,    bg: '#fee2e2' },
  priority: { label: 'Priority', labelColor: C.orange, bg: '#ffedd5' },
  share:    { label: 'Info',     labelColor: C.green,  bg: '#dcfce7' },
  info:     { label: 'System',   labelColor: C.blue,   bg: '#dbeafe' },
};

const TABS = [
  { key: 'all',   label: 'All'    },
  { key: 'alert', label: 'Alerts' },
  { key: 'info',  label: 'System' },
];

export default function Activity() {
  const [alerts, setAlerts]   = useState([]);
  const [filter, setFilter]   = useState('all');
  const [loading, setLoading] = useState(true);
  const [user, setUser]       = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadUser();
    }, [])
  );

  const loadUser = async () => {
    const raw = await AsyncStorage.getItem('user');
    const u   = raw ? JSON.parse(raw) : null;
    setUser(u);
    fetchAlerts(u);
  };

  const fetchAlerts = async (u) => {
    setLoading(true);
    try {
      // ✅ FIXED — extract role and email from u
      const role      = u?.role  || 'beginner';
      const userEmail = u?.email || '';

      console.log('USER EMAIL:', userEmail);
      console.log('ROLE:', role);

      const alertsRef = collection(db, 'Alerts');
      let q;

      if (role === 'admin') {
        q = query(alertsRef, orderBy('createdAt', 'desc'));
      } else {
        q = query(
          alertsRef,
          where('userEmail', '==', userEmail),
          orderBy('createdAt', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().createdAt?.toDate
          ? formatTime(doc.data().createdAt.toDate())
          : 'Just now',
      }));
      setAlerts(data);
    } catch (e) {
      console.log('Error fetching alerts:', e.message);
    }
    setLoading(false);
  };

  const formatTime = (date) => {
    const diff = Math.floor((Date.now() - new Date(date)) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(date).toLocaleDateString();
  };

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);
  const isAdmin  = user?.role === 'admin';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        <View style={s.headerRow}>
          <View>
            <Text style={s.pageTitle}>Activity & Alerts</Text>
            <Text style={s.pageSub}>
              {isAdmin ? 'Real-time feed from all active queries' : 'Your personal activity feed'}
            </Text>
          </View>
          <View style={s.liveRow}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>Live</Text>
          </View>
        </View>

        {!isAdmin && (
          <View style={s.noticeBanner}>
            <Text style={s.noticeText}>
              👤 Showing activity for your account only. Contact admin to view all.
            </Text>
          </View>
        )}

        <View style={s.tabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setFilter(tab.key)}
              style={[s.tab, {
                borderColor:     filter === tab.key ? C.primary : C.cardBorder,
                backgroundColor: filter === tab.key ? C.primaryLight : C.card,
              }]}
            >
              <Text style={[s.tabText, { color: filter === tab.key ? C.primaryText : C.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={C.primary} />
            <Text style={s.muted}>Loading activity feed…</Text>
          </View>
        )}

        {!loading && filtered.map(alert => {
          const cfg = TYPE_CONFIG[alert.type] || TYPE_CONFIG.info;
          return (
            <View key={alert.id} style={s.feedCard}>
              <View style={[s.iconBox, { backgroundColor: cfg.bg }]}>
                <Text style={{ fontSize: 18 }}>{alert.icon || '🔍'}</Text>
              </View>
              <View style={s.feedContent}>
                <View style={s.feedTopRow}>
                  <View style={[s.typeBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.typeBadgeText, { color: cfg.labelColor }]}>{cfg.label}</Text>
                  </View>
                  <Text style={s.timestamp}>{alert.timestamp}</Text>
                </View>
                <Text style={s.feedTitle}>{alert.title}</Text>
                <Text style={s.feedMessage}>{alert.message}</Text>
                {isAdmin && alert.role && (
                  <Text style={s.roleTag}>Role: {alert.role.toUpperCase()}</Text>
                )}
                {isAdmin && alert.userEmail && (
                  <Text style={s.emailTag}>📧 {alert.userEmail}</Text>
                )}
                <View style={s.feedBottom}>
                  {alert.status ? (
                    <View style={[s.statusBadge, { backgroundColor: alert.statusBg || '#dcfce7' }]}>
                      <Text style={[s.statusText, { color: alert.statusColor || C.green }]}>{alert.status}</Text>
                    </View>
                  ) : <View />}
                </View>
              </View>
            </View>
          );
        })}

        {!loading && filtered.length === 0 && (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🔔</Text>
            <Text style={s.emptyTitle}>No Activity Yet</Text>
            <Text style={s.muted}>
              {isAdmin
                ? 'No queries have been submitted yet.'
                : 'You have no activity logged yet. Start by asking a question in the Dashboard.'}
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
  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  pageTitle:     { color: C.text, fontSize: 20, fontWeight: '700' },
  pageSub:       { color: C.textSub, fontSize: 11, marginTop: 2 },
  liveRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  liveText:      { color: C.green, fontSize: 12, fontWeight: '700' },
  noticeBanner:  { backgroundColor: C.primaryLight, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.cardBorder },
  noticeText:    { color: C.primaryText, fontSize: 12, lineHeight: 18 },
  tabRow:        { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab:           { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  tabText:       { fontSize: 11, fontWeight: '600' },
  loadingBox:    { alignItems: 'center', paddingVertical: 40, gap: 10 },
  muted:         { color: C.textMuted, fontSize: 11, textAlign: 'center' },
  feedCard:      { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: C.cardBorder, elevation: 1 },
  iconBox:       { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feedContent:   { flex: 1 },
  feedTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  typeBadge:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  timestamp:     { color: C.textMuted, fontSize: 11 },
  feedTitle:     { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  feedMessage:   { color: C.textSub, fontSize: 12, lineHeight: 18 },
  roleTag:       { color: C.primary, fontSize: 10, fontWeight: '700', marginTop: 4 },
  emailTag:      { color: C.textMuted, fontSize: 10, marginTop: 2 },
  feedBottom:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  statusBadge:   { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:    { fontSize: 10, fontWeight: '700' },
  emptyState:    { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 16, padding: 40, alignItems: 'center', backgroundColor: C.card },
  emptyTitle:    { color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 6 },
});
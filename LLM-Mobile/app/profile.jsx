import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { useUser } from './_layout';

const ROLE_CONFIG = {
  admin:        { label: 'Supervisor / Admin',    color: '#7c3aed', bg: '#ede9fe', icon: 'shield-checkmark-outline' },
  expert:       { label: 'Worker — Expert',       color: '#16a34a', bg: '#f0fdf4', icon: 'star-outline'            },
  intermediate: { label: 'Worker — Intermediate', color: '#d97706', bg: '#fffbeb', icon: 'construct-outline'       },
  beginner:     { label: 'Worker — Beginner',     color: '#2563eb', bg: '#eff6ff', icon: 'book-outline'            },
};

export default function Profile() {
  const { user, setUser }     = useUser();
  const [stats, setStats]     = useState({ total: 0, approved: 0, rejected: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const router                = useRouter();
  const hasLoadedRef          = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (!hasLoadedRef.current) setLoading(true);
      const loadStats = async () => {
        try {
          const userId = user.uid || user.id || user.email || 'anonymous_user';
          const snap   = await getDocs(query(collection(db, 'audit_logs'), where('user_id', '==', userId), limit(30)));
          const logs   = snap.docs.map(d => d.data());
          setStats({
            total:    logs.length,
            approved: logs.filter(l => l.status === 'approved').length,
            rejected: logs.filter(l => l.status === 'rejected').length,
            pending:  logs.filter(l => l.status === 'pending_review').length,
          });
        } catch (_err) { console.error('[Profile] Stats load error:', _err); }
        hasLoadedRef.current = true;
        setLoading(false);
      };
      loadStats();
    }, [user])
  );

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) {
        AsyncStorage.removeItem('user');
        setUser(null);
        window.location.href = '/';
      }
      return;
    }
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('user');
        setUser(null);
        router.replace('/login');
      }},
    ]);
  };

  if (loading) return (
    <SafeAreaView style={s.safe}><ActivityIndicator color={C.primary} size="large" style={{ marginTop: 60 }} /></SafeAreaView>
  );
  if (!user) return (
    <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.muted}>Not logged in.</Text></View></SafeAreaView>
  );

  const roleCfg  = ROLE_CONFIG[user.role] || ROLE_CONFIG.beginner;
  const initials = (user.username || user.email || 'U').slice(0, 2).toUpperCase();
  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* ─── Header ──────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.displayName}>{user.username || 'Technician'}</Text>
          <Text style={s.emailText}>{user.email || 'No email'}</Text>
          <View style={[s.rolePill, { backgroundColor: roleCfg.bg }]}>
            <Ionicons name={roleCfg.icon} size={13} color={roleCfg.color} />
            <Text style={[s.rolePillText, { color: roleCfg.color }]}> {roleCfg.label}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* ─── Stats ───────────────────────────────────────────────── */}
          <View style={s.statsGrid}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{stats.total}</Text>
              <Text style={s.statLabel}>Sessions</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statValue, { color: '#16a34a' }]}>{stats.approved}</Text>
              <Text style={s.statLabel}>Approved</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statValue, { color: '#d97706' }]}>{stats.pending}</Text>
              <Text style={s.statLabel}>Pending</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statValue, { color: '#dc2626' }]}>{stats.rejected}</Text>
              <Text style={s.statLabel}>Rejected</Text>
            </View>
          </View>

          {/* ─── Account ─────────────────────────────────────────────── */}
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.card}>
            <Row iconName="person-outline"  label="Name"   value={user.username || 'Not set'} />
            <Row iconName="mail-outline"     label="Email"  value={user.email || 'Not set'} />
            <Row iconName="calendar-outline" label="Joined" value={joinDate} last />
          </View>



          {/* ─── Logout ──────────────────────────────────────────────── */}
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
            <Text style={s.logoutText}>Logout</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ iconName, label, value, last }) {
  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <Ionicons name={iconName} size={17} color={C.textMuted} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Action({ iconName, label, onPress }) {
  return (
    <TouchableOpacity style={s.actionRow} onPress={onPress}>
      <View style={s.actionIcon}>
        <Ionicons name={iconName} size={18} color={C.primary} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward-outline" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted:        { color: C.textMuted, fontSize: 14 },

  header:       { alignItems: 'center', paddingTop: 48, paddingBottom: 32, paddingHorizontal: 24, gap: 6 },
  avatarCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 3, borderColor: C.primary + '30' },
  avatarText:   { fontSize: 34, fontWeight: '700', color: C.primary },
  displayName:  { fontSize: 22, fontWeight: '700', color: C.text },
  emailText:    { fontSize: 13, color: C.textMuted },
  rolePill:     { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  rolePillText: { fontSize: 12, fontWeight: '700' },

  body:         { paddingHorizontal: 16, gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, marginTop: 8, marginBottom: 4 },

  statsGrid:    { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard:     { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.cardBorder },
  statValue:    { fontSize: 22, fontWeight: '800', color: C.text },
  statLabel:    { fontSize: 10, color: C.textMuted, marginTop: 2, fontWeight: '600' },

  card:         { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowBorder:    { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  rowLabel:     { color: C.textMuted, fontSize: 13, width: 56 },
  rowValue:     { flex: 1, color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },


  logoutBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 14, paddingVertical: 15, marginTop: 16 },
  logoutText:   { color: '#dc2626', fontWeight: '700', fontSize: 15 },
});
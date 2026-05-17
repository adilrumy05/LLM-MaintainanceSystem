import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

const ROLE_CONFIG = {
  admin:        { label: 'Supervisor / Admin',    color: '#7c3aed', bg: '#ede9fe', icon: 'shield-checkmark-outline', permissions: ['Manage Users & Roles', 'Configure AI Agents', 'Audit System Logs', 'Query RAG System', 'Approve / Reject Sessions'] },
  expert:       { label: 'Worker — Expert',       color: C.green,   bg: C.greenBg, icon: 'star-outline',            permissions: ['Full RAG Query Access', 'Update Maintenance Logs', 'Execute Disassembly Tasks', 'Authorize AI Recommendations'] },
  intermediate: { label: 'Worker — Intermediate', color: C.orange,  bg: C.orangeBg, icon: 'construct-outline',      permissions: ['Query RAG System', 'Update Maintenance Logs (Limited)', 'View Source Citations'] },
  beginner:     { label: 'Worker — Beginner',     color: C.blue,    bg: C.blueBg,  icon: 'book-outline',            permissions: ['View Disassembly Steps Only', 'Basic Query Access'] },
};

export default function Profile() {
  const [user, setUser]       = useState(null);
  const [stats, setStats]     = useState({ total: 0, approved: 0, rejected: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const router                = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const loadProfile = async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem('user');
      const u   = raw ? JSON.parse(raw) : null;
      setUser(u);
      if (!u) { setLoading(false); return; }
      const userId  = u.uid || u.id || u.email || 'anonymous_user';
      const snap    = await getDocs(query(collection(db, 'audit_logs'), where('user_id', '==', userId)));
      const logs    = snap.docs.map(d => d.data());
      setStats({
        total:    logs.length,
        approved: logs.filter(l => l.status === 'approved').length,
        rejected: logs.filter(l => l.status === 'rejected').length,
        pending:  logs.filter(l => l.status === 'pending_review').length,
      });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) {
        AsyncStorage.removeItem('user');
        router.replace('/login');
      }
      return;
    }
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('user');
        router.replace('/login');
      }},
    ]);
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator color={C.primary} size="large" style={{ marginTop: 60 }} /></SafeAreaView>;
  if (!user)   return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.muted}>Not logged in.</Text></View></SafeAreaView>;

  const roleCfg  = ROLE_CONFIG[user.role] || ROLE_CONFIG.beginner;
  const initials = (user.username || user.email || 'U').slice(0, 2).toUpperCase();
  const joinDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ─── Banner ──────────────────────────────────────────────── */}
        <View style={s.banner}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.displayName}>{user.username || 'Technician'}</Text>
          <Text style={s.emailText}>{user.email || 'No email'}</Text>
          <View style={[s.rolePill, { backgroundColor: roleCfg.bg }]}>
            <Ionicons name={roleCfg.icon} size={14} color={roleCfg.color} />
            <Text style={[s.rolePillText, { color: roleCfg.color }]}> {roleCfg.label}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* ─── Stats ───────────────────────────────────────────── */}
          <Text style={s.sectionLabel}>SESSION STATISTICS</Text>
          <View style={s.statsRow}>
            <StatCard label="Total"    value={stats.total}    color={C.primary} />
            <StatCard label="Approved" value={stats.approved} color={C.green}   />
            <StatCard label="Pending"  value={stats.pending}  color="#d97706"   />
            <StatCard label="Rejected" value={stats.rejected} color={C.red}     />
          </View>

          {/* ─── Account Info ─────────────────────────────────── */}
          <Text style={s.sectionLabel}>ACCOUNT INFO</Text>
          <View style={s.infoCard}>
            <InfoRow iconName="person-outline"   label="Name"   value={user.username || 'Not set'} />
            <InfoRow iconName="mail-outline"      label="Email"  value={user.email || 'Not set'} />
            <InfoRow iconName="shield-outline"    label="Role"   value={roleCfg.label} valueColor={roleCfg.color} />
            <InfoRow iconName="calendar-outline"  label="Joined" value={joinDate} last />
          </View>

          {/* ─── Permissions ──────────────────────────────────── */}
          <Text style={s.sectionLabel}>YOUR PERMISSIONS</Text>
          <View style={s.infoCard}>
            {roleCfg.permissions.map((perm, i) => (
              <View key={i} style={[s.permRow, i < roleCfg.permissions.length - 1 && s.permBorder]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={C.green} />
                <Text style={s.permText}>{perm}</Text>
              </View>
            ))}
          </View>

          {/* ─── Quick Actions ────────────────────────────────── */}
          <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
          <View style={s.actionsCard}>
            <ActionRow iconName="time-outline"          label="View My Audit History"     onPress={() => router.push('/history')} />
            <View style={s.actionDivider} />
            <ActionRow iconName="flash-outline"         label="Open Maintenance Copilot"  onPress={() => router.push('/dashboard')} />
            {user.role === 'admin' && <>
              <View style={s.actionDivider} />
              <ActionRow iconName="settings-outline"    label="Admin Dashboard"           onPress={() => router.push('/admin')} />
            </>}
          </View>

          {/* ─── Logout ───────────────────────────────────────── */}
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={C.red} />
            <Text style={s.logoutText}> Logout</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={[s.statCard, { borderColor: color }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ iconName, label, value, valueColor, last }) {
  return (
    <View style={[s.infoRow, !last && s.infoBorder]}>
      <Ionicons name={iconName} size={18} color={C.textSub} style={{ width: 24 }} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor && { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionRow({ iconName, label, onPress }) {
  return (
    <TouchableOpacity style={s.actionRow} onPress={onPress}>
      <Ionicons name={iconName} size={20} color={C.primary} style={{ width: 28 }} />
      <Text style={s.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward-outline" size={18} color={C.textMuted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted:        { color: C.textMuted, fontSize: 14 },
  banner:       { backgroundColor: C.primary, paddingTop: 40, paddingBottom: 32, alignItems: 'center', gap: 8 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText:   { fontSize: 32, fontWeight: '700', color: '#fff' },
  displayName:  { fontSize: 20, fontWeight: '700', color: '#fff' },
  emailText:    { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  rolePill:     { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  rolePillText: { fontSize: 12, fontWeight: '700' },
  body:         { padding: 16, gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.2, marginTop: 16, marginBottom: 8 },
  statsRow:     { flexDirection: 'row', gap: 8 },
  statCard:     { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  statValue:    { fontSize: 22, fontWeight: '700' },
  statLabel:    { fontSize: 10, color: C.textMuted, marginTop: 2, fontWeight: '600' },
  infoCard:     { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' },
  infoRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  infoBorder:   { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  infoLabel:    { color: C.textSub, fontSize: 13, width: 60 },
  infoValue:    { flex: 1, color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  permRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  permBorder:   { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  permText:     { color: C.text, fontSize: 13, flex: 1 },
  actionsCard:  { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' },
  actionRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  actionDivider:{ height: 1, backgroundColor: C.cardBorder },
  actionLabel:  { flex: 1, color: C.text, fontSize: 14, fontWeight: '600' },
  logoutBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.redBg, borderWidth: 1, borderColor: '#fecaca', borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  logoutText:   { color: C.red, fontWeight: '700', fontSize: 15 },
});
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useRouter, useFocusEffect } from 'expo-router';
import { C } from '../theme';

// ─── Role config ─────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin:        { label: 'Supervisor / Admin', color: '#7c3aed', bg: '#ede9fe', icon: '🛡️', permissions: ['Manage Users & Roles', 'Configure AI Agents', 'Audit System Logs', 'Query RAG System', 'Approve / Reject Sessions'] },
  expert:       { label: 'Worker — Expert',    color: C.green,   bg: C.greenBg, icon: '⭐', permissions: ['Full RAG Query Access', 'Update Maintenance Logs', 'Execute Disassembly Tasks', 'Authorize AI Recommendations'] },
  intermediate: { label: 'Worker — Intermediate', color: C.orange, bg: C.orangeBg, icon: '🔧', permissions: ['Query RAG System', 'Update Maintenance Logs (Limited)', 'View Source Citations'] },
  beginner:     { label: 'Worker — Beginner',  color: C.blue,    bg: C.blueBg,  icon: '📖', permissions: ['View Disassembly Steps Only', 'Basic Query Access'] },
};

export default function Profile() {
  const [user, setUser]         = useState(null);
  const [stats, setStats]       = useState({ total: 0, approved: 0, rejected: 0, pending: 0 });
  const [loading, setLoading]   = useState(true);
  const router                  = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  const loadProfile = async () => {
    setLoading(true);
    try {
      // 1. Load user from AsyncStorage
      const raw  = await AsyncStorage.getItem('user');
      const u    = raw ? JSON.parse(raw) : null;
      setUser(u);

      if (!u) { setLoading(false); return; }

      // 2. Get session stats from Firebase
      const userId = u.uid || u.id || u.email || 'anonymous_user';
      const logsRef = collection(db, 'audit_logs');
      const q = query(logsRef, where('user_id', '==', userId));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(d => d.data());

      setStats({
        total:    logs.length,
        approved: logs.filter(l => l.status === 'approved').length,
        rejected: logs.filter(l => l.status === 'rejected').length,
        pending:  logs.filter(l => l.status === 'pending_review').length,
      });
    } catch (e) {
      console.error('Profile load error:', e);
    }
    setLoading(false);
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

  if (loading) return (
    <SafeAreaView style={s.safe}>
      <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  if (!user) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={s.muted}>Not logged in.</Text>
        <TouchableOpacity onPress={() => router.replace('/login')} style={s.loginBtn}>
          <Text style={s.loginBtnText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const roleCfg   = ROLE_CONFIG[user.role] || ROLE_CONFIG.beginner;
  const initials  = (user.displayName || user.email || 'U').slice(0, 2).toUpperCase();
  const joinDate  = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ─── Header Banner ─────────────────────────────────────────────── */}
        <View style={s.banner}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.displayName}>{user.displayName || 'Technician'}</Text>
          <Text style={s.emailText}>{user.email || 'No email'}</Text>
          <View style={[s.rolePill, { backgroundColor: roleCfg.bg }]}>
            <Text style={[s.rolePillText, { color: roleCfg.color }]}>
              {roleCfg.icon}  {roleCfg.label}
            </Text>
          </View>
        </View>

        <View style={s.body}>

          {/* ─── Session Stats ───────────────────────────────────────────── */}
          <Text style={s.sectionLabel}>SESSION STATISTICS</Text>
          <View style={s.statsRow}>
            <View style={[s.statCard, { borderColor: C.primary }]}>
              <Text style={[s.statValue, { color: C.primary }]}>{stats.total}</Text>
              <Text style={s.statLabel}>Total</Text>
            </View>
            <View style={[s.statCard, { borderColor: C.green }]}>
              <Text style={[s.statValue, { color: C.green }]}>{stats.approved}</Text>
              <Text style={s.statLabel}>Approved</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#d97706' }]}>
              <Text style={[s.statValue, { color: '#d97706' }]}>{stats.pending}</Text>
              <Text style={s.statLabel}>Pending</Text>
            </View>
            <View style={[s.statCard, { borderColor: C.red }]}>
              <Text style={[s.statValue, { color: C.red }]}>{stats.rejected}</Text>
              <Text style={s.statLabel}>Rejected</Text>
            </View>
          </View>

          {/* ─── Account Info ────────────────────────────────────────────── */}
          <Text style={s.sectionLabel}>ACCOUNT INFO</Text>
          <View style={s.infoCard}>
            <InfoRow icon="👤" label="Name"     value={user.displayName || 'Not set'} />
            <InfoRow icon="📧" label="Email"    value={user.email || 'Not set'} />
            <InfoRow icon="🎭" label="Role"     value={roleCfg.label} valueColor={roleCfg.color} />
            <InfoRow icon="📅" label="Joined"   value={joinDate} last />
          </View>

          {/* ─── Permissions ─────────────────────────────────────────────── */}
          <Text style={s.sectionLabel}>YOUR PERMISSIONS</Text>
          <View style={s.infoCard}>
            {roleCfg.permissions.map((perm, i) => (
              <View key={i} style={[s.permRow, i < roleCfg.permissions.length - 1 && s.permBorder]}>
                <Text style={s.permCheck}>✓</Text>
                <Text style={s.permText}>{perm}</Text>
              </View>
            ))}
          </View>

          {/* ─── Quick Actions ───────────────────────────────────────────── */}
          <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
          <View style={s.actionsCard}>
            <TouchableOpacity style={s.actionRow} onPress={() => router.push('/history')}>
              <Text style={s.actionIcon}>🕐</Text>
              <Text style={s.actionLabel}>View My Audit History</Text>
              <Text style={s.actionArrow}>›</Text>
            </TouchableOpacity>
            <View style={s.actionDivider} />
            <TouchableOpacity style={s.actionRow} onPress={() => router.push('/dashboard')}>
              <Text style={s.actionIcon}>⚡</Text>
              <Text style={s.actionLabel}>Open Maintenance Copilot</Text>
              <Text style={s.actionArrow}>›</Text>
            </TouchableOpacity>
            {user.role === 'admin' && (
              <>
                <View style={s.actionDivider} />
                <TouchableOpacity style={s.actionRow} onPress={() => router.push('/admin')}>
                  <Text style={s.actionIcon}>⚙️</Text>
                  <Text style={s.actionLabel}>Admin Dashboard</Text>
                  <Text style={s.actionArrow}>›</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* ─── Logout ──────────────────────────────────────────────────── */}
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>Logout</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, valueColor, last }) {
  return (
    <View style={[s.infoRow, !last && s.infoBorder]}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor && { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted:        { color: C.textMuted, fontSize: 14 },
  loginBtn:     { marginTop: 16, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  loginBtnText: { color: '#fff', fontWeight: '700' },

  // Banner
  banner:       { backgroundColor: C.primary, paddingTop: 40, paddingBottom: 32, alignItems: 'center', gap: 8 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText:   { fontSize: 32, fontWeight: '700', color: '#fff' },
  displayName:  { fontSize: 20, fontWeight: '700', color: '#fff' },
  emailText:    { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  rolePill:     { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  rolePillText: { fontSize: 12, fontWeight: '700' },

  body:         { padding: 16, gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.2, marginTop: 16, marginBottom: 8 },

  // Stats
  statsRow:     { flexDirection: 'row', gap: 8 },
  statCard:     { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  statValue:    { fontSize: 22, fontWeight: '700' },
  statLabel:    { fontSize: 10, color: C.textMuted, marginTop: 2, fontWeight: '600' },

  // Info card
  infoCard:     { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' },
  infoRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  infoBorder:   { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  infoIcon:     { fontSize: 16, width: 24 },
  infoLabel:    { color: C.textSub, fontSize: 13, width: 60 },
  infoValue:    { flex: 1, color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },

  // Permissions
  permRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  permBorder:   { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  permCheck:    { color: C.green, fontWeight: '700', fontSize: 14 },
  permText:     { color: C.text, fontSize: 13, flex: 1 },

  // Actions
  actionsCard:  { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' },
  actionRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  actionDivider:{ height: 1, backgroundColor: C.cardBorder },
  actionIcon:   { fontSize: 18, width: 28 },
  actionLabel:  { flex: 1, color: C.text, fontSize: 14, fontWeight: '600' },
  actionArrow:  { color: C.textMuted, fontSize: 20 },

  // Logout
  logoutBtn:    { backgroundColor: C.redBg, borderWidth: 1, borderColor: '#fecaca', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutText:   { color: C.red, fontWeight: '700', fontSize: 15 },
});
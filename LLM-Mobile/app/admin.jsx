import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { C } from './theme';

const INITIAL_USERS = [
  { id: 1, initials: 'AR', name: 'Adil Rumy',                   email: 'adil.rumy@group6copilot.com',           role: 'admin'        },
  { id: 2, initials: 'PC', name: 'Prince Chikukwa',             email: 'prince.chikukwa@group6copilot.com',     role: 'expert'       },
  { id: 3, initials: 'AL', name: 'Andrei Lo Wen Heng',          email: 'andrei.lo@group6copilot.com',           role: 'expert'       },
  { id: 4, initials: 'AA', name: 'Aichner Anak Abert',          email: 'aichner.nunong@group6copilot.com',      role: 'intermediate' },
  { id: 5, initials: 'PC', name: 'Phillip Anthony Christopher', email: 'phillip.christopher@group6copilot.com', role: 'beginner'     },
];

const AUDIT_LOGS = [
  { id: 1, timestamp: '27 Mar · 14:35', user: 'Andrei Lo',    action: 'Approved Recommendation', taskId: '#1024', status: 'Approved' },
  { id: 2, timestamp: '27 Mar · 12:10', user: 'Aichner Anak', action: 'Override / Rejected',     taskId: '#1019', status: 'Rejected' },
  { id: 3, timestamp: '26 Mar · 09:22', user: 'Aichner Anak', action: 'Requested Revision',      taskId: '#1017', status: 'Revised'  },
];

const AGENTS = [
  { name: 'Data Retrieval',  icon: '📚' },
  { name: 'Safety Agent',    icon: '🛡'  },
  { name: 'Recommendation',  icon: '🧠' },
  { name: 'Alert Agent',     icon: '🚨' },
  { name: 'Priority Agent',  icon: '📊' },
  { name: 'Knowledge Agent', icon: '📗' },
];

const ROLE_COLORS = {
  admin:        '#7c3aed',
  expert:       '#2563eb',
  intermediate: '#16a34a',
  beginner:     '#9ca3af',
};

export default function Admin() {
  const [users, setUsers] = useState(INITIAL_USERS);
  const [tab, setTab]     = useState('users');
  const router            = useRouter();

  const handleRoleChange = (userId, newRole) => {
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const handleDelete = (userId) => {
    Alert.alert('Delete User', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setUsers(users.filter(u => u.id !== userId)) },
    ]);
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

  const statusColor = { Approved: C.green, Rejected: C.red, Revised: '#d97706' };
  const statusBg    = { Approved: C.greenBg, Rejected: C.redBg, Revised: '#fef3c7' };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>System Administration</Text>
            <Text style={s.pageSub}>User management · Audit log · Agents</Text>
          </View>
          <View style={s.headerRight}>
            <View style={s.adminBadge}>
              <Text style={s.adminBadgeText}>ADMIN</Text>
            </View>
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
              <Text style={s.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {[
            { key: 'users',  label: '👥 Users'  },
            { key: 'audit',  label: '🔒 Audit'  },
            { key: 'agents', label: '🤖 Agents' },
          ].map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[s.tab, tab === t.key && s.tabActive]}
            >
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* USERS */}
        {tab === 'users' && (
          <View>
            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>{users.length} users</Text>
              <TouchableOpacity style={s.addBtn}>
                <Text style={s.addBtnText}>+ Add User</Text>
              </TouchableOpacity>
            </View>
            {users.map(user => (
              <View key={user.id} style={s.card}>
                <View style={s.rowBetween}>
                  <View style={s.row}>
                    <View style={[s.avatar, { backgroundColor: ROLE_COLORS[user.role] + '22' }]}>
                      <Text style={[s.avatarText, { color: ROLE_COLORS[user.role] }]}>{user.initials}</Text>
                    </View>
                    <View style={{ marginLeft: 10 }}>
                      <Text style={s.userName}>{user.name}</Text>
                      <Text style={s.userEmail}>{user.email}</Text>
                    </View>
                  </View>
                  <View style={[s.roleBadge, { borderColor: ROLE_COLORS[user.role], backgroundColor: ROLE_COLORS[user.role] + '15' }]}>
                    <Text style={[s.roleBadgeText, { color: ROLE_COLORS[user.role] }]}>{user.role}</Text>
                  </View>
                </View>
                {user.role !== 'admin' ? (
                  <View style={[s.row, { marginTop: 10, marginBottom: 10, flexWrap: 'wrap', gap: 6 }]}>
                    {['expert', 'intermediate', 'beginner'].map(r => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => handleRoleChange(user.id, r)}
                        style={[s.pill, {
                          borderColor:     user.role === r ? ROLE_COLORS[r] : C.cardBorder,
                          backgroundColor: user.role === r ? ROLE_COLORS[r] + '15' : C.inputBg,
                        }]}
                      >
                        <Text style={[s.pillText, { color: user.role === r ? ROLE_COLORS[r] : C.textMuted }]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={[s.muted, { marginVertical: 10, textAlign: 'left' }]}>— locked (admin)</Text>
                )}
                <View style={s.row}>
                  <TouchableOpacity style={[s.actionBtn, { flex: 1, marginRight: 6 }]}>
                    <Text style={s.actionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  {user.role !== 'admin' && (
                    <TouchableOpacity style={[s.actionBtn, s.actionBtnRed, { flex: 1 }]} onPress={() => handleDelete(user.id)}>
                      <Text style={s.actionBtnRedText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* AUDIT */}
        {tab === 'audit' && (
          <View>
            <Text style={s.sectionTitle}>Audit Log</Text>
            <Text style={[s.muted, { marginBottom: 12, textAlign: 'left' }]}>Immutable record of all HITL decisions</Text>
            {AUDIT_LOGS.map(log => (
              <View key={log.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.mono}>{log.timestamp}</Text>
                  <View style={[s.statusPill, { backgroundColor: statusBg[log.status] }]}>
                    <Text style={[s.statusPillText, { color: statusColor[log.status] }]}>
                      {log.status === 'Approved' ? '✓ ' : log.status === 'Rejected' ? '✕ ' : '✏ '}
                      {log.status}
                    </Text>
                  </View>
                </View>
                <Text style={s.userName}>{log.user}</Text>
                <Text style={s.userEmail}>{log.action}</Text>
                <Text style={[s.mono, { color: C.orange, marginTop: 4 }]}>{log.taskId}</Text>
              </View>
            ))}
            <Text style={s.muted}>🔒 All HITL decisions are immutably recorded</Text>
          </View>
        )}

        {/* AGENTS */}
        {tab === 'agents' && (
          <View>
            <Text style={s.sectionTitle}>Agent Status</Text>
            <Text style={[s.muted, { marginBottom: 12, textAlign: 'left' }]}>{AGENTS.length} agents monitored</Text>
            <View style={s.agentGrid}>
              {AGENTS.map(agent => (
                <View key={agent.name} style={s.agentCard}>
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>{agent.icon}</Text>
                  <Text style={s.agentName}>{agent.name}</Text>
                  <View style={s.row}>
                    <View style={s.onlineDot} />
                    <Text style={s.onlineText}>Online</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={s.allOnlineCard}>
              <Text style={{ fontSize: 18 }}>✅</Text>
              <View style={{ marginLeft: 10 }}>
                <Text style={s.allOnlineText}>All {AGENTS.length} agents online</Text>
                <Text style={s.muted}>Auto-refreshes every 30s</Text>
              </View>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: C.bg },
  scroll:           { flex: 1, paddingHorizontal: 16 },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  pageTitle:        { color: C.text, fontSize: 17, fontWeight: '700' },
  pageSub:          { color: C.textSub, fontSize: 11, marginTop: 2 },
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminBadge:       { backgroundColor: C.primaryLight, borderWidth: 1, borderColor: C.primary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  adminBadgeText:   { color: C.primaryText, fontSize: 10, fontWeight: '700' },
  logoutBtn:        { backgroundColor: C.redBg, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  logoutText:       { color: C.red, fontSize: 11, fontWeight: '700' },
  tabRow:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.cardBorder, marginBottom: 20 },
  tab:              { marginRight: 16, paddingBottom: 12 },
  tabActive:        { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabText:          { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextActive:    { color: C.primary },
  rowBetween:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  row:              { flexDirection: 'row', alignItems: 'center' },
  sectionTitle:     { color: C.text, fontSize: 14, fontWeight: '700' },
  addBtn:           { backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText:       { color: '#fff', fontSize: 12, fontWeight: '700' },
  card:             { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.cardBorder, elevation: 1 },
  avatar:           { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText:       { fontSize: 12, fontWeight: '700' },
  userName:         { color: C.text, fontSize: 13, fontWeight: '700' },
  userEmail:        { color: C.textSub, fontSize: 11, marginTop: 1 },
  roleBadge:        { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText:    { fontSize: 10, fontWeight: '700' },
  pill:             { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:         { fontSize: 10, fontWeight: '700' },
  actionBtn:        { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionBtnText:    { color: C.textSub, fontSize: 12, fontWeight: '600' },
  actionBtnRed:     { borderColor: '#fecaca' },
  actionBtnRedText: { color: C.red, fontSize: 12, fontWeight: '600' },
  mono:             { color: C.textMuted, fontSize: 11, fontFamily: 'monospace' },
  statusPill:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusPillText:   { fontSize: 11, fontWeight: '700' },
  muted:            { color: C.textMuted, fontSize: 11, textAlign: 'center' },
  agentGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  agentCard:        { backgroundColor: C.card, borderRadius: 16, padding: 16, alignItems: 'center', width: '47%', borderWidth: 1, borderColor: C.cardBorder },
  agentName:        { color: C.text, fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  onlineDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 4 },
  onlineText:       { color: C.green, fontSize: 11, fontWeight: '600' },
  allOnlineCard:    { marginTop: 12, backgroundColor: C.greenBg, borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  allOnlineText:    { color: C.green, fontSize: 13, fontWeight: '700' },
});
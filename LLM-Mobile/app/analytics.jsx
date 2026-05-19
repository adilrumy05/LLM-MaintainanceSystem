import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { useUser } from './_layout';

const ROLE_ID_MAP = {
  'admin':               'admin',
  'worker_expert':       'expert',
  'worker_intermediate': 'intermediate',
  'worker_beginner':     'beginner',
};

export default function Analytics() {
  const { user }                    = useUser();
  const router                      = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const [logs,         setLogs]         = useState(null);
  const [users,        setUsers]        = useState(null);
  const [alertsCount,  setAlertsCount]  = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (user.role !== 'admin') { router.replace('/dashboard'); return; }

      let unsubLogs, unsubUsers, unsubAlerts;

      unsubLogs = onSnapshot(
        query(collection(db, 'audit_logs'), orderBy('last_updated', 'desc'), limit(100)),
        (snap) => setLogs(snap.docs.map(d => d.data())),
        (e)    => console.error('[Analytics] Logs error:', e)
      );

      unsubUsers = onSnapshot(
        query(collection(db, 'Users'), limit(100)),
        (snap) => setUsers(snap.docs.map(d => d.data())),
        (e)    => console.error('[Analytics] Users error:', e)
      );

      unsubAlerts = onSnapshot(
        query(collection(db, 'Alerts'), limit(100)),
        (snap) => setAlertsCount(snap.size),
        (e)    => console.error('[Analytics] Alerts error:', e)
      );

      return () => {
        if (unsubLogs)   unsubLogs();
        if (unsubUsers)  unsubUsers();
        if (unsubAlerts) unsubAlerts();
      };
    }, [user, router])
  );

  const metrics = useMemo(() => {
    if (logs === null || users === null || alertsCount === null) return null;

    const totalSessions = logs.length;
    const approved      = logs.filter(l => l.status === 'approved').length;
    const rejected      = logs.filter(l => l.status === 'rejected').length;
    const pending       = logs.filter(l => l.status === 'pending_review').length;
    const approvalRate  = totalSessions > 0 ? Math.round((approved / totalSessions) * 100) : 0;

    const userQueryMap = {};
    logs.forEach(l => {
      const uid = l.user_id || 'unknown';
      userQueryMap[uid] = (userQueryMap[uid] || 0) + (l.messages?.length || 0);
    });
    const topUsers     = Object.entries(userQueryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, count }));
    const totalQueries = Object.values(userQueryMap).reduce((a, b) => a + b, 0);

    const totalUsers  = users.length;
    const activeUsers = users.filter(u => u.isActive).length;
    const roleCounts  = { admin: 0, expert: 0, intermediate: 0, beginner: 0 };
    users.forEach(u => {
      const r = ROLE_ID_MAP[u.role_id] || u.role?.toLowerCase();
      if (r && roleCounts[r] !== undefined) roleCounts[r]++;
    });

    const dayLabels = [], dayCounts = [];
    for (let i = 6; i >= 0; i--) {
      const d       = new Date();
      d.setDate(d.getDate() - i);
      const label   = d.toLocaleDateString('en-GB', { weekday: 'short' });
      const dateStr = d.toISOString().split('T')[0];
      const count   = logs.filter(l => l.last_updated?.startsWith(dateStr)).length;
      dayLabels.push(label);
      dayCounts.push(count);
    }

    return {
      totalSessions, approved, rejected, pending, approvalRate,
      totalQueries, topUsers, totalUsers, activeUsers, roleCounts,
      totalAlerts: alertsCount, dayLabels, dayCounts,
    };
  }, [logs, users, alertsCount]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 600));
    setRefreshing(false);
  };

  if (!metrics) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const maxDay  = Math.max(...metrics.dayCounts, 1);
  const maxUser = Math.max(...metrics.topUsers.map(u => u.count), 1);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.header}>
          <View>
            <Text style={s.pageTitle}>Analytics</Text>
            <Text style={s.pageSub}>Live system metrics · Admin only</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh}>
            {refreshing ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="refresh-outline" size={18} color={C.primary} />}
            <Text style={s.refreshText}> {refreshing ? 'Updating…' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.body}>
          <Text style={s.sectionLabel}>OVERVIEW</Text>
          <View style={s.kpiRow}>
            <KpiCard iconName="chatbubble-outline" label="Total Sessions" value={metrics.totalSessions} color={C.primary} />
            <KpiCard iconName="search-outline" label="Total Queries" value={metrics.totalQueries} color={C.blue} />
          </View>
          <View style={s.kpiRow}>
            <KpiCard iconName="people-outline" label="Total Users" value={metrics.totalUsers} color={C.green} />
            <KpiCard iconName="ellipse" label="Active Users" value={metrics.activeUsers} color="#d97706" />
          </View>
          <View style={s.kpiRow}>
            <KpiCard iconName="notifications-outline" label="Total Alerts" value={metrics.totalAlerts} color={C.red} />
            <KpiCard iconName="checkmark-circle-outline" label="Approval Rate" value={`${metrics.approvalRate}%`} color={C.green} />
          </View>
          <Text style={s.sectionLabel}>SESSION STATUS</Text>
          <View style={s.card}>
            <StatusBar iconName="checkmark-circle-outline" label="Approved" value={metrics.approved} total={metrics.totalSessions} color={C.green} />
            <StatusBar iconName="time-outline" label="Pending" value={metrics.pending} total={metrics.totalSessions} color="#d97706" />
            <StatusBar iconName="close-circle-outline" label="Rejected" value={metrics.rejected} total={metrics.totalSessions} color={C.red} />
          </View>
          <Text style={s.sectionLabel}>SESSIONS — LAST 7 DAYS</Text>
          <View style={s.card}>
            <View style={s.barChartRow}>
              {metrics.dayCounts.map((count, i) => (
                <View key={i} style={s.barCol}>
                  <Text style={s.barValue}>{count > 0 ? count : ''}</Text>
                  <View style={s.barTrack}><View style={[s.barFill, { height: `${Math.max((count / maxDay) * 100, count > 0 ? 8 : 2)}%`, backgroundColor: count > 0 ? C.primary : C.cardBorder }]} /></View>
                  <Text style={s.barLabel}>{metrics.dayLabels[i]}</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={s.sectionLabel}>USER ROLE DISTRIBUTION</Text>
          <View style={s.card}>
            {[ { role: 'admin', label: 'Admin', color: '#7c3aed', iconName: 'shield-checkmark-outline' },
               { role: 'expert', label: 'Expert', color: C.green, iconName: 'star-outline' },
               { role: 'intermediate', label: 'Intermediate', color: '#d97706', iconName: 'construct-outline' },
               { role: 'beginner', label: 'Beginner', color: C.blue, iconName: 'book-outline' },
            ].map(({ role, label, color, iconName }) => (
              <StatusBar key={role} iconName={iconName} label={label} value={metrics.roleCounts[role]} total={metrics.totalUsers} color={color} showCount />
            ))}
          </View>
          {metrics.topUsers.length > 0 && (
            <>
              <Text style={s.sectionLabel}>TOP ACTIVE USERS</Text>
              <View style={s.card}>
                {metrics.topUsers.map((u, i) => (
                  <View key={u.id} style={[s.userRow, i < metrics.topUsers.length - 1 && s.userBorder]}>
                    <View style={[s.rankBadge, { backgroundColor: i === 0 ? '#fef9c3' : C.primaryLight }]}><Text style={[s.rankText, { color: i === 0 ? '#d97706' : C.primary }]}>#{i + 1}</Text></View>
                    <Text style={s.userId} numberOfLines={1}>{u.id}</Text>
                    <View style={s.userBarWrap}><View style={[s.userBar, { width: `${(u.count / maxUser) * 100}%`, backgroundColor: C.primary }]} /></View>
                    <Text style={s.userCount}>{u.count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ iconName, label, value, color }) {
  return (
    <View style={[s.kpiCard, { borderColor: color }]}>
      <Ionicons name={iconName} size={24} color={color} />
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function StatusBar({ iconName, label, value, total, color, showCount }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <View style={s.statusBarRow}>
      <Ionicons name={iconName} size={14} color={color} />
      <Text style={s.statusBarLabel}> {label}</Text>
      <View style={s.statusBarTrack}><View style={[s.statusBarFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
      <Text style={[s.statusBarCount, { color }]}>{showCount ? value : `${value} (${Math.round(pct)}%)`}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted:          { color: C.textMuted, fontSize: 13 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  pageTitle:      { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub:        { color: C.textSub, fontSize: 12, marginTop: 2 },
  refreshBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  refreshText:    { color: C.primary, fontWeight: '700', fontSize: 13 },
  body:           { paddingHorizontal: 16, paddingBottom: 20 },
  sectionLabel:   { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
  card:           { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16, gap: 14 },
  kpiRow:         { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCard:        { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1.5, padding: 16, alignItems: 'center', gap: 4 },
  kpiValue:       { fontSize: 26, fontWeight: '700' },
  kpiLabel:       { fontSize: 10, color: C.textMuted, fontWeight: '600', textAlign: 'center' },
  statusBarRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBarLabel: { color: C.text, fontSize: 12, fontWeight: '600', width: 86 },
  statusBarTrack: { flex: 1, height: 8, backgroundColor: C.cardBorder, borderRadius: 4, overflow: 'hidden' },
  statusBarFill:  { height: '100%', borderRadius: 4 },
  statusBarCount: { width: 70, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  barChartRow:    { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 },
  barCol:         { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue:       { fontSize: 9, color: C.primary, fontWeight: '700', marginBottom: 2 },
  barTrack:       { width: '100%', height: 80, justifyContent: 'flex-end' },
  barFill:        { width: '100%', borderRadius: 4, minHeight: 2 },
  barLabel:       { fontSize: 10, color: C.textMuted, marginTop: 4, fontWeight: '600' },
  userRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  userBorder:     { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  rankBadge:      { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankText:       { fontSize: 11, fontWeight: '700' },
  userId:         { flex: 1, color: C.text, fontSize: 12, fontWeight: '600' },
  userBarWrap:    { width: 60, height: 6, backgroundColor: C.cardBorder, borderRadius: 3, overflow: 'hidden' },
  userBar:        { height: '100%', borderRadius: 3 },
  userCount:      { width: 24, color: C.primary, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});
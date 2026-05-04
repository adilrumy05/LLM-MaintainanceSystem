import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../theme';

export default function Analytics() {
  const [loading, setLoading]   = useState(true);
  const [metrics, setMetrics]   = useState(null);
  const router                  = useRouter();

  useFocusEffect(
    useCallback(() => {
      checkAdminAndLoad();
    }, [])
  );

  const checkAdminAndLoad = async () => {
    const raw  = await AsyncStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    if (user?.role !== 'admin') { router.replace('/dashboard'); return; }
    loadMetrics();
  };

  const loadMetrics = async () => {
    setLoading(true);
    try {
      // ── Fetch audit logs ────────────────────────────────────────────────
      const logsSnap = await getDocs(query(collection(db, 'audit_logs'), orderBy('last_updated', 'desc')));
      const logs = logsSnap.docs.map(d => d.data());

      const totalSessions = logs.length;
      const approved      = logs.filter(l => l.status === 'approved').length;
      const rejected      = logs.filter(l => l.status === 'rejected').length;
      const pending       = logs.filter(l => l.status === 'pending_review').length;
      const approvalRate  = totalSessions > 0 ? Math.round((approved / totalSessions) * 100) : 0;

      // ── Queries per user (top 5) ────────────────────────────────────────
      const userQueryMap = {};
      logs.forEach(l => {
        const uid = l.user_id || 'unknown';
        userQueryMap[uid] = (userQueryMap[uid] || 0) + (l.messages?.length || 0);
      });
      const topUsers = Object.entries(userQueryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ id, count }));

      const totalQueries = Object.values(userQueryMap).reduce((a, b) => a + b, 0);

      // ── Fetch users ─────────────────────────────────────────────────────
      const usersSnap = await getDocs(collection(db, 'Users'));
      const users     = usersSnap.docs.map(d => d.data());
      const totalUsers   = users.length;
      const activeUsers  = users.filter(u => u.isActive).length;

      const roleCounts = { admin: 0, expert: 0, intermediate: 0, beginner: 0 };
      users.forEach(u => {
        const r = u.role?.toLowerCase();
        if (roleCounts[r] !== undefined) roleCounts[r]++;
      });

      // ── Fetch alerts ────────────────────────────────────────────────────
      const alertsSnap  = await getDocs(collection(db, 'Alerts'));
      const totalAlerts = alertsSnap.size;

      // ── Activity last 7 days ────────────────────────────────────────────
      const dayLabels = [];
      const dayCounts = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
        const dateStr = d.toISOString().split('T')[0];
        const count = logs.filter(l => l.last_updated?.startsWith(dateStr)).length;
        dayLabels.push(label);
        dayCounts.push(count);
      }

      setMetrics({
        totalSessions, approved, rejected, pending, approvalRate,
        totalQueries, topUsers,
        totalUsers, activeUsers, roleCounts,
        totalAlerts,
        dayLabels, dayCounts,
      });
    } catch (e) {
      console.error('Analytics load error:', e);
    }
    setLoading(false);
  };

  if (loading) return (
    <SafeAreaView style={s.safe}>
      <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  if (!metrics) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}><Text style={s.muted}>Failed to load analytics.</Text></View>
    </SafeAreaView>
  );

  const maxDay  = Math.max(...metrics.dayCounts, 1);
  const maxUser = Math.max(...metrics.topUsers.map(u => u.count), 1);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ─── Header ──────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.pageTitle}>Analytics</Text>
            <Text style={s.pageSub}>Live system metrics · Admin only</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={loadMetrics}>
            <Text style={s.refreshText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={s.body}>

          {/* ─── Top KPI Cards ───────────────────────────────────────── */}
          <Text style={s.sectionLabel}>OVERVIEW</Text>
          <View style={s.kpiRow}>
            <KpiCard label="Total Sessions" value={metrics.totalSessions} color={C.primary} icon="💬" />
            <KpiCard label="Total Queries"  value={metrics.totalQueries}  color={C.blue}    icon="🔍" />
          </View>
          <View style={s.kpiRow}>
            <KpiCard label="Total Users"   value={metrics.totalUsers}   color={C.green}  icon="👥" />
            <KpiCard label="Active Users"  value={metrics.activeUsers}  color="#d97706"  icon="🟢" />
          </View>
          <View style={s.kpiRow}>
            <KpiCard label="Total Alerts"  value={metrics.totalAlerts}  color={C.red}    icon="🔔" />
            <KpiCard label="Approval Rate" value={`${metrics.approvalRate}%`} color={C.green} icon="✅" />
          </View>

          {/* ─── Session Status Breakdown ─────────────────────────── */}
          <Text style={s.sectionLabel}>SESSION STATUS</Text>
          <View style={s.card}>
            <StatusBar label="Approved" value={metrics.approved} total={metrics.totalSessions} color={C.green} icon="✅" />
            <StatusBar label="Pending"  value={metrics.pending}  total={metrics.totalSessions} color="#d97706" icon="⏳" />
            <StatusBar label="Rejected" value={metrics.rejected} total={metrics.totalSessions} color={C.red}   icon="❌" />
          </View>

          {/* ─── Activity Last 7 Days ─────────────────────────────── */}
          <Text style={s.sectionLabel}>SESSIONS — LAST 7 DAYS</Text>
          <View style={s.card}>
            <View style={s.barChartRow}>
              {metrics.dayCounts.map((count, i) => (
                <View key={i} style={s.barCol}>
                  <Text style={s.barValue}>{count > 0 ? count : ''}</Text>
                  <View style={s.barTrack}>
                    <View style={[
                      s.barFill,
                      { height: `${Math.max((count / maxDay) * 100, count > 0 ? 8 : 2)}%`,
                        backgroundColor: count > 0 ? C.primary : C.cardBorder }
                    ]} />
                  </View>
                  <Text style={s.barLabel}>{metrics.dayLabels[i]}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ─── Role Distribution ───────────────────────────────── */}
          <Text style={s.sectionLabel}>USER ROLE DISTRIBUTION</Text>
          <View style={s.card}>
            {[
              { role: 'admin',        label: 'Admin',        color: '#7c3aed', icon: '🛡️' },
              { role: 'expert',       label: 'Expert',       color: C.green,   icon: '⭐' },
              { role: 'intermediate', label: 'Intermediate', color: '#d97706', icon: '🔧' },
              { role: 'beginner',     label: 'Beginner',     color: C.blue,    icon: '📖' },
            ].map(({ role, label, color, icon }) => (
              <StatusBar
                key={role}
                label={`${icon} ${label}`}
                value={metrics.roleCounts[role]}
                total={metrics.totalUsers}
                color={color}
                icon=""
                showCount
              />
            ))}
          </View>

          {/* ─── Top Active Users ─────────────────────────────────── */}
          {metrics.topUsers.length > 0 && (
            <>
              <Text style={s.sectionLabel}>TOP ACTIVE USERS</Text>
              <View style={s.card}>
                {metrics.topUsers.map((u, i) => (
                  <View key={u.id} style={[s.userRow, i < metrics.topUsers.length - 1 && s.userBorder]}>
                    <View style={[s.rankBadge, { backgroundColor: i === 0 ? '#fef9c3' : C.primaryLight }]}>
                      <Text style={[s.rankText, { color: i === 0 ? '#d97706' : C.primary }]}>#{i + 1}</Text>
                    </View>
                    <Text style={s.userId} numberOfLines={1}>{u.id}</Text>
                    <View style={s.userBarWrap}>
                      <View style={[s.userBar, { width: `${(u.count / maxUser) * 100}%`, backgroundColor: C.primary }]} />
                    </View>
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

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon }) {
  return (
    <View style={[s.kpiCard, { borderColor: color }]}>
      <Text style={s.kpiIcon}>{icon}</Text>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function StatusBar({ label, value, total, color, icon, showCount }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <View style={s.statusBarRow}>
      <Text style={s.statusBarLabel}>{icon ? `${icon} ` : ''}{label}</Text>
      <View style={s.statusBarTrack}>
        <View style={[s.statusBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.statusBarCount, { color }]}>
        {showCount ? value : `${value} (${Math.round(pct)}%)`}
      </Text>
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
  refreshBtn:     { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  refreshText:    { color: C.primary, fontWeight: '700', fontSize: 13 },
  body:           { paddingHorizontal: 16, paddingBottom: 20 },
  sectionLabel:   { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
  card:           { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16, gap: 14 },

  // KPI
  kpiRow:         { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCard:        { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1.5, padding: 16, alignItems: 'center', gap: 4 },
  kpiIcon:        { fontSize: 22 },
  kpiValue:       { fontSize: 26, fontWeight: '700' },
  kpiLabel:       { fontSize: 10, color: C.textMuted, fontWeight: '600', textAlign: 'center' },

  // Status bars
  statusBarRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBarLabel: { width: 90, color: C.text, fontSize: 12, fontWeight: '600' },
  statusBarTrack: { flex: 1, height: 8, backgroundColor: C.cardBorder, borderRadius: 4, overflow: 'hidden' },
  statusBarFill:  { height: '100%', borderRadius: 4 },
  statusBarCount: { width: 70, fontSize: 11, fontWeight: '700', textAlign: 'right' },

  // Bar chart
  barChartRow:    { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 },
  barCol:         { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue:       { fontSize: 9, color: C.primary, fontWeight: '700', marginBottom: 2 },
  barTrack:       { width: '100%', height: 80, justifyContent: 'flex-end' },
  barFill:        { width: '100%', borderRadius: 4, minHeight: 2 },
  barLabel:       { fontSize: 10, color: C.textMuted, marginTop: 4, fontWeight: '600' },

  // Top users
  userRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  userBorder:     { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  rankBadge:      { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankText:       { fontSize: 11, fontWeight: '700' },
  userId:         { flex: 1, color: C.text, fontSize: 12, fontWeight: '600' },
  userBarWrap:    { width: 60, height: 6, backgroundColor: C.cardBorder, borderRadius: 3, overflow: 'hidden' },
  userBar:        { height: '100%', borderRadius: 3 },
  userCount:      { width: 24, color: C.primary, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});
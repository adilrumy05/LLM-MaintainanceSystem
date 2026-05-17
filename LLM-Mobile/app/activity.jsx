import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Type config ─────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  alert:    { label: 'Alert',    labelColor: '#dc2626', bg: '#fef2f2', iconName: 'warning-outline'            },
  priority: { label: 'Priority', labelColor: '#d97706', bg: '#fffbeb', iconName: 'flag-outline'              },
  share:    { label: 'Info',     labelColor: '#16a34a', bg: '#f0fdf4', iconName: 'information-circle-outline' },
  info:     { label: 'System',   labelColor: '#2563eb', bg: '#eff6ff', iconName: 'search-outline'            },
};

const TABS = [
  { key: 'all',   label: 'All',    iconName: 'apps-outline'               },
  { key: 'alert', label: 'Alerts', iconName: 'warning-outline'            },
  { key: 'info',  label: 'System', iconName: 'information-circle-outline' },
];

// ─── Group alerts by date ─────────────────────────────────────────────────────
const groupByDate = (alerts) => {
  const groups = {};
  alerts.forEach(alert => {
    const date  = alert._rawDate || new Date();
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
    const d     = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    let label;
    if (d.getTime() === today.getTime())     label = 'Today';
    else if (d.getTime() === yest.getTime()) label = 'Yesterday';
    else label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(alert);
  });
  return Object.entries(groups);
};

export default function Activity() {
  const [alerts, setAlerts]         = useState([]);
  const [filter, setFilter]         = useState('all');
  const [loading, setLoading]       = useState(true);
  const [user, setUser]             = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useFocusEffect(useCallback(() => { loadUser(); }, []));

  const loadUser = async () => {
    const raw = await AsyncStorage.getItem('user');
    const u   = raw ? JSON.parse(raw) : null;
    setUser(u);
    fetchAlerts(u);
  };

  const fetchAlerts = async (u) => {
    setLoading(true);
    try {
      const role      = u?.role  || 'beginner';
      const userEmail = u?.email || '';
      const alertsRef = collection(db, 'Alerts');
      let q;
      if (role === 'admin') {
        q = query(alertsRef, orderBy('createdAt', 'desc'));
      } else {
        q = query(alertsRef, where('userEmail', '==', userEmail), orderBy('createdAt', 'desc'));
      }
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        _rawDate:  doc.data().createdAt?.toDate?.() || new Date(),
        timestamp: doc.data().createdAt?.toDate
          ? formatTime(doc.data().createdAt.toDate())
          : 'Just now',
      }));
      setAlerts(data);
    } catch (e) { console.log('Error fetching alerts:', e.message); }
    setLoading(false);
  };

  const formatTime = (date) => {
    const diff = Math.floor((Date.now() - new Date(date)) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => prev === id ? null : id);
  };

  const filtered   = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);
  const grouped    = groupByDate(filtered);
  const isAdmin    = user?.role === 'admin';
  const alertCount = alerts.filter(a => a.type === 'alert').length;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* ─── Header ──────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Activity</Text>
            <Text style={s.pageSub}>
              {isAdmin ? 'System-wide activity feed' : 'Your personal activity feed'}
            </Text>
          </View>
          <View style={s.headerRight}>
            {alertCount > 0 && (
              <View style={s.alertCountBadge}>
                <Text style={s.alertCountText}>{alertCount}</Text>
              </View>
            )}
            <View style={s.liveChip}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>Live</Text>
            </View>
          </View>
        </View>

        {/* ─── Worker notice ───────────────────────────────────────── */}
        {!isAdmin && (
          <View style={s.noticeBanner}>
            <Ionicons name="lock-closed-outline" size={13} color={C.primary} />
            <Text style={s.noticeText}> Your activity only. Contact admin to view all.</Text>
          </View>
        )}

        {/* ─── Filter tabs ─────────────────────────────────────────── */}
        <View style={s.tabRow}>
          {TABS.map(tab => {
            const active = filter === tab.key;
            const count  = tab.key === 'all'
              ? alerts.length
              : alerts.filter(a => a.type === tab.key).length;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setFilter(tab.key)}
                style={[s.tab, active && s.tabActive]}
              >
                <Ionicons name={tab.iconName} size={13} color={active ? C.primary : C.textMuted} />
                <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
                {count > 0 && (
                  <View style={[s.tabCount, active && s.tabCountActive]}>
                    <Text style={[s.tabCountText, active && s.tabCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── Loading ─────────────────────────────────────────────── */}
        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={s.muted}>Loading activity…</Text>
          </View>
        )}

        {/* ─── Grouped Feed ────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && grouped.map(([dateLabel, items]) => (
          <View key={dateLabel} style={s.group}>

            {/* Date group header */}
            <View style={s.groupHeader}>
              <View style={s.groupLine} />
              <Text style={s.groupLabel}>{dateLabel}</Text>
              <View style={s.groupLine} />
              <View style={s.groupCountBadge}>
                <Text style={s.groupCountText}>{items.length}</Text>
              </View>
            </View>

            {/* Cards */}
            {items.map(alert => {
              const cfg    = TYPE_CONFIG[alert.type] || TYPE_CONFIG.info;
              const isOpen = expandedId === alert.id;
              return (
                <TouchableOpacity
                  key={alert.id}
                  style={s.feedCard}
                  onPress={() => toggleExpand(alert.id)}
                  activeOpacity={0.85}
                >
                  {/* Accent bar */}
                  <View style={[s.accentBar, { backgroundColor: cfg.labelColor }]} />

                  <View style={s.cardInner}>

                    {/* Always visible: badge + title + chevron */}
                    <View style={s.cardSummary}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={s.cardTopRow}>
                          <View style={[s.typeBadge, { backgroundColor: cfg.bg }]}>
                            <Ionicons name={cfg.iconName} size={11} color={cfg.labelColor} />
                            <Text style={[s.typeBadgeText, { color: cfg.labelColor }]}>{cfg.label}</Text>
                          </View>
                          <Text style={s.timestamp}>{alert.timestamp}</Text>
                        </View>
                        <Text style={s.feedTitle} numberOfLines={isOpen ? undefined : 1}>
                          {alert.title}
                        </Text>
                      </View>
                      <Ionicons
                        name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
                        size={16}
                        color={C.textMuted}
                        style={{ marginLeft: 10, marginTop: 4 }}
                      />
                    </View>

                    {/* Expanded detail */}
                    {isOpen && (
                      <View style={s.cardDetail}>
                        <View style={s.detailDivider} />
                        <Text style={s.feedMessage}>{alert.message}</Text>

                        {/* Admin meta */}
                        {isAdmin && (alert.userEmail || alert.role) && (
                          <View style={s.metaRow}>
                            {alert.userEmail && (
                              <View style={s.metaChip}>
                                <Ionicons name="mail-outline" size={11} color={C.textMuted} />
                                <Text style={s.metaText}> {alert.userEmail}</Text>
                              </View>
                            )}
                            {alert.role && (
                              <View style={[s.metaChip, { backgroundColor: C.primaryLight, borderColor: C.primary + '33' }]}>
                                <Ionicons name="person-outline" size={11} color={C.primary} />
                                <Text style={[s.metaText, { color: C.primary }]}> {alert.role.toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Status */}
                        {alert.status && (
                          <View style={[s.statusBadge, { backgroundColor: alert.statusBg || '#f0fdf4' }]}>
                            <Text style={[s.statusText, { color: alert.statusColor || '#16a34a' }]}>
                              {alert.status}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* ─── Empty state ─────────────────────────────────────────── */}
        {!loading && filtered.length === 0 && (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="notifications-outline" size={32} color={C.primary} />
            </View>
            <Text style={s.emptyTitle}>No Activity Yet</Text>
            <Text style={s.emptyText}>
              {isAdmin
                ? 'No queries have been submitted yet.'
                : 'Start by asking a question in the Dashboard.'}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: C.bg },
  scroll:             { paddingHorizontal: 16 },

  // Header
  header:             { flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  pageTitle:          { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub:            { color: C.textSub, fontSize: 11, marginTop: 2 },
  headerRight:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertCountBadge:    { backgroundColor: '#fef2f2', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#fca5a5' },
  alertCountText:     { color: '#dc2626', fontSize: 11, fontWeight: '700' },
  liveChip:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 5, borderWidth: 1, borderColor: '#86efac' },
  liveDot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a' },
  liveText:           { color: '#16a34a', fontSize: 11, fontWeight: '700' },

  // Notice
  noticeBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.cardBorder },
  noticeText:         { color: C.primary, fontSize: 12, flex: 1, fontWeight: '500' },

  // Tabs
  tabRow:             { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab:                { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.card },
  tabActive:          { borderColor: C.primary, backgroundColor: C.primaryLight },
  tabText:            { fontSize: 12, fontWeight: '600', color: C.textMuted },
  tabTextActive:      { color: C.primary },
  tabCount:           { backgroundColor: C.cardBorder, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabCountActive:     { backgroundColor: C.primary + '22' },
  tabCountText:       { fontSize: 10, fontWeight: '700', color: C.textMuted },
  tabCountTextActive: { color: C.primary },

  // Loading
  loadingBox:         { alignItems: 'center', paddingVertical: 60, gap: 12 },
  muted:              { color: C.textMuted, fontSize: 12 },

  // Groups
  group:              { marginBottom: 6 },
  groupHeader:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 8 },
  groupLine:          { flex: 1, height: 1, backgroundColor: C.cardBorder },
  groupLabel:         { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  groupCountBadge:    { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  groupCountText:     { fontSize: 10, fontWeight: '700', color: C.primary },

  // Cards
  feedCard:           { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, flexDirection: 'row', overflow: 'hidden', marginBottom: 8 },
  accentBar:          { width: 4 },
  cardInner:          { flex: 1, padding: 14 },
  cardSummary:        { flexDirection: 'row', alignItems: 'flex-start' },
  cardTopRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  typeBadge:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText:      { fontSize: 10, fontWeight: '700' },
  timestamp:          { color: C.textMuted, fontSize: 11 },
  feedTitle:          { color: C.text, fontSize: 13, fontWeight: '700' },

  // Expanded
  cardDetail:         { marginTop: 10 },
  detailDivider:      { height: 1, backgroundColor: C.cardBorder, marginBottom: 10 },
  feedMessage:        { color: C.textSub, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  metaRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  metaChip:           { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.cardBorder },
  metaText:           { color: C.textMuted, fontSize: 10, fontWeight: '500' },
  statusBadge:        { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:         { fontSize: 10, fontWeight: '700' },

  // Empty
  emptyState:         { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIconWrap:      { width: 72, height: 72, borderRadius: 24, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:         { color: C.text, fontWeight: '700', fontSize: 16 },
  emptyText:          { color: C.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, maxWidth: 240 },
});
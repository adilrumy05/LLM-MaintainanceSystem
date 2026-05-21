import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, LayoutAnimation, Platform, UIManager, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { useUser } from './_layout';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatTime = (date) => {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

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

// ── Config ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  alert:    { label: 'Alert',    labelColor: '#dc2626', bg: '#fef2f2', iconName: 'warning-outline'            },
  priority: { label: 'Priority', labelColor: '#d97706', bg: '#fffbeb', iconName: 'flag-outline'              },
  share:    { label: 'Info',     labelColor: '#16a34a', bg: '#f0fdf4', iconName: 'information-circle-outline' },
  info:     { label: 'System',   labelColor: '#2563eb', bg: '#eff6ff', iconName: 'search-outline'            },
};

const TABS = [
  { key: 'all',      label: 'All',      iconName: 'apps-outline'               },
  { key: 'alert',    label: 'Alerts',   iconName: 'warning-outline'            },
  { key: 'priority', label: 'Priority', iconName: 'flag-outline'               },
  { key: 'info',     label: 'System',   iconName: 'information-circle-outline' },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Activity() {
  const { user }                    = useUser();
  const [alerts, setAlerts]         = useState([]);
  const [filter, setFilter]         = useState('all');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');

  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let unsubscribe;

      const role      = user.role  || 'beginner';
      const userEmail = user.email || '';
      const alertsRef = collection(db, 'Alerts');
      const q = role === 'admin'
        ? query(alertsRef, orderBy('createdAt', 'desc'), limit(30))
        : query(alertsRef, where('userEmail', '==', userEmail), orderBy('createdAt', 'desc'), limit(30));

      if (!hasLoadedRef.current) setLoading(true);

      unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(d => ({
          id:        d.id,
          ...d.data(),
          _rawDate:  d.data().createdAt?.toDate?.() || new Date(),
          timestamp: d.data().createdAt?.toDate
            ? formatTime(d.data().createdAt.toDate())
            : 'Just now',
        }));
        setAlerts(data);
        hasLoadedRef.current = true;
        setLoading(false);
      }, (e) => {
        console.log('Error fetching alerts:', e.message);
        setLoading(false);
      });

      return () => { if (unsubscribe) unsubscribe(); };
    }, [user])
  );

  const filtered = useMemo(() => {
    const base = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(a =>
      a.title?.toLowerCase().includes(q) ||
      a.userEmail?.toLowerCase().includes(q) ||
      a.message?.toLowerCase().includes(q)
    );
  }, [alerts, filter, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const flatData = useMemo(() => {
    const result = [];
    grouped.forEach(([label, items]) => {
      result.push({ _type: 'header', id: `header-${label}`, label, count: items.length });
      items.forEach(item => result.push({ _type: 'item', ...item }));
    });
    return result;
  }, [grouped]);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 600));
    setRefreshing(false);
  };

  const isAdmin    = user?.role === 'admin';
  const alertCount = alerts.filter(a => a.type === 'alert').length;

  // ── Render item (no expand/collapse) ───────────────────────────────────────
  const renderItem = ({ item }) => {
    if (item._type === 'header') {
      return (
        <View style={s.groupHeader}>
          <View style={s.groupLine} />
          <Text style={s.groupLabel}>{item.label}</Text>
          <View style={s.groupLine} />
          <View style={s.groupCountBadge}>
            <Text style={s.groupCountText}>{item.count}</Text>
          </View>
        </View>
      );
    }

    const alert  = item;
    const cfg    = TYPE_CONFIG[alert.type] || TYPE_CONFIG.info;
    return (
      <View style={s.feedCard}>
        <View style={[s.accentBar, { backgroundColor: cfg.labelColor }]} />
        <View style={s.cardInner}>
          <View style={s.cardTopRow}>
            <View style={[s.typeBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.iconName} size={11} color={cfg.labelColor} />
              <Text style={[s.typeBadgeText, { color: cfg.labelColor }]}>{cfg.label}</Text>
            </View>
            <Text style={s.timestamp}>{alert.timestamp}</Text>
          </View>
          <Text style={s.feedTitle}>{alert.title}</Text>
          <View style={s.cardDetail}>
            <View style={s.detailDivider} />
            <Text style={s.feedMessage}>{alert.message}</Text>
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
            {alert.status && (
              <View style={[s.statusBadge, { backgroundColor: alert.statusBg || '#f0fdf4' }]}>
                <Text style={[s.statusText, { color: alert.statusColor || '#16a34a' }]}>
                  {alert.status}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const ListHeader = () => (
    <View>
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
      {!isAdmin && (
        <View style={s.noticeBanner}>
          <Ionicons name="lock-closed-outline" size={13} color={C.primary} />
          <Text style={s.noticeText}> Your activity only. Contact admin to view all.</Text>
        </View>
      )}
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
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search alerts..."
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle-outline" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const ListEmpty = () => {
    if (loading) {
      return (
        <View style={s.loadingBox}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={s.muted}>Loading activity…</Text>
        </View>
      );
    }
    return (
      <View style={s.emptyState}>
        <View style={s.emptyIconWrap}>
          <Ionicons name="notifications-outline" size={32} color={C.primary} />
        </View>
        <Text style={s.emptyTitle}>{search ? 'No results found' : 'No Activity Yet'}</Text>
        <Text style={s.emptyText}>
          {search
            ? 'Try a different search term.'
            : isAdmin
              ? 'No queries have been submitted yet.'
              : 'Start by asking a question in the Dashboard.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={flatData}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={<View style={{ height: 40 }} />}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[C.primary]}
            tintColor={C.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: C.bg },
  scroll:             { paddingHorizontal: 16 },
  header:             { flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  pageTitle:          { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub:            { color: C.textSub, fontSize: 11, marginTop: 2 },
  headerRight:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertCountBadge:    { backgroundColor: '#fef2f2', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#fca5a5' },
  alertCountText:     { color: '#dc2626', fontSize: 11, fontWeight: '700' },
  liveChip:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 5, borderWidth: 1, borderColor: '#86efac' },
  liveDot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a' },
  liveText:           { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  noticeBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.cardBorder },
  noticeText:         { color: C.primary, fontSize: 12, flex: 1, fontWeight: '500' },
  tabRow:             { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab:                { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.card },
  tabActive:          { borderColor: C.primary, backgroundColor: C.primaryLight },
  tabText:            { fontSize: 12, fontWeight: '600', color: C.textMuted },
  tabTextActive:      { color: C.primary },
  tabCount:           { backgroundColor: C.cardBorder, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabCountActive:     { backgroundColor: C.primary + '22' },
  tabCountText:       { fontSize: 10, fontWeight: '700', color: C.textMuted },
  tabCountTextActive: { color: C.primary },
  searchWrap:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, gap: 8 },
  searchInput:        { flex: 1, fontSize: 13, color: C.text },
  loadingBox:         { alignItems: 'center', paddingVertical: 60, gap: 12 },
  muted:              { color: C.textMuted, fontSize: 12 },
  groupHeader:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 8 },
  groupLine:          { flex: 1, height: 1, backgroundColor: C.cardBorder },
  groupLabel:         { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  groupCountBadge:    { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  groupCountText:     { fontSize: 10, fontWeight: '700', color: C.primary },
  feedCard:           { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, flexDirection: 'row', overflow: 'hidden', marginBottom: 10 },
  accentBar:          { width: 4 },
  cardInner:          { flex: 1, padding: 14 },
  cardTopRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  typeBadge:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText:      { fontSize: 10, fontWeight: '700' },
  timestamp:          { color: C.textMuted, fontSize: 11 },
  feedTitle:          { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  cardDetail:         { marginTop: 6 },
  detailDivider:      { height: 1, backgroundColor: C.cardBorder, marginBottom: 10 },
  feedMessage:        { color: C.textSub, fontSize: 13, lineHeight: 20, marginBottom: 8 },
  metaRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  metaChip:           { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.cardBorder },
  metaText:           { color: C.textMuted, fontSize: 11, fontWeight: '500' },
  statusBadge:        { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:         { fontSize: 10, fontWeight: '700' },
  emptyState:         { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIconWrap:      { width: 72, height: 72, borderRadius: 24, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:         { color: C.text, fontWeight: '700', fontSize: 16 },
  emptyText:          { color: C.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, maxWidth: 240 },
});

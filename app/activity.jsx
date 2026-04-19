import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from './theme';

const ALL_ALERTS = [
  { id: 1, type: 'alert',    icon: '🚨', title: 'Time Threshold Exceeded',  message: 'Disassembly on Unit #403 has exceeded time threshold. Supervisor has been automatically notified.', timestamp: '2 min ago',  status: 'Sent',         statusColor: C.green, statusBg: '#dcfce7' },
  { id: 2, type: 'priority', icon: '📊', title: 'Priority Adjustment',      message: 'Maintenance task ID #1024 has been adjusted to HIGH PRIORITY based on equipment status.',            timestamp: '8 min ago',  status: 'Acknowledged', statusColor: C.blue,  statusBg: '#dbeafe' },
  { id: 3, type: 'share',    icon: '📗', title: 'Knowledge Base Updated',   message: 'Best practice for engine cover removal (Boeing 767F) has been updated. New torque specs apply.',     timestamp: '15 min ago', status: null,           statusColor: null,    statusBg: null      },
  { id: 4, type: 'info',     icon: 'ℹ️', title: 'Task Approved & Logged',   message: 'Recommendation for Task #1022 was approved and logged by T. Reyes. Audit entry created.',           timestamp: '32 min ago', status: 'Logged',       statusColor: C.green, statusBg: '#dcfce7' },
  { id: 5, type: 'alert',    icon: '🚨', title: 'Anomaly Detected',         message: 'Unit #388 — Hydraulic system anomaly detected during pre-flight check. Auto-created.',               timestamp: '1 hr ago',   status: 'Sent',         statusColor: C.green, statusBg: '#dcfce7' },
];

const TYPE_CONFIG = {
  alert:    { label: 'Alert',    labelColor: C.red,    bg: '#fee2e2' },
  priority: { label: 'Priority', labelColor: C.orange, bg: '#ffedd5' },
  share:    { label: 'Info',     labelColor: C.green,  bg: '#dcfce7' },
  info:     { label: 'System',   labelColor: C.blue,   bg: '#dbeafe' },
};

const TABS = [
  { key: 'all',      label: 'All'      },
  { key: 'alert',    label: 'Alerts'   },
  { key: 'priority', label: 'Priority' },
  { key: 'info',     label: 'System'   },
];

export default function Activity() {
  const [alerts, setAlerts]   = useState([]);
  const [filter, setFilter]   = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => { setAlerts(ALL_ALERTS); setLoading(false); }, 800);
  }, []);

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        <View style={s.headerRow}>
          <View>
            <Text style={s.pageTitle}>Activity & Alerts</Text>
            <Text style={s.pageSub}>Real-time feed from all active agents</Text>
          </View>
          <View style={s.liveRow}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>Live</Text>
          </View>
        </View>

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
          const cfg = TYPE_CONFIG[alert.type];
          return (
            <View key={alert.id} style={s.feedCard}>
              <View style={[s.iconBox, { backgroundColor: cfg.bg }]}>
                <Text style={{ fontSize: 18 }}>{alert.icon}</Text>
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
                <View style={s.feedBottom}>
                  {alert.status ? (
                    <View style={[s.statusBadge, { backgroundColor: alert.statusBg }]}>
                      <Text style={[s.statusText, { color: alert.statusColor }]}>{alert.status}</Text>
                    </View>
                  ) : <View />}
                  <Text style={s.detailsLink}>View Details →</Text>
                </View>
              </View>
            </View>
          );
        })}

        {!loading && filtered.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.muted}>No {filter === 'all' ? '' : filter} alerts at this time</Text>
          </View>
        )}

        {!loading && filtered.length > 0 && (
          <Text style={s.countText}>Showing {filtered.length} of {alerts.length} events today</Text>
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
  feedBottom:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  statusBadge:   { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:    { fontSize: 10, fontWeight: '700' },
  detailsLink:   { color: C.primary, fontSize: 11, fontWeight: '600' },
  emptyState:    { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 16, padding: 40, alignItems: 'center', backgroundColor: C.card },
  countText:     { color: C.textMuted, fontSize: 10, textAlign: 'center', marginTop: 8 },
});
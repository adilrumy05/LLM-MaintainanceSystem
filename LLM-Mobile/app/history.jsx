import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from './theme';

export default function History() {
  const [history, setHistory] = useState([]);
  const [search, setSearch]   = useState('');

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    const raw = await AsyncStorage.getItem('queryHistory');
    setHistory(JSON.parse(raw || '[]'));
  };

  const deleteEntry = async (id) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    await AsyncStorage.setItem('queryHistory', JSON.stringify(updated));
  };

  const clearAll = () => {
    Alert.alert('Clear History', 'Delete all history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => {
        setHistory([]);
        await AsyncStorage.removeItem('queryHistory');
      }},
    ]);
  };

  const formatTime = (iso) => {
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  const filtered = history.filter(h =>
    h.text.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, entry) => {
    const diff = (Date.now() - new Date(entry.timestamp)) / 1000;
    const key  = diff < 86400 ? 'Today' : diff < 172800 ? 'Yesterday' : 'Older';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        <View style={s.headerRow}>
          <View>
            <Text style={s.pageTitle}>History</Text>
            <Text style={s.pageSub}>Your recent maintenance queries</Text>
          </View>
          {history.length > 0 && (
            <TouchableOpacity style={s.clearBtn} onPress={clearAll}>
              <Text style={s.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {history.length > 0 && (
          <TextInput
            style={s.searchInput}
            placeholder="Search history…"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        )}

        {history.length === 0 && (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🕐</Text>
            <Text style={s.emptyTitle}>No history yet</Text>
            <Text style={s.muted}>Your queries will appear here after you use the dashboard</Text>
          </View>
        )}

        {Object.entries(grouped).map(([group, entries]) => (
          <View key={group} style={{ marginBottom: 16 }}>
            <Text style={s.groupLabel}>{group}</Text>
            {entries.map(entry => (
              <View key={entry.id} style={s.entryRow}>
                <Text style={{ fontSize: 14 }}>🔍</Text>
                <View style={s.entryContent}>
                  <Text style={s.entryText} numberOfLines={1}>{entry.text}</Text>
                  <Text style={s.entryTime}>{formatTime(entry.timestamp)}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteEntry(entry.id)} style={s.deleteBtn}>
                  <Text style={s.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}

        {history.length > 0 && filtered.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={s.muted}>No results for "{search}"</Text>
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
  clearBtn:      { backgroundColor: C.redBg, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  clearBtnText:  { color: C.red, fontSize: 11, fontWeight: '700' },
  searchInput:   { backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 12, fontSize: 13, marginBottom: 16 },
  emptyState:    { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 16, padding: 60, alignItems: 'center', marginTop: 16, backgroundColor: C.card },
  emptyTitle:    { color: C.text, fontWeight: '700', fontSize: 14, marginBottom: 6 },
  muted:         { color: C.textMuted, fontSize: 11, textAlign: 'center' },
  groupLabel:    { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  entryRow:      { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 6, elevation: 1 },
  entryContent:  { flex: 1, marginHorizontal: 10 },
  entryText:     { color: C.text, fontSize: 13, fontWeight: '500' },
  entryTime:     { color: C.textMuted, fontSize: 10, marginTop: 2 },
  deleteBtn:     { padding: 4 },
  deleteBtnText: { color: C.textMuted, fontSize: 13 },
});
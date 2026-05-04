import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';
import { C } from '../theme';

export default function Documents() {
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState(null);
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const router                    = useRouter();

  useFocusEffect(
    useCallback(() => {
      checkAndLoad();
    }, [])
  );

  const checkAndLoad = async () => {
    const raw  = await AsyncStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    if (user?.role !== 'admin') { router.replace('/dashboard'); return; }
    loadDocuments();
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/documents`);
      const data = await res.json();
      setFilters(data);
    } catch (e) {
      console.error('Failed to load documents:', e);
    }
    setLoading(false);
  };

  // ─── Build document list from filters ────────────────────────────────────
  const buildDocList = () => {
    if (!filters) return [];
    const groups = filters.document_group_ids || [];
    const files  = filters.filenames || [];

    // Pair groups with filenames where possible
    const maxLen = Math.max(groups.length, files.length);
    const docs   = [];
    for (let i = 0; i < maxLen; i++) {
      docs.push({
        id:       groups[i] || files[i] || `doc-${i}`,
        group:    groups[i] || 'Unknown Group',
        filename: files[i]  || 'Unknown File',
        classification: (filters.classifications || [])[i] || 'MANUAL',
        category1: (filters.category_level_1 || [])[i] || '—',
        category2: (filters.category_level_2 || [])[i] || '—',
      });
    }
    return docs;
  };

  const allDocs = buildDocList();
  const filtered = search.trim()
    ? allDocs.filter(d =>
        d.filename.toLowerCase().includes(search.toLowerCase()) ||
        d.group.toLowerCase().includes(search.toLowerCase()) ||
        d.category1.toLowerCase().includes(search.toLowerCase())
      )
    : allDocs;

  const classificationColor = (c) => {
    if (c === 'MANUAL')    return { color: C.blue,   bg: C.blueBg   };
    if (c === 'DATASHEET') return { color: C.green,  bg: C.greenBg  };
    return                        { color: C.primary, bg: C.primaryLight };
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View>
          <Text style={s.pageTitle}>RAG Document Library</Text>
          <Text style={s.pageSub}>{allDocs.length} documents loaded in vector store</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={loadDocuments}>
          <Text style={s.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Stats Row ───────────────────────────────────────────────── */}
      {filters && (
        <View style={s.statsRow}>
          <StatChip label="Documents" value={allDocs.length}                         color={C.primary} />
          <StatChip label="Categories" value={(filters.category_level_1 || []).length} color={C.blue}    />
          <StatChip label="Models" value={(filters.model_numbers || []).length}       color={C.green}   />
        </View>
      )}

      {/* ─── Search ──────────────────────────────────────────────────── */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by filename or category..."
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* ─── Document List ───────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {loading ? (
          <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>📚</Text>
            <Text style={s.emptyTitle}>No Documents Found</Text>
            <Text style={s.muted}>Check that the RAG service is running on port 8001.</Text>
          </View>
        ) : (
          filtered.map((doc, i) => {
            const cls    = classificationColor(doc.classification);
            const isOpen = expanded === doc.id;
            return (
              <TouchableOpacity
                key={doc.id}
                style={s.docCard}
                onPress={() => setExpanded(isOpen ? null : doc.id)}
                activeOpacity={0.8}
              >
                {/* Card Header */}
                <View style={s.docCardHeader}>
                  <View style={[s.clsBadge, { backgroundColor: cls.bg }]}>
                    <Text style={[s.clsText, { color: cls.color }]}>{doc.classification}</Text>
                  </View>
                  <Text style={s.docIndex}>#{i + 1}</Text>
                  <Text style={s.expandIcon}>{isOpen ? '▲' : '▼'}</Text>
                </View>

                {/* Filename */}
                <Text style={s.docFilename} numberOfLines={isOpen ? undefined : 1}>
                  📄 {doc.filename}
                </Text>

                {/* Expanded Details */}
                {isOpen && (
                  <View style={s.docDetails}>
                    <DetailRow label="Document Group" value={doc.group} />
                    <DetailRow label="Category L1"    value={doc.category1} />
                    <DetailRow label="Category L2"    value={doc.category2} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* ─── Model Numbers ─────────────────────────────────────────── */}
        {!loading && filters?.model_numbers?.length > 0 && (
          <>
            <Text style={s.sectionLabel}>INDEXED MODEL NUMBERS</Text>
            <View style={s.modelGrid}>
              {filters.model_numbers.map((m, i) => (
                <View key={i} style={s.modelChip}>
                  <Text style={s.modelText}>{m}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatChip({ label, value, color }) {
  return (
    <View style={[s.statChip, { borderColor: color }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  pageTitle:     { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub:       { color: C.textSub, fontSize: 12, marginTop: 2 },
  refreshBtn:    { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  refreshText:   { color: C.primary, fontWeight: '700', fontSize: 18 },

  statsRow:      { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  statChip:      { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5, padding: 10, alignItems: 'center' },
  statValue:     { fontSize: 20, fontWeight: '700' },
  statLabel:     { fontSize: 10, color: C.textMuted, marginTop: 2 },

  searchWrap:    { paddingHorizontal: 16, marginBottom: 8 },
  searchInput:   { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: C.text },

  emptyState:    { alignItems: 'center', paddingVertical: 60, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder },
  emptyTitle:    { color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  muted:         { color: C.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },

  docCard:       { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, padding: 14, marginBottom: 10, elevation: 1 },
  docCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  clsBadge:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  clsText:       { fontSize: 10, fontWeight: '700' },
  docIndex:      { color: C.textMuted, fontSize: 11, flex: 1 },
  expandIcon:    { color: C.textMuted, fontSize: 12 },
  docFilename:   { color: C.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  docDetails:    { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.cardBorder, gap: 8 },
  detailRow:     { flexDirection: 'row', gap: 8 },
  detailLabel:   { color: C.textMuted, fontSize: 12, width: 110 },
  detailValue:   { color: C.text, fontSize: 12, flex: 1, fontWeight: '600' },

  sectionLabel:  { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
  modelGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modelChip:     { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  modelText:     { color: C.primary, fontSize: 12, fontWeight: '600' },
});
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator, TextInput, Linking, Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { C } from '../theme';

// ---------------------------------------------------------------------------
// Inline file viewer (PDF / CSV)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PDF viewer — Expo Go compatible
// Uses expo-file-system to download, expo-sharing to open natively.
// No WebView, no react-native-pdf, no crashes.
// ---------------------------------------------------------------------------
let FileSystem = null;
let Sharing    = null;
try { FileSystem = require('expo-file-system');       } catch (_) {}
try { Sharing    = require('expo-sharing');            } catch (_) {}

function PdfViewer({ url, fileName }) {
  const [status, setStatus] = useState('idle'); // idle | downloading | opening | error
  const [progress, setProgress]     = useState(0);

  const openPdf = async () => {
    if (!FileSystem || !Sharing) {
      // Absolute fallback — just open in browser
      Linking.openURL(url);
      return;
    }
    try {
      setStatus('downloading');
      setProgress(0);

      const localName = fileName || 'document.pdf';
      const localUri  = FileSystem.cacheDirectory + localName;

      // Download with progress tracking
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        localUri,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(totalBytesWritten / totalBytesExpectedToWrite);
          }
        }
      );

      const { uri } = await downloadResumable.downloadAsync();
      setStatus('opening');

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: localName,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Linking.openURL(url);
      }
      setStatus('idle');
    } catch (e) {
      console.error('PDF open error:', e);
      setStatus('error');
    }
  };

  const pct = Math.round(progress * 100);

  return (
    <View style={styles.pdfViewerBox}>
      {/* PDF icon area */}
      <View style={styles.pdfIconWrap}>
        <Text style={styles.pdfIconText}>PDF</Text>
      </View>

      <Text style={styles.pdfViewerName} numberOfLines={2}>
        {fileName || 'Document'}
      </Text>

      <Text style={styles.pdfViewerHint}>
        Opens in your device's PDF viewer
      </Text>

      {status === 'downloading' && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{pct}%</Text>
        </View>
      )}

      {status === 'opening' && (
        <View style={styles.progressWrap}>
          <ActivityIndicator color={C.primary} size="small" />
          <Text style={[styles.progressLabel, { marginLeft: 8 }]}>Opening…</Text>
        </View>
      )}

      {status === 'error' && (
        <Text style={styles.pdfErrorText}>
          Download failed. Tap below to open in browser.
        </Text>
      )}

      <TouchableOpacity
        style={[styles.openPdfBtn, status === 'downloading' && styles.openPdfBtnDisabled]}
        onPress={status === 'error' ? () => Linking.openURL(url) : openPdf}
        disabled={status === 'downloading' || status === 'opening'}
      >
        <Text style={styles.openPdfBtnText}>
          {status === 'error' ? 'Open in Browser' : 'Open PDF'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function InlineFileViewer({ url, fileName }) {
  const isCsv = fileName?.toLowerCase().endsWith('.csv');
  if (isCsv) return <CsvViewer url={url} />;
  return <PdfViewer url={url} fileName={fileName} />;
}

// ---------------------------------------------------------------------------
// CSV viewer – fetches CSV, parses it, renders a scrollable table
// ---------------------------------------------------------------------------
function CsvViewer({ url }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useCallback(() => {
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        const lines = text.trim().split('\n');
        const parsed = lines.map((line) =>
          // simple CSV split – handles quoted commas imperfectly but good for read-only display
          line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim())
        );
        setRows(parsed);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url])();  // self-invoking callback on mount equivalent

  if (loading) return <ActivityIndicator color={C.primary} style={{ margin: 12 }} />;
  if (error) return <Text style={styles.viewerFallbackText}>Failed to load CSV: {error}</Text>;
  if (!rows?.length) return <Text style={styles.viewerFallbackText}>Empty file.</Text>;

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return (
    <ScrollView horizontal style={styles.csvOuter}>
      <View>
        {/* Header row */}
        <View style={[styles.csvRow, styles.csvHeaderRow]}>
          {headers.map((h, i) => (
            <Text selectable key={i} style={[styles.csvCell, styles.csvHeaderCell]}>
              {h}
            </Text>
          ))}
        </View>
        {/* Data rows */}
        {dataRows.map((row, ri) => (
          <View key={ri} style={[styles.csvRow, ri % 2 === 1 && styles.csvAltRow]}>
            {row.map((cell, ci) => (
              <Text selectable key={ci} style={styles.csvCell}>
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function Documents() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      checkAndLoad();
    }, [])
  );

  const checkAndLoad = async () => {
    const raw = await AsyncStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    if (user?.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    await loadDocuments();
  };

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDocs(collection(db, 'ManualDocuments'));
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setDocuments(docs);
      if (docs.length === 0) setError('No documents found in "ManualDocuments" collection.');
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => {
    const groupSet = new Set();
    documents.forEach((doc) => {
      if (doc.documentGroup) groupSet.add(doc.documentGroup);
    });
    return Array.from(groupSet).sort();
  }, [documents]);

  const filteredDocs = useMemo(() => {
    let filtered = documents;
    if (selectedGroup !== 'all') {
      filtered = filtered.filter((doc) => doc.documentGroup === selectedGroup);
    }
    if (search.trim()) {
      filtered = filtered.filter(
        (doc) =>
          doc.fileName?.toLowerCase().includes(search.toLowerCase()) ||
          doc.documentGroup?.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered;
  }, [documents, selectedGroup, search]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
    return new Date(timestamp).toLocaleDateString();
  };

  const downloadFile = async (url, fileName) => {
    if (!url) return;
    // On mobile, opening the URL triggers the browser / Files app download
    const supported = await Linking.canOpenURL(url);
    if (supported) Linking.openURL(url);
    else console.warn('Cannot open URL:', url);
  };

  // ---- Render filter chips ----
  // FIX: wrap chipScroll with a fixed-height container so chips never shift
  // content below them when the selected chip changes padding/border.
  const renderChips = () => (
    <View style={styles.chipRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // FIX: use contentInset so the very first chip isn't clipped
        contentContainerStyle={styles.chipContainer}
      >
        <TouchableOpacity
          style={[styles.chip, selectedGroup === 'all' && styles.chipActive]}
          onPress={() => setSelectedGroup('all')}
        >
          <Text
            style={[styles.chipText, selectedGroup === 'all' && styles.chipTextActive]}
          >
            All ({documents.length})
          </Text>
        </TouchableOpacity>
        {groups.map((group) => {
          const count = documents.filter((d) => d.documentGroup === group).length;
          const active = selectedGroup === group;
          return (
            <TouchableOpacity
              key={group}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelectedGroup(group)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {group} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ---- Render a single document card ----
  const renderDoc = (doc) => {
    const isExpanded = expandedId === doc.id;
    const isCsv = doc.fileName?.toLowerCase().endsWith('.csv');

    return (
      <TouchableOpacity
        key={doc.id}
        style={styles.docCard}
        onPress={() => setExpandedId(isExpanded ? null : doc.id)}
        activeOpacity={0.8}
      >
        {/* Card header */}
        <View style={styles.docCardHeader}>
          <Text selectable style={styles.docGroup} numberOfLines={1}>
            {doc.documentGroup || 'No group'}
          </Text>
          <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
        </View>

        {/* FIX: numberOfLines={2} so two lines of filename are always visible */}
        <Text selectable style={styles.docFilename} numberOfLines={2}>
          {doc.fileName || 'Unnamed'}
        </Text>

        <Text selectable style={styles.uploadDate}>
          Uploaded: {formatDate(doc.uploadedAt)}
        </Text>

        {/* Expanded section */}
        {isExpanded && (
          <View style={styles.expandedDetails}>
            {/* FIX: storage path no longer cut off – removed numberOfLines */}
            {doc.storagePath && (
              <Text selectable style={styles.storagePath}>
                {doc.storagePath}
              </Text>
            )}

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.downloadBtn]}
                onPress={() => downloadFile(doc.documentUrl, doc.fileName)}
              >
                <Text style={styles.actionBtnText}>
                  {isCsv ? '↓ Download CSV' : '↓ Download PDF'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inline file preview — Pressable stops tap bubbling to card toggle */}
            {doc.documentUrl ? (
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={styles.viewerContainer}>
                  <InlineFileViewer url={doc.documentUrl} fileName={doc.fileName} />
                </View>
              </Pressable>
            ) : (
              <Text style={styles.muted}>No URL available for preview.</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text selectable style={styles.pageTitle}>RAG Document Library</Text>
          <Text selectable style={styles.pageSub}>{documents.length} total documents</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadDocuments}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by file name or group..."
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter chips */}
      {groups.length > 0 && renderChips()}

      {/* Document list */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 16, 40) }}>
        {loading && (
          <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
        )}
        {error && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Error</Text>
            <Text selectable style={styles.muted}>{error}</Text>
          </View>
        )}
        {!loading && !error && filteredDocs.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No documents match</Text>
            <Text style={styles.muted}>Try a different filter or search term.</Text>
          </View>
        )}
        {!loading && !error && filteredDocs.map(renderDoc)}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  pageTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub: { color: C.textSub, fontSize: 12, marginTop: 2 },
  refreshBtn: {
    backgroundColor: C.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  refreshText: { color: C.primary, fontWeight: '700', fontSize: 18 },

  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  searchInput: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: C.text,
  },

  // FIX: chipRow is a fixed-height wrapper so the chip area never reflows
  // when switching between active/inactive chips (which have the same height).
  chipRow: {
    height: 52,               // fixed — chips are 36px tall + 8px vertical margin
    marginBottom: 4,
  },
  chipContainer: {
    paddingHorizontal: 16,    // FIX: padding here instead of on the ScrollView
    paddingVertical: 8,       // vertical centering within the fixed row
    alignItems: 'center',
  },
  chip: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    height: 36,               // explicit height so active/inactive are identical
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.text, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  emptyTitle: { color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  muted: { color: C.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },

  docCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
  },
  docCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  docGroup: {
    color: C.primary,
    fontWeight: '700',
    fontSize: 11,
    backgroundColor: C.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 1,            // won't push the chevron off-screen
    marginRight: 8,
  },
  expandIcon: { color: C.textMuted, fontSize: 12 },

  // FIX: minHeight ensures card is taller even for short single-line names
  docFilename: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    minHeight: 38,            // ~2 lines at lineHeight 19
    lineHeight: 19,
  },
  uploadDate: { color: C.textMuted, fontSize: 10, marginBottom: 4 },

  expandedDetails: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    paddingTop: 8,
    gap: 8,
  },

  // FIX: no numberOfLines — full path visible, wraps naturally
  storagePath: {
    color: C.textMuted,
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  downloadBtn: { backgroundColor: C.primary },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // Inline file viewer container — auto height now (PdfViewer is not fixed-height)
  viewerContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
  },

  // PDF viewer card styles
  pdfViewerBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 10,
  },
  pdfIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pdfIconText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
  },
  pdfViewerName: {
    color: C.text,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  pdfViewerHint: {
    color: C.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: C.cardBorder,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: C.primary,
    borderRadius: 3,
  },
  progressLabel: {
    color: C.textMuted,
    fontSize: 11,
    minWidth: 36,
    textAlign: 'right',
  },
  pdfErrorText: {
    color: '#dc2626',
    fontSize: 11,
    textAlign: 'center',
  },
  openPdfBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 32,
    marginTop: 4,
  },
  openPdfBtnDisabled: {
    backgroundColor: C.primaryLight,
  },
  openPdfBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  viewerFallbackText: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },

  // CSV table styles
  csvOuter: {
    flex: 1,
  },
  csvRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  csvHeaderRow: {
    backgroundColor: C.primaryLight,
  },
  csvAltRow: {
    backgroundColor: C.bg,
  },
  csvCell: {
    width: 120,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    color: C.text,
    borderRightWidth: 1,
    borderRightColor: C.cardBorder,
  },
  csvHeaderCell: {
    fontWeight: '700',
    color: C.primary,
    fontSize: 11,
  },
});

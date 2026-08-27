import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useRole } from '../hooks/useRole';
import {
  collection, addDoc, getDocs, updateDoc, doc,
  query, orderBy, serverTimestamp, limit
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { C } from '../theme';

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: '#d97706', bg: '#fef9c3', icon: 'time-outline' },
  in_progress: { label: 'In Progress', color: C.blue,    bg: C.blueBg,  icon: 'construct-outline' },
  done:        { label: 'Done',        color: C.green,   bg: C.greenBg, icon: 'checkmark-circle-outline' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    color: C.green,  bg: C.greenBg  },
  medium: { label: 'Medium', color: '#d97706', bg: '#fef9c3' },
  high:   { label: 'High',   color: C.red,    bg: C.redBg    },
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const sortTasksByPriority = (items) =>
  [...items].sort((a, b) => {
    const priorityDiff =
      (PRIORITY_ORDER[a.priority] ?? 3) -
      (PRIORITY_ORDER[b.priority] ?? 3);
    if (priorityDiff !== 0) return priorityDiff;

    const bTime = b.createdAt?.toMillis?.() ?? 0;
    const aTime = a.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });

const ROLES = ['all', 'expert', 'intermediate', 'beginner'];

export default function Tasks() {
  const { user, role, loading: userLoading } = useRole();
  const [tasks, setTasks]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority]       = useState('medium');
  const [assignedRole, setAssignedRole] = useState('all');

  const fetchTasks = useCallback(async () => {
    if (userLoading || !role) return;
    setLoading(true);
    try {
      const tasksRef = collection(db, 'maintenance_tasks');
      let q;
      if (role === 'admin') {
        q = query(tasksRef, orderBy('createdAt', 'desc'), limit(50));
      } else {
        q = query(tasksRef, orderBy('createdAt', 'desc'), limit(50));
      }
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (role !== 'admin') {
        data = data.filter(t => t.assignedRole === role || t.assignedRole === 'all');
      }
      setTasks(sortTasksByPriority(data));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [role, userLoading]);

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [fetchTasks])
  );

  const handleCreate = async () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Task title is required' });
      return;
    }
    setSaving(true);
    try {
      const userId = user?.uid || user?.email || 'unknown';
      await addDoc(collection(db, 'maintenance_tasks'), {
        title:        title.trim(),
        description:  description.trim(),
        priority,
        assignedRole,
        status:       'pending',
        createdBy:    userId,
        createdAt:    serverTimestamp(),
        linkedSessionId: null,
      });
      setTitle(''); setDescription(''); setPriority('medium'); setAssignedRole('all');
      setShowCreate(false);
      await fetchTasks();
      Toast.show({ type: 'success', text1: 'Task created successfully' });
    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Failed to create task' });
    }
    setSaving(false);
  };

  const handleStatusUpdate = async (taskId, currentStatus) => {
    const nextStatus = {
      pending:     'in_progress',
      in_progress: 'done',
      done:        'pending',
    }[currentStatus];
    const label = STATUS_CONFIG[nextStatus].label;
    Alert.alert('Update Status', `Mark this task as "${label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Update', onPress: async () => {
        try {
          await updateDoc(doc(db, 'maintenance_tasks', taskId), { status: nextStatus });
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: nextStatus } : t));
          Toast.show({ type: 'success', text1: `Marked as ${label}` });
        } catch (e) {
          Toast.show({ type: 'error', text1: 'Failed to update status' });
        }
      }},
    ]);
  };

  const isAdmin = role === 'admin';
  const filtered = useMemo(() => {
    if (filterStatus === 'all') return tasks;
    return tasks.filter(t => t.status === filterStatus);
  }, [filterStatus, tasks]);

  const renderTask = useCallback(({ item: task }) => {
    const statusCfg   = STATUS_CONFIG[task.status]   || STATUS_CONFIG.pending;
    const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    return (
      <View style={s.taskCard}>
        <View style={s.taskCardHeader}>
          <View style={[s.priorityBadge, { backgroundColor: priorityCfg.bg }]}>
            <Text style={[s.priorityText, { color: priorityCfg.color }]}>
              {priorityCfg.label}
            </Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Ionicons name={statusCfg.icon} size={10} color={statusCfg.color} style={{ marginRight: 3 }} />
            <Text style={[s.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>
        <Text style={s.taskTitle}>{task.title}</Text>
        {task.description ? <Text style={s.taskDesc}>{task.description}</Text> : null}
        <View style={s.taskMeta}>
          <View style={s.metaItem}>
            <Ionicons name="people-outline" size={12} color={C.textMuted} />
            <Text style={s.metaText}>
              {task.assignedRole === 'all' ? 'All Workers' : task.assignedRole}
            </Text>
          </View>
          {task.createdBy && (
            <View style={s.metaItem}>
              <Ionicons name="person-outline" size={12} color={C.textMuted} />
              <Text style={s.metaText}>{task.createdBy}</Text>
            </View>
          )}
        </View>
        {task.status !== 'done' ? (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: statusCfg.bg, borderColor: statusCfg.color }]}
            onPress={() => handleStatusUpdate(task.id, task.status)}
          >
            <Ionicons
              name={task.status === 'pending' ? 'play-outline' : 'checkmark-outline'}
              size={14}
              color={statusCfg.color}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.actionBtnText, { color: statusCfg.color }]}>
              {task.status === 'pending' ? 'Start Task' : 'Mark as Done'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#f3f4f6', borderColor: C.cardBorder }]}
            onPress={() => handleStatusUpdate(task.id, task.status)}
          >
            <Ionicons name="refresh-outline" size={14} color={C.textMuted} style={{ marginRight: 6 }} />
            <Text style={[s.actionBtnText, { color: C.textMuted }]}>Reopen Task</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, []);

  const ListEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={s.emptyState}>
          <Ionicons name="sync-outline" size={36} color={C.textMuted} />
          <Text style={s.emptyTitle}>Loading tasks…</Text>
          <Text style={s.muted}>Please wait a moment</Text>
        </View>
      );
    }
    return (
      <View style={s.emptyState}>
        <Ionicons name="clipboard-outline" size={36} color={C.textMuted} />
        <Text style={s.emptyTitle}>No Tasks</Text>
        <Text style={s.muted}>
          {isAdmin ? 'Tap "+ New Task" to create one.' : 'No tasks assigned to you yet.'}
        </Text>
      </View>
    );
  }, [loading, isAdmin]);

  if (userLoading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: C.textMuted }}>Loading user…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.pageTitle}>Maintenance Tasks</Text>
          <Text style={s.pageSub}>{tasks.length} total · tap to update status</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
            <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
            <Text style={s.createBtnText}>New Task</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.filterWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterContainer}
          data={['all', 'pending', 'in_progress', 'done']}
          keyExtractor={f => f}
          renderItem={({ item: f }) => (
            <TouchableOpacity
              onPress={() => setFilterStatus(f)}
              style={[s.filterTab, filterStatus === f && s.filterTabActive]}
              activeOpacity={0.7}
            >
              <Text style={[s.filterTabText, filterStatus === f && s.filterTabTextActive]}>
                {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label}
                {f !== 'all' && ` (${tasks.filter(t => t.status === f).length})`}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderTask}
        contentContainerStyle={s.taskListContent}
        ListEmptyComponent={ListEmpty}
        style={{ flex: 1 }}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Create New Task</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={s.closeBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={s.modalBody}>
            <Text style={s.fieldLabel}>TASK TITLE *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Inspect Unit 4 AC Filter"
              placeholderTextColor={C.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={s.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              placeholder="Optional details about the task..."
              placeholderTextColor={C.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={s.fieldLabel}>PRIORITY</Text>
            <View style={s.optionRow}>
              {['low', 'medium', 'high'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[s.optionBtn,
                    priority === p && { backgroundColor: PRIORITY_CONFIG[p].bg, borderColor: PRIORITY_CONFIG[p].color }
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[s.optionText, priority === p && { color: PRIORITY_CONFIG[p].color, fontWeight: '700' }]}>
                    {PRIORITY_CONFIG[p].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>ASSIGN TO ROLE</Text>
            <View style={s.optionRow}>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.optionBtn, assignedRole === r && { backgroundColor: C.primaryLight, borderColor: C.primary }]}
                  onPress={() => setAssignedRole(r)}
                >
                  <Text style={[s.optionText, assignedRole === r && { color: C.primary, fontWeight: '700' }]}>
                    {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.modalFooter}>
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>Create Task</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: C.bg },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  pageTitle:        { color: C.text, fontSize: 22, fontWeight: '700' },
  pageSub:          { color: C.textSub, fontSize: 12, marginTop: 2 },
  createBtn:        { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  createBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },

  filterWrapper: {
    height: 48,
    justifyContent: 'center',
    marginBottom: 4,
  },
  filterContainer: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  filterTab: {
    minWidth: 70,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginRight: 8,
    backgroundColor: C.card,
  },
  filterTabActive: {
    backgroundColor: C.primaryLight,
    borderColor: C.primary,
  },
  filterTabText: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  filterTabTextActive: {
    color: C.primary,
  },

  taskListContent: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },

  emptyState:       { alignItems: 'center', paddingVertical: 60, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, marginTop: 12 },
  emptyTitle:       { color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6, marginTop: 10 },
  muted:            { color: C.textMuted, fontSize: 12, textAlign: 'center' },

  taskCard:         { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16, marginBottom: 12, elevation: 2 },
  taskCardHeader:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  priorityBadge:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  priorityText:     { fontSize: 10, fontWeight: '700' },
  statusBadge:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, flexDirection: 'row', alignItems: 'center' },
  statusText:       { fontSize: 10, fontWeight: '700' },
  taskTitle:        { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  taskDesc:         { color: C.textSub, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  taskMeta:         { flexDirection: 'row', gap: 12, marginBottom: 12 },
  metaItem:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:         { color: C.textMuted, fontSize: 11 },
  actionBtn:        { borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  actionBtnText:    { fontSize: 13, fontWeight: '700' },

  modalContainer:   { flex: 1, backgroundColor: C.bg },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.cardBorder, backgroundColor: C.card },
  modalTitle:       { fontSize: 18, fontWeight: '700', color: C.text },
  closeBtn:         { color: C.red, fontSize: 15, fontWeight: '600' },
  modalBody:        { flex: 1, padding: 16 },
  fieldLabel:       { fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  input:            { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, padding: 14, fontSize: 14, color: C.text },
  inputMulti:       { height: 100, textAlignVertical: 'top' },
  optionRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn:        { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card },
  optionText:       { fontSize: 13, color: C.textSub },
  modalFooter:      { padding: 16, borderTopWidth: 1, borderTopColor: C.cardBorder, backgroundColor: C.card },
  saveBtn:          { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
});
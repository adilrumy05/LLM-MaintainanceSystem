// app/(tabs)/index.js

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {View, Text, TextInput, TouchableOpacity, FlatList, Modal, ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform, Image, ScrollView, Animated, Dimensions, Easing,} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { useRole } from '../hooks/useRole';
import { useUser } from './_layout';
import { submitQuery, decodeEntities, getFilters,
         resetSession, setSession, getSession,
         generateReport, logTimerEvent } from '../services/api';
import { shareReportPdf } from '../services/reportPdf';
import { extractTimers } from '../services/procedureTimers';
import { generateChatTitle } from '../services/api';
import Toast from 'react-native-toast-message';
import { capturePhotos, MAX_PHOTOS } from '../services/photo';
import MicButton from '../components/MicButton';
import HandsFreeBar from '../components/HandsFreeBar';
import { useHandsFree } from '../hooks/useHandsFree';
import BotMessage from '../components/BotMessage';
import { actionsForOutcome } from '../utils/chatActions';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const DEFAULT_PHOTO_QUESTION = 'What is this, and what should I check?';

// ─── Module-scope helpers still needed by Dashboard ────────────────────

const messagePhotos = (item) =>
  item.imageUris || (item.imageUri ? [item.imageUri] : []);

const choosePhotoSource = () => new Promise((resolve) => {
  if (Platform.OS === 'web') { resolve('library'); return; }
  Alert.alert('Add a photo', 'Photograph a nameplate, a fault display, or a part.', [
    { text: 'Take photo',          onPress: () => resolve('camera') },
    { text: 'Choose from library', onPress: () => resolve('library') },
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
  ], { cancelable: true, onDismiss: () => resolve(null) });
});

const PhotoThumb = memo(function PhotoThumb({ uri, small }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return null;
  return (
    <Image
      source={{ uri }}
      style={small ? s.msgPhotoSmall : s.msgPhoto}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
});

export default function Dashboard() {
  const [chats, setChats]                 = useState(() => {
    const id = Date.now().toString();
    // One chat == one audit session == one job. Without this each chat would
    // append into the same audit_logs document.
    return [{ id, messages: [], sessionId: getSession() }];
  });
  const [activeChatId, setActiveChatId]   = useState(() => chats[0].id);
  const [inputValue, setInputValue]       = useState('');
  const [isProcessing, setIsProcessing]   = useState(false);
  const [showSidebar, setShowSidebar]     = useState(false);
  // The drawer stays mounted through its closing animation, so it cannot
  // disappear the instant state flips.
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const sidebarX = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const [renameTarget, setRenameTarget]   = useState(null);
  const [renameText, setRenameText]       = useState('');
  const [loaded, setLoaded]               = useState(false);
  const [allFilters, setAllFilters]       = useState(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterSearchText, setFilterSearchText] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [isPhotoBusy, setIsPhotoBusy]     = useState(false);
  const [handsFreeNotice, setHandsFreeNotice] = useState(null);
  // Repair report (distinct from the Report Issue modal above)
  const [repairReport, setRepairReport]       = useState(null);
  const [repairReportBusy, setRepairReportBusy]   = useState(false);
  const [repairReportError, setRepairReportError] = useState(null);
  const [sharingRepairPdf, setSharingRepairPdf]   = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText]           = useState('');

  const cancelRef       = useRef(false);
  const flatListRef     = useRef(null);
  const chatsRef        = useRef(chats);
  const activeChatIdRef = useRef(activeChatId);
  const lastRequestRef  = useRef({});
  const noticeTimer     = useRef(null);

  chatsRef.current        = chats;
  activeChatIdRef.current = activeChatId;

  const router                             = useRouter();
  const { role, isJunior, isIntermediate } = useRole();
  const { user, setUser }                  = useUser();

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages   = useMemo(() => activeChat?.messages || [], [activeChat]);
  const isEmpty    = messages.length === 0;

  useEffect(() => {
    if (!role) return;
    const loadChats = async () => {
      try {
        const raw = await AsyncStorage.getItem(`chats_${role}`);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.length > 0) {
            const newId = Date.now().toString();
            const freshChat = { id: newId, messages: [], filter: null, confirmedModel: null, sessionId: resetSession() };
            // Chats saved before sessionId tracking get one each, rather than
            // all continuing to share the module-level session.
            const updatedChats = [freshChat, ...saved.map(c => ({
              ...c, filter: c.filter || null, sessionId: c.sessionId || resetSession(),
            }))];
            setChats(updatedChats);
            setActiveChatId(newId);
            setSession(freshChat.sessionId);
          }
        }
      } catch (e) { console.log('Error loading chats:', e); }
      setLoaded(true);
    };
    loadChats();
  }, [role]);

  useEffect(() => {
    if (!role || !loaded) return;
    AsyncStorage.setItem(`chats_${role}`, JSON.stringify(chats))
      .catch(e => console.log('Error saving chats:', e));
  }, [chats, role, loaded]);

  useEffect(() => {
    getFilters().then(setAllFilters).catch(e => console.log('Error loading filters:', e));
  }, []);

  // ─── Chat mutation callbacks ────────────────────────────────────────
  const addMessage = useCallback((from, text, sources = [], extra = {}, chatId = activeChatIdRef.current) => {
    const msg = { id: Date.now().toString() + Math.random(), from, text, sources, ...extra };
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, msg] } : c));
    requestAnimationFrame(() => setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80));
  }, []);

  // Kept so the external BotMessage can persist step state
  const updateMessage = useCallback((messageId, updater, chatId = activeChatIdRef.current) => {
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      return { ...c, messages: c.messages.map(m => m.id === messageId ? updater(m) : m) };
    }));
  }, []);

  const updateChat = useCallback((chatId, patch) =>
    setChats(prev => prev.map(c => (c.id === chatId ? { ...c, ...patch } : c))), []);

  const setActionsUsed = useCallback((chatId, messageId, used) =>
    setChats(prev => prev.map(c => (c.id !== chatId ? c : {
      ...c,
      messages: c.messages.map(m => (m.id === messageId ? { ...m, actionsUsed: used } : m)),
    }))), []);

  const markActionsUsed   = useCallback((chatId, messageId) => setActionsUsed(chatId, messageId, true),  [setActionsUsed]);
  const markActionsUnused = useCallback((chatId, messageId) => setActionsUsed(chatId, messageId, false), [setActionsUsed]);

  const runQuery = useCallback(async ({ text, photos = [], confirmedModel, docGroup, voice = false }) => {
    const chatId = activeChatIdRef.current;
    const chat   = chatsRef.current.find(c => c.id === chatId);
    const model  = confirmedModel !== undefined ? confirmedModel : chat?.confirmedModel || null;
    const group  = docGroup !== undefined ? docGroup : chat?.filter?.id || null;
    lastRequestRef.current[chatId] = { text, photos, confirmedModel: model, docGroup: group };
    const hasPhotos = photos.length > 0;

    cancelRef.current = false;
    setIsProcessing(true);
    try {
      const result = await submitQuery(text, {
        docGroup: group, images: photos.map(p => p.base64), confirmedModel: model, voice,
      });
      if (cancelRef.current) return { cancelled: true };

      if (result.needsInput) {
        addMessage('bot', decodeEntities(result.text), [], { actions: actionsForOutcome(result, hasPhotos) }, chatId);
      } else {
        // Decode entities first, then strip [[TIMER:...]] markers: order matters,
        // or the markers can be missed. Markers never reach the renderer,
        // AsyncStorage, or a later repair report.
        const { cleanText, timers } = extractTimers(decodeEntities(result.text));
        addMessage('bot', cleanText, result.sources || [], {
          timers,
          isProcedural: result.isProcedural || false,
          steps: (result.steps || []).map(st => ({
            title: decodeEntities(st.title),
            description: decodeEntities(st.description),
            warningLevel: st.warning_level,
            toolsRequired: st.tools_required || [],
            imageUrl: st.image_url || null,
          })),
          procedureView: (result.isProcedural && result.steps?.length > 0) ? 'procedure' : 'text',
          procedureState: (result.isProcedural && result.steps?.length > 0)
            ? { currentStep: 0, completedSteps: [], overviewOpen: false } : null,
        }, chatId);
        if (result.identifiedModel) updateChat(chatId, { confirmedModel: decodeEntities(result.identifiedModel) });

        // Name the chat from its first exchange, the way chat assistants do.
        // Fire-and-forget: the conversation must not wait on it, and a failure
        // just leaves the truncated-first-message fallback in place.
        const namedChat = chatsRef.current.find(c => c.id === chatId);
        if (namedChat && !namedChat.aiTitle && !namedChat.customTitle) {
          generateChatTitle(text, cleanText)
            .then(title => {
              if (title && title !== 'New Chat') updateChat(chatId, { aiTitle: title });
            })
            .catch(e => console.warn('[title] could not name chat:', e.message));
        }
      }
      return { result };
    } catch (err) {
      if (cancelRef.current) return { cancelled: true };
      const photoProblem = err.code === 'invalid_image' || err.code === 'image_too_large';
      const actions = hasPhotos && photoProblem ? [{ type: 'retake' }]
        : err.retryable || !err.status ? [{ type: 'retry' }] : [];
      addMessage('bot', `Error: ${err.message || 'Could not reach the server.'}`, [], { actions }, chatId);
      return { error: err };
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage, updateChat]);

  const handleSend = async (overrideText) => {
    const typed  = (overrideText || inputValue).trim();
    const photos = pendingPhotos;
    if ((!typed && !photos.length) || isProcessing) return;
    const queryText = typed || DEFAULT_PHOTO_QUESTION;
    setInputValue('');
    setPendingPhotos([]);
    const raw = await AsyncStorage.getItem('queryHistory');
    const existing = JSON.parse(raw || '[]');
    await AsyncStorage.setItem('queryHistory', JSON.stringify(
      [{ id: Date.now(), text: queryText, timestamp: new Date().toISOString() }, ...existing].slice(0, 50)
    ));
    addMessage('user', queryText, [], photos.length ? { imageUris: photos.map(p => p.uri) } : {});
    await runQuery({ text: queryText, photos });
  };

  const getPhotos = useCallback(async (limit) => {
    if (limit < 1) { Alert.alert('Photos', `You can attach up to ${MAX_PHOTOS} photos to one question.`); return []; }
    const source = await choosePhotoSource();
    if (!source) return [];
    setIsPhotoBusy(true);
    try { return await capturePhotos(source, { limit }); }
    catch (e) { Alert.alert('Photo', e.message || 'Could not get the photo.'); return []; }
    finally { setIsPhotoBusy(false); }
  }, []);

  const handleAttachPhoto = async () => {
    const added = await getPhotos(MAX_PHOTOS - pendingPhotos.length);
    if (added.length) setPendingPhotos(prev => [...prev, ...added].slice(0, MAX_PHOTOS));
  };

  const removePendingPhoto = (index) =>
    setPendingPhotos(prev => prev.filter((_, i) => i !== index));

  const handleAction = useCallback(async (message, action) => {
    const chatId = activeChatIdRef.current;
    const req    = lastRequestRef.current[chatId];
    markActionsUsed(chatId, message.id);

    switch (action.type) {
      case 'confirm_model': {
        updateChat(chatId, { confirmedModel: action.model });
        addMessage('user', `It's the ${action.model}`);
        if (!req) { addMessage('bot', `Saved ${action.model} for this chat. Ask your question again.`); return; }
        await runQuery({ ...req, confirmedModel: action.model });
        return;
      }
      case 'use_photo_model': {
        updateChat(chatId, { confirmedModel: action.model, filter: null });
        addMessage('user', `Use ${action.model}`);
        if (!req) { addMessage('bot', `Switched this chat to ${action.model}. Ask your question again.`); return; }
        await runQuery({ ...req, confirmedModel: action.model, docGroup: null });
        return;
      }
      case 'retake':
      case 'add_photo': {
        const kept  = action.type === 'add_photo' ? req?.photos || [] : [];
        const added = await getPhotos(MAX_PHOTOS - kept.length);
        if (!added.length) { markActionsUnused(chatId, message.id); return; }
        const photos = [...kept, ...added].slice(0, MAX_PHOTOS);
        const text   = req?.text || DEFAULT_PHOTO_QUESTION;
        addMessage('user', text, [], { imageUris: photos.map(p => p.uri) });
        await runQuery({ text, photos, confirmedModel: req?.confirmedModel, docGroup: req?.docGroup });
        return;
      }
      case 'retry': {
        if (!req) { addMessage('bot', 'That request is no longer available. Please ask again.'); return; }
        await runQuery(req);
        return;
      }
      default:
    }
  }, [markActionsUsed, markActionsUnused, updateChat, addMessage, runQuery, getPhotos]);

  const askHandsFree = async (text) => {
    addMessage('user', text);
    const { result, error, cancelled } = await runQuery({ text, voice: true });
    if (cancelled) return { speak: 'Cancelled.', stopAfter: true };
    if (error)     return { speak: `Sorry, that failed. ${error.message || ''}`.trim(), stopAfter: true };
    if (result.needsInput)  return { speak: decodeEntities(result.text) };
    if (result.spokenText)  return { speak: decodeEntities(result.spokenText) };
    return { speak: 'Audio guidance is not available for this answer. The full answer is on your screen.' };
  };

  const showHandsFreeNotice = (msg) => {
    setHandsFreeNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setHandsFreeNotice(null), 5000);
  };

  const handsFree        = useHandsFree({ ask: askHandsFree, onNotice: showHandsFreeNotice });
  const handsFreeActive  = handsFree.active;
  const handsFreeStopRef = useRef(handsFree.stop);
  handsFreeStopRef.current = handsFree.stop;

  useFocusEffect(useCallback(() => () => { handsFreeStopRef.current(); }, []));

  const toggleHandsFree = () => {
    if (handsFree.active) handsFree.stop('Hands-free stopped.');
    else handsFree.start();
  };

  const prettifyFilterLabel = (id) => {
    if (!id) return '';
    const parts = id.split('_');
    const model = parts.pop();
    const rest = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return `${rest} ${model}`;
  };

  const filterOptions = (allFilters?.document_group_ids || []).map((id, idx) => ({
    id,
    label: prettifyFilterLabel(id),
    filename: allFilters?.filenames?.[idx] || '',
  }));

  const filteredOptions = filterOptions.filter(opt => {
    const q = filterSearchText.trim().toLowerCase();
    if (!q) return true;
    return (
      opt.label.toLowerCase().includes(q) ||
      opt.id.toLowerCase().includes(q) ||
      opt.filename.toLowerCase().includes(q)
    );
  });

  const handleSelectFilter = (opt) => {
    setChats(prev => prev.map(c =>
      c.id === activeChatId
        ? { ...c, filter: opt || null, confirmedModel: (c.filter?.id === opt?.id) ? c.confirmedModel : null }
        : c
    ));
    setShowFilterPicker(false);
    setFilterSearchText('');
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    addMessage('bot', 'Response stopped. You can continue the conversation.');
  };

  // Slide the drawer in and out. Unmount only after the close finishes.
  useEffect(() => {
    const width = Dimensions.get('window').width;
    if (showSidebar) {
      setSidebarMounted(true);
      Animated.timing(sidebarX, {
        toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    } else if (sidebarMounted) {
      Animated.timing(sidebarX, {
        toValue: -width, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setSidebarMounted(false); });
    }
  }, [showSidebar, sidebarMounted, sidebarX]);

  const closeSidebar = () => setShowSidebar(false);

  const openRename = (chat) => {
    setRenameText(getChatTitle(chat));
    setRenameTarget(chat.id);
  };
  const cancelRename = () => { setRenameTarget(null); setRenameText(''); };
  const confirmRename = () => {
    const name = renameText.trim();
    if (!name || !renameTarget) return;
    // customTitle wins over both the AI title and the first-message fallback,
    // so a manual rename is never overwritten later.
    setChats(prev => prev.map(c => c.id === renameTarget ? { ...c, customTitle: name } : c));
    cancelRename();
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    // The screen clears with no other signal that anything happened, which
    // reads as the app losing the previous conversation.
    Toast.show({
      type: 'success',
      text1: 'New chat started',
      text2: 'Your previous chat is saved in the menu.',
      position: 'top',
      visibilityTime: 2200,
    });
    handsFree.stop();
    setPendingPhotos([]);
    setChats(prev => [...prev, { id: newId, messages: [], filter: null, confirmedModel: null, sessionId: resetSession() }]);
    setActiveChatId(newId);
    setShowSidebar(false);
    setInputValue('');
  };

  const handleSwitchChat = (id) => {
    if (id !== activeChatId) { handsFree.stop(); setPendingPhotos([]); }
    // Re-point the API at this chat's session so its messages land in its own
    // audit_logs document.
    const target = chats.find(c => c.id === id);
    if (target?.sessionId) setSession(target.sessionId);
    setActiveChatId(id);
    setShowSidebar(false);
  };

  const handleDeleteChat = (id) => {
    // Deleting a conversation is unrecoverable, so confirm first. Alert.alert
    // buttons do not fire on web, hence the split.
    const chat = chats.find(c => c.id === id);
    const name = chat ? getChatTitle(chat) : 'this chat';
    const run = () => doDeleteChat(id);
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${name}"? This cannot be undone.`)) run();
      return;
    }
    Alert.alert('Delete chat', `Delete "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  };

  const doDeleteChat = (id) => {
    if (chats.length === 1) {
      setChats([{ id: '1', messages: [], filter: null, sessionId: resetSession() }]);
      setActiveChatId('1');
      setShowSidebar(false);
      return;
    }
    const remaining = chats.filter(c => c.id !== id);
    setChats(remaining);
    if (activeChatId === id) {
      setActiveChatId(remaining[0].id);
      if (remaining[0].sessionId) setSession(remaining[0].sessionId);
    }
    setShowSidebar(false);
  };

  // A completed wait is evidence the procedure was followed, so it is recorded
  // against the session rather than being only a UI convenience.
  const handleTimerComplete = useCallback((doneTimer) => {
    const sessionId = chatsRef.current.find(c => c.id === activeChatIdRef.current)?.sessionId;
    if (sessionId) {
      logTimerEvent(sessionId, {
        label: doneTimer.label,
        seconds: doneTimer.seconds,
        completed_at: doneTimer.completedAt,
      }).catch(e => console.warn('[timers] could not record:', e.message));
    }
    const msg = `${doneTimer.label} — wait complete. You can continue.`;
    Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Procedure timer', msg);
  }, []);

  // Summarises THIS chat's session. Each chat owns its sessionId, so the
  // report covers one job rather than everything since app launch.
  const handleGenerateRepairReport = async () => {
    if (repairReportBusy) return;
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat?.messages?.length) return;
    if (!chat?.sessionId) {
      setRepairReportError('This chat has no session yet. Send a message first.');
      return;
    }
    setRepairReportBusy(true);
    setRepairReportError(null);
    setRepairReport(null);
    try {
      setRepairReport(await generateReport(chat.sessionId));
    } catch (e) {
      setRepairReportError(e.message || 'Could not generate the report.');
    }
    setRepairReportBusy(false);
  };

  const handleShareRepairPdf = async () => {
    if (!repairReport || sharingRepairPdf) return;
    setSharingRepairPdf(true);
    try {
      const { shared } = await shareReportPdf(repairReport);
      if (!shared) {
        const msg = 'Sharing is not available on this platform. The report is saved and viewable here.';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Export', msg);
      }
    } catch (e) {
      const msg = e.message || 'Could not create the PDF.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Export failed', msg);
    }
    setSharingRepairPdf(false);
  };

  const closeRepairReport = () => { setRepairReport(null); setRepairReportError(null); };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) { AsyncStorage.removeItem('user'); router.replace('/login'); }
      return;
    }
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem('user'); setUser(null); router.replace('/login'); } },
    ]);
  };

  // Precedence: a manual rename always wins, then the AI-generated title, then
  // a truncated first message so a chat is never nameless while the title call
  // is still in flight (or if it failed).
  const getChatTitle = (chat) => {
    if (chat.customTitle) return chat.customTitle;
    if (chat.aiTitle) return chat.aiTitle;
    const first = chat.messages.find(m => m.from === 'user');
    return first ? first.text.slice(0, 30) + (first.text.length > 30 ? '...' : '') : 'New Chat';
  };

  const handleSubmitReport = async () => {
    try {
      await addDoc(collection(db, 'Alerts'), {
        type: 'report',
        title: 'Issue Reported',
        message: reportText.trim(),
        userEmail: user?.email || 'unknown',
        role: user?.role || 'beginner',
        status: 'Pending Review',
        statusColor: '#ea580c',
        statusBg: '#fff7ed',
        createdAt: serverTimestamp(),
      });
      setShowReportModal(false);
      setReportText('');
      Alert.alert('Reported', 'Your issue has been sent to the admin team.');
    } catch (e) {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  };

  const renderMessage = useCallback(({ item }) => {
    const isUser = item.from === 'user';
    const disabled = isProcessing || isPhotoBusy || handsFreeActive;
    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowBot]}>
        {isUser ? (
          <View style={[s.bubble, s.bubbleUser]}>
            {messagePhotos(item).length === 1 ? <PhotoThumb uri={messagePhotos(item)[0]} /> : null}
            {messagePhotos(item).length > 1 ? (
              <View style={s.msgPhotoGrid}>
                {messagePhotos(item).map((uri, i) => <PhotoThumb key={i} uri={uri} small />)}
              </View>
            ) : null}
            <Text style={[s.bubbleText, s.bubbleTextUser]}>{item.text}</Text>
          </View>
        ) : (
          <BotMessage
            item={item}
            onAction={handleAction}
            disabled={disabled}
            updateMessage={updateMessage}
            onTimerComplete={handleTimerComplete}
          />
        )}
      </View>
    );
  }, [handleAction, isProcessing, isPhotoBusy, handsFreeActive, updateMessage]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>

        {/* Full-screen drawer. It was 280px wide with a dimmed strip beside it,
            which read as an unfinished panel on a phone. Now it covers the
            screen and slides in, so there is no tap-outside-to-close target —
            hence the explicit X. */}
        {sidebarMounted && (
          <Animated.View style={[s.overlay, { transform: [{ translateX: sidebarX }] }]}>
            <SafeAreaView style={s.sidebar} edges={['top']}>
              <View style={s.sidebarHeader}>
                <View style={s.sidebarTitleRow}>
                  <Text style={s.sidebarTitle}>Chats</Text>
                  <TouchableOpacity
                    onPress={handleNewChat}
                    style={s.sidebarAdd}
                    accessibilityLabel="New chat"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="add" size={22} color={C.primary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={closeSidebar}
                  style={s.sidebarClose}
                  accessibilityLabel="Close chats"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={C.text} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={[...chats].reverse()}
                keyExtractor={c => c.id}
                contentContainerStyle={{ paddingBottom: 8 }}
                renderItem={({ item }) => (
                  <View style={[s.chatItem, item.id === activeChatId && s.chatItemActive]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => handleSwitchChat(item.id)}>
                      <Text style={s.chatItemText} numberOfLines={1}>{getChatTitle(item)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openRename(item)}
                      style={s.chatItemAction}
                      accessibilityLabel="Rename chat"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="pencil-outline" size={15} color={C.textSub} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteChat(item.id)}
                      style={s.chatItemAction}
                      accessibilityLabel="Delete chat"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={C.red} />
                    </TouchableOpacity>
                  </View>
                )}
              />

              <TouchableOpacity style={s.clearAllBtn} onPress={() => {
                const wipe = () => {
                  setChats([{ id: '1', messages: [], filter: null, sessionId: resetSession() }]);
                  setActiveChatId('1');
                  closeSidebar();
                };
                if (Platform.OS === 'web') {
                  if (window.confirm('Delete all conversations? This cannot be undone.')) wipe();
                  return;
                }
                Alert.alert('Clear All Chats', 'Delete all conversations? This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear All', style: 'destructive', onPress: wipe },
                ]);
              }}>
                <Ionicons name="trash-outline" size={14} color={C.red} />
                <Text style={s.clearAllText}> Clear All Chats</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.logoutSidebar} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={14} color={C.red} />
                <Text style={s.logoutSidebarText}> Logout</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </Animated.View>
        )}

        {/* Rename. A modal rather than Alert.prompt, which is iOS-only. */}
        <Modal
          visible={!!renameTarget}
          transparent
          animationType="fade"
          onRequestClose={cancelRename}
        >
          <View style={s.renameOverlay}>
            <View style={s.renameCard}>
              <Text style={s.renameTitle}>Rename chat</Text>
              <TextInput
                style={s.renameInput}
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Chat name"
                placeholderTextColor={C.textMuted}
                autoFocus
                maxLength={60}
                onSubmitEditing={confirmRename}
                returnKeyType="done"
              />
              <View style={s.renameRow}>
                <TouchableOpacity style={s.renameCancel} onPress={cancelRename}>
                  <Text style={s.renameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.renameSave, !renameText.trim() && s.renameSaveDisabled]}
                  onPress={confirmRename}
                  disabled={!renameText.trim()}
                >
                  <Text style={s.renameSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── Report Issue Modal ───────────────────────────────────── */}
        <Modal visible={showReportModal} animationType="slide" transparent onRequestClose={() => setShowReportModal(false)}>
          {/* The sheet is pinned to the bottom, so the iOS keyboard covered it
              the moment the field autofocused. KeyboardAvoidingView lifts it;
              iOS needs 'padding', Android handles it via windowSoftInputMode. */}
          <KeyboardAvoidingView
            style={s.reportOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={s.reportSheet}>
              <View style={s.reportHeader}>
                <Ionicons name="bug-outline" size={20} color="#ea580c" />
                <Text style={s.reportTitle}>Report an Issue</Text>
                <TouchableOpacity onPress={() => { setShowReportModal(false); setReportText(''); }}>
                  <Ionicons name="close-outline" size={24} color={C.text} />
                </TouchableOpacity>
              </View>
              <Text style={s.reportSub}>Describe the problem — wrong answer, missing procedure, equipment fault, etc.</Text>
              <TextInput
                style={s.reportInput}
                placeholder="What went wrong or what did you notice?"
                placeholderTextColor={C.textMuted}
                value={reportText}
                onChangeText={setReportText}
                multiline
                autoFocus
              />
              <TouchableOpacity
                style={[s.reportSubmitBtn, !reportText.trim() && s.reportSubmitBtnDisabled]}
                disabled={!reportText.trim()}
                onPress={handleSubmitReport}
              >
                <Ionicons name="send-outline" size={14} color="#fff" />
                <Text style={s.reportSubmitText}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ─── Model Filter Modal ───────────────────────────────────── */}
        {/* Repair report preview (distinct from the Report Issue modal above) */}
        <Modal
          visible={!!repairReport || !!repairReportError}
          animationType="slide"
          onRequestClose={closeRepairReport}
        >
          <SafeAreaView style={s.rrSheet} edges={['top', 'bottom']}>
            <View style={s.rrHead}>
              <Text style={s.rrHeadTitle}>Repair Report</Text>
              <TouchableOpacity onPress={closeRepairReport} accessibilityLabel="Close report">
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>

            {repairReportError ? (
              <View style={s.rrErrBox}>
                <Ionicons name="alert-circle-outline" size={20} color={C.red} />
                <Text style={s.rrErrText}>{repairReportError}</Text>
              </View>
            ) : repairReport ? (
              <>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={s.rrBody}>
                  <Text style={s.rrTitle}>{repairReport.report?.title}</Text>
                  <View style={s.rrMetaRow}>
                    <Text style={s.rrMeta}>{repairReport.report?.equipment}</Text>
                    <Text style={s.rrMetaDim}>{repairReport.generated_at}</Text>
                  </View>

                  <RepairSection label="Problem Reported" text={repairReport.report?.problem_reported} />
                  <RepairSection label="Diagnosis" text={repairReport.report?.diagnosis} />
                  <RepairSection label="Actions Taken" items={repairReport.report?.actions_taken} empty="No actions recorded" />
                  <RepairSection label="Parts Replaced" items={repairReport.report?.parts_replaced} empty="No parts recorded" />
                  {!!repairReport.report?.safety_notes?.length && (
                    <View style={s.rrSafety}>
                      <Text style={s.rrSectionLabel}>Safety Notes</Text>
                      {repairReport.report.safety_notes.map((n, i) => (
                        <Text key={i} style={s.rrSafetyItem}>• {n}</Text>
                      ))}
                    </View>
                  )}
                  <RepairSection label="Outcome" text={repairReport.report?.outcome} />
                  <RepairSection label="Follow-up" text={repairReport.report?.follow_up} />

                  <Text style={s.rrSectionLabel}>Manual Sources Cited</Text>
                  {(repairReport.sources || []).length === 0
                    ? <Text style={s.rrEmpty}>No manual sources cited</Text>
                    : Object.entries(
                        (repairReport.sources || []).reduce((acc, src) => {
                          const k = src.filename || 'Unknown';
                          (acc[k] = acc[k] || []).push(src.page);
                          return acc;
                        }, {})
                      ).map(([file, pages]) => (
                        <Text key={file} style={s.rrSource}>
                          {file} <Text style={s.rrMetaDim}>p. {pages.filter(x => x != null).join(', ') || '—'}</Text>
                        </Text>
                      ))}

                  <Text style={s.rrFoot}>
                    Summarised from {repairReport.exchange_count} logged exchange(s). Stored in Firestore as
                    repair_reports/{repairReport.session_id}. Verify against the cited pages before acting.
                  </Text>
                </ScrollView>

                <View style={s.rrActions}>
                  <TouchableOpacity
                    style={[s.rrShareBtn, sharingRepairPdf && s.rrBtnDisabled]}
                    onPress={handleShareRepairPdf}
                    disabled={sharingRepairPdf}
                  >
                    {sharingRepairPdf
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="share-outline" size={18} color="#fff" />
                          <Text style={s.rrShareText}>  Export PDF</Text></>}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </SafeAreaView>
        </Modal>

        <Modal visible={showFilterPicker} animationType="slide" onRequestClose={() => setShowFilterPicker(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
            <View style={s.filterModalHeader}>
              <Text style={s.filterModalTitle}>Ground to a model</Text>
              <TouchableOpacity onPress={() => setShowFilterPicker(false)}>
                <Ionicons name="close-outline" size={26} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={s.filterSearchBar}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} />
              <TextInput
                style={s.filterSearchInput}
                placeholder="Search model number, brand..."
                placeholderTextColor={C.textMuted}
                value={filterSearchText}
                onChangeText={setFilterSearchText}
                autoFocus
              />
            </View>
            <TouchableOpacity style={s.filterAllOption} onPress={() => handleSelectFilter(null)}>
              <Ionicons name="layers-outline" size={16} color={C.primary} />
              <Text style={s.filterAllOptionText}> All models (no filter)</Text>
            </TouchableOpacity>
            <FlatList
              data={filteredOptions}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={s.filterOptionRow} onPress={() => handleSelectFilter(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.filterOptionLabel}>{item.label}</Text>
                    {!!item.filename && <Text style={s.filterOptionSub} numberOfLines={1}>{item.filename}</Text>}
                  </View>
                  {activeChat?.filter?.id === item.id && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={s.filterEmptyText}>No models match "{filterSearchText}"</Text>}
            />
          </SafeAreaView>
        </Modal>

        {/* ─── Header ──────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.menuBtn} onPress={() => setShowSidebar(true)}>
            <Ionicons name="menu-outline" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Maintenance Copilot</Text>
            <Text style={s.headerRole}>{role?.toUpperCase()} ACCESS</Text>
          </View>
          <TouchableOpacity
            style={s.newChatIconBtn}
            onPress={handleGenerateRepairReport}
            disabled={!activeChat?.messages?.length || repairReportBusy}
            accessibilityLabel="Generate repair report"
          >
            {repairReportBusy
              ? <ActivityIndicator size="small" color={C.primary} />
              : <Ionicons name="document-text-outline" size={21}
                  color={activeChat?.messages?.length ? C.text : C.textMuted} />}
          </TouchableOpacity>
          <TouchableOpacity style={s.newChatIconBtn} onPress={handleNewChat}>
            <Ionicons name="create-outline" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        {isJunior && (
          <View style={[s.banner, { borderColor: C.blue, backgroundColor: C.blueBg }]}>
            <Ionicons name="bulb-outline" size={13} color={C.blue} />
            <Text style={[s.bannerText, { color: C.blue }]}> Always consult a senior technician before performing any work.</Text>
          </View>
        )}
        {isIntermediate && (
          <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fef9c3' }]}>
            <Ionicons name="warning-outline" size={13} color="#d97706" />
            <Text style={[s.bannerText, { color: '#d97706' }]}> Escalate HIGH difficulty tasks to an Expert Technician.</Text>
          </View>
        )}

        {/* ─── Message area ────────────────────────────────────────── */}
        <View style={s.messageArea}>
          {isEmpty ? (
            <View style={s.welcomeContainer}>
              <View style={s.logoCircle}>
                <Ionicons name="flash-outline" size={36} color={C.primary} />
              </View>
              <Text style={s.welcomeTitle}>Maintenance Copilot</Text>
              <Text style={s.welcomeSub}>Your AI-powered maintenance assistant.</Text>
              <Text style={s.welcomeSub2}>Ask me anything about equipment, procedures, or safety.</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              style={s.msgFlatList}
              contentContainerStyle={s.msgList}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              directionalLockEnabled
              scrollEventThrottle={16}
              showsVerticalScrollIndicator
              removeClippedSubviews
              maxToRenderPerBatch={5}
              updateCellsBatchingPeriod={50}
              windowSize={5}
              initialNumToRender={5}
            />
          )}

          {isProcessing && (
            <View style={s.typingRow}>
              <View style={s.typingBubble}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={s.typingText}>Analyzing...</Text>
              </View>
              <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
                <Ionicons name="close-circle-outline" size={14} color="#f87171" />
                <Text style={s.cancelText}> Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ─── Input area ──────────────────────────────────────────── */}
        <View style={s.inputWrapper}>
          <HandsFreeBar
            phase={handsFree.phase}
            level={handsFree.level}
            floor={handsFree.floor}
            onStop={() => handsFree.stop('Hands-free stopped.')}
            onFinishNow={handsFree.finishNow}
          />
          {handsFreeNotice && !handsFree.active && (
            <Text style={s.handsFreeNotice}>{handsFreeNotice}</Text>
          )}

          {pendingPhotos.length > 0 && (
            <View style={s.pendingPhotos}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pendingPhotoStrip}>
                {pendingPhotos.map((p, i) => (
                  <View key={p.uri + i} style={s.pendingPhotoTile}>
                    <Image source={{ uri: p.uri }} style={s.pendingPhotoImg} />
                    <TouchableOpacity style={s.pendingPhotoRemove} onPress={() => removePendingPhoto(i)}>
                      <Ionicons name="close-circle" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {pendingPhotos.length < MAX_PHOTOS && (
                  <TouchableOpacity style={s.pendingPhotoAdd} onPress={handleAttachPhoto} disabled={isPhotoBusy || isProcessing}>
                    {isPhotoBusy ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="add" size={24} color={C.primary} />}
                  </TouchableOpacity>
                )}
              </ScrollView>
              <Text style={s.pendingPhotoText}>{pendingPhotos.length} of {MAX_PHOTOS} photos. Ask about them, or just send.</Text>
            </View>
          )}

          <View style={s.filterBar}>
            <TouchableOpacity style={s.filterChip} onPress={() => setShowFilterPicker(true)}>
              <Ionicons name="filter-outline" size={13} color={activeChat?.filter ? C.primary : C.textMuted} />
              <Text style={[s.filterChipText, activeChat?.filter && { color: C.primary, fontWeight: '700' }]} numberOfLines={1}>
                {activeChat?.filter ? activeChat.filter.label : 'All models (no filter)'}
              </Text>
            </TouchableOpacity>
            {activeChat?.filter && (
              <TouchableOpacity onPress={() => handleSelectFilter(null)} style={s.filterClearBtn}>
                <Ionicons name="close-circle" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
            {activeChat?.confirmedModel && (
              <View style={s.machineChip}>
                <Ionicons name="hardware-chip-outline" size={13} color={C.primary} />
                <Text style={s.machineChipText} numberOfLines={1}>{activeChat.confirmedModel}</Text>
                <TouchableOpacity onPress={() => updateChat(activeChatId, { confirmedModel: null })}>
                  <Ionicons name="close-circle" size={15} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={s.reportChip} onPress={() => setShowReportModal(true)}>
              <Ionicons name="bug-outline" size={13} color="#ea580c" />
              <Text style={s.reportChipText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.handsFreeChip, handsFree.active && s.handsFreeChipOn]}
              onPress={toggleHandsFree}
              disabled={!handsFree.active && (isProcessing || isPhotoBusy)}
            >
              <Ionicons name="headset-outline" size={13} color={handsFree.active ? '#fff' : C.primary} />
              <Text style={[s.handsFreeChipText, handsFree.active && { color: '#fff' }]}>Hands-free</Text>
            </TouchableOpacity>
          </View>

          <View style={s.inputBar}>
            <TouchableOpacity style={s.iconBtn} onPress={handleAttachPhoto} disabled={isProcessing || isPhotoBusy || handsFree.active || pendingPhotos.length >= MAX_PHOTOS}>
              {isPhotoBusy ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="camera-outline" size={20} color={C.primary} />}
            </TouchableOpacity>
            <MicButton style={s.iconBtn} disabled={isProcessing || handsFree.active} onTranscript={(text) => setInputValue(text)} />
            <TextInput
              style={s.input}
              placeholder={pendingPhotos.length ? 'Ask about these photos...' : 'Ask a maintenance question...'}
              placeholderTextColor={C.textMuted}
              value={inputValue}
              onChangeText={setInputValue}
              multiline
              editable={!isProcessing && !handsFree.active}
            />
            <TouchableOpacity
              style={[s.sendBtn, ((!inputValue.trim() && !pendingPhotos.length) || isProcessing || handsFree.active) && s.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={(!inputValue.trim() && !pendingPhotos.length) || isProcessing || handsFree.active}
            >
              <Ionicons name="send-outline" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────
// Styles that belong to the external BotMessage component (step viewer,
// view toggle, sources, action chips, markdown, tableScroll) live in
// ../components/BotMessage.js — not here.

// One repair-report section: paragraph or bullet list, mirroring the PDF.
function RepairSection({ label, text, items, empty }) {
  return (
    <>
      <Text style={s.rrSectionLabel}>{label}</Text>
      {items
        ? (items.length
            ? items.map((it, i) => <Text key={i} style={s.rrItem}>• {it}</Text>)
            : <Text style={s.rrEmpty}>{empty}</Text>)
        : <Text style={s.rrText}>{text}</Text>}
    </>
  );
}

const s = StyleSheet.create({
  // ── Repair report ──
  rrSheet:        { flex: 1, backgroundColor: C.bg },
  rrHead:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  rrHeadTitle:    { fontSize: 16, fontWeight: '700', color: C.text },
  rrBody:         { padding: 16, paddingBottom: 28 },
  rrTitle:        { fontSize: 18, fontWeight: '700', color: C.text, lineHeight: 24 },
  rrMetaRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 6 },
  rrMeta:         { fontSize: 12, color: C.textSub, fontWeight: '600' },
  rrMetaDim:      { fontSize: 12, color: C.textMuted },
  rrSectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: C.primary, marginTop: 16, marginBottom: 5 },
  rrText:         { fontSize: 14, color: C.text, lineHeight: 20 },
  rrItem:         { fontSize: 14, color: C.text, lineHeight: 20, marginBottom: 2 },
  rrEmpty:        { fontSize: 13, color: C.textMuted, fontStyle: 'italic' },
  rrSafety:       { backgroundColor: C.orangeBg, borderLeftWidth: 3, borderLeftColor: C.orange, borderRadius: 8, padding: 10, marginTop: 6 },
  rrSafetyItem:   { fontSize: 13, color: C.orange, lineHeight: 19, marginBottom: 2 },
  rrSource:       { fontSize: 13, color: C.text, marginBottom: 3 },
  rrFoot:         { fontSize: 11, color: C.textMuted, lineHeight: 16, marginTop: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.cardBorder },
  rrActions:      { padding: 16, borderTopWidth: 1, borderTopColor: C.cardBorder, backgroundColor: C.card },
  rrShareBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14 },
  rrShareText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  rrBtnDisabled:  { opacity: 0.6 },
  rrErrBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, padding: 14, backgroundColor: C.redBg, borderRadius: 12 },
  rrErrText:      { flex: 1, fontSize: 13, color: C.red, lineHeight: 19 },

  safe:               { flex: 1, backgroundColor: C.bg },
  overlay:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  sidebar:            { flex: 1, backgroundColor: C.card, paddingHorizontal: 16, paddingBottom: 8 },
  sidebarHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 10 },
  sidebarTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sidebarAdd:         { padding: 4 },
  sidebarClose:       { padding: 4, marginRight: -4 },
  sidebarTitle:       { color: C.text, fontSize: 18, fontWeight: '700' },
  chatItemAction:     { paddingHorizontal: 6, paddingVertical: 4 },
  renameOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  renameCard:         { width: '100%', maxWidth: 400, backgroundColor: C.card, borderRadius: 16, padding: 18 },
  renameTitle:        { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  renameInput:        { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.inputBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontSize: 14 },
  renameRow:          { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  renameCancel:       { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  renameCancelText:   { color: C.textSub, fontWeight: '600', fontSize: 13 },
  renameSave:         { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: C.primary },
  renameSaveDisabled: { opacity: 0.5 },
  renameSaveText:     { color: '#fff', fontWeight: '700', fontSize: 13 },
  chatItem:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6, backgroundColor: C.bg },
  chatItemActive:     { backgroundColor: C.primaryLight },
  chatItemText:       { color: C.text, fontSize: 13, flex: 1 },
  clearAllBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fecaca', backgroundColor: C.redBg, borderRadius: 10, paddingVertical: 10, marginTop: 'auto', marginBottom: 8 },
  clearAllText:       { color: C.red, fontWeight: '700', fontSize: 12 },
  logoutSidebar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fecaca', backgroundColor: C.redBg, borderRadius: 10, paddingVertical: 12 },
  logoutSidebarText:  { color: C.red, fontWeight: '700', fontSize: 13 },
  header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  menuBtn:            { padding: 6 },
  headerTitle:        { color: C.text, fontWeight: '700', fontSize: 16 },
  headerRole:         { color: C.primary, fontSize: 10, fontWeight: '700', marginTop: 1 },
  newChatIconBtn:     { padding: 6 },
  banner:             { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 10, paddingHorizontal: 16 },
  bannerText:         { fontSize: 11, lineHeight: 16, flex: 1 },
  messageArea:        { flex: 1 },
  welcomeContainer:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  logoCircle:         { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  welcomeTitle:       { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  welcomeSub:         { color: C.textSub, fontSize: 14, textAlign: 'center', marginBottom: 4 },
  welcomeSub2:        { color: C.textMuted, fontSize: 12, textAlign: 'center' },
  msgFlatList:        { flex: 1 },
  msgList:            { padding: 16, paddingBottom: 12 },
  msgRow:             { flexDirection: 'row', marginBottom: 14 },
  msgRowUser:         { justifyContent: 'flex-end' },
  msgRowBot:          { justifyContent: 'flex-start' },
  bubble:             { maxWidth: '88%', borderRadius: 18, padding: 12 },
  bubbleUser:         { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleText:         { color: C.text, fontSize: 14, lineHeight: 20 },
  bubbleTextUser:     { color: '#fff' },
  msgPhoto:           { width: 200, height: 150, borderRadius: 10, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
  msgPhotoSmall:      { width: 96, height: 96, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)' },
  msgPhotoGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6, maxWidth: 196 },
  typingRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  typingBubble:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 10, gap: 8, borderWidth: 1, borderColor: C.cardBorder, flex: 1 },
  typingText:         { color: C.textMuted, fontSize: 12 },
  cancelBtn:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cancelText:         { color: '#f87171', fontSize: 12, fontWeight: '700' },
  inputWrapper:       { backgroundColor: C.card, borderTopWidth: 1, borderColor: C.cardBorder, paddingBottom: 0 },
  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  iconBtn:            { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  input:              { flex: 1, backgroundColor: C.inputBg, color: C.text, borderRadius: 20, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 120 },
  sendBtn:            { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  sendBtnDisabled:    { backgroundColor: '#c4b5fd' },
  filterBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  filterChip:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, gap: 4, flexShrink: 1 },
  filterChipText:     { fontSize: 12, color: C.textSub, flexShrink: 1 },
  filterClearBtn:     { padding: 4 },
  filterModalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.cardBorder },
  filterModalTitle:   { fontSize: 17, fontWeight: '700', color: C.text },
  filterSearchBar:    { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 12, gap: 8 },
  filterSearchInput:  { flex: 1, paddingVertical: 10, color: C.text, fontSize: 14 },
  filterAllOption:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.cardBorder },
  filterAllOptionText:{ color: C.primary, fontWeight: '700', fontSize: 13 },
  filterOptionRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.cardBorder },
  filterOptionLabel:  { color: C.text, fontSize: 14, fontWeight: '600' },
  filterOptionSub:    { color: C.textMuted, fontSize: 11, marginTop: 2 },
  filterEmptyText:    { textAlign: 'center', color: C.textMuted, fontSize: 13, marginTop: 24 },

  machineChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primaryLight, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6, flexShrink: 1 },
  machineChipText:    { fontSize: 12, color: C.primary, fontWeight: '700', flexShrink: 1 },
  handsFreeChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.primary },
  handsFreeChipOn:    { backgroundColor: C.primary },
  handsFreeChipText:  { fontSize: 12, color: C.primary, fontWeight: '700' },
  handsFreeNotice:    { marginHorizontal: 12, marginTop: 6, color: C.textMuted, fontSize: 12 },

  reportChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#ea580c', backgroundColor: '#fff7ed' },
  reportChipText:     { fontSize: 12, color: '#ea580c', fontWeight: '700' },
  reportOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  reportSheet:        { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  reportHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reportTitle:        { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },
  reportSub:          { color: C.textMuted, fontSize: 13, lineHeight: 18 },
  reportInput:        { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.inputBorder, borderRadius: 12, padding: 12, color: C.text, fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  reportSubmitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ea580c', borderRadius: 12, paddingVertical: 14 },
  reportSubmitBtnDisabled: { backgroundColor: '#fdba74' },
  reportSubmitText:   { color: '#fff', fontWeight: '700', fontSize: 14 },

  pendingPhotos:      { marginHorizontal: 12, marginTop: 8, padding: 8, borderRadius: 12, backgroundColor: C.primaryLight, gap: 6 },
  pendingPhotoStrip:  { gap: 8, alignItems: 'center' },
  pendingPhotoTile:   { width: 64, height: 64 },
  pendingPhotoImg:    { width: 64, height: 64, borderRadius: 8 },
  pendingPhotoRemove: { position: 'absolute', top: -2, right: -2, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12 },
  pendingPhotoAdd:    { width: 64, height: 64, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  pendingPhotoText:   { color: C.primary, fontSize: 12, fontWeight: '600' },
});
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, StyleSheet,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { C } from '../theme';
import { useRole } from '../hooks/useRole';
import { submitQuery } from '../services/api';
import * as ImagePicker from 'expo-image-picker';

export default function Dashboard() {
  const [chats, setChats]               = useState([{ id: '1', messages: [] }]);
  const [activeChatId, setActiveChatId] = useState('1');
  const [inputValue, setInputValue]     = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSidebar, setShowSidebar]   = useState(false);
  const [loaded, setLoaded]             = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const cancelRef                       = useRef(false);
  const flatListRef                     = useRef(null);
  const router                          = useRouter();
  const { role, isJunior, isIntermediate } = useRole();

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages   = activeChat?.messages || [];
  const isEmpty    = messages.length === 0;

  useEffect(() => {
    if (!role) return;
    const loadChats = async () => {
      try {
        const raw = await AsyncStorage.getItem(`chats_${role}`);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.length > 0) {
            setChats(saved);
            setActiveChatId(saved[0].id);
          }
        }
      } catch (e) {
        console.log('Error loading chats:', e);
      }
      setLoaded(true);
    };
    loadChats();
  }, [role]);

  useEffect(() => {
    if (!role || !loaded) return;
    AsyncStorage.setItem(`chats_${role}`, JSON.stringify(chats)).catch(e =>
      console.log('Error saving chats:', e)
    );
  }, [chats, role, loaded]);

  const addMessage = (from, text, sources = []) => {
    const msg = { id: Date.now().toString() + Math.random(), from, text, sources };
    setChats(prev => prev.map(c =>
      c.id === activeChatId
        ? { ...c, messages: [...c.messages, msg] }
        : c
    ));
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = async (overrideText) => {
    const queryText = (overrideText || inputValue).trim();
    if (!queryText || isProcessing) return;
    setInputValue('');
    cancelRef.current = false;

    const raw = await AsyncStorage.getItem('queryHistory');
    const existing = JSON.parse(raw || '[]');
    await AsyncStorage.setItem('queryHistory', JSON.stringify(
      [{ id: Date.now(), text: queryText, timestamp: new Date().toISOString() }, ...existing].slice(0, 50)
    ));

    addMessage('user', queryText);
    setIsProcessing(true);

    try {
      const result = await submitQuery(queryText);
      if (!cancelRef.current) {
        addMessage('bot', result.text, result.sources || []);
      }
    } catch {
      if (!cancelRef.current) {
        await new Promise(r => setTimeout(r, 2000));
        addMessage('bot', '1. Power down the system.\n2. Remove the four bolts on the engine cover using a 10mm socket.\n3. Carefully lift the cover straight up.');
      }
    }

    setIsProcessing(false);
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    addMessage('bot', '⚠️ Response stopped. You can continue the conversation.');
  };

  const handleFilePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please allow access to your files.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets?.[0]) {
      const file = result.assets[0];
      setUploadedFile(file);
      addMessage('user', `📎 Attached: ${file.fileName || 'file'}`);
      addMessage('bot', `✅ File received! You can now ask questions about it.`);
    }
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    setChats(prev => [...prev, { id: newId, messages: [] }]);
    setActiveChatId(newId);
    setShowSidebar(false);
    setInputValue('');
    setUploadedFile(null);
  };

  const handleSwitchChat = (id) => {
    setActiveChatId(id);
    setShowSidebar(false);
  };

  const handleDeleteChat = (id) => {
    if (chats.length === 1) {
      const fresh = [{ id: '1', messages: [] }];
      setChats(fresh);
      setActiveChatId('1');
      setShowSidebar(false);
      return;
    }
    const remaining = chats.filter(c => c.id !== id);
    setChats(remaining);
    if (activeChatId === id) setActiveChatId(remaining[0].id);
    setShowSidebar(false);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive', onPress: async () => {
          await AsyncStorage.removeItem('user');
          setChats([{ id: '1', messages: [] }]);
          setActiveChatId('1');
          setShowSidebar(false);
          router.replace('/login');
        }
      },
    ]);
  };

  const getChatTitle = (chat) => {
    const first = chat.messages.find(m => m.from === 'user');
    return first ? first.text.slice(0, 30) + (first.text.length > 30 ? '...' : '') : 'New Chat';
  };

  const renderMessage = ({ item }) => {
    const isUser = item.from === 'user';
    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowBot]}>
        {!isUser && (
          <View style={s.avatar}>
            <Text style={s.avatarText}>⚡</Text>
          </View>
        )}
        <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleBot]}>
          <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{item.text}</Text>
          {item.sources?.length > 0 && (
            <View style={s.sourcesBox}>
              <Text style={s.sourcesLabel}>📎 SOURCES</Text>
              {item.sources.map((src, i) => (
                <Text key={i} style={s.sourceItem}>
                  • {src.title}{src.page ? ` — p.${src.page}` : ''}{src.section ? ` §${src.section}` : ''}
                </Text>
              ))}
            </View>
          )}
        </View>
        {isUser && (
          <View style={s.avatarUser}>
            <Text style={s.avatarText}>👤</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* Sidebar */}
      {showSidebar && (
        <View style={s.overlay}>
          <TouchableOpacity style={s.overlayBg} onPress={() => setShowSidebar(false)} />
          <View style={s.sidebar}>
            <Text style={s.sidebarTitle}>Chats</Text>
            <TouchableOpacity style={s.newChatBtn} onPress={handleNewChat}>
              <Text style={s.newChatText}>+ New Chat</Text>
            </TouchableOpacity>
            <FlatList
              data={[...chats].reverse()}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <View style={[s.chatItem, item.id === activeChatId && s.chatItemActive]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => handleSwitchChat(item.id)}>
                    <Text style={s.chatItemText} numberOfLines={1}>{getChatTitle(item)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteChat(item.id)}>
                    <Text style={s.deleteText}>🗑</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity style={s.logoutSidebar} onPress={handleLogout}>
              <Text style={s.logoutSidebarText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={() => setShowSidebar(true)}>
          <Text style={s.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Maintenance Copilot</Text>
          <Text style={s.headerRole}>{role?.toUpperCase()} ACCESS</Text>
        </View>
        <TouchableOpacity style={s.newChatIconBtn} onPress={handleNewChat}>
          <Text style={s.newChatIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      {/* Role banners */}
      {isJunior && (
        <View style={[s.banner, { borderColor: C.blue, backgroundColor: C.blueBg }]}>
          <Text style={[s.bannerText, { color: C.blue }]}>
            💡 Always consult a senior technician before performing any work.
          </Text>
        </View>
      )}
      {isIntermediate && (
        <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fef9c3' }]}>
          <Text style={[s.bannerText, { color: '#d97706' }]}>
            ⚠️ Escalate HIGH difficulty tasks to an Expert Technician.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isEmpty ? (
          <View style={s.welcomeContainer}>
            <View style={s.logoCircle}>
              <Text style={s.logoIcon}>⚡</Text>
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
            contentContainerStyle={s.msgList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Typing indicator with cancel */}
        {isProcessing && (
          <View style={s.typingRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>⚡</Text>
            </View>
            <View style={s.typingBubble}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={s.typingText}>Analyzing...</Text>
            </View>
            <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
              <Text style={s.cancelText}>✕ Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* File badge */}
        {uploadedFile && (
          <View style={s.fileBadge}>
            <Text style={s.fileBadgeText} numberOfLines={1}>📎 {uploadedFile.fileName || 'Attached file'}</Text>
            <TouchableOpacity onPress={() => setUploadedFile(null)}>
              <Text style={s.fileBadgeRemove}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          <TouchableOpacity style={s.iconBtn} onPress={handleFilePick} disabled={isProcessing}>
            <Text style={s.iconBtnText}>📎</Text>
          </TouchableOpacity>
          <TextInput
            style={s.input}
            placeholder="Ask a maintenance question..."
            placeholderTextColor={C.textMuted}
            value={inputValue}
            onChangeText={setInputValue}
            multiline
            editable={!isProcessing}
            onFocus={() => setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 300)}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!inputValue.trim() || isProcessing) && s.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!inputValue.trim() || isProcessing}
          >
            <Text style={s.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: C.bg },
  overlay:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, flexDirection: 'row' },
  overlayBg:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sidebar:            { width: 280, backgroundColor: C.card, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 20 },
  sidebarTitle:       { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  newChatBtn:         { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  newChatText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
  chatItem:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6, backgroundColor: C.bg },
  chatItemActive:     { backgroundColor: C.primaryLight },
  chatItemText:       { color: C.text, fontSize: 13, flex: 1 },
  deleteText:         { fontSize: 16, marginLeft: 8 },
  logoutSidebar:      { marginTop: 'auto', borderWidth: 1, borderColor: '#fecaca', backgroundColor: C.redBg, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  logoutSidebarText:  { color: C.red, fontWeight: '700', fontSize: 13 },
  header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  menuBtn:            { padding: 6 },
  menuIcon:           { fontSize: 20, color: C.text },
  headerTitle:        { color: C.text, fontWeight: '700', fontSize: 16 },
  headerRole:         { color: C.primary, fontSize: 10, fontWeight: '700', marginTop: 1 },
  newChatIconBtn:     { padding: 6 },
  newChatIcon:        { fontSize: 20 },
  banner:             { borderWidth: 1, padding: 10 },
  bannerText:         { fontSize: 11, lineHeight: 16, paddingHorizontal: 16 },
  welcomeContainer:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 0 },
  logoCircle:         { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoIcon:           { fontSize: 36 },
  welcomeTitle:       { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  welcomeSub:         { color: C.textSub, fontSize: 14, textAlign: 'center', marginBottom: 4 },
  welcomeSub2:        { color: C.textMuted, fontSize: 12, textAlign: 'center' },
  msgList:            { padding: 16, paddingBottom: 12 },
  msgRow:             { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  msgRowUser:         { justifyContent: 'flex-end' },
  msgRowBot:          { justifyContent: 'flex-start' },
  avatar:             { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  avatarUser:         { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  avatarText:         { fontSize: 14 },
  bubble:             { maxWidth: '75%', borderRadius: 18, padding: 12 },
  bubbleUser:         { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleBot:          { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderBottomLeftRadius: 4 },
  bubbleText:         { color: C.text, fontSize: 14, lineHeight: 20 },
  bubbleTextUser:     { color: '#fff' },
  sourcesBox:         { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: '#ddd6fe' },
  sourcesLabel:       { fontSize: 9, fontWeight: '700', color: '#7c3aed', letterSpacing: 1, marginBottom: 4 },
  sourceItem:         { fontSize: 11, color: '#6d28d9', marginBottom: 2 },
  typingRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  typingBubble:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 10, gap: 8, borderWidth: 1, borderColor: C.cardBorder, flex: 1 },
  typingText:         { color: C.textMuted, fontSize: 12 },
  cancelBtn:          { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cancelText:         { color: '#f87171', fontSize: 12, fontWeight: '700' },
  fileBadge:          { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  fileBadgeText:      { color: C.primary, fontSize: 12, flex: 1, fontWeight: '600' },
  fileBadgeRemove:    { color: C.primary, fontSize: 14, fontWeight: '700' },
  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', padding: 10, paddingBottom: 10, borderTopWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, gap: 6 },
  iconBtn:            { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  iconBtnText:        { fontSize: 16 },
  input:              { flex: 1, backgroundColor: C.inputBg, color: C.text, borderRadius: 20, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 120 },
  sendBtn:            { backgroundColor: C.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, marginBottom: 2 },
  sendBtnDisabled:    { backgroundColor: '#c4b5fd' },
  sendBtnText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
});
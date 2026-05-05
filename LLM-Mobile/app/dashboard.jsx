import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { C } from '../theme';
import { useRole } from '../hooks/useRole';
import { submitQuery } from '../services/api';
import * as ImagePicker from 'expo-image-picker';
import Markdown from 'react-native-markdown-display';

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
      } catch (e) { console.log('Error loading chats:', e); }
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
      c.id === activeChatId ? { ...c, messages: [...c.messages, msg] } : c
    ));
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = async (overrideText) => {
    console.log('🚀 handleSend called');
    const queryText = (overrideText || inputValue).trim();
    console.log('📝 queryText:', queryText);
    console.log('🔍 isProcessing:', isProcessing);
    
    if (!queryText || isProcessing) {
      console.log('⛔ blocked - empty query or processing');
      return;
    }
    
    console.log('✅ passed validation');
    setInputValue('');
    cancelRef.current = false;

    console.log('💾 saving to queryHistory...');
    const raw = await AsyncStorage.getItem('queryHistory');
    const existing = JSON.parse(raw || '[]');
    await AsyncStorage.setItem('queryHistory', JSON.stringify(
      [{ id: Date.now(), text: queryText, timestamp: new Date().toISOString() }, ...existing].slice(0, 50)
    ));

    console.log('➕ adding user message');
    addMessage('user', queryText);
    setIsProcessing(true);
    console.log('🔄 isProcessing set to true');

    try {
      console.log('📡 calling submitQuery...');
      const result = await submitQuery(queryText);
      console.log('✅ submitQuery succeeded, result:', result);
      if (!cancelRef.current) {
        console.log('🤖 adding bot message');
        addMessage('bot', result.text, result.sources || []);
      } else {
        console.log('⚠️ cancelled, not adding bot message');
      }
    } catch (err) {
      console.error('❌ submitQuery error:', err);
      if (!cancelRef.current) {
        console.log('⚠️ adding error message to chat');
        addMessage('bot', `❌ Error: ${err.message || 'Could not reach the server. Make sure backend is running.'}`);
      }
    }
    setIsProcessing(false);
    console.log('🏁 handleSend finished');
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    addMessage('bot', '⚠️ Response stopped. You can continue the conversation.');
  };

  const handleFilePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Denied', 'Please allow access to your files.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsEditing: false, quality: 1 });
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

  const handleSwitchChat = (id) => { setActiveChatId(id); setShowSidebar(false); };

  const handleDeleteChat = (id) => {
    if (chats.length === 1) {
      setChats([{ id: '1', messages: [] }]);
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
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('user');
        setChats([{ id: '1', messages: [] }]);
        setActiveChatId('1');
        setShowSidebar(false);
        router.replace('/login');
      }},
    ]);
  };

  const getChatTitle = (chat) => {
    const first = chat.messages.find(m => m.from === 'user');
    return first ? first.text.slice(0, 30) + (first.text.length > 30 ? '...' : '') : 'New Chat';
  };
  // Component for a single source item with expand/collapse
  const SourceItem = ({ source, index }) => {
    console.log('🔍 Source object:', JSON.stringify(source, null, 2));
    const [expanded, setExpanded] = useState(false);
    const hasImages = source.images && source.images.length > 0;

    const toggleExpand = () => setExpanded(!expanded);

    return (
      <View style={s.sourceContainer}>
        <TouchableOpacity onPress={toggleExpand} style={s.sourceRow}>
          <Text style={s.sourceItem}>
            • {source.filename || source.document_group_id}
            {source.page ? ` — p.${source.page}` : ''}
          </Text>
          {/* {hasImages && <Text style={s.expandIcon}>{expanded ? '▲' : '▼'}</Text>} */}
        </TouchableOpacity>
        {expanded && hasImages && (
          <View style={s.imageDropdown}>
            {source.images.map((img, imgIdx) => (
              <View key={imgIdx} style={s.imageCard}>
                <Text style={s.imagePlaceholder}>🖼️ {img.caption || 'Image'}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderMessage = ({ item }) => {
    const isUser = item.from === 'user';

    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowBot]}>
        {!isUser && <View style={s.avatar}><Text style={s.avatarText}>⚡</Text></View>}
        <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleBot]}>
          {isUser
            ? <Text style={[s.bubbleText, s.bubbleTextUser]}>{item.text}</Text>
            : <Markdown style={markdownStyles}>{item.text}</Markdown>
          }
          {item.sources?.length > 0 && (
            <View style={s.sourcesBox}>
              <Text style={s.sourcesLabel}>📎 SOURCES</Text>
              {item.sources.map((src, i) => (
                <SourceItem key={i} source={src} index={i} />
              ))}
            </View>
          )}
        </View>
        {isUser && <View style={s.avatarUser}><Text style={s.avatarText}>👤</Text></View>}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
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
              <TouchableOpacity style={s.clearAllBtn} onPress={() => {
                Alert.alert('Clear All Chats', 'Delete all conversations?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear All', style: 'destructive', onPress: () => {
                    setChats([{ id: '1', messages: [] }]);
                    setActiveChatId('1');
                    setShowSidebar(false);
                  }},
                ]);
              }}>
                <Text style={s.clearAllText}>🗑 Clear All Chats</Text>
              </TouchableOpacity>

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
            <Text style={[s.bannerText, { color: C.blue }]}>💡 Always consult a senior technician before performing any work.</Text>
          </View>
        )}
        {isIntermediate && (
          <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fef9c3' }]}>
            <Text style={[s.bannerText, { color: '#d97706' }]}>⚠️ Escalate HIGH difficulty tasks to an Expert Technician.</Text>
          </View>
        )}

        {/* Message area */}
        <View style={s.messageArea}>
          {isEmpty ? (
            <View style={s.welcomeContainer}>
              <View style={s.logoCircle}><Text style={s.logoIcon}>⚡</Text></View>
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
              keyboardDismissMode="interactive"
            />
          )}

          {/* Typing indicator */}
          {isProcessing && (
            <View style={s.typingRow}>
              <View style={s.avatar}><Text style={s.avatarText}>⚡</Text></View>
              <View style={s.typingBubble}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={s.typingText}>Analyzing...</Text>
              </View>
              <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
                <Text style={s.cancelText}>✕ Stop</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>


        {/* Temporary test button
        <TouchableOpacity 
          style={{ backgroundColor: '#dc2626', padding: 10, margin: 10, borderRadius: 8, alignItems: 'center' }}
          onPress={async () => {
            console.log('🔵 Test button pressed');
            try {
              const result = await submitQuery('test query');
              console.log('✅ Test result:', result);
              Alert.alert('Test Success', 'Check Metro logs');
            } catch (err) {
              console.error('❌ Test error:', err);
              Alert.alert('Test Failed', err.message);
            }
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>TEST API</Text>
        </TouchableOpacity> */}

        {/* Input area */}
        <View style={s.inputWrapper}>
          {uploadedFile && (
            <View style={s.fileBadge}>
              <Text style={s.fileBadgeText} numberOfLines={1}>📎 {uploadedFile.fileName || 'Attached file'}</Text>
              <TouchableOpacity onPress={() => setUploadedFile(null)}>
                <Text style={s.fileBadgeRemove}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
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
        </View>

      </SafeAreaView>
    </KeyboardAvoidingView>
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
  clearAllBtn:        { borderWidth: 1, borderColor: '#fecaca', backgroundColor: C.redBg, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  clearAllText:       { color: C.red, fontWeight: '700', fontSize: 12 },
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
  messageArea:        { flex: 1 },
  welcomeContainer:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
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
  inputWrapper:       { backgroundColor: C.card, borderTopWidth: 1, borderColor: C.cardBorder },
  fileBadge:          { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  fileBadgeText:      { color: C.primary, fontSize: 12, flex: 1, fontWeight: '600' },
  fileBadgeRemove:    { color: C.primary, fontSize: 14, fontWeight: '700' },
  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  iconBtn:            { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  iconBtnText:        { fontSize: 16 },
  input:              { flex: 1, backgroundColor: C.inputBg, color: C.text, borderRadius: 20, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 120 },
  sendBtn:            { backgroundColor: C.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, marginBottom: 2 },
  sendBtnDisabled:    { backgroundColor: '#c4b5fd' },
  sendBtnText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
  sourceContainer: {
    marginBottom: 8,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  expandIcon: {
    fontSize: 12,
    color: '#7c3aed',
    marginLeft: 8,
  },
  imageDropdown: {
    marginTop: 6,
    marginLeft: 12,
    padding: 8,
    backgroundColor: '#f9f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  imageCard: {
    marginBottom: 8,
    padding: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    alignItems: 'center',
  },
  imagePlaceholder: {
    fontSize: 12,
    color: '#6b7280',
  },
  thumbnail: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    marginTop: 4,
  },
});

const markdownStyles = {
  body:         { color: C.text, fontSize: 14, lineHeight: 20 },
  strong:       { fontWeight: '700' },
  bullet_list:  { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  code_inline:  { backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 4, fontFamily: 'monospace', fontSize: 12 },
  fence:        { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10, fontSize: 12, fontFamily: 'monospace' },
  heading1:     { fontSize: 18, fontWeight: '700', marginVertical: 6 },
  heading2:     { fontSize: 16, fontWeight: '700', marginVertical: 4 },

  // ✅ Add these
  table:        { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, marginVertical: 8 },
  thead:        { backgroundColor: C.primaryLight },
  th:           { padding: 8, fontWeight: '700', fontSize: 12, color: C.primaryText, borderRightWidth: 1, borderColor: C.cardBorder },
  tr:           { borderBottomWidth: 1, borderColor: C.cardBorder, flexDirection: 'row' },
  td:           { padding: 8, fontSize: 12, color: C.text, borderRightWidth: 1, borderColor: C.cardBorder, flex: 1 },
};
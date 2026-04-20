import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { C } from '../theme';
import { useRole } from '../hooks/useRole';
import { submitQuery } from '../services/api';
import * as ImagePicker from 'expo-image-picker';

export default function Dashboard() {
  const [chats, setChats] = useState([{ id: '1', messages: [] }]);
  const [activeChatId, setActiveChatId] = useState('1');
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  
  const cancelRef = useRef(false);
  const flatListRef = useRef(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, isJunior, isIntermediate } = useRole();

  const activeChat = chats.find((c) => c.id === activeChatId);
  const messages = activeChat?.messages || [];
  const isEmpty = messages.length === 0;

  // --- Persistence ---
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
      } catch (e) { console.log(e); }
      setLoaded(true);
    };
    loadChats();
  }, [role]);

  useEffect(() => {
    if (!role || !loaded) return;
    AsyncStorage.setItem(`chats_${role}`, JSON.stringify(chats));
  }, [chats, role, loaded]);

  // --- Actions ---
  const addMessage = (from, text, sources = []) => {
    const msg = { id: Date.now().toString(), from, text, sources };
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId ? { ...c, messages: [...c.messages, msg] } : c
      )
    );
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = async () => {
    const queryText = inputValue.trim();
    if (!queryText || isProcessing) return;
    setInputValue('');
    cancelRef.current = false;
    addMessage('user', queryText);
    setIsProcessing(true);

    try {
      const result = await submitQuery(queryText);
      if (!cancelRef.current) addMessage('bot', result.text, result.sources || []);
    } catch {
      if (!cancelRef.current) addMessage('bot', 'Power down the system before proceeding.');
    }
    setIsProcessing(false);
  };

  const renderMessage = ({ item }) => {
    const isUser = item.from === 'user';
    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowBot]}>
        {!isUser && <View style={s.avatar}><Text style={s.avatarText}>⚡</Text></View>}
        <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleBot]}>
          <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{item.text}</Text>
        </View>
        {isUser && <View style={s.avatarUser}><Text style={s.avatarText}>👤</Text></View>}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* Sidebar logic remains as is... */}

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => setShowSidebar(true)}><Text style={s.menuIcon}>☰</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Maintenance Copilot</Text>
          <Text style={s.headerRole}>{role?.toUpperCase()} ACCESS</Text>
        </View>
        <TouchableOpacity onPress={() => setChats([{ id: Date.now().toString(), messages: [] }])}><Text style={s.newChatIcon}>✏️</Text></TouchableOpacity>
      </View>

      {/* CRITICAL FIX: KeyboardAvoidingView wraps the message area AND the input.
          'padding' is the magic behavior for iOS.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0} 
      >
        <View style={s.messageArea}>
          {isEmpty ? (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={s.welcomeContainer}>
                <View style={s.logoCircle}><Text style={s.logoIcon}>⚡</Text></View>
                <Text style={s.welcomeTitle}>Maintenance Copilot</Text>
                <Text style={s.welcomeSub}>Your AI assistant is ready.</Text>
              </View>
            </TouchableWithoutFeedback>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={s.msgList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />
          )}
        </View>

        {/* INPUT AREA 
            Padding bottom is dynamically adjusted for the iPhone notch/home bar
        */}
        <View style={[s.inputWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={s.inputBar}>
            <TouchableOpacity style={s.iconBtn} onPress={() => {}}>
              <Text style={s.iconBtnText}>📎</Text>
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder="Ask a maintenance question..."
              value={inputValue}
              onChangeText={setInputValue}
              multiline
              placeholderTextColor={C.textMuted}
            />
            <TouchableOpacity
              style={[s.sendBtn, !inputValue.trim() && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputValue.trim() || isProcessing}
            >
              <Text style={s.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.cardBorder },
  headerTitle: { fontWeight: '700', fontSize: 16, color: C.text },
  headerRole: { fontSize: 10, color: C.primary, fontWeight: '700' },
  messageArea: { flex: 1 },
  msgList: { padding: 16 },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 18 },
  bubbleUser: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: C.text, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  inputWrapper: { backgroundColor: C.card, borderTopWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 12, paddingTop: 10 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, backgroundColor: C.inputBg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: C.text, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: C.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnDisabled: { backgroundColor: '#c4b5fd' },
  sendBtnText: { color: '#fff', fontWeight: '700' },
  welcomeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  logoIcon: { fontSize: 36 },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: C.text },
  welcomeSub: { fontSize: 14, color: C.textSub, marginTop: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  avatarUser: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  menuIcon: { fontSize: 24, color: C.text },
  newChatIcon: { fontSize: 24 }
});
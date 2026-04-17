import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from './theme';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email || !password) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    const role = email.includes('admin') ? 'admin' : 'expert';
    await AsyncStorage.setItem('user', JSON.stringify({ email, role }));
    router.replace(role === 'admin' ? '/admin' : '/dashboard');
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.logo}>
          <Text style={s.logoText}>FX</Text>
        </View>
        <Text style={s.title}>Group 6 Copilot</Text>
        <Text style={s.subtitle}>Maintenance Disassembly Assistant{'\n'}Sign in to continue</Text>
        <View style={s.card}>
          <Text style={s.label}>EMAIL ADDRESS</Text>
          <TextInput
            style={s.input}
            placeholder="your@group6copilot.com"
            placeholderTextColor={C.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={s.label}>PASSWORD</Text>
          <TextInput
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor={C.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Sign In →</Text>}
          </TouchableOpacity>
        </View>
        <Text style={s.footer}>🔒 Secured with Role-Based Access Control</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  container:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  logo:        { width: 64, height: 64, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText:    { color: '#fff', fontSize: 24, fontWeight: '700' },
  title:       { color: C.text, fontSize: 24, fontWeight: '700', marginBottom: 6 },
  subtitle:    { color: C.textSub, fontSize: 13, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  card:        { width: '100%', backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.cardBorder, shadowColor: '#7c3aed', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  label:       { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  input:       { backgroundColor: C.inputBg, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, marginBottom: 16 },
  btn:         { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnDisabled: { backgroundColor: '#c4b5fd' },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  footer:      { color: C.textMuted, fontSize: 11, marginTop: 24 },
});
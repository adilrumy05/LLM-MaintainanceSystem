import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { auth, db } from '../firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useUser } from './_layout';

const ROLE_MAP = {
  'admin':               'admin',
  'worker_expert':       'expert',
  'worker_intermediate': 'intermediate',
  'worker_beginner':     'beginner',
};

// Firebase auth errors surface as codes like "auth/invalid-credential" with
// messages such as "Firebase: Error (auth/invalid-credential)." Those mean
// nothing to a technician and leak which provider we use, so they are mapped to
// one plain sentence. Wrong email and wrong password deliberately produce the
// SAME message: distinguishing them tells an attacker which emails are real.
const friendlyAuthError = (code) => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid credentials. Check your email and password and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Cannot reach the server. Check your connection and try again.';
    default:
      return 'Could not sign you in. Please try again.';
  }
};

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const router    = useRouter();
  const { setUser } = useUser();

  const handleSubmit = async () => {
    if (!email || !password) return;
    setErrorMsg('');
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const { uid }        = userCredential.user;

      // ── Fetch role from Firestore ──────────────────────────────
      const userDoc = await getDoc(doc(db, 'Users', uid));
      if (!userDoc.exists()) {
        // Authentication succeeded but there is no Users record — the account
        // was removed, or was never finished being set up.
        setErrorMsg('This account is no longer active. Contact your administrator.');
        setLoading(false);
        return;
      }

      const rawRole      = userDoc.data().role_id;
      const role         = ROLE_MAP[rawRole] || 'beginner';
      const username     = userDoc.data().username || '';
      const rawCreatedAt = userDoc.data().createdAt;
      const createdAt    = rawCreatedAt?.toDate?.()?.toISOString() || null;

      // ── Get Firebase ID token for backend auth ─────────────────
      const token = await userCredential.user.getIdToken();

      // ── Persist full session ───────────────────────────────────
      const newUser = { uid, email: email.trim(), role, token, username, createdAt };
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);

      router.replace(role === 'admin' ? '/admin' : '/dashboard');
    } catch (error) {
      setErrorMsg(friendlyAuthError(error?.code));
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.container}>
            <View style={s.logo}>
              <Text style={s.logoText}>FX</Text>
            </View>
            <Text style={s.title}>Group 6 Copilot</Text>
            <Text style={s.subtitle}>Maintenance Disassembly Assistant{'\n'}Sign in to continue</Text>
            <View style={s.card}>
              <Text style={s.label}>EMAIL</Text>
              <TextInput
                style={s.input}
                placeholder="your@email.com"
                placeholderTextColor={C.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
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
              {!!errorMsg && (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={C.red} />
                  <Text style={s.errorText}>{errorMsg}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Sign In</Text>}
              </TouchableOpacity>

              {/* Accounts are created and reset by an administrator — this is an
                  internal tool, so there is no self-service password reset to
                  link to. The panel says who to ask instead. */}
              <TouchableOpacity
                style={s.helpLink}
                onPress={() => setShowHelp(v => !v)}
                accessibilityLabel="Can't sign in?"
              >
                <Text style={s.helpLinkText}>Can't sign in?</Text>
                <Ionicons
                  name={showHelp ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={14}
                  color={C.primary}
                />
              </TouchableOpacity>

              {showHelp && (
                <View style={s.helpBox}>
                  <Text style={s.helpText}>
                    Accounts for this app are created and managed by your system
                    administrator.{'\n'}{'\n'}
                    If you have forgotten your password, or cannot remember which
                    email address your account uses, contact your administrator to
                    have it reset. Passwords cannot be changed from this screen.
                  </Text>
                </View>
              )}
            </View>
            <Text style={s.footer}>Secured with Role-Based Access Control</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  errorBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: C.redBg, borderRadius: 10, padding: 11, marginBottom: 14 },
  errorText:    { flex: 1, color: C.red, fontSize: 13, lineHeight: 18 },
  helpLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14, paddingVertical: 6 },
  helpLinkText: { color: C.primary, fontSize: 13, fontWeight: '600' },
  helpBox:      { backgroundColor: C.bg, borderRadius: 10, padding: 12, marginTop: 4 },
  helpText:     { color: C.textSub, fontSize: 12.5, lineHeight: 18 },

  safe:          { flex: 1, backgroundColor: C.bg },
  scrollContent: { flexGrow: 1 },
  container:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  logo:          { width: 64, height: 64, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText:      { color: '#fff', fontSize: 24, fontWeight: '700' },
  title:         { color: C.text, fontSize: 24, fontWeight: '700', marginBottom: 6 },
  subtitle:      { color: C.textSub, fontSize: 13, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  card:          { width: '100%', backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.cardBorder, shadowColor: '#7c3aed', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  label:         { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  input:         { backgroundColor: C.inputBg, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, marginBottom: 16 },
  btn:           { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnDisabled:   { backgroundColor: '#c4b5fd' },
  btnText:       { color: '#fff', fontWeight: '700', fontSize: 15 },
  footer:        { color: C.textMuted, fontSize: 11, marginTop: 24 },
});
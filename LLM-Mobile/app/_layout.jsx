import { Tabs, usePathname } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

// ── UserContext — created once here, consumed in every screen ─
// Usage in any screen:
//   import { useUser } from './_layout';
//   const { user, setUser, role } = useUser();
/* eslint-disable react-refresh/only-export-components */
export const UserContext = createContext(null);
export const useUser     = () => useContext(UserContext);
/* eslint-enable react-refresh/only-export-components */

export default function Layout() {
  const [user, setUser]   = useState(null);
  const [loading, setLoading] = useState(true);
  const pathname              = usePathname();
  const hideTabBar            = pathname === '/login' || pathname === '/';

  const role    = user?.role ?? null;
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.textContent = `
        * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
        *::-webkit-scrollbar { display: none !important; width: 0 !important; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem('user');
        const u   = JSON.parse(raw || 'null');
        if (!cancelled) setUser(u);
      } catch (e) {
        console.warn('[Layout] AsyncStorage read failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const interval = setInterval(async () => {
      const raw = await AsyncStorage.getItem('user');
      const u   = JSON.parse(raw || 'null');
      setUser(u);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const tabNav = (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: hideTabBar
        ? { display: 'none' }
        : { backgroundColor: C.navBg, borderTopColor: C.navBorder },
      tabBarActiveTintColor:   C.tabActive,
      tabBarInactiveTintColor: C.tabInactive,
    }}>
      <Tabs.Screen name="index"          options={{ href: null }} />
      <Tabs.Screen name="login"          options={{ href: null }} />
      <Tabs.Screen name="beginner"       options={{ href: null }} />
      <Tabs.Screen name="expert"         options={{ href: null }} />
      <Tabs.Screen name="intermediate"   options={{ href: null }} />
      <Tabs.Screen name="usermanagement" options={{ href: null }} />
      <Tabs.Screen name="userform"       options={{ href: null }} />
      <Tabs.Screen name="agentconfig"    options={{ href: null }} />

      <Tabs.Screen name="tasks"     options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="history"   options={{ href: null }} />

      <Tabs.Screen name="dashboard" options={{
        title: 'Copilot',
        tabBarIcon: ({ color, size }) => <Ionicons name="flash-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="activity" options={{
        title: 'Activity',
        tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="mysessions" options={{
        title: 'My Sessions',
        href: !isAdmin ? '/mysessions' : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="admin" options={{
        title: 'Admin',
        href: isAdmin ? '/admin' : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Profile',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
      }} />
    </Tabs>
  );

  const spinner = (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <UserContext.Provider value={{ user, setUser, role }}>
        <View style={web.container}>
          <style>{`* { scrollbar-width: none !important; } *::-webkit-scrollbar { display: none !important; }`}</style>
          <View style={web.device}>
            <View style={web.btnLeft} />
            <View style={web.btnLeft2} />
            <View style={web.btnLeft3} />
            <View style={web.btnRight} />
            <View style={web.screen}>
              {loading ? spinner : tabNav}
            </View>
          </View>
        </View>
      </UserContext.Provider>
    );
  }

  if (loading) return spinner;
  return (
    <UserContext.Provider value={{ user, setUser, role }}>
      {tabNav}
    </UserContext.Provider>
  );
}

const web = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    overflow: 'hidden',
  },
  device: {
    width: 360,
    height: '88vh',
    maxHeight: 760,
    backgroundColor: '#1a1a1a',
    borderRadius: 44,
    padding: 8,
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    position: 'relative',
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 38,
    overflow: 'hidden',
  },
  btnLeft:  { position: 'absolute', left: -10, top: 120, width: 3, height: 30,  backgroundColor: '#333', borderRadius: 2 },
  btnLeft2: { position: 'absolute', left: -10, top: 165, width: 3, height: 55,  backgroundColor: '#333', borderRadius: 2 },
  btnLeft3: { position: 'absolute', left: -10, top: 232, width: 3, height: 55,  backgroundColor: '#333', borderRadius: 2 },
  btnRight: { position: 'absolute', right: -10, top: 165, width: 3, height: 70, backgroundColor: '#333', borderRadius: 2 },
});
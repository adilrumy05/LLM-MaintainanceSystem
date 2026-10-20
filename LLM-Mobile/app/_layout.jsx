import { Tabs, usePathname } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
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
  const { width } = useWindowDimensions();
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
      <Tabs.Screen name="usermanagement" options={{ href: null }} />
      <Tabs.Screen name="userform"       options={{ href: null }} />
      <Tabs.Screen name="agentconfig"    options={{ href: null }} />
      
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
    const isPhone = width < 768;

    if (isPhone) {
      // Phone browser: full-screen, feels like the native app
      return (
        <UserContext.Provider value={{ user, setUser, role }}>
          <View style={web.mobileFull}>
            {loading ? spinner : tabNav}
            <Toast />
          </View>
        </UserContext.Provider>
      );
    }

    // Desktop browser: centered column
    return (
      <UserContext.Provider value={{ user, setUser, role }}>
        <View style={web.desktopBackdrop}>
          <View style={web.desktopColumn}>
            {loading ? spinner : tabNav}
            <Toast />
          </View>
        </View>
      </UserContext.Provider>
    );
  }

  if (loading) return spinner;
  return (
    <UserContext.Provider value={{ user, setUser, role }}>
      {tabNav}
      <Toast />
    </UserContext.Provider>
  );
}

const web = StyleSheet.create({
  mobileFull: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
  },
  desktopBackdrop: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  desktopColumn: {
    width: '100%',
    maxWidth: 480,
    height: '100vh',
    maxHeight: 900,
    backgroundColor: C.bg,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
});

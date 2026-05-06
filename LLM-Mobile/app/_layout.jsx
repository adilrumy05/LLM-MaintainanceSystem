import { Tabs, usePathname } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

export default function Layout() {
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);
  const pathname              = usePathname();
  const hideTabBar            = pathname === '/login' || pathname === '/';

  useEffect(() => {
    const load = async () => {
      const raw  = await AsyncStorage.getItem('user');
      const user = JSON.parse(raw || '{}');
      setRole(user?.role || null);
      setLoading(false);
    };
    load();
  }, [pathname]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );

  const isAdmin = role === 'admin';

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: hideTabBar
        ? { display: 'none' }
        : { backgroundColor: C.navBg, borderTopColor: C.navBorder },
      tabBarActiveTintColor:   C.tabActive,
      tabBarInactiveTintColor: C.tabInactive,
    }}>
      {/* ── Hidden screens ── */}
      <Tabs.Screen name="index"          options={{ href: null }} />
      <Tabs.Screen name="login"          options={{ href: null }} />
      <Tabs.Screen name="beginner"       options={{ href: null }} />
      <Tabs.Screen name="expert"         options={{ href: null }} />
      <Tabs.Screen name="intermediate"   options={{ href: null }} />
      <Tabs.Screen name="usermanagement" options={{ href: null }} />
      <Tabs.Screen name="userform"       options={{ href: null }} />

      {/* ── Admin menu only pages ── */}
      <Tabs.Screen name="tasks"      options={{ href: null }} />
      <Tabs.Screen name="analytics"  options={{ href: null }} />
      <Tabs.Screen name="documents"  options={{ href: null }} />

      {/* ── History: admin only via Admin menu ── */}
      <Tabs.Screen name="history" options={{ href: null }} />

      {/* ══ TAB BAR ════════════════════════════════════════════════ */}

      {/* Dashboard — all roles */}
      <Tabs.Screen name="dashboard" options={{
        title: 'Dashboard',
        tabBarIcon: ({ color, size }) => <Ionicons name="flash-outline" size={size} color={color} />
      }} />

      {/* Alerts — all roles (renamed to Activity) */}
      <Tabs.Screen name="activity" options={{
        title: 'Activity',
        tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />
      }} />

      {/* My Sessions — workers only (hidden for admin) */}
      <Tabs.Screen name="mysessions" options={{
        title: 'My Sessions',
        href: !isAdmin ? '/mysessions' : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />
      }} />

      {/* Admin — admin only */}
      <Tabs.Screen name="admin" options={{
        title: 'Admin',
        href: isAdmin ? '/admin' : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />
      }} />

      {/* Profile — all roles */}
      <Tabs.Screen name="profile" options={{
        title: 'Profile',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />
      }} />

    </Tabs>
  );
}
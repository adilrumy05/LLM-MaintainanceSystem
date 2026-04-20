import { Tabs, usePathname } from 'expo-router';
import { Text, View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  return (
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
      <Tabs.Screen name="dashboard" options={{
        title: 'Dashboard',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>⚡</Text>
      }} />
      <Tabs.Screen name="activity" options={{
        title: 'Activity',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>🔔</Text>
      }} />
      <Tabs.Screen name="history" options={{
        title: 'History',
        href: role === 'admin' ? '/history' : null,
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>🕐</Text>
      }} />
      <Tabs.Screen name="admin" options={{
        title: 'Admin',
        href: role === 'admin' ? '/admin' : null,
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>⚙️</Text>
      }} />
    </Tabs>
  );
}
import { Tabs, usePathname } from 'expo-router';
import { Text, View, ActivityIndicator } from 'react-native';
import { C } from './theme';
import { useRole } from '../hooks/useRole';

export default function Layout() {
  const { role, loading } = useRole();
  const pathname          = usePathname();
  const hideTabBar        = pathname === '/login' || pathname === '/';

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
      <Tabs.Screen name="index"     options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>⚡</Text> }} />
      <Tabs.Screen name="activity"  options={{ title: 'Activity',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>🔔</Text> }} />
      <Tabs.Screen name="history"   options={{ title: 'History',   tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>🕐</Text> }} />
      <Tabs.Screen name="admin"     options={{
        title: 'Admin',
        href: role === 'admin' ? '/admin' : null,
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>⚙️</Text>,
      }} />
      <Tabs.Screen name="login" options={{ href: null }} />
    </Tabs>
  );
}
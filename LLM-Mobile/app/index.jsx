import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from './theme';

export default function Index() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user').then(raw => {
      setUser(JSON.parse(raw || 'null'));
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );

  if (!user) return <Redirect href="/login" />;
  return <Redirect href={user.role === 'admin' ? '/admin' : '/dashboard'} />;
}
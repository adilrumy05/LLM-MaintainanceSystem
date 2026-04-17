import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useRole() {
  const [role, setRole]       = useState('beginner');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user').then(raw => {
      const user = JSON.parse(raw || '{}');
      if (user?.role) setRole(user.role);
      setLoading(false);
    });
  }, []);

  return {
    role,
    loading,
    isAdmin:         role === 'admin',
    isExpert:        role === 'expert',
    isIntermediate:  role === 'intermediate',
    isBeginner:      role === 'beginner',
    canApprove:      ['admin', 'expert', 'intermediate'].includes(role),
    canSeeReasoning: ['admin', 'expert'].includes(role),
    canSeeAgents:    ['admin', 'expert'].includes(role),
    needsGuidance:   ['beginner', 'intermediate'].includes(role),
    isJunior:        role === 'beginner',
  };
}
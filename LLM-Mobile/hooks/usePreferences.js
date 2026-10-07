import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normaliseDetail } from '../utils/responseDetail';

export default function usePreferences(user) {
  const identity = user?.uid || user?.userId || user?.id || user?.email;
  const key = identity ? `prefs_${identity}` : null;
  const [state, setState] = useState({ key: null, detail: 'standard', ready: false, error: null });
  const currentKey = useRef(key);
  currentKey.current = key;
  const savedFields = useRef({});
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    savedFields.current = {};
    setState({ key, detail: 'standard', ready: false, error: null });
    if (!key) {
      setState({ key, detail: 'standard', ready: true, error: null });
      return () => { active = false; };
    }
    AsyncStorage.getItem(key).then(raw => {
      if (!active) return;
      const value = raw ? JSON.parse(raw) : {};
      const fields = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      savedFields.current = fields;
      setState({ key, detail: normaliseDetail(fields.detail), ready: true, error: null });
    }).catch(() => {
      if (active) setState({ key, detail: 'standard', ready: true, error: 'Could not load your saved detail setting. Using Standard.' });
    });
    return () => { active = false; };
  }, [key]);

  const setDetail = useCallback(value => {
    const detail = normaliseDetail(value);
    setState({ key, detail, ready: true, error: null });
    if (!key) return;
    const next = { ...savedFields.current, detail };
    savedFields.current = next;
    // Serialise rapid choices, and capture the user's key before awaiting.
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(next)))
      .catch(() => {
        if (currentKey.current === key) setState(previous => ({ ...previous, error: 'Could not save your detail setting. It still applies to this session.' }));
      });
  }, [key]);

  return { ...(state.key === key ? state : { detail: 'standard', ready: false, error: null }), setDetail };
}

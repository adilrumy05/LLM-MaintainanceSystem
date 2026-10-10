import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normaliseDetail } from '../utils/responseDetail';

// `animate` is the Animate toggle; `animateIntroSeen` records that its
// first-time notice has been read.
const DEFAULTS = { detail: 'standard', animate: false, animateIntroSeen: false };
const fromSaved = fields => ({ detail: normaliseDetail(fields.detail), animate: fields.animate === true, animateIntroSeen: fields.animateIntroSeen === true });

export default function usePreferences(user) {
  const identity = user?.uid || user?.userId || user?.id || user?.email;
  const key = identity ? `prefs_${identity}` : null;
  const [state, setState] = useState({ key: null, ...DEFAULTS, ready: false, error: null });
  const currentKey = useRef(key);
  currentKey.current = key;
  const savedFields = useRef({});
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    savedFields.current = {};
    setState({ key, ...DEFAULTS, ready: false, error: null });
    if (!key) {
      setState({ key, ...DEFAULTS, ready: true, error: null });
      return () => { active = false; };
    }
    AsyncStorage.getItem(key).then(raw => {
      if (!active) return;
      const value = raw ? JSON.parse(raw) : {};
      const fields = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      savedFields.current = fields;
      setState({ key, ...fromSaved(fields), ready: true, error: null });
    }).catch(() => {
      if (active) setState({ key, ...DEFAULTS, ready: true, error: 'Could not load your saved settings. Using the defaults.' });
    });
    return () => { active = false; };
  }, [key]);

  const save = useCallback(fields => {
    setState(previous => ({ ...DEFAULTS, ...(previous.key === key ? previous : {}), key, ...fields, ready: true, error: null }));
    if (!key) return;
    const next = { ...savedFields.current, ...fields };
    savedFields.current = next;
    // Serialise rapid choices, and capture the user's key before awaiting.
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(next)))
      .catch(() => {
        if (currentKey.current === key) setState(previous => ({ ...previous, error: 'Could not save your setting. It still applies to this session.' }));
      });
  }, [key]);

  const setDetail = useCallback(value => save({ detail: normaliseDetail(value) }), [save]);
  // Turning the toggle on is also when its notice is read.
  const setAnimate = useCallback(value => save(value ? { animate: true, animateIntroSeen: true } : { animate: false }), [save]);

  return { ...(state.key === key ? state : { ...DEFAULTS, ready: false, error: null }), setDetail, setAnimate };
}

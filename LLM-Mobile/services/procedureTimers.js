// Procedure timers.
//
// The backend prompt asks the model to emit [[TIMER:<seconds>|<label>]] after
// any step the technician must actually wait out. This module turns those
// markers into timer descriptors and strips them from the text before display,
// so a marker is never shown raw even if parsing changes later.
//
// Detection is deliberately NOT a regex over the response prose. "Wait 3
// minutes before restarting" and "the unit has a 3-minute restart delay"
// contain the same tokens; only the model has the context to tell an
// instruction from a specification.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const MARKER = /\[\[TIMER:(\d{1,5})\|([^\]|]{0,60})\]\]/g;

// Catch-all sweep. MARKER only matches well-formed markers, so a malformed one
// (a non-numeric duration, say) would survive the first pass and be shown to
// the technician as literal "[[TIMER:abc|bad]]". Whatever the model emits, the
// user must never see marker syntax.
const ANY_MARKER = /\[\[\s*TIMER\b[^\]]{0,80}\]\]/gi;

// Markers are replaced with a sentinel rather than deleted outright, so the two
// cases can be cleaned up differently:
//   own line  -> drop the whole line, or a numbered list gains a blank gap
//   inline    -> drop just the marker, or the words either side jam together
const SENTINEL = '\u0000';
const SENTINEL_LINE = /^[ \t]*\u0000[ \t]*\n?/gm;

// Returns the text with markers removed, plus the timers found.
// Guards against a model that ignores the 3-marker cap or emits nonsense
// durations: anything outside 5s..2h is dropped rather than shown.
export function extractTimers(text) {
  if (!text || typeof text !== 'string') return { cleanText: text || '', timers: [] };

  const timers = [];
  let index = 0;
  let out = text.replace(MARKER, (_full, secs, label) => {
    const seconds = parseInt(secs, 10);
    if (Number.isFinite(seconds) && seconds >= 5 && seconds <= 7200 && timers.length < 3) {
      timers.push({
        id: `t${index++}`,
        seconds,
        label: (label || '').trim() || 'Procedure wait',
      });
    }
    return SENTINEL;
  });

  out = out.replace(ANY_MARKER, SENTINEL);        // sweep malformed markers too
  out = out.replace(SENTINEL_LINE, '');           // marker owned the line
  out = out.replace(new RegExp(SENTINEL, 'g'), ''); // marker was inline

  return { cleanText: out.replace(/\n{3,}/g, '\n\n').trim(), timers };
}

let permissionChecked = false;
let permissionGranted = false;

// Asked once per app run, and only when a timer is actually started — there is
// no reason to prompt on launch for a feature most sessions never use.
export async function ensureNotificationPermission() {
  if (permissionChecked) return permissionGranted;
  permissionChecked = true;
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    permissionGranted = status === 'granted';
  } catch (e) {
    console.warn('[timers] permission check failed:', e?.message);
    permissionGranted = false;
  }
  return permissionGranted;
}

// The OS owns the schedule, so this is what makes the alert survive the app
// being backgrounded or the phone being locked — which is the whole point.
// An in-app countdown alone stops the moment iOS suspends the JS thread.
export async function scheduleTimerNotification(seconds, label) {
  const granted = await ensureNotificationPermission();
  if (!granted) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Procedure wait complete',
        body: `${label} — you can continue.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
        repeats: false,
      },
    });
  } catch (e) {
    console.warn('[timers] could not schedule notification:', e?.message);
    return null;
  }
}

export async function cancelTimerNotification(identifier) {
  if (!identifier) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (e) {
    console.warn('[timers] could not cancel notification:', e?.message);
  }
}

export const formatRemaining = (totalSeconds) => {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

// Web has no scheduled-notification path here, so the UI can warn that the
// countdown only runs while the tab is open.
export const backgroundAlertsSupported = Platform.OS !== 'web';

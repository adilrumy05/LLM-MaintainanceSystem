// A single procedure wait, rendered under the AI message that prescribed it.
//
// Correctness note: the countdown is derived from an absolute end timestamp,
// never by decrementing a counter. iOS suspends the JS thread when the app
// backgrounds, so a decrementing timer silently drifts or freezes — exactly
// the case this feature exists for, since the technician pockets the phone
// during the wait. Recomputing from Date.now() means a suspended interval
// catches up correctly on resume.
//
// The user-visible alert does not depend on this component at all: a local
// notification is scheduled with the OS on start, so it fires even if the app
// is backgrounded or the screen is locked.
import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import {
  scheduleTimerNotification,
  cancelTimerNotification,
  formatRemaining,
  backgroundAlertsSupported,
} from '../services/procedureTimers';

export default function ProcedureTimer({ timer, onComplete }) {
  const [endsAt, setEndsAt]       = useState(null);   // ms epoch, null = idle
  const [remaining, setRemaining] = useState(timer.seconds);
  const [done, setDone]           = useState(false);
  const notifIdRef                = useRef(null);
  const firedRef                  = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const left = (endsAt - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        if (!firedRef.current) {
          firedRef.current = true;
          setDone(true);
          setEndsAt(null);
          onComplete?.({ ...timer, completedAt: new Date().toISOString() });
        }
      } else {
        setRemaining(left);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, timer, onComplete]);

  // Cancel the scheduled notification if this message scrolls out of existence
  // mid-wait, so a stale alert cannot fire for a timer nobody is watching.
  useEffect(() => () => { cancelTimerNotification(notifIdRef.current); }, []);

  const start = async () => {
    firedRef.current = false;
    setDone(false);
    const id = await scheduleTimerNotification(timer.seconds, timer.label);
    notifIdRef.current = id;
    if (!id && backgroundAlertsSupported) {
      const msg = 'Notifications are off, so the alert will only appear while this screen is open. Enable notifications to be alerted with the app in the background.';
      Platform.OS === 'web' ? console.warn(msg) : Alert.alert('Procedure timer', msg);
    }
    setEndsAt(Date.now() + timer.seconds * 1000);
  };

  const cancel = async () => {
    await cancelTimerNotification(notifIdRef.current);
    notifIdRef.current = null;
    setEndsAt(null);
    setRemaining(timer.seconds);
    setDone(false);
    firedRef.current = false;
  };

  const running = !!endsAt;
  const pct = running ? 1 - remaining / timer.seconds : done ? 1 : 0;

  return (
    <View style={[s.wrap, done && s.wrapDone, running && s.wrapRunning]}>
      <View style={s.row}>
        <Ionicons
          name={done ? 'checkmark-circle' : running ? 'timer' : 'timer-outline'}
          size={18}
          color={done ? C.green : running ? C.primary : C.textSub}
        />
        <View style={s.textCol}>
          <Text style={s.label} numberOfLines={1}>{timer.label}</Text>
          <Text style={[s.time, done && s.timeDone, running && s.timeRunning]}>
            {done ? 'Wait complete' : formatRemaining(remaining)}
          </Text>
        </View>

        {!running && !done && (
          <TouchableOpacity style={s.btn} onPress={start}>
            <Text style={s.btnText}>Start</Text>
          </TouchableOpacity>
        )}
        {running && (
          <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={cancel}>
            <Text style={[s.btnText, s.btnGhostText]}>Cancel</Text>
          </TouchableOpacity>
        )}
        {done && (
          <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={cancel}>
            <Text style={[s.btnText, s.btnGhostText]}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      {(running || done) && (
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.min(100, Math.max(0, pct * 100))}%` },
                        done && { backgroundColor: C.green }]} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:        { borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, borderRadius: 12, padding: 10, marginTop: 8 },
  wrapRunning: { borderColor: C.primary },
  wrapDone:    { borderColor: C.green, backgroundColor: C.greenBg },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 9 },
  textCol:     { flex: 1 },
  label:       { fontSize: 12, color: C.textSub, fontWeight: '600' },
  time:        { fontSize: 17, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'], marginTop: 1 },
  timeRunning: { color: C.primary },
  timeDone:    { color: C.green, fontSize: 14 },
  btn:         { backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnGhost:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.cardBorder },
  btnGhostText:{ color: C.textSub },
  track:       { height: 3, backgroundColor: C.cardBorder, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  fill:        { height: 3, backgroundColor: C.primary, borderRadius: 2 },
});

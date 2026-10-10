// Plays a checked animation one step at a time. The words under each drawing
// are the manual's own, with the page they come from.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../theme';
import { KIND_LABELS, isSafety } from '../../utils/animationScene';
import Stage from './Stage';

const STEP_MS = 4500;

function useReduceMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (active) setReduced(!!value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => setReduced(!!value));
    return () => { active = false; subscription?.remove?.(); };
  }, []);
  return reduced;
}

function Captions({ lines }) {
  return <View style={s.captions}>
    {lines.map((line, i) => <View key={i} style={s.caption}>
      <View style={s.captionHead}>
        <Text style={[s.kind, isSafety(line.type) && s.kindSafety]}>{KIND_LABELS[line.type] || line.type}</Text>
        <Text style={s.page}>p.{line.page}</Text>
      </View>
      <Text style={s.captionText}>{line.text}</Text>
    </View>)}
  </View>;
}

function Control({ icon, label, onPress, disabled, primary }) {
  return <TouchableOpacity style={[s.control, primary && s.controlPrimary, disabled && s.controlDisabled]} onPress={onPress} disabled={disabled}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}>
    {icon && <Ionicons name={icon} size={14} color={primary ? '#fff' : C.primary} />}
    <Text style={[s.controlText, primary && s.controlTextPrimary]}>{label}</Text>
  </TouchableOpacity>;
}

export default function Player({ animation }) {
  const total = animation.steps.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [all, setAll] = useState(false);
  const reduced = useReduceMotion();

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setTimeout(() => {
      if (index < total - 1) setIndex(index + 1); else setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, index, total]);

  const go = (next) => { setPlaying(false); setIndex(Math.min(Math.max(next, 0), total - 1)); };
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (index === total - 1) setIndex(0);
    setPlaying(true);
  };

  return (
    <View style={s.player}>
      <View style={s.controls}>
        <Control primary icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onPress={togglePlay} disabled={all || total < 2} />
        <Control label="Back" onPress={() => go(index - 1)} disabled={all || index === 0} />
        <Control label="Next" onPress={() => go(index + 1)} disabled={all || index === total - 1} />
        <Control label={all ? 'One at a time' : 'All steps'} onPress={() => { setPlaying(false); setAll(!all); }} />
      </View>
      <Text style={s.count} accessibilityLiveRegion="polite">{all ? `${total} steps` : `Step ${index + 1} of ${total}`}</Text>

      {all
        ? animation.steps.map((step, i) => <View key={i} style={s.frame}>
          <Text style={s.frameNumber}>Step {i + 1} of {total}</Text>
          <Stage animation={animation} index={i} still />
          <Captions lines={animation.captions[i]} />
        </View>)
        : <>
          <Stage animation={animation} index={index} still={reduced} />
          <Captions lines={animation.captions[index]} />
        </>}
    </View>
  );
}

const s = StyleSheet.create({
  player:        { gap: 8 },
  controls:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  control:       { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: C.card },
  controlPrimary:{ backgroundColor: C.primary, borderColor: C.primary },
  controlDisabled:{ opacity: 0.45 },
  controlText:   { fontSize: 12, fontWeight: '700', color: C.primary },
  controlTextPrimary: { color: '#fff' },
  count:         { fontSize: 11, fontWeight: '700', color: C.textSub },
  frame:         { gap: 6, marginBottom: 8 },
  frameNumber:   { fontSize: 11, fontWeight: '800', color: C.textSub },
  captions:      { gap: 8 },
  caption:       { gap: 2 },
  captionHead:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  kind:          { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: C.textSub },
  kindSafety:    { color: C.red, fontWeight: '800' },
  page:          { fontSize: 11, color: C.textSub },
  captionText:   { fontSize: 13, lineHeight: 19, color: C.text },
});

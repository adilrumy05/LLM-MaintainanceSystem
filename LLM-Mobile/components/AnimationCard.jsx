// The animation under a step-by-step answer: being made, ready to play, not
// available, or failed. `state` is the `animation` field stored on the message.
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { isPlayable } from '../utils/animationScene';
import Player from './animation/Player';

function Button({ icon, label, onPress }) {
  return <TouchableOpacity style={s.button} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <Ionicons name={icon} size={13} color={C.primary} />
    <Text style={s.buttonText}>{label}</Text>
  </TouchableOpacity>;
}

/**
 * @param {object} props
 * @param {object} props.state     { status, ref, animation?, message?, missing? }
 * @param {boolean} props.active   a request for this animation is running now
 * @param {Function} props.onRetry
 * @param {Function} props.onCancel
 */
export default function AnimationCard({ state, active = false, onRetry, onCancel }) {
  const [open, setOpen] = useState(true);
  if (!state?.status) return null;

  let body;
  if (state.status === 'generating' && active) {
    body = <>
      <View style={s.row}>
        <ActivityIndicator size="small" color={C.primary} />
        <Text style={s.text}>Drawing the animation from the manual. This can take up to 30 seconds.</Text>
      </View>
      {onCancel && <Button icon="close" label="Cancel animation" onPress={onCancel} />}
    </>;
  } else if (state.status === 'ready' && isPlayable(state.animation)) {
    body = open ? <Player animation={state.animation} /> : null;
  } else if (state.status === 'unavailable') {
    body = <>
      <Text style={s.text}>{state.message || 'No animation is available for this answer.'}</Text>
      {state.missing?.length > 0 && <View style={s.missing}>
        <Text style={s.missingTitle}>Not in the manual text:</Text>
        {state.missing.slice(0, 3).map(item => <Text key={item} style={s.missingItem}>• {item}</Text>)}
      </View>}
    </>;
  } else {
    // Failed, cancelled, or still marked as being made from a session that ended.
    const message = state.status === 'cancelled' ? 'Animation cancelled.'
      : state.status === 'generating' ? 'The animation was interrupted.'
      : state.message || 'The animation could not be made.';
    body = <>
      <Text style={s.text}>{message}</Text>
      {onRetry && <Button icon="refresh-outline" label="Retry animation" onPress={onRetry} />}
    </>;
  }

  const ready = state.status === 'ready' && isPlayable(state.animation);
  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} disabled={!ready} onPress={() => setOpen(!open)}
        accessibilityRole="button" accessibilityLabel={open ? 'Hide animation' : 'Show animation'} accessibilityState={{ expanded: open, disabled: !ready }}>
        <Ionicons name="film-outline" size={14} color={C.primary} />
        <Text style={s.title}>Animation</Text>
        {ready && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />}
      </TouchableOpacity>
      {body}
    </View>
  );
}

const s = StyleSheet.create({
  card:       { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.cardBorder, gap: 8 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  title:      { flex: 1, fontSize: 12, fontWeight: '800', color: C.primary },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text:       { flex: 1, fontSize: 13, lineHeight: 19, color: C.textSub },
  missing:    { gap: 2 },
  missingTitle: { fontSize: 12, fontWeight: '700', color: C.textSub },
  missingItem:{ fontSize: 12, lineHeight: 18, color: C.textSub },
  button:     { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: C.card },
  buttonText: { fontSize: 12, fontWeight: '700', color: C.primary },
});

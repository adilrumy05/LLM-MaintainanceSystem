// components/HandsFreeBar.jsx
//
// Status strip for hands-free mode. The level meter is deliberately visible:
// it shows the live input level against the measured noise floor, which is what
// the quiet/noisy device test needs to judge whether end-of-speech detection
// can work in a given room.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

const LABELS = {
  listening:    'Listening… speak now',
  transcribing: 'Got it, transcribing…',
  thinking:     'Finding the answer…',
  speaking:     'Speaking. Say "repeat" after to hear it again',
};

// Map dBFS (-80 quiet … 0 loud) to a 0–1 bar.
const toFraction = (db) => (Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 80) / 80)) : 0);

export default function HandsFreeBar({ phase, level, floor, onStop, onFinishNow }) {
  if (phase === 'off') return null;
  const listening = phase === 'listening';

  return (
    <View style={s.bar}>
      <View style={s.row}>
        <Ionicons name={listening ? 'mic' : phase === 'speaking' ? 'volume-high' : 'hourglass-outline'} size={16} color={C.primary} />
        <Text style={s.label} numberOfLines={1}>{LABELS[phase] || 'Hands-free'}</Text>

        {listening && (
          <TouchableOpacity style={s.secondaryBtn} onPress={onFinishNow} accessibilityLabel="Done talking">
            <Text style={s.secondaryText}>Done</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.stopBtn} onPress={onStop} accessibilityLabel="Stop hands-free">
          <Ionicons name="stop-circle" size={16} color={C.red} />
          <Text style={s.stopText}> Stop</Text>
        </TouchableOpacity>
      </View>

      {listening && (
        <View style={s.meterRow}>
          <View style={s.meterTrack}>
            <View style={[s.meterFill, { width: `${toFraction(level) * 100}%` }]} />
            {Number.isFinite(floor) && <View style={[s.floorMark, { left: `${toFraction(floor) * 100}%` }]} />}
          </View>
          <Text style={s.meterText}>
            {Number.isFinite(level) ? `${Math.round(level)} dB` : '…'}
            {Number.isFinite(floor) ? ` · floor ${Math.round(floor)}` : ' · measuring room'}
          </Text>
        </View>
      )}

      {phase === 'speaking' && (
        <Text style={s.hint}>Can't hear it? Turn up the volume or switch off silent mode.</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar:           { marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: C.primaryLight, gap: 6 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label:         { flex: 1, color: C.primaryText || C.primary, fontSize: 13, fontWeight: '600' },
  secondaryBtn:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
  secondaryText: { color: C.text, fontSize: 12, fontWeight: '600' },
  stopBtn:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: C.redBg, borderWidth: 1, borderColor: '#fecaca' },
  stopText:      { color: C.red, fontSize: 12, fontWeight: '700' },
  meterRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterTrack:    { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.card, overflow: 'hidden' },
  meterFill:     { height: 6, backgroundColor: C.primary },
  floorMark:     { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: C.red },
  meterText:     { color: C.textMuted, fontSize: 10, minWidth: 110, textAlign: 'right' },
  hint:          { color: C.textMuted, fontSize: 11 },
});

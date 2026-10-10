// The drawing for one step of an animation.
//
// The still parts are one SVG. Anything that moves is its own view on top, so
// the movement is an ordinary view animation. Every moving part rests in its
// end position, which is what a still frame (All steps, Reduce Motion) shows.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { C } from '../../theme';
import { STAGE, stepLayout } from '../../utils/animationScene';
import { ACCENT, ArrowHead, Badge, MUTED, Part, ScrewHead } from './Parts';

const NATIVE = Platform.OS !== 'web';
// The box a moving part is drawn in, in stage units around the part's centre.
const BOX = { width: 150, height: 110 };
const arrow = { stroke: ACCENT, strokeWidth: 2, strokeLinecap: 'round', fill: 'none' };
const angleOf = ({ x1, y1, x2, y2 }) => (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

const loop = (value, steps) => { value.setValue(0); const running = Animated.loop(Animated.sequence(steps)); running.start(); return running; };

// A label centred on a point of the stage. Text is laid out by the phone, not
// scaled with the drawing, so it stays readable on a narrow screen.
function Label({ x, y, k, width = 130, style, children, lines = 2 }) {
  return <Text numberOfLines={lines} style={[s.label, { left: x * k - (width * k) / 2, top: y * k - 8, width: width * k }, style]}>{children}</Text>;
}

function Wiring({ wiring, k, still, draw }) {
  const middle = (wiring.top + wiring.bottom) / 2;
  const wirePath = y => `M168 ${y}C196 ${y + 12} 224 ${y - 12} 252 ${y}`;
  return <>
    <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${STAGE.width} ${STAGE.height}`}>
      <Part shape="outdoor_unit" x={58} y={middle} scale={0.72} />
      <Part shape="indoor_unit" x={362} y={middle} scale={0.72} />
      {[134, 252].map(x => <Rect key={x} fill={C.card} stroke={C.text} strokeWidth={1.6} x={x} y={wiring.top - 20} width={34} height={wiring.bottom - wiring.top + 40} rx={4} />)}
      {still && wiring.wires.map(wire => <Path key={wire.y} {...arrow} strokeWidth={2.4} d={wirePath(wire.y)} />)}
      {wiring.wires.map(wire => <ScrewHead key={`a${wire.y}`} x={151} y={wire.y} r={8} />)}
      {wiring.wires.map(wire => <ScrewHead key={`b${wire.y}`} x={269} y={wire.y} r={8} />)}
    </Svg>
    {/* Each wire is revealed from the outdoor side to the indoor side. */}
    {!still && wiring.wires.map((wire, i) => {
      const start = Math.min(i * 0.15, 0.45);
      return <Animated.View key={wire.y} style={[s.clip, { left: 168 * k, top: (wire.y - 14) * k, height: 28 * k,
        width: draw.interpolate({ inputRange: [start, start + 0.4], outputRange: [0, 84 * k], extrapolate: 'clamp' }) }]}>
        <Svg width={84 * k} height={28 * k} viewBox={`168 ${wire.y - 14} 84 28`}><Path {...arrow} strokeWidth={2.4} d={wirePath(wire.y)} /></Svg>
      </Animated.View>;
    })}
    {wiring.wires.map(wire => <Label key={`f${wire.y}`} x={122} y={wire.y} k={k} width={24} style={s.number}>{wire.from}</Label>)}
    {wiring.wires.map(wire => <Label key={`t${wire.y}`} x={298} y={wire.y} k={k} width={24} style={s.number}>{wire.to}</Label>)}
    <Label x={58} y={wiring.bottom + 58} k={k} width={110}>{wiring.fromUnit}</Label>
    <Label x={362} y={wiring.bottom + 58} k={k} width={110}>{wiring.toUnit}</Label>
    <Label x={210} y={wiring.top - 34} k={k} width={260} style={s.small} lines={1}>terminal numbers as in the manual's table</Label>
    {wiring.coloursMissing && <Label x={210} y={wiring.bottom + 34} k={k} width={260} style={s.small} lines={1}>wire colours are not in the manual text</Label>}
  </>;
}

function Actor({ actor, k, still, values }) {
  const { part, effect } = actor;
  const scale = part.scale;
  const box = { left: (part.x - (BOX.width / 2) * scale) * k, top: (part.y - (BOX.height / 2) * scale) * k, width: BOX.width * scale * k, height: BOX.height * scale * k };
  const viewBox = `${-BOX.width / 2} ${-BOX.height / 2} ${BOX.width} ${BOX.height}`;
  const moving = effect === 'away' || effect === 'toward';

  // A part taken away ends up away; a part fitted on ends up in place.
  const travel = (distance) => {
    if (still) return effect === 'away' ? distance : 0;
    return values.move.interpolate({ inputRange: [0, 1], outputRange: effect === 'away' ? [0, distance] : [distance, 0] });
  };
  const transform = [];
  if (moving) transform.push({ translateX: travel(actor.dx * k) }, { translateY: travel(actor.dy * k) });
  if (!still && (effect === 'ccw' || effect === 'cw') && part.shape === 'screw') {
    transform.push({ rotate: values.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', effect === 'cw' ? '360deg' : '-360deg'] }) });
  }
  if (!still && effect === 'press') transform.push({ translateY: values.pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 5 * scale * k] }) });

  const marked = effect === 'highlight' || effect === 'off' || effect === 'clean' || effect === 'cw' || effect === 'ccw' || effect === 'press';
  const pulsing = !still && (effect === 'highlight' || effect === 'off' || effect === 'clean');
  return <>
    <Animated.View style={[s.layer, box, { transform }]}>
      <Svg width="100%" height="100%" viewBox={viewBox}><Part shape={part.shape} /></Svg>
    </Animated.View>
    {marked && <Animated.View style={[s.layer, box, pulsing && { opacity: values.pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }]}>
      <Svg width="100%" height="100%" viewBox={viewBox}>
        {(effect === 'highlight' || effect === 'off') && <Rect fill="none" stroke={ACCENT} strokeWidth={2.2} x={-66} y={-44} width={132} height={88} rx={18} />}
        {(effect === 'cw' || effect === 'ccw') && <>
          <Path {...arrow} d="M0 -29A29 29 0 1 1 -29 0" />
          {effect === 'cw' ? <ArrowHead x={-29} y={0} angle={-90} /> : <ArrowHead x={0} y={-29} angle={180} />}
        </>}
        {effect === 'press' && <><Line {...arrow} x1={0} y1={-50} x2={0} y2={-30} /><ArrowHead x={0} y={-28} angle={90} /></>}
        {effect === 'clean' && [[-58, -30], [56, -34], [60, 22]].map(([x, y]) => <Path key={`${x}${y}`} {...arrow} d={`M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}`} />)}
      </Svg>
    </Animated.View>}
  </>;
}

/**
 * @param {object} props
 * @param {object} props.animation  the checked animation from the server
 * @param {number} props.index      which step to draw
 * @param {boolean} [props.still]   draw the end position with no movement
 */
export default function Stage({ animation, index, still = false }) {
  const [width, setWidth] = useState(0);
  const values = useRef({ move: new Animated.Value(0), spin: new Animated.Value(0), pulse: new Animated.Value(0), draw: new Animated.Value(0) }).current;
  const layout = stepLayout(animation, index);
  const k = width / STAGE.width;

  useEffect(() => {
    if (still) return undefined;
    const timing = (value, toValue, duration, easing = Easing.inOut(Easing.ease), native = NATIVE) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: native });
    const running = [
      // Rest, move, rest, then start again.
      loop(values.move, [Animated.delay(600), timing(values.move, 1, 1500), Animated.delay(1300), timing(values.move, 0, 0)]),
      loop(values.spin, [timing(values.spin, 1, 2600, Easing.linear)]),
      loop(values.pulse, [timing(values.pulse, 1, 750), timing(values.pulse, 0, 750)]),
      // The wires change a width, which the native driver cannot animate.
      loop(values.draw, [timing(values.draw, 1, 2800, Easing.out(Easing.ease), false), Animated.delay(700)]),
    ];
    return () => running.forEach(each => each.stop());
  }, [still, index, values]);

  return (
    <View style={s.stage} onLayout={event => setWidth(event.nativeEvent.layout.width)}
      accessible accessibilityRole="image" accessibilityLabel={`Drawing for step ${index + 1}. Schematic, not to scale.`}>
      {width > 0 && <>
        {layout.wiring
          ? <Wiring wiring={layout.wiring} k={k} still={still} draw={values.draw} />
          : <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${STAGE.width} ${STAGE.height}`}>
            {layout.actors.map(actor => <ActorBackdrop key={actor.key} actor={actor} />)}
          </Svg>}
        {layout.actors.map(actor => <Actor key={actor.key} actor={actor} k={k} still={still} values={values} />)}
        {layout.actors.map(actor => <ActorText key={actor.key} actor={actor} k={k} />)}
        {layout.empty && <Label x={210} y={126} k={k} width={340} style={s.small}>No drawing for this step. Read the text below.</Label>}
        {layout.safety && <View style={s.safety}><Text style={s.safetyMark}>!</Text><Text style={s.safetyText}>safety</Text></View>}
        <Text style={s.scaleNote}>schematic, not to scale</Text>
      </>}
    </View>
  );
}

// What stays put around a part: where it was, which way it goes, what it goes
// onto or comes off, and what it is done with.
function ActorBackdrop({ actor }) {
  return <>
    {actor.context && <Part shape={actor.context.shape} x={actor.context.x} y={actor.context.y} scale={actor.context.scale} opacity={0.78} />}
    {actor.ghost && <Rect fill="none" stroke={MUTED} strokeWidth={1.2} strokeDasharray="5 4" rx={8} {...actor.ghost} />}
    {actor.arrow && <><Line {...arrow} {...actor.arrow} /><ArrowHead x={actor.arrow.x2} y={actor.arrow.y2} angle={angleOf(actor.arrow)} /></>}
    {actor.instrument && <Part shape={actor.instrument.shape} x={actor.instrument.x} y={actor.instrument.y} scale={actor.instrument.scale} />}
    {actor.badge && <Badge {...actor.badge} />}
  </>;
}

function ActorText({ actor, k }) {
  return <>
    {actor.tag && <Label x={actor.tag.x} y={actor.tag.y} k={k} width={110} style={s.tag} lines={1}>{actor.tag.text}</Label>}
    <Label x={actor.label.x} y={actor.label.y} k={k} width={actor.label.wide ? 220 : 124}>{actor.label.text}</Label>
    {actor.values.map((value, i) =>
      <View key={value} style={[s.valueRow, { left: actor.label.x * k - 70, top: actor.label.y * k + 26 + i * 22 }]}><Text style={s.value}>{value}</Text></View>)}
    {actor.context && <Label x={actor.context.labelX} y={actor.context.y + 56 * actor.part.scale} k={k} width={84} style={s.small}>{actor.context.label}</Label>}
    {actor.instrument && <>
      <Label x={actor.instrument.x} y={actor.instrument.y - 40} k={k} width={60} style={s.small} lines={1}>with</Label>
      <Label x={actor.instrument.x} y={actor.instrument.y + 38} k={k} width={100} style={s.small}>{actor.instrument.label}</Label>
    </>}
  </>;
}

const s = StyleSheet.create({
  stage:      { width: '100%', aspectRatio: STAGE.width / STAGE.height, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 10, overflow: 'hidden' },
  layer:      { position: 'absolute' },
  clip:       { position: 'absolute', overflow: 'hidden' },
  label:      { position: 'absolute', textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '600', color: C.text },
  small:      { fontSize: 10, fontWeight: '400', color: C.textSub },
  number:     { fontSize: 12, fontWeight: '800' },
  tag:        { fontSize: 11, fontWeight: '800', color: C.primary },
  valueRow:   { position: 'absolute', width: 140, alignItems: 'center' },
  value:      { fontSize: 11, fontWeight: '800', color: C.primaryText, backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden' },
  safety:     { position: 'absolute', left: 8, top: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  safetyMark: { width: 18, height: 18, borderRadius: 9, textAlign: 'center', lineHeight: 18, fontSize: 12, fontWeight: '900', color: '#fff', backgroundColor: C.orange, overflow: 'hidden' },
  safetyText: { fontSize: 10, fontWeight: '800', color: C.orange },
  scaleNote:  { position: 'absolute', right: 8, bottom: 5, fontSize: 9, color: C.textMuted },
});

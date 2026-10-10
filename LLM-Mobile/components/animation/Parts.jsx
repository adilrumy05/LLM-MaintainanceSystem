// Generic pictures of a kind of part, not drawings of the real one. Each is
// drawn around (0, 0), about 110 wide and 70 high. The choice of picture is
// made in utils/animationScene.js.
import { Circle, G, Path, Rect } from 'react-native-svg';
import { C } from '../../theme';

export const INK = C.text;
export const ACCENT = C.primary;
export const MUTED = C.textSub;

const body = { fill: C.card, stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' };
const shade = { fill: C.primaryLight, stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round' };
const ink = { fill: 'none', stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
const thin = { fill: 'none', stroke: INK, strokeWidth: 1, strokeLinecap: 'round', opacity: 0.5 };
const hot = { fill: ACCENT };
const tube = { fill: 'none', stroke: INK, strokeWidth: 13, strokeLinecap: 'round' };
const tubeIn = { fill: 'none', stroke: C.card, strokeWidth: 10, strokeLinecap: 'round' };

export const ScrewHead = ({ x, y, r }) => <>
  <Circle {...body} cx={x} cy={y} r={r} />
  <Path {...ink} d={`M${x - r * 0.55} ${y}H${x + r * 0.55}`} />
</>;

const HOSE = 'M-54 -14C-20 -14 -24 18 8 18S40 -2 54 -2';

const PICTURES = {
  indoor_unit: () => <>
    <Rect {...body} x={-58} y={-24} width={116} height={46} rx={13} />
    <Path {...ink} d="M-58 6H58M-42 14H42" />
    <Rect {...shade} x={-44} y={-15} width={26} height={9} rx={2} />
    <Circle {...hot} cx={40} cy={-10} r={2.6} />
  </>,
  outdoor_unit: () => <>
    <Rect {...body} x={-54} y={-36} width={108} height={70} rx={6} />
    <Circle {...shade} cx={-16} cy={-1} r={26} />
    <Path {...thin} d="M-16 -27V25M-42 -1H10M-34 -19L2 17M-34 17L2 -19" />
    <Circle {...body} cx={-16} cy={-1} r={7} />
    <Rect {...shade} x={24} y={-28} width={20} height={54} rx={2} />
    <Path {...ink} d="M-44 34v6M44 34v6" />
  </>,
  unit: () => <>
    <Rect {...body} x={-52} y={-30} width={104} height={60} rx={8} />
    <Path {...ink} d="M-52 10H52" />
    <Path {...thin} d="M-38 19H38" />
    <Circle {...hot} cx={38} cy={-17} r={2.6} />
  </>,
  cover: () => <>
    <Rect {...body} x={-44} y={-30} width={88} height={60} rx={5} />
    <Path {...thin} d="M-28 -10H28M-28 0H28M-28 10H28" />
    {[[-35, -21], [35, -21], [-35, 21], [35, 21]].map(([x, y]) => <Circle key={`${x}${y}`} {...ink} cx={x} cy={y} r={2.4} />)}
  </>,
  screw: () => <>
    <Circle {...body} cx={0} cy={0} r={18} />
    <Path {...ink} d="M-11 0H11" />
    <Circle {...hot} cx={0} cy={-12} r={2.2} />
  </>,
  cable: () => <>
    <Rect {...shade} x={-58} y={-8} width={64} height={16} rx={8} />
    <Path {...ink} d="M6 -5L40 -20M6 -2L44 -7M6 2L44 7M6 5L40 20" />
    {[[43, -21], [47, -7], [47, 7], [43, 21]].map(([x, y]) => <Circle key={`${x}${y}`} {...body} cx={x} cy={y} r={3.6} />)}
  </>,
  terminal_block: () => <>
    <Rect {...body} x={-42} y={-18} width={84} height={36} rx={3} />
    <ScrewHead x={-26} y={0} r={8} /><ScrewHead x={0} y={0} r={8} /><ScrewHead x={26} y={0} r={8} />
  </>,
  board: () => <>
    <Rect {...body} x={-48} y={-30} width={96} height={60} rx={3} />
    <Rect {...shade} x={-38} y={-21} width={24} height={16} rx={1} />
    <Rect {...shade} x={-4} y={-21} width={38} height={9} rx={1} />
    <Path {...thin} d="M-38 2H-10M-4 -5H32" />
    {[-36, -18, 0, 18].map(x => <Rect key={x} {...shade} x={x} y={12} width={11} height={11} />)}
  </>,
  clamp: () => <>
    <Path {...body} d="M-36 14H-17V2a17 17 0 0 1 34 0V14H36V23H-36Z" />
    <Circle {...ink} cx={-27} cy={18.5} r={2} /><Circle {...ink} cx={27} cy={18.5} r={2} />
  </>,
  tape: () => <>
    <Circle {...body} cx={-6} cy={0} r={25} />
    <Circle {...shade} cx={-6} cy={0} r={10} />
    <Path {...ink} d="M12 18L42 27" />
  </>,
  filter: () => <>
    <Path {...ink} d="M-12 26v9h24v-9" />
    <Rect {...body} x={-48} y={-28} width={96} height={54} rx={6} />
    <Path {...thin} d="M-32 -28V26M-16 -28V26M0 -28V26M16 -28V26M32 -28V26M-48 -10H48M-48 8H48" />
  </>,
  hose: () => <><Path {...tube} d={HOSE} /><Path {...tubeIn} d={HOSE} /></>,
  pipe: () => <>
    <Path {...tube} d="M-54 0H34" /><Path {...tubeIn} d="M-54 0H34" />
    <Rect {...shade} x={28} y={-13} width={24} height={26} rx={3} />
  </>,
  tool: () => <>
    <Rect {...shade} x={-54} y={-9} width={44} height={18} rx={8} />
    <Path {...ink} d="M-10 0H40" />
    <Path {...body} d="M40 -4.5L53 0L40 4.5Z" />
  </>,
  remote: () => <>
    <Rect {...body} x={-22} y={-38} width={44} height={76} rx={9} />
    <Rect {...shade} x={-14} y={-30} width={28} height={17} rx={2} />
    {[-2, 12, 26].flatMap(y => [-9, 9].map(x => <Circle key={`${x}${y}`} {...ink} cx={x} cy={y} r={4} />))}
  </>,
  button: () => <>
    <Rect {...shade} x={-32} y={-6} width={64} height={26} rx={7} />
    <Rect {...body} x={-26} y={-18} width={52} height={26} rx={9} />
  </>,
  led: () => <>
    <Path {...thin} d="M0 -26V-20M0 20V26M-26 0H-20M20 0H26M-18.5 -18.5L-14 -14M18.5 -18.5L14 -14M-18.5 18.5L-14 14M18.5 18.5L14 14" />
    <Circle {...body} cx={0} cy={0} r={14} />
    <Circle {...hot} cx={0} cy={0} r={7.5} />
  </>,
  display: () => <>
    <Rect {...body} x={-38} y={-21} width={76} height={42} rx={5} />
    <Rect {...shade} x={-30} y={-14} width={60} height={28} rx={2} />
    <Path {...ink} d="M-13 0H-4M4 0H13" />
  </>,
  switch: () => <>
    <Rect {...body} x={-24} y={-32} width={48} height={64} rx={7} />
    <Rect {...shade} x={-13} y={-22} width={26} height={44} rx={4} />
    <Path {...ink} d="M0 -15V-6" />
    <Circle {...ink} cx={0} cy={9} r={5.5} />
  </>,
  bottle: () => <>
    <Path {...body} d="M-16 32V-4q0-9 9-11V-30h14v15q9 2 9 11V32Z" />
    <Rect {...shade} x={-10} y={2} width={20} height={18} rx={2} />
  </>,
  generic: () => <>
    <Rect {...body} x={-46} y={-24} width={92} height={48} rx={10} />
    <Path {...thin} d="M-30 -6H30M-30 6H14" />
  </>,
};
PICTURES.panel = PICTURES.cover;

/** One part, drawn at (x, y) in the surrounding drawing. */
export function Part({ shape, x = 0, y = 0, scale = 1, opacity = 1 }) {
  const Picture = PICTURES[shape] || PICTURES.generic;
  return <G transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}><Picture /></G>;
}

/** A small arrowhead at (x, y) pointing along `angle` (degrees, 0 = right). */
export const ArrowHead = ({ x, y, angle }) =>
  <Path fill={ACCENT} d="M0 0L-9 -4.5L-9 4.5Z" transform={`translate(${x} ${y}) rotate(${angle})`} />;

const badgeInk = { fill: 'none', stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const BADGES = {
  check: () => <Path {...badgeInk} d="M-5 0L-1.5 4L5.5 -4" />,
  replace: () => <>
    <Path {...badgeInk} d="M-5 -1.5A5.5 5.5 0 0 1 5 -2.5M5 1.5A5.5 5.5 0 0 1 -5 2.5" />
    <Path {...badgeInk} d="M5 -6V-2.5H1.5M-5 6V2.5H-1.5" />
  </>,
  wait: () => <><Circle {...badgeInk} cx={0} cy={0} r={6} /><Path {...badgeInk} d="M0 -3.5V0L2.5 2" /></>,
};

/** The round mark for "check", "replace" and "wait". */
export function Badge({ kind, x, y }) {
  const Mark = BADGES[kind];
  if (!Mark) return null;
  return <G transform={`translate(${x} ${y})`}><Circle fill={ACCENT} r={11} /><Mark /></G>;
}

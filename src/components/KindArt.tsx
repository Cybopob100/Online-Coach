// Иллюстрации трёх видов тренировок (векторные, чёткие на любом экране,
// цвета берутся из темы — работают и в светлой, и в тёмной теме).
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useColors } from '../lib/theme';

export type Kind = 'online' | 'gym' | 'group';

/** Атлет со штангой над головой (фиксация рывка). cx — центр, y — верх грифа, s — масштаб. */
function Athlete({ cx, y, s, body, plate }: { cx: number; y: number; s: number; body: string; plate: string }) {
  const bar = 22 * s;
  const sw = 3 * s;
  return (
    <G>
      {/* гриф и блины */}
      <Line x1={cx - bar} y1={y} x2={cx + bar} y2={y} stroke={body} strokeWidth={sw * 0.8} strokeLinecap="round" />
      <Rect x={cx - bar - 2 * s} y={y - 7 * s} width={5 * s} height={14 * s} rx={1.5 * s} fill={plate} />
      <Rect x={cx + bar - 3 * s} y={y - 7 * s} width={5 * s} height={14 * s} rx={1.5 * s} fill={plate} />
      {/* руки */}
      <Line x1={cx - 15 * s} y1={y} x2={cx} y2={y + 16 * s} stroke={body} strokeWidth={sw} strokeLinecap="round" />
      <Line x1={cx + 15 * s} y1={y} x2={cx} y2={y + 16 * s} stroke={body} strokeWidth={sw} strokeLinecap="round" />
      {/* голова и корпус */}
      <Circle cx={cx} cy={y + 11 * s} r={4.5 * s} fill={body} />
      <Line x1={cx} y1={y + 16 * s} x2={cx} y2={y + 32 * s} stroke={body} strokeWidth={sw * 1.3} strokeLinecap="round" />
      {/* ноги в широкой стойке */}
      <Line x1={cx} y1={y + 32 * s} x2={cx - 9 * s} y2={y + 46 * s} stroke={body} strokeWidth={sw} strokeLinecap="round" />
      <Line x1={cx} y1={y + 32 * s} x2={cx + 9 * s} y2={y + 46 * s} stroke={body} strokeWidth={sw} strokeLinecap="round" />
    </G>
  );
}

function OnlineArt({ ink, accent, soft }: Palette) {
  return (
    <>
      {/* экран ноутбука */}
      <Rect x={18} y={22} width={84} height={58} rx={6} fill={soft} stroke={ink} strokeWidth={3} />
      <Athlete cx={60} y={32} s={0.85} body={ink} plate={accent} />
      {/* основание */}
      <Path d="M8 84 H112 L106 92 H14 Z" fill={ink} />
      {/* значок «в эфире» */}
      <Circle cx={92} cy={32} r={3.5} fill={accent} />
      <Path d="M84 25 A11 11 0 0 1 100 25" stroke={accent} strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </>
  );
}

function GymArt({ ink, accent, soft }: Palette) {
  return (
    <>
      {/* помост */}
      <Rect x={8} y={88} width={104} height={12} rx={2} fill={soft} stroke={ink} strokeWidth={2.5} />
      <Line x1={40} y1={88} x2={40} y2={100} stroke={ink} strokeWidth={2} />
      <Line x1={80} y1={88} x2={80} y2={100} stroke={ink} strokeWidth={2} />
      {/* штанга на помосте */}
      <Line x1={10} y1={70} x2={110} y2={70} stroke={ink} strokeWidth={4} strokeLinecap="round" />
      <Rect x={18} y={52} width={11} height={36} rx={3} fill={accent} />
      <Rect x={30} y={58} width={7} height={24} rx={2} fill={ink} />
      <Rect x={91} y={52} width={11} height={36} rx={3} fill={accent} />
      <Rect x={83} y={58} width={7} height={24} rx={2} fill={ink} />
      <Rect x={38} y={65} width={4} height={10} rx={1} fill={ink} />
      <Rect x={78} y={65} width={4} height={10} rx={1} fill={ink} />
      {/* гиря */}
      <Path d="M52 30 A8 8 0 0 1 68 30" stroke={ink} strokeWidth={3.5} fill="none" strokeLinecap="round" />
      <Circle cx={60} cy={38} r={10} fill={accent} />
      <Rect x={53} y={45} width={14} height={3} rx={1.5} fill={ink} />
    </>
  );
}

function GroupArt({ ink, accent, soft }: Palette) {
  return (
    <>
      <Rect x={6} y={96} width={108} height={6} rx={3} fill={soft} />
      <Athlete cx={28} y={46} s={0.75} body={ink} plate={ink} />
      <Athlete cx={92} y={46} s={0.75} body={ink} plate={ink} />
      <Athlete cx={60} y={30} s={1.05} body={accent} plate={accent} />
    </>
  );
}

type Palette = { ink: string; accent: string; soft: string };

export function KindArt({ kind, size = 96 }: { kind: Kind; size?: number }) {
  const c = useColors();
  const p: Palette = { ink: c.text, accent: c.accent, soft: c.accentSoft };
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityElementsHidden importantForAccessibility="no">
      {kind === 'online' ? <OnlineArt {...p} /> : kind === 'gym' ? <GymArt {...p} /> : <GroupArt {...p} />}
    </Svg>
  );
}

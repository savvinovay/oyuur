// Building blocks for drawing trees with Skia. Every drawing stands on (0, 0),
// grows up (negative y) and is measured in the units of layout.ts.
import { Circle, Group, LinearGradient, Oval, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { Palette } from '../theme';

/** Repeatable random numbers: the same tree always gets the same leaves. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Blend two #RRGGBB colors: t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

export const deg = (d: number) => (d * Math.PI) / 180;

/** A thirsty leaf turns `25° × thirst` further down from upright (0° stays up). */
export const droop = (angle: number, thirst = 0) => angle + Math.sign(angle) * 25 * thirst;

/** How far (units) a thirsty crown sags. */
export const sag = (thirst = 0) => 6 * thirst;

/**
 * A leaf on the edge of a crown hangs `30° × thirst` further towards straight down,
 * whichever way it points (degrees, 0 = up), and never past it.
 */
export function hangDown(angle: number, thirst = 0): number {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180;
  const turn = Math.min(30 * thirst, 180 - Math.abs(a));
  return a + Math.sign(a || 1) * turn;
}

/** Four shades of one material, from the lit side to the deepest shadow. */
export interface Shades {
  light: string;
  mid: string;
  dark: string;
  deep: string;
}

export const leafShades = (p: Palette): Shades => ({
  light: p.leafLight,
  mid: p.leaf,
  dark: p.leafDark,
  deep: mix(p.leafDark, '#000000', 0.3),
});

export const barkShades = (p: Palette): Shades => ({
  light: mix(p.trunk, '#FFFFFF', 0.18),
  mid: p.trunk,
  dark: p.trunkDark,
  deep: mix(p.trunkDark, '#000000', 0.3),
});

/** Soft shadow on the ground. */
export function GroundShadow({ w, p }: { w: number; p: Palette }) {
  // Flat, and mostly above the ground line: the picture ends a few units below it.
  return <Oval x={-w / 2} y={-w * 0.04} width={w} height={w * 0.065} color={p.groundShade} opacity={0.75} />;
}

/** A little dome of soil for the smallest plants. */
export function Mound({ w, p }: { w: number; p: Palette }) {
  const h = w * 0.13;
  return (
    <Path path={`M${-w / 2} 2 Q ${-w / 4} ${-h}, 0 ${-h} Q ${w / 4} ${-h}, ${w / 2} 2 Z`}>
      <LinearGradient start={vec(0, -h)} end={vec(0, 2)} colors={[mix(p.groundShade, p.trunkDark, 0.25), p.groundShade]} />
    </Path>
  );
}

/** A curved stem or branch, darker along one side so it looks round. */
export function Stem({ d, width, color, shadow }: { d: string; width: number; color: string; shadow: string }) {
  return (
    <Group>
      <Path path={d} style="stroke" strokeWidth={width} strokeCap="round" strokeJoin="round" color={shadow} />
      <Path path={d} style="stroke" strokeWidth={width * 0.55} strokeCap="round" strokeJoin="round" color={color} />
    </Group>
  );
}

const almond = (len: number, w: number) =>
  `M0 0 C ${w} ${-len * 0.22}, ${w} ${-len * 0.72}, 0 ${-len} C ${-w} ${-len * 0.72}, ${-w} ${-len * 0.22}, 0 0 Z`;

/** Oak leaf: three rounded lobes on each side. */
const lobed = (len: number, w: number) => {
  const side = (s: number) => {
    let d = '';
    const ys = [0.2, 0.45, 0.7];
    ys.forEach((y, i) => {
      const lobe = w * (1 - i * 0.12);
      d += ` Q ${s * lobe * 1.15} ${-len * (y - 0.06)}, ${s * lobe} ${-len * (y + 0.06)}`;
      d += ` Q ${s * lobe * 0.85} ${-len * (y + 0.12)}, ${s * w * 0.62} ${-len * (y + 0.13)}`;
    });
    return d;
  };
  const right = side(1) + ` Q ${w * 0.55} ${-len * 0.96}, 0 ${-len}`;
  // The left side mirrors the right one, walked from the tip down.
  const left = side(-1);
  return `M0 0${right} M0 0${left} Q ${-w * 0.55} ${-len * 0.96}, 0 ${-len} Z`;
};

/**
 * Maple leaf: five pointed lobes. The right half as points on a leaf one unit long
 * (stalk at 0, tip at −1); a pair of numbers is a line, four a curve. The left half mirrors it.
 */
const MAPLE: number[][] = [[0.10, -0.22], [0.42, -0.20], [0.30, -0.30, 0.26, -0.38], [0.52, -0.60], [0.32, -0.58, 0.18, -0.62], [0, -1]];

const mapleHalf = (len: number, side: number) => {
  let d = `M0 ${-len * 0.16}`;
  for (const p of MAPLE) {
    d += p.length === 4
      ? ` Q ${side * p[0] * len} ${p[1] * len}, ${side * p[2] * len} ${p[3] * len}`
      : ` L ${side * p[0] * len} ${p[1] * len}`;
  }
  return `${d} Z`;
};

const maple = (len: number) => `${mapleHalf(len, 1)} ${mapleHalf(len, -1)}`;

export type LeafShape = 'almond' | 'oak' | 'maple';

/** A leaf whose stalk is at (x, y), pointing at `angle` degrees (0 = up). */
export function Leaf({
  x, y, angle, len, width, light, dark, vein, oak = false, shape,
}: {
  x: number; y: number; angle: number; len: number; width: number;
  light: string; dark: string; vein: string;
  /** The old flag for `shape: 'oak'`. */
  oak?: boolean;
  shape?: LeafShape;
}) {
  const w = width / 2;
  const form = shape ?? (oak ? 'oak' : 'almond');
  if (form === 'maple') {
    // The gradient runs across the whole leaf: its lobes reach out to half its length.
    const g = Math.max(w, len * 0.5);
    return (
      <Group transform={[{ translateX: x }, { translateY: y }, { rotate: deg(angle) }]}>
        <Path path={maple(len)}>
          <LinearGradient start={vec(-g, 0)} end={vec(g, 0)} colors={[dark, light]} />
        </Path>
        <Path path={`M0 0 L0 ${-len * 0.16}`} style="stroke" strokeWidth={Math.max(0.8, len * 0.05)} strokeCap="round" color={vein} />
        <Path
          path={`M0 ${-len * 0.18} L0 ${-len * 0.9} M0 ${-len * 0.2} L${len * 0.44} ${-len * 0.56} M0 ${-len * 0.2} L${-len * 0.44} ${-len * 0.56}`}
          style="stroke" strokeWidth={Math.max(0.6, len * 0.035)} strokeCap="round" color={vein} opacity={0.55}
        />
      </Group>
    );
  }
  const d = form === 'oak' ? lobed(len, w) : almond(len, w);
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { rotate: deg(angle) }]}>
      <Path path={d}>
        <LinearGradient start={vec(-w, 0)} end={vec(w, 0)} colors={[dark, light]} />
      </Path>
      <Path path={`M0 0 L0 ${-len * 0.85}`} style="stroke" strokeWidth={Math.max(0.7, width * 0.05)} strokeCap="round" color={vein} opacity={0.6} />
    </Group>
  );
}

/** One round mass of foliage, lit from the top left. */
export function Blob({ x, y, r, s }: { x: number; y: number; r: number; s: Shades }) {
  return (
    <Circle cx={x} cy={y} r={r}>
      <RadialGradient c={vec(x - r * 0.35, y - r * 0.45)} r={r * 1.4} colors={[s.light, s.mid, s.dark]} positions={[0, 0.5, 1]} />
    </Circle>
  );
}

export interface BlobSpec {
  x: number;
  y: number;
  r: number;
}

/**
 * Masses of a round crown centered at (cx, cy) whose outline reaches exactly rx / ry:
 * a ring of blobs on the edge and a few inside. Sorted top to bottom, so lower ones overlap.
 */
export function crownBlobs(cx: number, cy: number, rx: number, ry: number, count: number, seed: number): BlobSpec[] {
  const rand = rng(seed);
  const r = Math.min(rx, ry) * 0.52;
  const blobs: BlobSpec[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.3;
    const br = r * (0.72 + rand() * 0.34);
    // Edge leaves stick out about 1.2 × the blob radius, so the outline still ends at rx / ry.
    blobs.push({ x: cx + Math.cos(a) * (rx - br * 1.2), y: cy + Math.sin(a) * (ry - br * 1.2), r: br });
  }
  const inner = Math.max(2, Math.round(count / 3));
  for (let i = 0; i < inner; i++) {
    const a = (i / inner) * Math.PI * 2 + 0.6;
    blobs.push({ x: cx + Math.cos(a) * rx * 0.3, y: cy + Math.sin(a) * ry * 0.25, r: r * 1.05 });
  }
  return blobs.sort((a, b) => a.y - b.y);
}

/**
 * A crown of several clumps — each [cx, cy, rx, ry, count] is a small crownBlobs — so the
 * outline is lumpy and the masses differ in size, not one even ball (maple and birch, wave 5
 * fixes). The clumps must stay inside the kind's SIZES. Sorted top to bottom, like crownBlobs.
 */
export function clumpBlobs(clumps: [number, number, number, number, number][], seed: number): BlobSpec[] {
  return clumps.flatMap(([cx, cy, rx, ry, count], i) => crownBlobs(cx, cy, rx, ry, count, seed + i * 17)).sort((a, b) => a.y - b.y);
}

/** A leafy crown: shadow underneath, shaded masses, leaves sticking out of the edge and catching the light. */
export function Crown({ blobs, s, flecks, seed, fleckColor, thirst = 0, leafShape = 'almond', edgeScale = 1 }: {
  blobs: BlobSpec[]; s: Shades; flecks: number; seed: number; fleckColor?: string;
  /** 0..1: the leaves on the edge hang down. */
  thirst?: number;
  /** Shape of the leaves on the edge and of the flecks of light. */
  leafShape?: LeafShape;
  /** Size of the leaves on the edge (1 — as before). */
  edgeScale?: number;
}) {
  const rand = rng(seed + 7);
  const marks = Array.from({ length: flecks }, () => {
    const b = blobs[Math.floor(rand() * blobs.length)];
    const a = -Math.PI * (0.15 + rand() * 0.7);
    const d = b.r * (0.35 + rand() * 0.55);
    return { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, angle: -60 + rand() * 120, len: b.r * (0.22 + rand() * 0.12) };
  });
  // Small leaves along the outline break up the round edge, so it reads as foliage.
  const cx = blobs.reduce((t, b) => t + b.x, 0) / blobs.length;
  const cy = blobs.reduce((t, b) => t + b.y, 0) / blobs.length;
  const edge = blobs.flatMap((b) => {
    const out = Math.atan2(b.y - cy, b.x - cx);
    return [-0.7, -0.25, 0.2, 0.65].map((o) => {
      const a = out + o + (rand() - 0.5) * 0.3;
      return { x: b.x + Math.cos(a) * b.r * 0.86, y: b.y + Math.sin(a) * b.r * 0.86, angle: hangDown((a * 180) / Math.PI + 90, thirst), len: b.r * (0.3 + rand() * 0.1) * edgeScale };
    });
  });
  const mapleLeaves = leafShape === 'maple';
  const wide = mapleLeaves ? 1 : 0.7;
  return (
    <Group>
      {blobs.map((b, i) => (
        <Circle key={`s${i}`} cx={b.x + b.r * 0.05} cy={b.y + b.r * 0.14} r={b.r * 1.02} color={s.deep} />
      ))}
      {edge.map((m, i) => (
        <Leaf key={`e${i}`} x={m.x} y={m.y} angle={m.angle} len={m.len} width={m.len * wide} light={s.mid} dark={s.dark} vein={s.dark} shape={leafShape} />
      ))}
      {blobs.map((b, i) => (
        <Blob key={`b${i}`} x={b.x} y={b.y} r={b.r} s={s} />
      ))}
      {marks.map((m, i) => (
        <Leaf key={`f${i}`} x={m.x} y={m.y} angle={m.angle} len={m.len * (mapleLeaves ? 1.1 : 1)} width={m.len * (mapleLeaves ? 1 : 0.6)} light={fleckColor ?? s.light} dark={s.mid} vein={s.mid} shape={leafShape} />
      ))}
    </Group>
  );
}

/**
 * A trunk `h` tall and `w` wide at the ground, narrowing upwards, with roots
 * spreading out when `roots` is set. Rounded by a gradient across it.
 */
export function Trunk({ h, w, s, roots = false, lean = 0 }: { h: number; w: number; s: Shades; roots?: boolean; lean?: number }) {
  const top = w * 0.42;
  const flare = roots ? w * 0.45 : w * 0.1;
  const d = `M${-w / 2 - flare} 0
    C ${-w / 2} ${-h * 0.08}, ${-w / 2} ${-h * 0.25}, ${-w * 0.42 + lean * 0.4} ${-h * 0.5}
    C ${-w * 0.35 + lean * 0.7} ${-h * 0.75}, ${-top / 2 + lean} ${-h * 0.9}, ${-top / 2 + lean} ${-h}
    L ${top / 2 + lean} ${-h}
    C ${top / 2 + lean} ${-h * 0.9}, ${w * 0.35 + lean * 0.7} ${-h * 0.75}, ${w * 0.42 + lean * 0.4} ${-h * 0.5}
    C ${w / 2} ${-h * 0.25}, ${w / 2} ${-h * 0.08}, ${w / 2 + flare} 0 Z`;
  return (
    <Group>
      <Path path={d}>
        <LinearGradient start={vec(-w / 2, 0)} end={vec(w / 2, 0)} colors={[s.dark, s.light, s.mid, s.deep]} positions={[0, 0.3, 0.65, 1]} />
      </Path>
      {/* Bark lines. */}
      <Path path={`M${-w * 0.15} ${-h * 0.08} C ${-w * 0.2} ${-h * 0.3}, ${-w * 0.08} ${-h * 0.45}, ${-w * 0.12} ${-h * 0.62}`} style="stroke" strokeWidth={Math.max(1, w * 0.06)} strokeCap="round" color={s.deep} opacity={0.45} />
      <Path path={`M${w * 0.18} ${-h * 0.15} C ${w * 0.12} ${-h * 0.32}, ${w * 0.22} ${-h * 0.4}, ${w * 0.14} ${-h * 0.52}`} style="stroke" strokeWidth={Math.max(1, w * 0.05)} strokeCap="round" color={s.deep} opacity={0.35} />
    </Group>
  );
}

/** Grass tufts and flowers around the foot of a big tree. */
export function Meadow({ w, p, seed, flowers }: { w: number; p: Palette; seed: number; flowers: string[] }) {
  const rand = rng(seed + 3);
  const tufts = Array.from({ length: 9 }, (_, i) => ({ x: -w / 2 + (w * (i + 0.5)) / 9 + (rand() - 0.5) * 10, h: 8 + rand() * 8 }));
  const dots = Array.from({ length: 10 }, () => ({ x: (rand() - 0.5) * w * 0.95, y: -3 - rand() * 10, c: flowers[Math.floor(rand() * flowers.length)] }));
  return (
    <Group>
      {tufts.map((t, i) => (
        <Path
          key={`t${i}`}
          path={`M${t.x - 5} 0 Q ${t.x - 4} ${-t.h * 0.6}, ${t.x - 7} ${-t.h} Q ${t.x - 1} ${-t.h * 0.5}, ${t.x} ${-t.h * 1.1} Q ${t.x + 1} ${-t.h * 0.5}, ${t.x + 7} ${-t.h * 0.9} Q ${t.x + 4} ${-t.h * 0.5}, ${t.x + 5} 0 Z`}
          color={i % 2 ? p.leaf : p.leafDark}
        />
      ))}
      {dots.map((d, i) => (
        <Group key={`d${i}`}>
          <Circle cx={d.x} cy={d.y} r={3.4} color={d.c} />
          <Circle cx={d.x} cy={d.y} r={1.3} color="#FFF3B0" />
        </Group>
      ))}
    </Group>
  );
}

// The layer the acorns fly in (wave 5 spec, 3.1–3.5), mounted once in _layout over every
// screen and never taking a touch. Each flock is a few plain views with the acorn glyph
// (react-native-svg, not Skia: the main screen has its three canvases already); one clock
// per flock runs on the UI thread and every acorn reads its place on its arc from it.
// When an acorn reaches the wallet the layer tells the bus, which counts it in.
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { Easing, SharedValue, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { formatAcorns, pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { Glyph } from '@/ui/ds';
import { FlightSpec, onFlight, onLanded, setFlightAnimations, shownAcorns } from './bus';
import { arcControl, bezier, EARN, earnArrival, earnStart, earnTotal, Pt, SPEND, spendArrival, spendStart, spendTotal } from './flight';

/** One acorn's path, in the layer's coordinates. */
interface Plan {
  /** Fan-out: from the source to `burst` (earning only). */
  from: Pt;
  burst: Pt;
  ctrl: Pt;
  to: Pt;
  /** Degrees it starts turned by. */
  rot: number;
  start: number;
  arrive: number;
}

interface Flock {
  id: number;
  kind: 'earn' | 'spend';
  source: Pt;
  plans: Plan[];
  total: number;
  arrive: (i: number) => void;
}

const ACORN = 22;
const GLOW = 80;
const rad = (deg: number) => (deg * Math.PI) / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function planFlock(f: FlightSpec, origin: Pt, center: Pt): Flock {
  const local = (p: Pt) => ({ x: p.x - origin.x, y: p.y - origin.y });
  const from = local(f.from);
  const to = local(f.to);
  const n = f.shares.length;
  const plans = f.shares.map((_, i) => {
    if (f.kind === 'spend') {
      return { from, burst: from, ctrl: arcControl(from, to, center), to, rot: 0, start: spendStart(i), arrive: spendArrival(i) };
    }
    // A fan upward, from −150° to −30°, each a little off its even place.
    const angle = rad(-150 + (n > 1 ? (120 * i) / (n - 1) : 60) + rnd(-8, 8));
    const d = rnd(EARN.near, EARN.far);
    const burst = { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d };
    return { from, burst, ctrl: arcControl(burst, to, center), to, rot: rnd(-25, 25), start: earnStart(i), arrive: earnArrival(i) };
  });
  return { id: f.id, kind: f.kind, source: from, plans, total: f.kind === 'earn' ? earnTotal(n) : spendTotal(n), arrive: f.arrive };
}

export function AcornLayer() {
  const { settings, t, wallet } = useStore();
  const reduced = useReducedMotion();
  const animations = settings.animations && !reduced;
  useEffect(() => setFlightAnimations(animations), [animations]);

  const root = useRef<ComponentRef<typeof View>>(null);
  const size = useRef({ w: 375, h: 812 });
  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };
  const [flocks, setFlocks] = useState<Flock[]>([]);
  useEffect(
    () =>
      onFlight((f) => {
        // Window points become the layer's own: in a browser the app is a column in the middle.
        const add = (origin: Pt) => {
          const center = { x: size.current.w / 2, y: size.current.h / 2 };
          setFlocks((list) => [...list, planFlock(f, origin, center)]);
        };
        const view = root.current;
        if (!view) return add({ x: 0, y: 0 });
        view.measureInWindow((x, y) => add({ x, y }));
      }),
    [],
  );
  const gone = useCallback((id: number) => setFlocks((list) => list.filter((f) => f.id !== id)), []);

  // One announcement per landing, not one per acorn (spec 2.4).
  const said = useRef({ t, acorns: wallet.acorns });
  said.current = { t, acorns: wallet.acorns };
  useEffect(
    () =>
      onLanded((amount) => {
        const { t: tr, acorns } = said.current;
        const word = tr.dict.acornWords[pluralForm(tr.lang, amount)];
        AccessibilityInfo.announceForAccessibility(tr('earnedA11y', { n: amount, word, total: formatAcorns(shownAcorns(acorns), tr.lang) }));
      }),
    [],
  );

  return (
    <View ref={root} style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout} collapsable={false}>
      {flocks.map((f) => (
        <FlockView key={f.id} flock={f} onGone={gone} />
      ))}
    </View>
  );
}

function FlockView({ flock, onGone }: { flock: Flock; onGone: (id: number) => void }) {
  const clock = useSharedValue(0);
  const arrivals = flock.plans.map((p) => p.arrive);
  const total = flock.total;
  useEffect(() => {
    clock.set(withTiming(total, { duration: total, easing: Easing.linear }));
    // The views go a moment after the last acorn has faded.
    const id = setTimeout(() => onGone(flock.id), total + 50);
    return () => clearTimeout(id);
  }, [clock, total, flock.id, onGone]);
  // Tells the bus about each acorn that reached the wallet (several, if a frame skipped some).
  const arrive = flock.arrive;
  const landed = useCallback((from: number, to: number) => {
    for (let i = from; i < to; i++) arrive(i);
  }, [arrive]);
  useAnimatedReaction(
    () => {
      const now = clock.get();
      let k = 0;
      for (let i = 0; i < arrivals.length; i++) if (now >= arrivals[i]) k++;
      return k;
    },
    (k, before) => {
      if (before !== null && k > before) scheduleOnRN(landed, before, k);
    },
  );
  return (
    <>
      {flock.kind === 'earn' && <Glow clock={clock} at={flock.source} />}
      {flock.plans.map((p, i) => (
        <Acorn key={i} clock={clock} plan={p} spend={flock.kind === 'spend'} />
      ))}
    </>
  );
}

function outCubic(x: number) {
  'worklet';
  return 1 - (1 - x) ** 3;
}
function inOutCubic(x: number) {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
/** Like the `pop` spring: overshoots a little and settles. */
function popOut(x: number) {
  'worklet';
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}
function clamp01(x: number) {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function Acorn({ clock, plan, spend }: { clock: SharedValue<number>; plan: Plan; spend: boolean }) {
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    const fade = spend ? SPEND.fade : EARN.fade;
    let x = plan.from.x;
    let y = plan.from.y;
    let scale = 1;
    let rot = plan.rot;
    let opacity = 1;
    if (t >= plan.arrive) {
      // Goes out inside the wallet's glyph (or the item).
      x = plan.to.x;
      y = plan.to.y;
      scale = spend ? 1.1 : 0.7;
      rot = 0;
      opacity = 1 - clamp01((t - plan.arrive) / fade);
    } else if (t >= plan.start) {
      const q = inOutCubic(clamp01((t - plan.start) / (plan.arrive - plan.start)));
      const p = bezier(plan.burst, plan.ctrl, plan.to, q);
      x = p.x;
      y = p.y;
      scale = spend ? 0.8 + 0.3 * q : 1 - 0.3 * q;
      rot = plan.rot * (1 - q);
    } else if (spend) {
      opacity = 0;
    } else {
      // Fan-out: out of the source, popping to full size.
      const b = clamp01(t / EARN.burst);
      const e = outCubic(b);
      x = plan.from.x + (plan.burst.x - plan.from.x) * e;
      y = plan.from.y + (plan.burst.y - plan.from.y) * e;
      scale = Math.max(0, popOut(b));
    }
    return {
      opacity,
      transform: [{ translateX: x - ACORN / 2 }, { translateY: y - ACORN / 2 }, { rotate: `${rot}deg` }, { scale }],
    };
  });
  return (
    <Animated.View style={[styles.acorn, style]}>
      <Glyph name="acorn" size={ACORN} />
    </Animated.View>
  );
}

/** The warm spot under the source while the acorns burst out (0–260 ms). */
function Glow({ clock, at }: { clock: SharedValue<number>; at: Pt }) {
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    const a = t < EARN.glowIn ? t / EARN.glowIn : 1 - outCubic(clamp01((t - EARN.glowIn) / EARN.glowOut));
    return { opacity: 0.7 * clamp01(a) };
  });
  return (
    <Animated.View style={[styles.glow, { left: at.x - GLOW / 2, top: at.y - GLOW / 2 }, style]}>
      <Svg width={GLOW} height={GLOW}>
        <Defs>
          <RadialGradient id="acornGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFE7A0" stopOpacity={1} />
            <Stop offset="1" stopColor="#FFE7A0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#acornGlow)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  acorn: { position: 'absolute', left: 0, top: 0, width: ACORN, height: ACORN },
  glow: { position: 'absolute', width: GLOW, height: GLOW },
});

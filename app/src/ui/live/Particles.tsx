// One particle engine for everything small that flies: water drops and splashes,
// sparkles on the revived crown, bubble droplets, motes of light gathering before a
// new stage, the burst of leaves after it and leaves shaken off by a repeated tap.
// Every particle's place is a pure function of time (timeline.ts), so all of them are
// drawn into one picture per frame on the UI thread. Never more than 60 at once.
import { createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { SharedValue, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { Skin } from '@/game/tree';
import { burstColors, fx, shakenLeaf } from './colors';
import { burstAt, dropAt, Frame, hash01, moteAt, shakenLeafAt, sprayAt, STAGE, WATER } from './timeline';

export interface ParticleScene {
  /** Middle of the crown and the tree's drawn size, px from the feet. */
  crownX: number;
  crownY: number;
  treeW: number;
  treeH: number;
  /** Middle of the thirst bubble, px from the feet. */
  bubbleX: number;
  bubbleY: number;
  skin: Skin;
  /** The tree reached 100 days: all-gold leaves and extra sparkles. */
  big: boolean;
}

const STAR = 'M0 -1 Q 0.14 -0.14 1 0 Q 0.14 0.14 0 1 Q -0.14 0.14 -1 0 Q -0.14 -0.14 0 -1 Z';
const LEAF = 'M0 -1 C 0.55 -0.6 0.55 0.6 0 1 C -0.55 0.6 -0.55 -0.6 0 -1 Z';
const PETAL = 'M0 -1 C 0.75 -0.7 0.6 0.7 0 1 C -0.6 0.7 -0.75 -0.7 0 -1 Z';
const DROP = 'M0 -1.6 C 0.5 -0.6 1 0 1 0.4 A 1 1 0 0 1 -1 0.4 C -1 0 -0.5 -0.6 0 -1.6 Z';
const isWeb = Platform.OS === 'web';

export function Particles({ frame, ms, stage, poke, fade, scene, reduced, bounds }: {
  frame: SharedValue<Frame>;
  ms: SharedValue<number>;
  /** 1 while celebrating a new stage. */
  stage: SharedValue<number>;
  /** ms since a repeated tap, or −1. */
  poke: SharedValue<number>;
  /** 0..1: everything fades out when the celebration is skipped. */
  fade: SharedValue<number>;
  scene: ParticleScene;
  reduced: boolean;
  /** The canvas size: nothing is drawn outside. */
  bounds: { width: number; height: number };
}) {
  const kit = useMemo(() => {
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(1);
    stroke.setStrokeWidth(1.5);
    const c = (hex: string) => Skia.Color(hex);
    const leafColors = (scene.big ? [fx.gold] : burstColors[scene.skin]).map(c);
    return {
      fill,
      stroke,
      star: Skia.Path.MakeFromSVGString(STAR)!,
      leaf: Skia.Path.MakeFromSVGString(scene.skin === 'sakura' ? PETAL : LEAF)!,
      drop: Skia.Path.MakeFromSVGString(DROP)!,
      empty: createPicture(() => {}),
      dropColor: c(fx.drop),
      splash: c(fx.splash),
      white: c('#FFFFFF'),
      sparkles: fx.sparkles.map(c),
      mote: c(fx.mote),
      gold: c(fx.gold),
      leafColors,
      shaken: c(shakenLeaf[scene.skin]),
      bubbleDrop: c(fx.bubbleDrop),
    };
  }, [scene.big, scene.skin]);
  const last = useSharedValue<SkPicture | null>(null);

  const picture = useDerivedValue(() => {
    const t = ms.get();
    const p = poke.get();
    const f = frame.get();
    const celebrating = stage.get() === 1;
    const end = celebrating ? STAGE.origin + STAGE.end : WATER.end;
    const k = fade.get();
    let pic = kit.empty;
    if (!reduced && ((t >= 0 && t <= end) || p >= 0)) {
      const { fill, stroke } = kit;
      const dot = (x: number, y: number, r: number, color: Float32Array, a: number) => {
        fill.setColor(color);
        fill.setAlphaf(Math.max(0, Math.min(1, a * k)));
        canvas.drawCircle(x, y, r, fill);
      };
      const shape = (path: typeof kit.star, x: number, y: number, size: number, rot: number, color: Float32Array, a: number, sx = 1) => {
        fill.setColor(color);
        fill.setAlphaf(Math.max(0, Math.min(1, a * k)));
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(rot, 0, 0);
        canvas.scale(size * sx, size);
        canvas.drawPath(path, fill);
        canvas.restore();
      };
      let canvas = null as unknown as Parameters<Parameters<typeof createPicture>[0]>[0];
      pic = createPicture((c) => {
        canvas = c;
        if (t >= 0 && t <= end) {
          // Droplets of the popped bubble.
          if (t < 320) {
            const q = t / 320;
            for (let i = 0; i < 3; i++) {
              const a = -Math.PI / 2 + (i - 1) * 1.1;
              dot(scene.bubbleX + Math.cos(a) * 26 * q, scene.bubbleY + Math.sin(a) * 26 * q + 60 * q * q, 2.4, kit.bubbleDrop, 1 - q);
            }
          }
          // The stream, splashes and flecks.
          for (let i = 0; i < WATER.drops; i++) {
            const d = dropAt(i, t);
            if (!d) continue;
            if (d.landed < 0) {
              shape(kit.drop, d.x, d.y, 3.2, 0, kit.dropColor, 0.95);
              dot(d.x - 0.9, d.y - 0.6, 0.9, kit.white, 0.8);
              continue;
            }
            const life = WATER.splashLife / 1000;
            if (d.landed > life) continue;
            const q = d.landed / life;
            stroke.setColor(kit.splash);
            stroke.setAlphaf(0.8 * (1 - q) * k);
            const r = 14 * (1 - (1 - q) * (1 - q) * (1 - q));
            canvas.drawOval(Skia.XYWHRect(d.x - r, d.y - r * 0.35, r * 2, r * 0.7), stroke);
            for (let j = 0; j < 2 + (i % 2); j++) {
              const s = sprayAt(i, j, d.landed);
              if (s) dot(d.x + s.x, d.y + s.y, 1.6, kit.dropColor, s.alpha);
            }
          }
          // Sparkles over the revived crown.
          for (let i = 0; i < WATER.sparkles; i++) {
            const q = (t - WATER.sparklesFrom - i * WATER.sparkleEvery) / WATER.sparkleLife;
            if (q <= 0 || q >= 1) continue;
            const x = scene.crownX + (hash01(i, 31) - 0.5) * scene.treeW * 0.7;
            const y = scene.crownY + (hash01(i, 37) - 0.5) * scene.treeH * 0.5;
            shape(kit.star, x, y, (3 + 2 * hash01(i, 41)) * Math.sin(Math.PI * q), q * 90, kit.sparkles[i % 2], 1);
          }
          if (celebrating) {
            // Motes spiralling in.
            if (f.moteAlpha > 0) {
              for (let i = 0; i < STAGE.motes; i++) {
                const m = moteAt(i, f.gather);
                dot(scene.crownX + m.x, scene.crownY + m.y, 8, kit.mote, 0.14 * f.moteAlpha);
                dot(scene.crownX + m.x, scene.crownY + m.y, 2.5, kit.mote, f.moteAlpha);
              }
            }
            // The burst of leaves (and gold sparkles for a grand tree).
            if (f.leavesT >= 0) {
              for (let i = 0; i < STAGE.leaves; i++) {
                const b = burstAt(i, f.leavesT);
                if (!b) continue;
                const gold = !scene.big && i % 6 === 0;
                const color = gold ? kit.gold : kit.leafColors[i % kit.leafColors.length];
                shape(kit.leaf, scene.crownX + b.x, scene.crownY + b.y, 5 + 3 * hash01(i, 43), (b.rot * 180) / Math.PI, color, b.alpha, 0.6);
              }
              if (scene.big) {
                for (let i = 0; i < 12; i++) {
                  const q = (f.leavesT - i * 0.07) / 0.6;
                  if (q <= 0 || q >= 1) continue;
                  const a = hash01(i, 47) * Math.PI * 2;
                  const r = 30 + 120 * hash01(i, 53);
                  shape(kit.star, scene.crownX + Math.cos(a) * r, scene.crownY + Math.sin(a) * r * 0.8, 6 * Math.sin(Math.PI * q), q * 120, kit.gold, 1);
                }
              }
            }
          }
        }
        // Leaves shaken off by a repeated tap.
        if (p >= 0) {
          for (let i = 0; i < 3; i++) {
            const l = shakenLeafAt(i, p);
            if (!l) continue;
            const x = scene.crownX + (i - 1) * scene.treeW * 0.28;
            const y = scene.crownY + scene.treeH * 0.12;
            shape(kit.leaf, x + l.x, y + l.y, 6.5, (l.rot * 180) / Math.PI + 30, kit.shaken, l.alpha, 0.6);
          }
        }
      }, Skia.XYWHRect(-bounds.width * 2, -bounds.height * 2, bounds.width * 4, bounds.height * 4));
    }
    // In the browser Skia's memory is not collected on its own: free the last frame's picture.
    const prev = last.get();
    if (isWeb && prev && prev !== kit.empty && prev !== pic) prev.dispose();
    last.set(pic);
    return pic;
  });

  return <Picture picture={picture} />;
}

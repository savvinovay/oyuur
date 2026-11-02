// The meadow's weather drawn into a canvas that is already there (wave 5 spec, 10.5): one
// picture per frame on the UI thread, at most 26 particles. The meadow canvas draws it
// over the grass; the sky canvas draws the part above the meadow canvas, so snow, leaves
// and petals fall through the whole scene without a new canvas.
import { ClipOp, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { PixelRatio, Platform } from 'react-native';
import { SharedValue, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { BUTTERFLY_COLORS, Weather, WEATHER_COLORS } from './themes';
import { butterflyAt, butterflyCount, particleAt, weakPhone, weatherCount, WeatherBox } from './weather';

/** Unit shapes: a leaf and a maple leaf one unit long (stalk at 0, tip at −1), a petal and a wing. */
const ALMOND = 'M0 0 C 0.4 -0.22 0.4 -0.72 0 -1 C -0.4 -0.72 -0.4 -0.22 0 0 Z';
const MAPLE_HALF = 'L 0.10 -0.22 L 0.42 -0.20 Q 0.30 -0.30 0.26 -0.38 L 0.52 -0.60 Q 0.32 -0.58 0.18 -0.62 L 0 -1';
const MAPLE_LEFT = 'L -0.10 -0.22 L -0.42 -0.20 Q -0.30 -0.30 -0.26 -0.38 L -0.52 -0.60 Q -0.32 -0.58 -0.18 -0.62 L 0 -1';
const MAPLE = `M0 -0.16 ${MAPLE_HALF} Z M0 -0.16 ${MAPLE_LEFT} Z M-0.03 0 L0.03 0 L0.03 -0.2 L-0.03 -0.2 Z`;
const isWeb = Platform.OS === 'web';
const weak = weakPhone(Platform.OS, PixelRatio.get());

export function WeatherLayer({ kind, night, box, t, clipBottom }: {
  kind: Weather;
  night: boolean;
  box: WeatherBox;
  /** The scene clock (wind.t): stands at 0 when animations are off, and so does the weather. */
  t: SharedValue<number>;
  /** Draw only above this line, screen px (the sky canvas leaves the rest to the meadow's). */
  clipBottom?: number;
}) {
  const kit = useMemo(() => {
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    const colors = WEATHER_COLORS[kind][night ? 'night' : 'day'].map((c) => Skia.Color(c));
    return {
      fill,
      colors,
      wings: BUTTERFLY_COLORS.map((c) => Skia.Color(c)),
      body: Skia.Color('#5A3A0E'),
      almond: Skia.Path.MakeFromSVGString(ALMOND)!,
      maple: Skia.Path.MakeFromSVGString(MAPLE)!,
      count: weatherCount(kind, night, weak),
      butterflies: butterflyCount(kind, night),
      // Snow at night is pale lilac at 0.8.
      snowAlpha: night ? 0.8 : 1,
    };
  }, [kind, night]);
  const last = useSharedValue<SkPicture | null>(null);

  const picture = useDerivedValue(() => {
    const now = t.get();
    const { fill } = kit;
    const pic = createPicture((canvas) => {
      if (clipBottom !== undefined) canvas.clipRect(Skia.XYWHRect(0, box.top, box.width, clipBottom - box.top), ClipOp.Intersect, true);
      for (let i = 0; i < kit.count; i++) {
        const p = particleAt(kind, i, now, box, kit.colors.length);
        if (p.alpha <= 0) continue;
        if (clipBottom !== undefined && p.y > clipBottom + 12) continue;
        fill.setColor(kit.colors[p.color]);
        if (kind === 'snow') {
          fill.setAlphaf(p.alpha * kit.snowAlpha);
          canvas.drawCircle(p.x, p.y, p.size, fill);
          continue;
        }
        fill.setAlphaf(p.alpha);
        canvas.save();
        canvas.translate(p.x, p.y);
        canvas.rotate(p.rot, 0, 0);
        if (kind === 'leaves') {
          canvas.scale(p.size, p.size);
          canvas.drawPath(p.maple ? kit.maple : kit.almond, fill);
        } else {
          canvas.drawOval(Skia.XYWHRect(-p.size / 2, -1.9, p.size, 3.8), fill);
        }
        canvas.restore();
      }
      for (let i = 0; i < kit.butterflies; i++) {
        const b = butterflyAt(i, now, box);
        if (clipBottom !== undefined && b.y > clipBottom + 12) continue;
        canvas.save();
        canvas.translate(b.x, b.y);
        canvas.rotate(b.rot, 0, 0);
        fill.setColor(kit.wings[i % kit.wings.length]);
        fill.setAlphaf(1);
        // Four wings, squeezed along x as they beat; wingspan 12.
        canvas.save();
        canvas.scale(b.open, 1);
        canvas.drawOval(Skia.XYWHRect(-6.2, -3.4, 6.4, 4.8), fill);
        canvas.drawOval(Skia.XYWHRect(-0.2, -3.4, 6.4, 4.8), fill);
        canvas.drawOval(Skia.XYWHRect(-4, 0.5, 4, 3), fill);
        canvas.drawOval(Skia.XYWHRect(0, 0.5, 4, 3), fill);
        canvas.restore();
        fill.setColor(kit.body);
        canvas.drawRect(Skia.XYWHRect(-0.5, -3, 1, 6), fill);
        canvas.restore();
      }
    }, Skia.XYWHRect(0, box.top, box.width, box.bottom - box.top));
    // In the browser Skia's memory is not collected on its own: free the last frame's picture.
    const prev = last.get();
    if (isWeb && prev && prev !== pic) prev.dispose();
    last.set(pic);
    return pic;
  });

  return <Picture picture={picture} />;
}

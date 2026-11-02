// A soft oval of earth laid under a tree picture: solid in the middle, melting into the
// meadow at the edge, like the hole under the live tree (live/Soil.tsx). A plain view with
// rounded corners showed as a hard-edged brown bar, worst at night (OYUUR-41).
// One small picture per color, drawn once and stretched to the oval.
import { Skia, TileMode, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

/** Side of the drawn picture, px: the patch is blurry anyway, stretching it costs nothing. */
const SIDE = 64;

const patches = new Map<string, string>();

/** Gives Skia's memory back. On the web a surface Skia could not make is an empty wrapper whose dispose throws. */
function free(object: { dispose(): void } | null | undefined) {
  try {
    object?.dispose();
  } catch {
    // Nothing was allocated.
  }
}

function drawPatch(color: string): string | null {
  const surface = Skia.Surface.Make(SIDE, SIDE);
  if (!surface) return null;
  const paint = Skia.Paint();
  let shader;
  // Skia's memory is not freed by the browser on its own: give it all back right away.
  try {
    const solid = Skia.Color(color);
    const clear = Float32Array.from(solid);
    clear[3] = 0;
    const r = SIDE / 2;
    shader = Skia.Shader.MakeRadialGradient(vec(r, r), r, [solid, solid, clear], [0, 0.45, 1], TileMode.Clamp);
    paint.setShader(shader);
    surface.getCanvas().drawCircle(r, r, r, paint);
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      return `data:image/png;base64,${image.encodeToBase64()}`;
    } finally {
      free(image);
    }
  } catch {
    return null;
  } finally {
    free(shader);
    free(paint);
    free(surface);
  }
}

function patchFor(color: string): string | null {
  const ready = patches.get(color);
  if (ready) return ready;
  // Only a drawn patch is kept: after a failure the next render tries again.
  const uri = drawPatch(color);
  if (uri) patches.set(color, uri);
  return uri;
}

/** `style` places and sizes the oval (position, left/top, width/height, opacity). */
export function SoftPatch({ color, style }: { color: string; style: StyleProp<ImageStyle> }) {
  const uri = useMemo(() => patchFor(color), [color]);
  // Without a picture no patch at all: a hard-edged stand-in is what this replaces.
  if (!uri) return null;
  // No fade on Android: the patch is there at once, like the view it replaces.
  return <Image source={{ uri }} resizeMode="stretch" fadeDuration={0} style={style} />;
}

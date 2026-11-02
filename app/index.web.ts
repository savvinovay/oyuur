// In the browser the Skia drawing engine (CanvasKit, ~8 MB) must be loaded before
// any screen draws with it. The file is copied to public/ by `npm install` (postinstall).
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// The browser keeps canvaskit.wasm for a day (OYUUR-35); the Skia version in the address
// makes a new Skia a new file, so new code never meets an old engine.
const SKIA: string = require('@shopify/react-native-skia/package.json').version;

// A plain require inside the callback: the bundle includes the app, but it starts only now.
// If the engine does not load, the loading screen (public/index.html) says so instead of waiting forever.
LoadSkiaWeb({ locateFile: (file: string) => `/${file}?v=${SKIA}` })
  .then(() => require('expo-router/entry'))
  .catch((error: unknown) => {
    console.error('Oyuur could not start', error);
    (window as unknown as { oyuurBoot?: (failed: boolean) => void }).oyuurBoot?.(true);
  });

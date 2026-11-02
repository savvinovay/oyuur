// Is this the web version open in a browser on an iPhone or iPad, not yet from the Home
// Screen (OYUUR-17)? Then the "Add to Home Screen" card is worth showing. iOS has no
// install prompt of its own, so people only learn about it from us.

export interface BrowserInfo {
  userAgent: string;
  /** iPadOS says "Macintosh" but has touch. */
  maxTouchPoints: number;
  /** Safari's own flag: true when opened from the Home Screen. */
  standalone?: boolean;
  /** matchMedia('(display-mode: standalone)').matches */
  displayStandalone: boolean;
}

export function isIos({ userAgent, maxTouchPoints }: BrowserInfo): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function isStandalone(info: BrowserInfo): boolean {
  return info.standalone === true || info.displayStandalone;
}

/** Browsers inside other apps (Telegram, Instagram, …) can't add to the Home Screen: no card there. */
const IN_APP = /Telegram|Instagram|FBAN|FBAV|Line\/|VKClient|; wv\)/;

export function shouldOfferInstall(info: BrowserInfo): boolean {
  return isIos(info) && !isStandalone(info) && !IN_APP.test(info.userAgent);
}

/** The real browser, or null outside a browser (native app, tests). */
export function readBrowser(): BrowserInfo | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone,
    displayStandalone: window.matchMedia('(display-mode: standalone)').matches,
  };
}

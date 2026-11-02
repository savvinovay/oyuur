import { describe, expect, it } from '@jest/globals';
import { BrowserInfo, isStandalone, shouldOfferInstall } from '../detect';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const IPHONE_TELEGRAM = `${IPHONE} Telegram-iOS/11.0`;

const info = (userAgent: string, more: Partial<BrowserInfo> = {}): BrowserInfo => ({
  userAgent, maxTouchPoints: 5, displayStandalone: false, ...more,
});

describe('the Add to Home Screen card', () => {
  it('shows in Safari and Chrome on iPhone', () => {
    expect(shouldOfferInstall(info(IPHONE))).toBe(true);
    expect(shouldOfferInstall(info(IPHONE_CHROME))).toBe(true);
  });

  it('shows on an iPad, which calls itself a Mac but has touch', () => {
    expect(shouldOfferInstall(info(IPAD))).toBe(true);
    expect(shouldOfferInstall(info(IPAD, { maxTouchPoints: 0 }))).toBe(false);
  });

  it('does not show once opened from the Home Screen', () => {
    expect(shouldOfferInstall(info(IPHONE, { standalone: true }))).toBe(false);
    expect(shouldOfferInstall(info(IPHONE, { displayStandalone: true }))).toBe(false);
    expect(isStandalone(info(ANDROID, { displayStandalone: true }))).toBe(true);
  });

  it('does not show on Android or inside other apps', () => {
    expect(shouldOfferInstall(info(ANDROID))).toBe(false);
    expect(shouldOfferInstall(info(IPHONE_TELEGRAM))).toBe(false);
  });
});

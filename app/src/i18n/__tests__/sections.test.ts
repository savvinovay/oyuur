import { describe, expect, it } from '@jest/globals';
import { accountEn, accountRu } from '../account';
import { artEn, artRu } from '../art';
import { friendsEn, friendsRu } from '../friends';
import { homeEn, homeRu } from '../home';
import { leadersEn, leadersRu } from '../leaders';
import { coreEn, dictionaries } from '../index';
import { meEn, meRu } from '../me';
import { shopEn, shopRu } from '../shop';
import { togetherEn, togetherRu } from '../together';
import { wateringEn, wateringRu } from '../watering';
import { widgetEn, widgetRu } from '../widget';
import { remindEn, remindRu } from '../remind';

const sections = { home: homeEn, shop: shopEn, art: artEn, me: meEn, friends: friendsEn, account: accountEn, together: togetherEn, leaders: leadersEn, watering: wateringEn, widget: widgetEn, remind: remindEn };

describe('dictionary sections (wave 5)', () => {
  it('no key repeats in two sections', () => {
    const seen = new Map<string, string>(Object.keys(coreEn).map((k) => [k, 'core']));
    for (const [name, dict] of Object.entries(sections)) {
      for (const key of Object.keys(dict)) {
        expect([key, seen.get(key)]).toEqual([key, undefined]);
        seen.set(key, name);
      }
    }
  });

  it('sections say every key in both languages', () => {
    for (const [en, ru] of [[homeEn, homeRu], [shopEn, shopRu], [artEn, artRu], [meEn, meRu], [friendsEn, friendsRu], [accountEn, accountRu], [togetherEn, togetherRu], [leadersEn, leadersRu], [wateringEn, wateringRu], [widgetEn, widgetRu], [remindEn, remindRu]] as const) {
      expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    }
  });

  it('the merged dictionaries keep every section key', () => {
    for (const dict of Object.values(sections)) {
      for (const [key, value] of Object.entries(dict)) expect(dictionaries.en[key as keyof typeof dictionaries.en]).toEqual(value);
    }
  });
});

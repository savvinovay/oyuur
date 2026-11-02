// Saves of APK 1.0 (data version 4) and 1.1 (version 5) opened by the version with the forest in
// the account (6): nothing is lost — the same trees, the same acorns, purchases, quests, achievements.
import { describe, expect, it } from '@jest/globals';
import { balanceOf, earnedOf } from '@/game/economy';
import { migrateSave } from '../migrate';
import { buildRecords, emptyForest } from '../records';

const TODAY = '2026-10-29';

// What 1.0 writes (store.tsx at v1.0): version 4, no watering hours.
const V4 = `{"version":4,"trees":[
{"id":"mh1a2b3c","lineageId":"mh1a2b3c","name":"Не курить","kind":"quit","visibility":"friends","skin":"oak","plantedOn":"2026-10-20","checkins":["2026-10-20","2026-10-21","2026-10-23","2026-10-24"],"frozen":["2026-10-22"],"chancesLeft":2,"refilledMonth":"2026-10","settledThrough":"2026-10-24","diedOn":null,"completedOn":null,"generation":1,"parentId":null,"nickname":"Дубок","namedOn":"2026-10-21","nameAsks":1,"nameAskedOn":"2026-10-21","nameLaterOn":null},
{"id":"mh4d5e6f","lineageId":"mh4d5e6f","name":"Бег","kind":"do","visibility":"private","skin":"birch","plantedOn":"2026-10-22","checkins":["2026-10-22","2026-10-23","2026-10-24"],"frozen":[],"chancesLeft":3,"refilledMonth":"2026-10","settledThrough":"2026-10-24","diedOn":null,"completedOn":null,"generation":1,"parentId":null,"nickname":null,"namedOn":null,"nameAsks":0,"nameAskedOn":null,"nameLaterOn":null},
{"id":"mh7g8h9i","lineageId":"mh7g8h9i","name":"Без сладкого","kind":"quit","visibility":"private","skin":"sakura","plantedOn":"2026-10-01","checkins":["2026-10-01"],"frozen":["2026-10-02","2026-10-03","2026-10-04"],"chancesLeft":0,"refilledMonth":"2026-10","settledThrough":"2026-10-05","diedOn":"2026-10-05","completedOn":null,"generation":1,"parentId":null,"nickname":null,"namedOn":null,"nameAsks":0,"nameAskedOn":null,"nameLaterOn":null}],
"settings":{"theme":"auto","animations":true,"vibration":true,"sounds":true,"menuHintSeen":true,"language":"auto","dayOffset":0},
"plot":{"size":4,"places":{"mh1a2b3c":{"c":1,"r":1},"mh4d5e6f":{"c":2,"r":1},"mh7g8h9i":{"c":1,"r":2}},"seen":["mh1a2b3c","mh4d5e6f","mh7g8h9i"],"shownSize":4},
"wallet":{"acorns":135,"earned":335,"paidOn":"2026-10-24","paidToday":2,"sharedPaid":["s1:2026-10-24"]},
"shop":{"owned":["tree:birch"],"meadow":"summer","seenAffordable":["tree:birch"]},
"quests":{"day":"2026-10-24","ids":["waterAll","visitForest","moveTree"],"done":["waterAll"],"claimed":["waterAll"],"bonus":false,"streak":0,"streakDay":null,"best":0},
"achievements":{"firstWater":"2026-10-20"},"announced":["firstWater"],
"profile":{"name":null,"avatar":"fox","color":2}}`;

// What 1.1 writes (store.tsx after OYUUR-34/39): version 5, watering hours, my hours of shared trees.
const V5 = `{"version":5,"trees":[
{"id":"mk2x9a1b","lineageId":"mk2x9a1b","name":"Не есть сладкое","kind":"quit","visibility":"friends","skin":"maple","plantedOn":"2026-10-10","checkins":["2026-10-10","2026-10-11","2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16"],"frozen":[],"chancesLeft":3,"refilledMonth":"2026-10","settledThrough":"2026-10-16","diedOn":null,"completedOn":null,"generation":2,"parentId":"mk0prev01","nickname":"Клён II","namedOn":"2026-10-12","nameAsks":1,"nameAskedOn":"2026-10-12","nameLaterOn":null,"openHours":[{"from":"2026-10-10","hour":18},{"from":"2026-10-15","hour":20}]},
{"id":"mk0prev01","lineageId":"mk2x9a1b","name":"Не есть сладкое","kind":"quit","visibility":"friends","skin":"maple","plantedOn":"2026-10-01","checkins":["2026-10-01","2026-10-02"],"frozen":["2026-10-03","2026-10-04","2026-10-05"],"chancesLeft":0,"refilledMonth":"2026-10","settledThrough":"2026-10-06","diedOn":"2026-10-06","completedOn":null,"generation":1,"parentId":null,"nickname":"Клён","namedOn":"2026-10-02","nameAsks":1,"nameAskedOn":"2026-10-02","nameLaterOn":null,"openHours":[{"from":"2026-10-01","hour":18}]},
{"id":"mk5c6d7e","lineageId":"mk5c6d7e","name":"Читать","kind":"do","visibility":"private","skin":"oak","plantedOn":"2026-10-14","checkins":["2026-10-14","2026-10-15"],"frozen":[],"chancesLeft":3,"refilledMonth":"2026-10","settledThrough":"2026-10-15","diedOn":null,"completedOn":"2026-10-15","generation":1,"parentId":null,"nickname":null,"namedOn":null,"nameAsks":0,"nameAskedOn":null,"nameLaterOn":null,"openHours":[{"from":"2026-10-14","hour":0}]}],
"settings":{"theme":"dark","animations":true,"vibration":false,"sounds":true,"menuHintSeen":true,"language":"ru","dayOffset":0,"minuteOffset":0,"widgetNames":true},
"plot":{"size":4,"places":{"mk2x9a1b":{"c":2,"r":2},"mk5c6d7e":{"c":0,"r":3}},"seen":["mk2x9a1b"],"shownSize":4},
"wallet":{"acorns":512,"earned":1662,"paidOn":"2026-10-16","paidToday":1,"sharedPaid":[]},
"shop":{"owned":["tree:maple","meadow:winter"],"meadow":"winter","seenAffordable":["tree:birch","tree:maple","meadow:winter"]},
"quests":{"day":"2026-10-16","ids":["waterAll","nameTree","visitFriend"],"done":["waterAll","visitFriend"],"claimed":["waterAll","visitFriend"],"bonus":false,"streak":3,"streakDay":"2026-10-15","best":4},
"achievements":{"firstWater":"2026-10-01","days7":"2026-10-16","firstBuy":"2026-10-12","seedTree":"2026-10-10"},"announced":["firstWater","days7","firstBuy","seedTree"],
"profile":{"name":"Саша","avatar":"owl","color":5},
"eveningOffer":"done","sharedHours":{"sh9":[{"from":"2026-10-12","hour":18}]},"oldSharedUntil":"2026-10-12"}`;

describe('saves of older versions open without losses', () => {
  for (const [name, raw] of [['1.0 (version 4)', V4], ['1.1 (version 5)', V5]] as const) {
    describe(name, () => {
      const saved = JSON.parse(raw);
      const loaded = migrateSave(saved, 'dev1', TODAY);

      it('the same trees, in the same places', () => {
        expect(loaded.trees.map((t) => t.id)).toEqual(saved.trees.map((t: { id: string }) => t.id));
        loaded.trees.forEach((t, i) => {
          const old = saved.trees[i];
          for (const key of Object.keys(old).filter((k) => k !== 'openHours')) expect([key, t[key as keyof typeof t]]).toEqual([key, old[key]]);
          expect(t.stamps).toBeUndefined();
        });
        expect(loaded.plot.places).toEqual(saved.plot.places);
      });

      it('the same acorns, to the acorn; earned not less', () => {
        expect(balanceOf(loaded.ledger, loaded.shop.owned)).toBe(saved.wallet.acorns);
        expect(earnedOf(loaded.ledger)).toBeGreaterThanOrEqual(saved.wallet.earned);
        expect(Object.keys(loaded.ledger)).toEqual(['legacy:dev1']);
      });

      it('the same purchases, quests, achievements, profile', () => {
        expect(loaded.shop.owned).toEqual(saved.shop.owned);
        expect(loaded.shop.meadow).toBe(saved.shop.meadow);
        expect(loaded.quests).toEqual(saved.quests);
        expect(loaded.claimed).toEqual(saved.achievements);
        expect(loaded.announced).toEqual(saved.announced);
        expect(loaded.profile).toMatchObject(saved.profile);
        expect(loaded.tombs).toEqual({});
      });

      it('saved again as version 6 and read back: the same', () => {
        const v6 = JSON.parse(JSON.stringify({ ...saved, version: 6, trees: loaded.trees, plot: loaded.plot, wallet: { ledger: loaded.ledger }, eveningOffer: loaded.eveningOffer, oldSharedUntil: loaded.oldSharedUntil, tombs: {}, hiddenTombs: {}, hlc: '' }));
        expect(migrateSave(v6, 'other', TODAY)).toEqual(loaded);
      });

      it('hidden trees stay out of the account records', () => {
        const records = buildRecords({ ...emptyForest(), ...loaded });
        const hidden = loaded.trees.filter((t) => t.visibility === 'private').map((t) => `tree:${t.id}`);
        expect(hidden.length).toBeGreaterThan(0);
        hidden.forEach((key) => expect(records.has(key)).toBe(false));
      });
    });
  }

  it('version 5 keeps the watering hours and my hours of shared trees', () => {
    const loaded = migrateSave(JSON.parse(V5), 'dev1', TODAY);
    expect(loaded.trees[0].openHours).toEqual([{ from: '2026-10-10', hour: 18 }, { from: '2026-10-15', hour: 20 }]);
    expect(loaded.sharedHours).toEqual({ sh9: [{ from: '2026-10-12', hour: 18 }] });
    expect(loaded.oldSharedUntil).toBe('2026-10-12');
    expect(loaded.eveningOffer).toBe('done');
  });

  it('a damaged save loads with defaults, never throws', () => {
    for (const raw of [null, {}, { trees: 'x', wallet: 5, plot: null, shop: [], quests: 'q', tombs: [1], hlc: 3 }, { wallet: { ledger: { 'w:a:2026-10-01': 'x', 'a:days7': 30 } } }]) {
      const loaded = migrateSave(raw, 'd', TODAY);
      expect(Array.isArray(loaded.trees)).toBe(true);
      expect(Number.isFinite(balanceOf(loaded.ledger, loaded.shop.owned))).toBe(true);
    }
    expect(migrateSave({ wallet: { ledger: { 'w:a:2026-10-01': 'x', 'a:days7': 30 } } }, 'd', TODAY).ledger).toEqual({ 'a:days7': 30 });
  });
});

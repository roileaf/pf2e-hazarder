import { buildInfoView } from '../../scripts/ui/infoView.js';

const furnace = {
  level: 4,
  saves: { fortitude: { mod: 15 }, reflex: { mod: 8 }, will: { mod: 0 } },
  system: {
    traits: { value: ['haunt', 'complex-thing'] },
    attributes: {
      ac: { value: 21 },
      hardness: 13,
      hp: { value: 45, max: 60, details: '' },
      stealth: { value: 15, dc: 25 },
      immunities: [{ type: 'critical-hits', label: 'critical hits' }],
      weaknesses: [
        { type: 'cold', value: 5, label: 'cold 5' },
        { type: 'vitality', value: 5 },
      ],
      resistances: [],
    },
  },
};

test('defenses, immunities and weaknesses in sheet order', () => {
  const v = buildInfoView(furnace);
  expect(v.defenses.map((d) => `${d.label} ${d.value}`)).toEqual([
    'PF2E_HAZARDER.Info.AC 21',
    'PF2E_HAZARDER.Info.Save.fortitude +15',
    'PF2E_HAZARDER.Info.Save.reflex +8',
    'PF2E_HAZARDER.Info.Save.will +0',
    'PF2E_HAZARDER.Info.Hardness 13',
    'PF2E_HAZARDER.Info.HP 60',
    'PF2E_HAZARDER.Info.BT 30',
  ]);
  expect(v.iwr.map((e) => e.value)).toEqual(['critical hits', 'cold 5, vitality 5']);
  expect(v.empty).toBe(false);
});

test('live hit points only when asked, and only when damaged', () => {
  const hp = (v) => v.defenses.find((d) => d.label === 'PF2E_HAZARDER.Info.HP').value;
  expect(hp(buildInfoView(furnace, { liveHp: true }))).toBe('45/60');
  const fresh = {
    ...furnace,
    system: {
      ...furnace.system,
      attributes: { ...furnace.system.attributes, hp: { value: 60, max: 60 } },
    },
  };
  expect(hp(buildInfoView(fresh, { liveHp: true }))).toBe('60');
});

test('details: level and traits, stealth, and only the prose that exists', () => {
  const v = buildInfoView(furnace, {
    disableHtml: '<p>Cow a spirit…</p>',
    resetHtml: ' ',
    descriptionHtml: '',
  });
  expect(v.meta).toBe('PF2E_HAZARDER.Info.Level · Haunt · Complex Thing');
  expect(v.stealth).toBe('+15 (PF2E_HAZARDER.Tracker.DC)');
  expect(v.sections.map((s) => s.label)).toEqual(['PF2E_HAZARDER.Info.Disable']);
  expect(v.hasDetails).toBe(true);
});

test('a hazard with no defenses lists none; one with nothing at all is empty', () => {
  const bare = { system: { attributes: {}, saves: { will: { value: 0 }, reflex: { value: 12 } } } };
  expect(buildInfoView(bare).defenses.map((d) => d.value)).toEqual(['+12']);
  expect(buildInfoView({ system: {} })).toMatchObject({
    defenses: [],
    iwr: [],
    hasDetails: false,
    empty: true,
  });
});

test('a hazard with no stat block does not list its zeroed saves', () => {
  const atmosphere = {
    saves: { fortitude: { mod: 0 }, reflex: { mod: 0 }, will: { mod: 0 } },
    system: {
      attributes: {
        ac: { value: 0 },
        hp: { max: 0 },
        immunities: [{ label: 'object immunities' }],
      },
    },
  };
  const v = buildInfoView(atmosphere);
  expect(v.defenses).toEqual([]);
  expect(v.iwr.map((e) => e.value)).toEqual(['object immunities']);
});

test('brief: AC and hit points, for the folded block', () => {
  const actor = {
    saves: {},
    system: { attributes: { ac: { value: 27 }, hp: { value: 40, max: 66 } } },
  };
  expect(buildInfoView(actor, { liveHp: true }).brief).toBe(
    'PF2E_HAZARDER.Info.AC 27 · PF2E_HAZARDER.Info.HP 40/66',
  );
  expect(buildInfoView({ system: { attributes: {} } }).brief).toBeNull();
});

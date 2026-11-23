import {
  buildDisableRollParams,
  disableEligibility,
  rollDisable,
} from '../../scripts/ui/TrackerCard.js';

const TAG = 'hazarder:instance:t1:c1:0:d1';

test('buildDisableRollParams passes every trait, action: traits as roll options', () => {
  const disable = {
    dc: 22,
    label: 'Erase the rune',
    traits: ['action:disable-a-device', 'manipulate'],
  };
  expect(buildDisableRollParams(disable, TAG)).toEqual({
    dc: { value: 22, label: 'Erase the rune' },
    extraRollOptions: ['action:disable-a-device', 'manipulate', TAG],
    traits: ['manipulate'],
  });
});

test('buildDisableRollParams omits dc when null and tolerates missing traits', () => {
  expect(buildDisableRollParams({ dc: null, label: 'X' }, TAG)).toEqual({
    dc: undefined,
    extraRollOptions: [TAG],
    traits: [],
  });
});

describe('rollDisable', () => {
  const plan = {
    version: 1,
    confirmed: true,
    components: [
      {
        id: 'c1',
        count: 1,
        disables: [{ id: 'd1', skill: 'thievery', dc: 20, label: 'Pick', traits: [] }],
      },
    ],
  };
  const tokenDoc = {
    id: 't1',
    actor: { getFlag: () => plan, toObject: () => ({}) },
  };

  beforeEach(() => {
    global.fromUuid = jest.fn(async () => tokenDoc);
    ui.notifications.warn.mockClear();
  });
  afterEach(() => {
    delete global.fromUuid;
    delete global.canvas;
    delete game.user.character;
  });

  test('warns when the roller has no such statistic', async () => {
    global.canvas = {
      tokens: { controlled: [{ actor: { name: 'Ezren', getStatistic: () => null } }] },
    };
    await rollDisable({ tokenUuid: 'x', instanceKey: 'c1:0', disableId: 'd1' });
    expect(ui.notifications.warn).toHaveBeenCalledWith('PF2E_HAZARDER.Tracker.NoStatistic');
  });

  test('falls back to the user character when the controlled actor lacks getStatistic', async () => {
    const roll = jest.fn();
    global.canvas = { tokens: { controlled: [{ actor: { name: 'Loot' } }] } };
    game.user.character = { name: 'Amiri', getStatistic: () => ({ roll }) };
    await rollDisable({ tokenUuid: 'x', instanceKey: 'c1:0', disableId: 'd1' });
    expect(roll).toHaveBeenCalledWith({
      dc: { value: 20, label: 'Pick' },
      extraRollOptions: [TAG],
      traits: [],
    });
  });

  test('blocks a roller below the minimum rank', async () => {
    const roll = jest.fn();
    plan.components[0].disables[0].minRank = 3;
    try {
      global.canvas = {
        tokens: {
          controlled: [{ actor: { name: 'Ezren', getStatistic: () => ({ roll, rank: 2 }) } }],
        },
      };
      await rollDisable({ tokenUuid: 'x', instanceKey: 'c1:0', disableId: 'd1' });
      expect(roll).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith('PF2E_HAZARDER.Tracker.RankTooLow');
    } finally {
      delete plan.components[0].disables[0].minRank;
    }
  });
});

describe('rollDisable for another module', () => {
  const plan = {
    version: 1,
    confirmed: true,
    components: [
      {
        id: 'c1',
        count: 1,
        disables: [{ id: 'd1', skill: 'thievery', dc: 20, label: 'Pick', traits: [] }],
      },
    ],
  };
  beforeEach(() => {
    global.fromUuid = jest.fn(async () => ({
      id: 't1',
      actor: { getFlag: () => plan, toObject: () => ({}) },
    }));
  });
  afterEach(() => {
    delete global.fromUuid;
    delete global.canvas;
  });

  test('rolls as the given actor, passes roll params through and returns the roll', async () => {
    const roll = jest.fn(async () => 'the-roll');
    global.canvas = {
      tokens: {
        controlled: [{ actor: { name: 'Other', getStatistic: () => ({ roll: jest.fn() }) } }],
      },
    };
    const actor = { name: 'Merisiel', getStatistic: () => ({ roll, rank: 2 }) };
    const result = await rollDisable({
      tokenUuid: 'x',
      instanceKey: 'c1:0',
      disableId: 'd1',
      actor,
      rollParams: { skipDialog: true },
    });
    expect(result).toBe('the-roll');
    expect(roll).toHaveBeenCalledWith({
      skipDialog: true,
      dc: { value: 20, label: 'Pick' },
      extraRollOptions: ['hazarder:instance:t1:c1:0:d1'],
      traits: [],
    });
  });

  test('disableEligibility reports the reason', () => {
    const actor = (rank) => ({ getStatistic: (s) => (s === 'thievery' ? { rank } : null) });
    expect(disableEligibility(actor(1), { skill: 'thievery', minRank: 3 })).toMatchObject({
      ok: false,
      reason: 'rank-too-low',
      rank: 1,
    });
    expect(disableEligibility(actor(3), { skill: 'thievery', minRank: 3 })).toMatchObject({
      ok: true,
      reason: null,
    });
    expect(disableEligibility(actor(3), { skill: 'arcana' })).toMatchObject({
      ok: false,
      reason: 'no-statistic',
    });
  });
});

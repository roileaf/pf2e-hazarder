import { hazardSnapshot } from '../../scripts/services/hazardSnapshot.js';
import { activate, createInitialState } from '../../scripts/services/RulesEngine.js';

const tokenDoc = { uuid: 'Scene.s.Token.t1', id: 't1', name: 'Puzzle Gate' };
const plan = {
  components: [
    {
      id: 'c1',
      name: 'lock',
      count: 2,
      disables: [
        { id: 'd1', skill: 'athletics', dc: 44, label: 'Force', successesNeeded: 1, minRank: 3 },
        {
          id: 'd2',
          skill: 'crafting',
          dc: 41,
          successesNeeded: 2,
          group: 'A',
          traits: ['manipulate'],
        },
        { id: 'd3', skill: 'thievery', dc: 41, successesNeeded: 2, group: 'A' },
      ],
    },
  ],
};

test('lists open options per instance with pool progress', () => {
  const state = activate(createInitialState(plan));
  state.instances[0].progress.d2 = 1;
  state.instances[1].disabled = true;
  const snap = hazardSnapshot({ tokenDoc, plan, state });
  expect(snap).toMatchObject({
    tokenUuid: 'Scene.s.Token.t1',
    name: 'Puzzle Gate',
    status: 'active',
    disabled: false,
  });
  expect(
    snap.options.map((o) => [o.instanceKey, o.disableId, o.have, o.successesLeft, o.pooledWith]),
  ).toEqual([
    ['c1:0', 'd1', 0, 1, []],
    ['c1:0', 'd2', 1, 1, ['d3']],
    ['c1:0', 'd3', 0, 1, ['d2']],
  ]);
  expect(snap.options[0]).toMatchObject({
    instanceLabel: 'lock 1',
    skill: 'athletics',
    dc: 44,
    minRank: 3,
  });
  expect(snap.options[1]).toMatchObject({
    label: 'crafting',
    traits: ['manipulate'],
    minRank: null,
  });
});

test('hides DCs when asked, and shared totals pool every option', () => {
  const shared = { components: [{ ...plan.components[0], count: 1, sharedSuccesses: 3 }] };
  const state = activate(createInitialState(shared));
  state.instances[0].progress.d1 = 2;
  const snap = hazardSnapshot({ tokenDoc, plan: shared, state, showDC: false });
  expect(snap.options.every((o) => o.dc === null && o.instanceLabel === null)).toBe(true);
  expect(snap.options.map((o) => [o.successesLeft, o.pooledWith.length])).toEqual([
    [1, 2],
    [1, 2],
    [1, 2],
  ]);
});

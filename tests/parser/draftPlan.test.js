import { draftPlan } from '../../scripts/parser/draftPlan.js';

const hazard = (details, items = [], name = 'Test Hazard') => ({
  name,
  system: { details: { isComplex: true, routine: '', disable: '', reset: '', ...details } },
  items,
});

test('actions per turn from routine', () => {
  const { plan, warnings } = draftPlan(
    hazard({ routine: '<p>(2 actions) On its initiative…</p>' }),
  );
  expect(plan.actionsPerTurn).toBe(2);
  expect(warnings).not.toContain('actions-per-turn-missing');
});

test('missing actions count on complex hazard warns', () => {
  const { plan, warnings } = draftPlan(hazard({ routine: 'It attacks.' }));
  expect(plan.actionsPerTurn).toBeNull();
  expect(warnings).toContain('actions-per-turn-missing');
});

test('simple hazard has null actions and no actions warning', () => {
  const { plan, warnings } = draftPlan(
    hazard({ isComplex: false, disable: '@Check[thievery|dc:18]' }),
  );
  expect(plan.actionsPerTurn).toBeNull();
  expect(warnings).not.toContain('actions-per-turn-missing');
});

test('disables come from inline checks on one implicit component', () => {
  const { plan } = draftPlan(
    hazard({
      routine: '(1 action)',
      disable:
        '@Check[thievery|dc:26|name:Stop Wheel] (expert) or @Check[thievery|dc:22|name:Erase Rune] (master)',
    }),
  );
  expect(plan.components).toHaveLength(1);
  expect(plan.components[0]).toMatchObject({
    id: 'c1',
    name: 'Test Hazard',
    count: 1,
    actionsEach: 0,
  });
  expect(
    plan.components[0].disables.map((d) => [d.id, d.skill, d.dc, d.label, d.successesNeeded]),
  ).toEqual([
    ['d1', 'thievery', 26, 'Stop Wheel', 1],
    ['d2', 'thievery', 22, 'Erase Rune', 1],
  ]);
});

test('"twice" written right after a check is trusted: no warning', () => {
  const { plan, warnings } = draftPlan(
    hazard({
      routine: '(9 actions)',
      disable: '@Check[religion|dc:35]{Religion (expert)} twice to exorcise',
    }),
  );
  expect(plan.components[0].disables[0].successesNeeded).toBe(2);
  expect(warnings).not.toContain('successes-heuristic');
});

test('a count after joined alternatives is one total between them, flagged for review', () => {
  const { plan, warnings } = draftPlan(
    hazard({
      routine: '(1 action)',
      disable: '@Check[nature|dc:20] or @Check[occultism|dc:20] twice to disperse',
    }),
  );
  expect(plan.components[0].sharedSuccesses).toBe(2);
  expect(plan.components[0].disables.map((d) => d.successesNeeded)).toEqual([1, 1]);
  expect(warnings).toContain('shared-successes');
});

test('no routine text at all: no actions warning', () => {
  const { plan, warnings } = draftPlan(hazard({ routine: '', disable: '@Check[survival|dc:18]' }));
  expect(plan.actionsPerTurn).toBeNull();
  expect(warnings).toEqual([]);
});

test('"twice" belonging to a later check does not leak backwards', () => {
  const { plan } = draftPlan(
    hazard({
      routine: '(1 action)',
      disable: '@Check[thievery|dc:37] to jam, or @Check[religion|dc:35] twice',
    }),
  );
  expect(plan.components[0].disables.map((d) => d.successesNeeded)).toEqual([1, 2]);
});

test('named component with per-instance actions', () => {
  const { plan, warnings } = draftPlan(
    hazard({
      routine:
        "(9 actions) Each of the mannequins uses three of the haunt's actions on each turn, and the haunt loses three actions each turn for every disabled or destroyed mannequin.",
      disable: '@Check[thievery|dc:37]',
    }),
  );
  expect(plan.components[0]).toMatchObject({ name: 'mannequin', actionsEach: 3, count: 1 });
  expect(warnings).toContain('component-count-unknown');
});

test('no inline checks warns no-disables', () => {
  const { plan, warnings } = draftPlan(hazard({ routine: '(1 action)', disable: 'Smash it.' }));
  expect(plan.components[0].disables).toEqual([]);
  expect(warnings).toContain('no-disables');
});

test('counteract attaches to the component', () => {
  const { plan } = draftPlan(
    hazard({
      routine: '(1 action)',
      disable:
        '@UUID[Compendium.pf2e.spells-srd.Item.abc]{Dispel Magic} (4th rank; counteract DC 22) to counteract each rune',
    }),
  );
  expect(plan.components[0].counteract).toEqual({
    spellUuid: 'Compendium.pf2e.spells-srd.Item.abc',
    name: 'Dispel Magic',
    rank: 4,
    dc: 22,
  });
});

test('reaction and routine items', () => {
  const { plan } = draftPlan(
    hazard({ routine: '(1 action)' }, [
      { _id: 'r1', type: 'action', name: 'Awaken', system: { actionType: { value: 'reaction' } } },
      { _id: 'm1', type: 'melee', name: 'Fist', system: { actionType: { value: null } } },
      { _id: 'a1', type: 'action', name: 'Submerge', system: { actionType: { value: 'free' } } },
    ]),
  );
  expect(plan.reactionItemId).toBe('r1');
  expect(plan.routineItemIds).toEqual(['m1', 'a1']);
});

test('passive abilities are not routine items', () => {
  const { plan } = draftPlan(
    hazard({ routine: '(3 actions)' }, [
      {
        _id: 'p1',
        type: 'action',
        name: 'Void Healing',
        system: { actionType: { value: 'passive' } },
      },
      { _id: 'm1', type: 'melee', name: 'Ghostly Attack', system: { actionType: { value: null } } },
    ]),
  );
  expect(plan.routineItemIds).toEqual(['m1']);
});

test('defaults and reset text', () => {
  const { plan } = draftPlan(
    hazard({ routine: '(1 action)', reset: '<p>Resets after 1 minute.</p>' }),
  );
  expect(plan).toMatchObject({
    version: 1,
    confirmed: false,
    resetText: 'Resets after 1 minute.',
    resetAfterSeconds: null,
  });
});

test('never throws on garbage', () => {
  const { plan, warnings } = draftPlan({ name: 'X', system: null, items: 'nope' });
  expect(plan.components).toHaveLength(1);
  expect(warnings).toContain('parse-error');
});

describe('actions-per-turn formats', () => {
  test.each([
    ['(1 action; mental, occult) The haunt…', 1],
    ['(2 actions; cold, mental) The haunt…', 2],
    ['(six actions) This trap loses 2 actions', 6],
    ['(two-actions) The fang leaps', 2],
    ['Routine (4 actions) The trap loses 1 action', 4],
    ['<p><strong>Routine</strong> (3 actions) The trap</p>', 3],
    ['1 Action: If there are no targets', 1],
    ['3 For each of its actions, the trap attempts', 3],
  ])('%s', (routine, expected) => {
    expect(draftPlan(hazard({ routine })).plan.actionsPerTurn).toBe(expected);
  });

  test('prose without a count stays null', () => {
    expect(
      draftPlan(hazard({ routine: 'On its turn, the fire spreads.' })).plan.actionsPerTurn,
    ).toBeNull();
  });
});

test('"actions per <thing>" is not a per-turn total', () => {
  const { plan, warnings } = draftPlan(
    hazard({ routine: '(2 actions per shadow tendril) Each tendril lashes out.' }),
  );
  expect(plan.actionsPerTurn).toBeNull();
  expect(warnings).toContain('actions-per-turn-missing');
});

test('"(1 action, illusion)" still parses', () => {
  expect(
    draftPlan(hazard({ routine: '(1 action, illusion, mental) It acts.' })).plan.actionsPerTurn,
  ).toBe(1);
});

describe('multiplier shared across alternatives', () => {
  const component = (disable) =>
    draftPlan(hazard({ routine: '(1 action)', disable })).plan.components[0];
  const successes = (disable) => component(disable).disables.map((d) => d.successesNeeded);

  test('two alternatives, trailing twice', () => {
    expect(
      component('@Check[nature|dc:20] or @Check[occultism|dc:20] twice to disperse')
        .sharedSuccesses,
    ).toBe(2);
  });

  test('four alternatives with proficiency parenthetical, four times', () => {
    const c = component(
      '@Check[arcana|dc:25], @Check[nature|dc:25], @Check[occultism|dc:25], or @Check[religion|dc:25] (master) four times',
    );
    expect(c.sharedSuccesses).toBe(4);
    expect(c.disables.map((d) => d.successesNeeded)).toEqual([1, 1, 1, 1]);
  });

  test('two sets of alternatives, each with its own count: two groups', () => {
    const c = component(
      '@Check[athletics|dc:44] (master) to force the gate, @Check[crafting|dc:41] or @Check[thievery|dc:41] (expert) twice to dismantle the lock, or @Check[games-lore|dc:34] (expert) or @Check[society|dc:36] (expert) five times to solve the puzzles',
    );
    expect(c.sharedSuccesses).toBeNull();
    expect(c.disables.map((d) => [d.skill, d.successesNeeded, d.group])).toEqual([
      ['athletics', 1, null],
      ['crafting', 2, 'A'],
      ['thievery', 2, 'A'],
      ['games-lore', 5, 'B'],
      ['society', 5, 'B'],
    ]);
  });

  test('separated by prose, no sharing', () => {
    expect(successes('@Check[thievery|dc:37] to jam, or @Check[religion|dc:35] twice')).toEqual([
      1, 2,
    ]);
  });
});

describe('any-combination disables', () => {
  const shared = (disable) => draftPlan(hazard({ routine: '(1 action)', disable }));

  test.each([
    [
      '@Check[occultism|dc:44] (master) to disrupt, or @Check[religion|dc:42] (master) to exorcise. Disabling the trap requires three successful checks, in any combination of Occultism and Religion checks.',
      3,
    ],
    [
      '@Check[occultism|dc:30] (trained) or @Check[religion|dc:30] (trained) to weaken the haunt; three total successes in any combination are required to disable the haunt',
      3,
    ],
    [
      'Succeed at two of the following checks in any combination: @Check[athletics|dc:25] (trained) to confiscate debris, @Check[diplomacy|dc:25] (trained) to calm the crowd',
      2,
    ],
    [
      '@Check[thievery|dc:18] (trained) to puncture a pipe, or @Check[engineering-lore|dc:16] (trained) to turn a valve; any combination of three punctured pipes or turned valves disables the trap',
      3,
    ],
  ])('%#: shared total parsed', (disable, n) => {
    const { plan, warnings } = shared(disable);
    expect(plan.components[0].sharedSuccesses).toBe(n);
    expect(warnings).toContain('shared-successes');
  });

  test('plain alternatives stay per-option', () => {
    const { plan, warnings } = shared('@Check[thievery|dc:20] or @Check[arcana|dc:20]');
    expect(plan.components[0].sharedSuccesses).toBeNull();
    expect(warnings).not.toContain('shared-successes');
  });
});

test('minimum ranks: own rank, shared trailing rank, none', () => {
  const { plan } = draftPlan(
    hazard({
      routine: '(1 action)',
      disable:
        '@Check[arcana|dc:33] (expert) to disrupt, @Check[occultism|dc:30] or @Check[religion|dc:30] (master) to suppress, or @Check[thievery|dc:28] to jam it',
    }),
  );
  expect(plan.components[0].disables.map((d) => [d.skill, d.minRank])).toEqual([
    ['arcana', 2],
    ['occultism', 3],
    ['religion', 3],
    ['thievery', null],
  ]);
});

test('rank inside the label or after an action cost; label loses the rank', () => {
  const { plan } = draftPlan(
    hazard({
      routine: '(1 action)',
      disable:
        '@Check[thievery|dc:37]{Thievery (master)} to jam it, or @Check[arcana|dc:16] (2 actions) (trained) to dispel',
    }),
  );
  expect(plan.components[0].disables.map((d) => [d.label, d.minRank])).toEqual([
    ['Thievery', 3],
    ['arcana', 1],
  ]);
});

describe('stated success counts without "any combination"', () => {
  const draft = (disable) => draftPlan(hazard({ routine: '(1 action)', disable }));
  const opts = (plan) => plan.components[0].disables.map((d) => [d.skill, d.successesNeeded]);

  test('one option: it needs that many', () => {
    const { plan } = draft(
      '@Check[survival|dc:27] to unthread the vines; four successes are required to disable the haunt.',
    );
    expect(opts(plan)).toEqual([['survival', 4]]);
    expect(plan.components[0].sharedSuccesses).toBeNull();
  });

  test('every option: they share the total', () => {
    const { plan, warnings } = draft(
      '@Check[intimidation|dc:25] (trained) to threaten the guests or @Check[religion|dc:28] (expert) to exorcise the haunt; two successes are required to disable it.',
    );
    expect(plan.components[0].sharedSuccesses).toBe(2);
    expect(opts(plan)).toEqual([
      ['intimidation', 1],
      ['religion', 1],
    ]);
    expect(warnings).toContain('shared-successes');
  });

  test('in brackets it belongs to the option it follows', () => {
    const { plan } = draft(
      '@Check[thievery|dc:24] (trained) to press hidden knobs (three successes are required to disable the trap); @Check[crafting|dc:24] (expert) to sabotage the mechanisms',
    );
    expect(opts(plan)).toEqual([
      ['thievery', 3],
      ['crafting', 1],
    ]);
    expect(plan.components[0].sharedSuccesses).toBeNull();
  });

  test('a count written before the checks', () => {
    expect(
      draft(
        'Three @Check[thievery|dc:48] (legendary) or @Check[occultism|dc:48] (master) checks to mend the rift.',
      ).plan.components[0].sharedSuccesses,
    ).toBe(3);
    const { plan, warnings } = draft(
      '@Check[thievery|dc:22] (trained) to disable the plate, or four @Check[thievery|dc:18] (trained) checks to plug the launchers',
    );
    expect(opts(plan)).toEqual([
      ['thievery', 1],
      ['thievery', 4],
    ]);
    expect(warnings).not.toContain('successes-heuristic');
  });

  test('some of several options: they form a group with one total', () => {
    const { plan, warnings } = draft(
      'Three @Check[nature|dc:33] or @Check[occultism|dc:33] checks to clot the blood, a @Check[religion|dc:36] check to offer prayers',
    );
    expect(plan.components[0].disables.map((d) => [d.skill, d.successesNeeded, d.group])).toEqual([
      ['nature', 3, 'A'],
      ['occultism', 3, 'A'],
      ['religion', 1, null],
    ]);
    expect(plan.components[0].sharedSuccesses).toBeNull();
    expect(warnings).toContain('shared-successes');
  });

  test('"counts as two successes" is not a requirement', () => {
    const { plan } = draft(
      '@Check[arcana|dc:20] or @Check[religion|dc:20] to alter the runes. A critical success counts as two successes.',
    );
    expect(plan.components[0].sharedSuccesses).toBeNull();
    expect(opts(plan).every(([, n]) => n === 1)).toBe(true);
  });
});

describe('unusual check notations', () => {
  const draft = (disable) =>
    draftPlan(hazard({ routine: '(1 action)', disable })).plan.components[0];

  test('[[/act disable-device]] is a Thievery check', () => {
    const c = draft(
      'Three [[/act disable-device dc=31]]{DC 31 Thievery} (expert) checks to disable the latches',
    );
    expect(c.disables).toMatchObject([
      {
        skill: 'thievery',
        dc: 31,
        successesNeeded: 3,
        minRank: 2,
        traits: ['action:disable-a-device'],
      },
    ]);
  });

  test('plain text skills and DC', () => {
    const c = draft('Survival (trained) or Thievery (expert) DC 20 to rearrange the webbing.');
    expect(c.disables.map((d) => [d.skill, d.dc, d.minRank])).toEqual([
      ['survival', 20, 1],
      ['thievery', 20, 2],
    ]);
  });

  test('one check naming several skills, N times: a shared total', () => {
    const c = draft(
      '@Check[type:arcana,nature,thievery|dc:18] (trained) three times to counter the energies.',
    );
    expect(c.disables.map((d) => [d.skill, d.dc, d.successesNeeded, d.minRank])).toEqual([
      ['arcana', 18, 1, 1],
      ['nature', 18, 1, 1],
      ['thievery', 18, 1, 1],
    ]);
    expect(c.sharedSuccesses).toBe(3);
  });

  test('a missing DC comes from the joined alternative; lore names are slugged', () => {
    const c = draft(
      '@Check[arcana] (trained) or @Check[occultism|dc:17] (trained) to weaken it, or @Check[HellLore|dc:34]',
    );
    expect(c.disables.map((d) => [d.skill, d.dc])).toEqual([
      ['arcana', 17],
      ['occultism', 17],
      ['hell-lore', 34],
    ]);
  });

  test('consequence saves and flat checks are not disable options; a real save is', () => {
    const c = draft(
      '@Check[religion|dc:28] (expert) to rest the dead, or @Check[will|dc:28] save (expert) to refuse to listen. A creature that fails must succeed at a @Check[will|dc:28|options:inflicts:confused] save, taking damage (@Check[reflex|dc:20|basic] save). @Check[flat|dc:5]',
    );
    expect(c.disables.map((d) => d.skill)).toEqual(['religion', 'will']);
  });

  test('counteract written without a spell link', () => {
    const c = draft(
      '@Check[thievery|dc:19] to cover the mirror or dispel magic (2nd level; counteract DC 19) to counteract the binding',
    );
    expect(c.counteract).toEqual({ spellUuid: null, name: 'Dispel Magic', rank: 2, dc: 19 });
  });
});

describe('actions per turn, less common wordings', () => {
  const apt = (routine) =>
    draftPlan(hazard({ routine, disable: '@Check[thievery|dc:20]' })).plan.actionsPerTurn;
  test.each([
    ['<p><span class="action-glyph">d</span> Singe uses its first action to Strike.</p>', 2],
    ['<p><span class="action-glyph">a</span> Tentacles grasp at all creatures.</p>', 1],
    ['<p>(1 to 3 actions) The flow uses up to 3 actions to Strike.</p>', 3],
    ['<p>The keystone uses its 3 actions to Electrify, Spin, and then Launch Darts.</p>', 3],
    ['<p>Each turn, the walls use 1 action. Roll a d10.</p>', 1],
    ['<p>A Voyage Through the Infinite (1 action) Every round on its turn, the trap…</p>', 1],
    ['<p>On its turn, each shadow tendril uses 1 action to make a lash Strike.</p>', null],
  ])('%s', (routine, n) => expect(apt(routine)).toBe(n));
});

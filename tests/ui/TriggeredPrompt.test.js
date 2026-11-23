import {
  offerTriggerReaction,
  referencedAbilities,
  referencedStrikes,
  strikeTargetChoices,
  showTriggered,
} from '../../scripts/ui/TriggeredPrompt.js';

const DialogV2 = {
  confirm: jest.fn(async () => true),
  prompt: jest.fn(async () => null),
  wait: jest.fn(async () => null),
};
beforeEach(() => {
  global.foundry = { applications: { api: { DialogV2 } }, utils: { escapeHTML: (s) => s } };
  DialogV2.confirm.mockClear();
  DialogV2.prompt.mockClear();
});
afterEach(() => {
  delete global.foundry;
});

const tokenDoc = (item) => ({ name: 'Wheel', actor: { items: { get: () => item } } });

test('no reaction item: info-only prompt, no confirm', async () => {
  await showTriggered(tokenDoc(null), { reactionItemId: null });
  await showTriggered(tokenDoc(undefined), { reactionItemId: 'gone' });
  expect(DialogV2.prompt).toHaveBeenCalledTimes(2);
  expect(DialogV2.prompt.mock.calls[0][0].content).toContain('PF2E_HAZARDER.Triggered.NoReaction');
  expect(DialogV2.confirm).not.toHaveBeenCalled();
});

test('reaction item: confirm then post', async () => {
  const item = { toMessage: jest.fn() };
  expect(await showTriggered(tokenDoc(item), { reactionItemId: 'r1' })).toBe(true);
  expect(DialogV2.confirm).toHaveBeenCalled();
  expect(item.toMessage).toHaveBeenCalled();
});

describe('offerTriggerReaction', () => {
  const item = () => ({ name: 'Ghostly Assault', toMessage: jest.fn() });

  test('asks, then posts on yes', async () => {
    const it = item();
    expect(await offerTriggerReaction(tokenDoc(it), { reactionItemId: 'r1' })).toBe(true);
    expect(DialogV2.confirm.mock.calls[0][0].content).toContain('PF2E_HAZARDER.Trigger.Body');
    expect(it.toMessage).toHaveBeenCalled();
  });

  test('a "no" posts nothing', async () => {
    const it = item();
    DialogV2.confirm.mockResolvedValueOnce(false);
    expect(await offerTriggerReaction(tokenDoc(it), { reactionItemId: 'r1' })).toBe(false);
    expect(it.toMessage).not.toHaveBeenCalled();
  });

  test('without asking it posts straight away; no reaction, nothing happens', async () => {
    const it = item();
    expect(await offerTriggerReaction(tokenDoc(it), { reactionItemId: 'r1' }, { ask: false })).toBe(
      true,
    );
    expect(DialogV2.confirm).not.toHaveBeenCalled();
    expect(it.toMessage).toHaveBeenCalled();
    expect(await offerTriggerReaction(tokenDoc(null), { reactionItemId: null })).toBe(false);
  });
});

describe('abilities a reaction names', () => {
  const ability = (id, name, type = 'passive', text = '') => ({
    id,
    name,
    type: 'action',
    system: { actionType: { value: type }, description: { value: text } },
    toMessage: jest.fn(),
  });
  const reaction = ability(
    'r1',
    'Ghostly Assault',
    'reaction',
    "<p><strong>Effect</strong> Burning ghosts burst from the furnace, exposing the triggering creature to the haunt's burn knowledge effect. The haunt rolls initiative.</p>",
  );
  const burn = ability('p1', 'Burn Knowledge');
  const other = ability('p2', 'Void Healing');
  const rebuke = ability('r2', 'Burst', 'reaction');
  const strike = {
    id: 'm1',
    name: 'Burning Ghosts',
    type: 'melee',
    system: {},
    toMessage: jest.fn(),
  };
  const actor = { items: [reaction, burn, other, rebuke, strike] };

  test('finds named abilities, not strikes, other reactions or itself', () => {
    expect(referencedAbilities(actor, reaction).map((i) => i.id)).toEqual(['p1']);
    expect(referencedAbilities(actor, other)).toEqual([]);
  });

  test('posting the reaction posts them after it', async () => {
    const tokenDoc = {
      name: 'Vengeful Furnace',
      actor: { items: Object.assign([...actor.items], { get: () => reaction }) },
    };
    await offerTriggerReaction(tokenDoc, { reactionItemId: 'r1' }, { ask: false });
    expect(reaction.toMessage).toHaveBeenCalledTimes(1);
    expect(burn.toMessage).toHaveBeenCalledTimes(1);
    expect(other.toMessage).not.toHaveBeenCalled();
    expect(strike.toMessage).not.toHaveBeenCalled();
  });
});

describe('Strikes a reaction calls for', () => {
  const reaction = (text) => ({
    id: 'r1',
    name: 'Spear Trap',
    type: 'action',
    system: { actionType: { value: 'reaction' }, description: { value: `<p>${text}</p>` } },
    toMessage: jest.fn(),
  });
  const melee = (id, name) => ({ id, name, type: 'melee', system: {} });

  test('a named Strike wins; "a Strike" alone means the only one', () => {
    const spear = melee('m1', 'Spear');
    const dart = melee('m2', 'Dart');
    const named = reaction('The trap makes a spear Strike against the triggering creature.');
    expect(referencedStrikes({ items: [named, spear, dart] }, named)).toEqual([spear]);
    const generic = reaction('The trap makes a Strike against the triggering creature.');
    expect(referencedStrikes({ items: [generic, spear] }, generic)).toEqual([spear]);
    expect(referencedStrikes({ items: [generic, spear, dart] }, generic)).toEqual([]);
    const none = reaction('The haunt rolls initiative.');
    expect(referencedStrikes({ items: [none, spear] }, none)).toEqual([]);
  });

  describe('posting', () => {
    const origSettings = game.settings;
    beforeEach(() => {
      global.foundry.applications.handlebars = { renderTemplate: jest.fn(async () => '<div/>') };
      global.ChatMessage = { create: jest.fn(async () => ({})), getSpeaker: () => ({}) };
      game.users = Object.assign(
        [
          { id: 'gm1', isGM: true },
          { id: 'p1', isGM: false },
        ],
        game.users,
      );
    });
    afterEach(() => {
      delete global.ChatMessage;
      game.settings = origSettings;
    });

    const tokenFor = (r, strikeItem) => ({
      name: 'Spear Trap',
      uuid: 'Scene.s.Token.t',
      actor: {
        items: Object.assign([r, strikeItem], { get: () => r }),
        system: {
          actions: [
            { item: { id: 'm1' }, variants: [{ label: '+14' }, { label: '+9' }], damage: () => {} },
          ],
        },
      },
    });

    test('a GM-only card with its buttons follows the reaction', async () => {
      const r = reaction('The trap makes a spear Strike against the triggering creature.');
      await offerTriggerReaction(
        tokenFor(r, melee('m1', 'Spear')),
        { reactionItemId: 'r1' },
        { ask: false },
      );
      expect(r.toMessage).toHaveBeenCalledTimes(1);
      const data = foundry.applications.handlebars.renderTemplate.mock.calls[0][1];
      expect(data.strikes).toEqual([
        {
          id: 'm1',
          name: 'Spear',
          variants: [
            { index: 0, label: '+14' },
            { index: 1, label: '+9' },
          ],
          hasDamage: true,
        },
      ]);
      expect(ChatMessage.create.mock.calls[0][0].whisper).toEqual(['gm1']);
    });
  });
});

describe('aiming the Strike a reaction calls for', () => {
  const token = (id, name, type, extra = {}) => ({
    id,
    name,
    actor: { type },
    setTarget: jest.fn(),
    ...extra,
  });
  const origUser = game.user;
  const origCombat = game.combat;
  let amiri, goblin, ezren, chest, roll, tokenDoc, reaction;
  beforeEach(() => {
    amiri = token('a', 'Amiri', 'character');
    ezren = token('e', 'Ezren', 'character');
    goblin = token('g', 'Goblin', 'npc');
    chest = token('c', 'Chest', 'loot');
    roll = jest.fn();
    reaction = {
      id: 'r1',
      name: 'Spear Trap',
      type: 'action',
      system: {
        actionType: { value: 'reaction' },
        description: {
          value: '<p>The trap makes a spear Strike against the triggering creature.</p>',
        },
      },
      toMessage: jest.fn(),
    };
    const spear = { id: 'm1', name: 'Spear', type: 'melee', system: {} };
    const self = { id: 'h', name: 'Spear Trap', actor: { type: 'hazard' } };
    const scene = { id: 's1', tokens: [self, goblin, chest, ezren, amiri] };
    global.canvas = { scene, tokens: { get: (id) => scene.tokens.find((t) => t.id === id) } };
    game.user = { ...origUser, targets: new Set([goblin]) };
    game.combat = { combatants: [{ tokenId: 'e' }] };
    global.foundry.applications.handlebars = { renderTemplate: jest.fn(async () => '<div/>') };
    global.ChatMessage = { create: jest.fn(async () => ({})), getSpeaker: () => ({}) };
    game.users = Object.assign([{ id: 'gm1', isGM: true }], game.users);
    DialogV2.wait.mockReset();
    tokenDoc = {
      id: 'h',
      name: 'Spear Trap',
      uuid: 'Scene.s1.Token.h',
      parent: scene,
      actor: {
        items: Object.assign([reaction, spear], { get: () => reaction }),
        system: {
          actions: [{ item: { id: 'm1' }, variants: [{ label: '+14', roll }], damage: () => {} }],
        },
      },
    };
  });
  afterEach(() => {
    delete global.canvas;
    delete global.ChatMessage;
    game.user = origUser;
    game.combat = origCombat;
  });

  test('choices: current target first, then characters, no hazards or loot', () => {
    expect(strikeTargetChoices(tokenDoc).map((t) => t.name)).toEqual(['Goblin', 'Amiri', 'Ezren']);
    expect(strikeTargetChoices({ ...tokenDoc, parent: { id: 'elsewhere' } })).toEqual([]);
  });

  test('picking a target targets it and rolls the Strike; no buttons card', async () => {
    DialogV2.wait.mockResolvedValueOnce({ target: 'a', strike: 'm1' });
    await offerTriggerReaction(tokenDoc, { reactionItemId: 'r1' }, { ask: false });
    expect(goblin.setTarget).toHaveBeenCalledWith(false, { releaseOthers: false });
    expect(amiri.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(roll).toHaveBeenCalledTimes(1);
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('"Later" (or closing) posts the buttons card and rolls nothing', async () => {
    DialogV2.wait.mockResolvedValueOnce('later');
    await offerTriggerReaction(tokenDoc, { reactionItemId: 'r1' }, { ask: false });
    expect(roll).not.toHaveBeenCalled();
    expect(amiri.setTarget).not.toHaveBeenCalled();
    expect(ChatMessage.create).toHaveBeenCalledTimes(1);
  });
});

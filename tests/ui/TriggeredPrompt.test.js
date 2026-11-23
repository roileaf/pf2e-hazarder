import {
  offerTriggerReaction,
  referencedAbilities,
  showTriggered,
} from '../../scripts/ui/TriggeredPrompt.js';

const DialogV2 = { confirm: jest.fn(async () => true), prompt: jest.fn(async () => null) };
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

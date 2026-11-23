import { offerTriggerReaction, showTriggered } from '../../scripts/ui/TriggeredPrompt.js';

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

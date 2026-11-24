import { attackedTokenIds, buildTurnLog, messageFacts } from '../../scripts/services/turnLog.js';

const HAZ = {
  tokenId: 'haz',
  tokenUuid: 'Scene.s.Token.haz',
  actorUuid: 'Scene.s.Token.haz.Actor.a',
};

const attack = (id, item, target, outcome) =>
  messageFacts(
    { id, speaker: { token: 'haz', alias: 'Trap' } },
    {
      context: {
        type: 'attack-roll',
        outcome,
        target: target ? { token: `Scene.s.Token.${target}` } : null,
        options: ['self:type:hazard', `item:id:${item}`],
      },
    },
  );
const damage = (id, item, target) =>
  messageFacts(
    { id, speaker: { token: 'haz' } },
    {
      context: {
        type: 'damage-roll',
        outcome: 'success',
        target: target ? { token: `Scene.s.Token.${target}` } : null,
        options: [`item:id:${item}`],
      },
    },
  );

test('messageFacts reads the roll, its item, target and outcome', () => {
  expect(attack('m1', 'blade', 'pc1', 'criticalSuccess')).toMatchObject({
    id: 'm1',
    type: 'attack-roll',
    outcome: 'criticalSuccess',
    speakerToken: 'haz',
    itemId: 'blade',
    targetUuid: 'Scene.s.Token.pc1',
  });
  expect(messageFacts({ id: 'x' }, {})).toBeNull();
  expect(messageFacts({ id: 'x' }, undefined)).toBeNull();
  // No item roll option: fall back to the origin item's uuid.
  const f = messageFacts(
    { id: 'y', speaker: {} },
    { context: { type: 'attack-roll' }, origin: { uuid: 'Actor.a.Item.spear' } },
  );
  expect(f.itemId).toBe('spear');
});

test('Strikes are logged in order; a damage roll settles the Strike it belongs to', () => {
  const log = buildTurnLog(
    [
      attack('m1', 'blade', 'pc1', 'success'),
      attack('m2', 'blade', 'pc2', 'failure'),
      attack('m3', 'blade', 'pc3', 'criticalSuccess'),
      damage('m4', 'blade', 'pc3'),
    ],
    HAZ,
  );
  expect(log.map((e) => [e.targetUuid.split('.').pop(), e.outcome, e.damaged])).toEqual([
    ['pc1', 'success', false],
    ['pc2', 'failure', false],
    ['pc3', 'criticalSuccess', true],
  ]);
  expect([...attackedTokenIds(log)]).toEqual(['pc1', 'pc2', 'pc3']);
});

test('damage with no target settles the latest open Strike of that item', () => {
  const log = buildTurnLog(
    [
      attack('m1', 'blade', 'pc1', 'success'),
      attack('m2', 'spear', 'pc1', 'success'),
      damage('m3', 'blade', null),
    ],
    HAZ,
  );
  expect(log.map((e) => e.damaged)).toEqual([true, false]);
});

test("other tokens' rolls are ignored; saves count when made against the hazard", () => {
  const other = messageFacts(
    { id: 'o', speaker: { token: 'npc' } },
    { context: { type: 'attack-roll', outcome: 'success', options: ['item:id:blade'] } },
  );
  const save = (id, origin) =>
    messageFacts(
      { id, speaker: { token: 'pc1', alias: 'Harlan' } },
      {
        context: {
          type: 'saving-throw',
          outcome: 'failure',
          domains: ['saving-throw', 'reflex'],
          dc: { value: 28 },
          origin,
        },
      },
    );
  const log = buildTurnLog(
    [
      other,
      save('s1', { actor: HAZ.actorUuid }),
      save('s2', { token: HAZ.tokenUuid }),
      save('s3', { actor: 'Actor.someone-else' }),
      save('s4', null),
    ],
    HAZ,
  );
  expect(log).toEqual([
    { kind: 'save', id: 's1', name: 'Harlan', statistic: 'reflex', outcome: 'failure', dc: 28 },
    { kind: 'save', id: 's2', name: 'Harlan', statistic: 'reflex', outcome: 'failure', dc: 28 },
  ]);
});

test('abilities posted to chat are logged with the actions they cost', () => {
  const posted = messageFacts(
    { id: 'a1', speaker: { token: 'haz' } },
    { origin: { uuid: 'Actor.a.Item.whirl', type: 'action' } },
    { cost: 2, label: 'Whirling Blades' },
  );
  const free = messageFacts({ id: 'a2', speaker: { token: 'haz' } }, { origin: {} });
  expect(free).toBeNull();
  const log = buildTurnLog([posted, attack('m1', 'blade', 'pc1', 'success')], HAZ);
  expect(log[0]).toEqual({
    kind: 'action',
    id: 'a1',
    itemId: 'whirl',
    name: 'Whirling Blades',
    cost: 2,
  });
  expect(log[1]).toMatchObject({ kind: 'attack', cost: 1 });
});

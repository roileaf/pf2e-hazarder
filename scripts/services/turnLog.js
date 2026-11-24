const ATTACK = 'attack-roll';
const DAMAGE = 'damage-roll';
const SAVE = 'saving-throw';

const lastId = (uuid) => (uuid ? String(uuid).split('.').pop() : null);

/**
 * What a chat message says about a roll, from its system flags (`flags.pf2e`): the roll's kind,
 * who made it, with which item, against whom, and how it went. `cost` is the number of the
 * hazard's actions the message stands for and `label` what to call it (an ability posted to chat
 * is no roll, but it spends actions). Null for a message that is neither.
 */
export function messageFacts(message, flags, { cost = 0, label = null } = {}) {
  const context = flags?.context ?? {};
  if (!context.type && !cost) return null;
  const options = context.options ?? [];
  const option = (prefix) =>
    options.find((o) => o.startsWith(prefix))?.slice(prefix.length) ?? null;
  return {
    id: message.id ?? null,
    type: context.type ?? null,
    cost,
    label,
    outcome: context.outcome ?? null,
    speakerToken: message.speaker?.token ?? null,
    name: message.speaker?.alias ?? null,
    itemId: option('item:id:') ?? lastId(flags?.origin?.uuid),
    targetUuid: context.target?.token ?? null,
    originActor: context.origin?.actor ?? flags?.origin?.actor ?? null,
    originToken: context.origin?.token ?? null,
    statistic: (context.domains ?? []).find((d) => /^(fortitude|reflex|will)$/.test(d)) ?? null,
    dc: context.dc?.value ?? null,
  };
}

/**
 * What a hazard has done so far, in order, from the messages in chat: each Strike with its target
 * and outcome and whether its damage has been rolled, each other thing that spent actions, and
 * each save made against the hazard.
 * `facts` are `messageFacts` of the messages to consider, oldest first.
 */
export function buildTurnLog(facts, { tokenId, tokenUuid = null, actorUuid = null }) {
  const entries = [];
  for (const f of facts) {
    if (!f) continue;
    const mine = !!tokenId && f.speakerToken === tokenId;
    if (f.type === ATTACK && mine) {
      entries.push({
        kind: 'attack',
        id: f.id,
        itemId: f.itemId,
        targetUuid: f.targetUuid,
        outcome: f.outcome,
        cost: 1,
        damaged: false,
      });
    } else if (f.type === DAMAGE && mine) {
      const sameTarget = (a) => !a.targetUuid || !f.targetUuid || a.targetUuid === f.targetUuid;
      const attack = entries.findLast(
        (e) => e.kind === 'attack' && !e.damaged && e.itemId === f.itemId && sameTarget(e),
      );
      if (attack) attack.damaged = true;
    } else if (mine && f.cost > 0) {
      entries.push({ kind: 'action', id: f.id, itemId: f.itemId, name: f.label, cost: f.cost });
    } else if (f.type === SAVE) {
      const against =
        (!!tokenUuid && f.originToken === tokenUuid) ||
        (!!actorUuid && f.originActor === actorUuid);
      if (!against) continue;
      entries.push({
        kind: 'save',
        id: f.id,
        name: f.name,
        statistic: f.statistic,
        outcome: f.outcome,
        dc: f.dc,
      });
    }
  }
  return entries;
}

/** Token ids of the creatures the hazard has already attacked in `entries`. */
export function attackedTokenIds(entries) {
  return new Set(
    entries.filter((e) => e.kind === 'attack' && e.targetUuid).map((e) => lastId(e.targetUuid)),
  );
}

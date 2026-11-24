import { MODULE_ID } from '../constants.js';
import { actionCost, saveRequestCost } from '../services/actionSpend.js';
import { actionsRemaining } from '../services/RulesEngine.js';
import { getSystemFlags } from '../systemCompat.js';
import { getOrCreateState, getOrDraftPlan } from '../stores/hazardStore.js';
import { buildSaveRequest, toolbeltTargetHelper } from '../integrations/toolbelt.js';
import { buildTurnLog, messageFacts } from '../services/turnLog.js';
import { renderHazardInfo } from './HazardInfo.js';
import { postReaction, strikeFollowUps } from './TriggeredPrompt.js';
import {
  endOfTurnAbilityIds,
  endOfTurnNotes,
  extractSaves,
  splitRoutine,
  triggerText,
} from './routineParts.js';
import { buildTurnView } from './turnView.js';

const render = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);

// Hazard Strikes can't go through item.toMessage(): pf2e routes melee items through its action
// macro, which only accepts characters and NPCs. Use the actor's prepared strike actions instead.
export function findStrike(actor, itemId) {
  return actor?.system?.actions?.find((a) => a.item?.id === itemId) ?? null;
}

// Characters of the Pathfinder action font used by pf2e's .action-glyph.
function actionGlyph(item) {
  const type = item.system?.actionType?.value;
  if (type === 'reaction') return 'R';
  if (type === 'free') return 'F';
  if (type === 'action') return String(item.system?.actions?.value ?? 1);
  return null;
}

function describeItem(actor, item) {
  const base = { id: item.id, name: item.name };
  if (item.type !== 'melee') {
    const description = item.system?.description?.value ?? '';
    const type = item.system?.actionType?.value;
    return {
      ...base,
      cost: actionGlyph(item),
      passive: type === 'passive',
      reaction: type === 'reaction',
      trigger: type === 'reaction' ? triggerText(description) : null,
      description,
      saves: extractSaves(description),
    };
  }
  const strike = findStrike(actor, item.id);
  if (!strike) return base;
  return {
    ...base,
    strike: {
      variants: (strike.variants ?? []).map((v) => v.label),
      hasDamage: typeof strike.damage === 'function',
    },
  };
}

export async function postTurnCard(combatant) {
  const tokenDoc = combatant.token;
  const actor = combatant.actor;
  if (!tokenDoc || !actor) return null;
  const { plan } = getOrDraftPlan(actor);
  const state = getOrCreateState(tokenDoc, plan);
  const rawRoutine = actor.system.details.routine ?? '';
  const { traits, intro, outcomes } = splitRoutine(rawRoutine);
  const enrich = (html) =>
    foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
      rollData: actor.getRollData(),
      relativeTo: actor,
    });
  const view = buildTurnView({
    name: tokenDoc.name,
    plan,
    state,
    routineHtml: await enrich(intro),
    outcomesHtml: outcomes ? await enrich(outcomes) : null,
    traits,
    saves: extractSaves(rawRoutine),
    round: game.combat?.started ? game.combat.round : null,
    items: await Promise.all(
      actor.items.map(async (i) => {
        const d = describeItem(actor, i);
        if (d.description == null) return d;
        const { description, ...rest } = d;
        return { ...rest, descriptionHtml: description ? await enrich(description) : null };
      }),
    ),
  });
  const content = await render(`modules/${MODULE_ID}/templates/turn-card.hbs`, {
    ...view,
    tokenUuid: tokenDoc.uuid,
    infoHtml: await renderHazardInfo(actor, { liveHp: true }),
    // "At the end of its turn, it takes its … reaction": kept in sight, with the abilities named.
    endNotes: endOfTurnNotes(
      rawRoutine,
      actor.items.map((i) => ({ id: i.id, name: i.name })),
    ),
  });
  await collapsePreviousTurnCard(tokenDoc);
  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
  const msg = await ChatMessage.create({
    content,
    whisper: gmIds,
    speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    flags: { [MODULE_ID]: { kind: 'turn', round: game.combat?.round, turn: game.combat?.turn } },
  });
  await tokenDoc.setFlag(MODULE_ID, 'turnMessageId', msg.id);
  if (game.settings.get(MODULE_ID, 'publicFlavorCard')) {
    await ChatMessage.create({
      content: `<p>${game.i18n.format('PF2E_HAZARDER.Turn.Flavor', { name: foundry.utils.escapeHTML(tokenDoc.name) })}</p>`,
      speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    });
  }
  return msg;
}

/**
 * The hazard's turn (`round`, `turn`) just ended: use what its routine says it does then ("At the
 * end of its turn, it takes its Spectral Uprising reaction"). Each ability named is posted, a
 * reaction with the abilities and the Strike it calls for; one the GM already posted during the
 * turn is left alone. Resolves to the items posted.
 */
export async function postEndOfTurn(tokenDoc, { round, turn }) {
  const actor = tokenDoc?.actor;
  if (!actor) return [];
  const notes = endOfTurnNotes(
    actor.system?.details?.routine,
    actor.items.map((i) => ({ id: i.id, name: i.name })),
  );
  if (!notes.length) return [];
  const card = game.messages.get(tokenDoc.getFlag(MODULE_ID, 'turnMessageId') ?? '');
  const sameTurn =
    card?.getFlag(MODULE_ID, 'round') === round && card?.getFlag(MODULE_ID, 'turn') === turn;
  // Without that turn's card there is no telling what was already used: leave it to the GM.
  if (!sameTurn) return [];
  const used = game.messages.contents
    .filter((m) => (m.timestamp ?? 0) >= (card.timestamp ?? 0) && m.speaker?.token === tokenDoc.id)
    .map((m) =>
      String(getSystemFlags(m)?.origin?.uuid ?? '')
        .split('.')
        .pop(),
    );
  const posted = [];
  for (const id of endOfTurnAbilityIds(notes, used)) {
    const item = actor.items.get(id);
    if (!item) continue;
    if (item.system?.actionType?.value === 'reaction') await postReaction(tokenDoc, item);
    else await item.toMessage();
    posted.push(item);
  }
  return posted;
}

/** Fold the hazard's previous turn card down to its header so the log stays short. */
async function collapsePreviousTurnCard(tokenDoc) {
  const previous = game.messages.get(tokenDoc.getFlag(MODULE_ID, 'turnMessageId') ?? '');
  if (previous && !previous.getFlag(MODULE_ID, 'collapsed')) {
    await previous.setFlag(MODULE_ID, 'collapsed', true);
  }
}

/** Post a routine's saving throw for the GM's current targets (upgraded by PF2e Toolbelt if active). */
export async function postSaveRequest(tokenDoc, raw, fromItem = null) {
  const targetUuids = [...(game.user.targets ?? [])].map((t) => t.document.uuid);
  const data = buildSaveRequest({
    raw,
    speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    targetUuids,
    targetHelper: toolbeltTargetHelper(),
  });
  foundry.utils.setProperty(data, `flags.${MODULE_ID}`, {
    kind: 'save-request',
    actionCost: saveRequestCost({ fromItem, targets: targetUuids.length }),
  });
  return ChatMessage.create(data);
}

/** The hazard actions a chat message stands for (see `actionCost`), and what to call it. */
function messageCost(message) {
  const flags = getSystemFlags(message) ?? {};
  if (flags.context?.isReroll) return { cost: 0, label: null, reroll: true };
  const origin = flags.origin;
  const item = origin?.type === 'action' && origin.uuid ? fromUuidSync(origin.uuid) : null;
  const own = message.flags?.[MODULE_ID] ?? {};
  const cost = actionCost({
    contextType: flags.context?.type,
    originType: origin?.type,
    actionType: item?.system?.actionType?.value,
    actions: item?.system?.actions?.value,
    hazarderCost: own.actionCost,
  });
  const label =
    item?.name ??
    (own.kind === 'save-request' ? game.i18n.localize('PF2E_HAZARDER.Panel.SaveRequest') : null);
  return { cost, label, origin, item };
}

let spendQueue = Promise.resolve();

/**
 * Count the actions a chat message represents against the acting hazard's current turn card.
 * Runs on the active GM only; serialized so quick successive messages don't overwrite each other.
 */
export function spendFromMessage(message) {
  spendQueue = spendQueue
    .then(() => applySpend(message))
    .catch((err) => console.error(`${MODULE_ID} |`, err));
  return spendQueue;
}

const debug = (...args) => {
  if (game.settings.get(MODULE_ID, 'debug')) console.log(`${MODULE_ID} | spend:`, ...args);
};

async function applySpend(message) {
  const combat = game.combat;
  const combatant = combat?.started ? combat.combatant : null;
  const tokenDoc = combatant?.token;
  if (!tokenDoc || tokenDoc.actor?.type !== 'hazard') {
    return debug('skip: not a hazard turn', message.id);
  }
  const speaker = message.speaker ?? {};
  const fromHazard = speaker.token
    ? speaker.token === tokenDoc.id
    : !!speaker.actor && speaker.actor === tokenDoc.actorId;
  if (!fromHazard) return debug('skip: message not from the acting hazard', speaker, tokenDoc.id);
  const { cost, origin, item, reroll } = messageCost(message);
  if (reroll) return debug('skip: reroll');
  if (!cost) {
    return debug('skip: costs no actions', {
      contextType: getSystemFlags(message)?.context?.type,
      origin,
      actionType: item?.system?.actionType?.value,
    });
  }
  const turnMessage = game.messages.get(tokenDoc.getFlag(MODULE_ID, 'turnMessageId') ?? '');
  if (!turnMessage) return debug('skip: no turn card for this hazard');
  const { plan } = getOrDraftPlan(tokenDoc.actor);
  const max = actionsRemaining(getOrCreateState(tokenDoc, plan), plan) ?? 0;
  const spent = turnMessage.getFlag(MODULE_ID, 'spent') ?? 0;
  const next = Math.min(max, spent + cost);
  debug('apply', { cost, spent, next, max });
  if (next !== spent) await turnMessage.setFlag(MODULE_ID, 'spent', next);
}

/** The turn card of the turn this hazard is taking right now, or null. Its flags hold the spent actions. */
export function currentTurnCard(tokenDoc) {
  const combat = game.combat;
  if (!tokenDoc || !combat?.started || combat.combatant?.token?.uuid !== tokenDoc.uuid) return null;
  const card = game.messages.get(tokenDoc.getFlag(MODULE_ID, 'turnMessageId') ?? '');
  const sameTurn =
    card?.getFlag(MODULE_ID, 'round') === combat.round &&
    card?.getFlag(MODULE_ID, 'turn') === combat.turn;
  return sameTurn ? card : null;
}

/** What the hazard has rolled so far in the turn it is taking (see `buildTurnLog`). */
export function turnLogFor(tokenDoc) {
  const card = currentTurnCard(tokenDoc);
  if (!card) return [];
  const facts = game.messages.contents
    .filter((m) => (m.timestamp ?? 0) >= (card.timestamp ?? 0))
    .map((m) => messageFacts(m, getSystemFlags(m), messageCost(m)));
  return buildTurnLog(facts, {
    tokenId: tokenDoc.id,
    tokenUuid: tokenDoc.uuid,
    actorUuid: tokenDoc.actor?.uuid ?? null,
  });
}

const HIT = new Set(['success', 'criticalSuccess']);

/**
 * The turn's rolls as rows for the turn card: each Strike with its target, how it went and the
 * damage it is still owed, each save made against the hazard with its outcome.
 */
export function turnLogRows(tokenDoc) {
  const actor = tokenDoc.actor;
  const outcomeLabel = (kind, outcome) =>
    outcome ? game.i18n.localize(`PF2E_HAZARDER.Turn.Outcome.${kind}.${outcome}`) : null;
  return turnLogFor(tokenDoc)
    .filter((e) => e.kind !== 'action')
    .map((e) => {
      if (e.kind === 'save') {
        const key = globalThis.CONFIG?.PF2E?.saves?.[e.statistic];
        const save = key ? game.i18n.localize(key) : (e.statistic ?? '');
        return {
          save: true,
          name: e.name ?? '',
          what: [save, e.dc != null ? `DC ${e.dc}` : null].filter(Boolean).join(' '),
          outcome: e.outcome,
          outcomeLabel: outcomeLabel('Save', e.outcome),
        };
      }
      const item = actor.items.get(e.itemId);
      const hit = HIT.has(e.outcome);
      const canDamage = typeof findStrike(actor, e.itemId)?.damage === 'function';
      return {
        name: item?.name ?? '',
        target: e.targetUuid ? (fromUuidSync(e.targetUuid)?.name ?? null) : null,
        outcome: e.outcome,
        outcomeLabel: outcomeLabel('Attack', e.outcome),
        itemId: e.itemId,
        targetUuid: e.targetUuid,
        critical: e.outcome === 'criticalSuccess',
        // A hit is owed its damage; once that is rolled the Strike is settled.
        owed: hit && !e.damaged && canDamage,
        done: hit && e.damaged,
        followUps:
          hit && item ? strikeFollowUps(actor, item).map((i) => ({ id: i.id, name: i.name })) : [],
      };
    });
}

/** The acting hazard's action pool for combat-tracker display, or null. */
export function currentHazardPool() {
  const combat = game.combat;
  const combatant = combat?.started ? combat.combatant : null;
  const tokenDoc = combatant?.token;
  if (!tokenDoc || tokenDoc.actor?.type !== 'hazard') return null;
  const { plan } = getOrDraftPlan(tokenDoc.actor);
  const remaining = actionsRemaining(getOrCreateState(tokenDoc, plan), plan);
  if (!remaining) return null;
  const card = currentTurnCard(tokenDoc);
  const spent = card?.getFlag(MODULE_ID, 'spent') ?? 0;
  return { combatantId: combatant.id, remaining, spent, messageId: card?.id ?? null };
}

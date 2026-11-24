import { MODULE_ID } from '../constants.js';
import { stripHtml } from '../parser/inline.js';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The hazard's other abilities that `item`'s text names ("…exposing the creature to the haunt's
 * burn knowledge effect"): the rules a reader needs next, which otherwise only show on the
 * hazard's own turn. Strikes are handled by `referencedStrikes`.
 */
export function referencedAbilities(actor, item) {
  const text = stripHtml(item?.system?.description?.value).toLowerCase();
  if (!text) return [];
  return [...(actor?.items ?? [])].filter((other) => {
    if (other.id === item.id || other.type !== 'action') return false;
    if (other.system?.actionType?.value === 'reaction') return false;
    const name = String(other.name ?? '')
      .trim()
      .toLowerCase();
    return name.length >= 4 && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);
  });
}

/**
 * The Strikes `item`'s text calls for ("…making a spear Strike against the triggering creature").
 * A named Strike wins; "a Strike" with no name means the hazard's only one.
 */
export function referencedStrikes(actor, item) {
  const text = stripHtml(item?.system?.description?.value).toLowerCase();
  if (!text) return [];
  const strikes = [...(actor?.items ?? [])].filter((i) => i.type === 'melee');
  const named = strikes.filter((s) => {
    const name = String(s.name ?? '')
      .trim()
      .toLowerCase();
    return name.length >= 3 && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);
  });
  if (named.length) return named;
  return strikes.length === 1 && /\bstrikes?\b/.test(text) ? strikes : [];
}

/** A GM-only card with attack and damage buttons, as on the hazard's turn card. */
async function postStrikeCard(tokenDoc, item, strikes) {
  const data = strikes
    .map((s) => {
      const strike = tokenDoc.actor?.system?.actions?.find((a) => a.item?.id === s.id);
      if (!strike) return null;
      return {
        id: s.id,
        name: s.name,
        variants: (strike.variants ?? []).map((v, index) => ({ index, label: v.label })),
        hasDamage: typeof strike.damage === 'function',
      };
    })
    .filter(Boolean);
  if (!data.length) return null;
  const content = await foundry.applications.handlebars.renderTemplate(
    `modules/${MODULE_ID}/templates/reaction-strikes.hbs`,
    {
      title: game.i18n.format('PF2E_HAZARDER.Trigger.Strikes', { reaction: item.name }),
      tokenUuid: tokenDoc.uuid,
      strikes: data,
    },
  );
  return ChatMessage.create({
    content,
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    flags: { [MODULE_ID]: { kind: 'reaction-strikes' } },
  });
}

const NOT_TARGETS = new Set(['hazard', 'loot', 'party', 'vehicle']);

/**
 * Creature tokens the GM may aim a hazard's Strike at: `{ id, name }`, most likely first (whoever
 * the GM has targeted, then player characters, then others in the fight). Empty when the hazard
 * is not on the scene being viewed, where nothing can be targeted.
 */
export function strikeTargetChoices(tokenDoc) {
  const scene = globalThis.canvas?.scene;
  if (!scene || tokenDoc.parent?.id !== scene.id) return [];
  const targeted = new Set([...(game.user.targets ?? [])].map((t) => t.id));
  const fighting = new Set([...(game.combat?.combatants ?? [])].map((c) => c.tokenId));
  const rank = (t) =>
    targeted.has(t.id) ? 0 : t.actor.type === 'character' ? 1 : fighting.has(t.id) ? 2 : 3;
  return [...scene.tokens]
    .filter((t) => t.id !== tokenDoc.id && t.actor && !NOT_TARGETS.has(t.actor.type))
    .map((t) => ({ id: t.id, name: t.name, rank: rank(t) }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}

/**
 * "…makes a spear Strike against the triggering creature": the GM picks that creature and the
 * Strike is rolled against it. Resolves to false when there is nobody to pick or the GM defers.
 */
async function rollReactionStrike(tokenDoc, item, strikes) {
  const usable = strikes
    .map((s) => ({
      id: s.id,
      name: s.name,
      strike: tokenDoc.actor?.system?.actions?.find((a) => a.item?.id === s.id),
    }))
    .filter((s) => s.strike);
  const targets = strikeTargetChoices(tokenDoc);
  if (!usable.length || !targets.length) return false;

  const esc = foundry.utils.escapeHTML;
  const options = (list) =>
    list.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
  const field = (key, name, list) =>
    `<div class="form-group"><label>${game.i18n.localize(key)}</label><select name="${name}">${options(list)}</select></div>`;
  const names = { reaction: item.name, strike: usable.map((s) => s.name).join(' / ') };
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format('PF2E_HAZARDER.Trigger.StrikeTitle', names) },
    content:
      `<p>${game.i18n.format('PF2E_HAZARDER.Trigger.StrikeBody', { strike: esc(names.strike) })}</p>` +
      (usable.length > 1 ? field('PF2E_HAZARDER.Trigger.StrikeChoice', 'strike', usable) : '') +
      field('PF2E_HAZARDER.Trigger.Target', 'target', targets),
    rejectClose: false,
    buttons: [
      {
        action: 'roll',
        label: game.i18n.localize('PF2E_HAZARDER.Trigger.RollStrike'),
        icon: 'fa-solid fa-dice-d20',
        default: true,
        callback: (_event, button) => ({
          target: button.form.elements.target.value,
          strike: button.form.elements.strike?.value ?? usable[0].id,
        }),
      },
      { action: 'later', label: game.i18n.localize('PF2E_HAZARDER.Trigger.LaterStrike') },
    ],
  });
  const token = picked?.target ? canvas.tokens?.get(picked.target) : null;
  if (!token) return false;
  // pf2e reads the attack's target from the user's targets, not from a roll parameter.
  for (const other of [...(game.user.targets ?? [])]) {
    other.setTarget(false, { releaseOthers: false });
  }
  token.setTarget(true, { releaseOthers: true });
  const chosen = usable.find((s) => s.id === picked.strike) ?? usable[0];
  await chosen.strike.variants?.[0]?.roll({});
  return true;
}

/**
 * Posts a reaction, then what it needs to be resolved: each ability its text names, and the
 * Strike it calls for. The GM picks the Strike's target and it is rolled; if they defer, or the
 * target can't be picked here, a card with the Strike's buttons is posted to use later.
 */
async function postReaction(tokenDoc, item) {
  const actor = tokenDoc.actor;
  await item.toMessage();
  for (const ability of referencedAbilities(actor, item)) await ability.toMessage();
  const strikes = referencedStrikes(actor, item);
  if (!strikes.length) return;
  if (!(await rollReactionStrike(tokenDoc, item, strikes))) {
    await postStrikeCard(tokenDoc, item, strikes);
  }
}

/** After a critical failure. Resolves to whether the reaction was posted. */
export async function showTriggered(tokenDoc, plan) {
  const name = tokenDoc.name;
  const item = plan.reactionItemId ? tokenDoc.actor?.items.get(plan.reactionItemId) : null;
  const { DialogV2 } = foundry.applications.api;
  const title = game.i18n.format('PF2E_HAZARDER.Triggered.Title', { name });
  if (!item) {
    // Nothing to post: inform the GM without offering a reaction.
    await DialogV2.prompt({
      window: { title },
      content: `<p>${game.i18n.localize('PF2E_HAZARDER.Triggered.NoReaction')}</p>`,
    });
    return false;
  }
  const fire = await DialogV2.confirm({
    window: { title },
    content: `<p>${game.i18n.localize('PF2E_HAZARDER.Triggered.Body')}</p>`,
    yes: { label: game.i18n.localize('PF2E_HAZARDER.Triggered.Fire') },
  });
  if (fire) await postReaction(tokenDoc, item);
  return !!fire;
}

/**
 * A hazard joined the encounter: triggering it is what started its part in the fight, so its
 * reaction comes first. Asks the GM unless `ask` is false. Resolves to whether it was posted.
 */
export async function offerTriggerReaction(tokenDoc, plan, { ask = true } = {}) {
  const item = plan.reactionItemId ? tokenDoc.actor?.items.get(plan.reactionItemId) : null;
  if (!item) return false;
  if (ask) {
    const data = {
      name: foundry.utils.escapeHTML(tokenDoc.name),
      reaction: foundry.utils.escapeHTML(item.name),
    };
    const fire = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.format('PF2E_HAZARDER.Trigger.Title', { name: tokenDoc.name }) },
      content: `<p>${game.i18n.format('PF2E_HAZARDER.Trigger.Body', data)}</p>`,
      yes: { label: game.i18n.localize('PF2E_HAZARDER.Triggered.Fire') },
    });
    if (!fire) return false;
  }
  await postReaction(tokenDoc, item);
  return true;
}

/** Damage took the hazard to its Broken Threshold or to 0 HP: does that disable it? */
export async function confirmHpDisable(tokenDoc, stage) {
  const hp = tokenDoc.actor?.system?.attributes?.hp ?? {};
  const data = {
    name: foundry.utils.escapeHTML(tokenDoc.name),
    hp: hp.value ?? 0,
    threshold: hp.brokenThreshold ?? Math.floor((hp.max ?? 0) / 2),
  };
  const key = stage === 'destroyed' ? 'Destroyed' : 'Broken';
  return !!(await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format(`PF2E_HAZARDER.Hp.${key}Title`, { name: tokenDoc.name }) },
    content: `<p>${game.i18n.format(`PF2E_HAZARDER.Hp.${key}Body`, data)}</p>`,
    yes: { label: game.i18n.localize('PF2E_HAZARDER.Hp.Disable') },
  }));
}

import { stripHtml } from '../parser/inline.js';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The hazard's other abilities that `item`'s text names ("…exposing the creature to the haunt's
 * burn knowledge effect"): the rules a reader needs next, which otherwise only show on the
 * hazard's own turn. Strikes are left out; they are rolled from the turn card.
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

/** Posts a reaction, then each ability its text names. */
async function postReaction(actor, item) {
  await item.toMessage();
  for (const ability of referencedAbilities(actor, item)) await ability.toMessage();
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
  if (fire) await postReaction(tokenDoc.actor, item);
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
  await postReaction(tokenDoc.actor, item);
  return true;
}

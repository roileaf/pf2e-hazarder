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
  if (fire) await item.toMessage();
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
  await item.toMessage();
  return true;
}

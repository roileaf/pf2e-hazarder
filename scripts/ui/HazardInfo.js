import { MODULE_ID } from '../constants.js';
import { buildInfoView } from './infoView.js';

const TEMPLATE = `modules/${MODULE_ID}/templates/hazard-info.hbs`;

/**
 * The GM's reference block for a hazard's cards: defenses, then stealth, description, the full
 * disable text and reset behind a fold. Empty string when the hazard has none of it.
 */
export async function renderHazardInfo(actor, { liveHp = false } = {}) {
  if (!actor) return '';
  const enrich = async (html) => {
    const text = String(html ?? '').trim();
    if (!text) return '';
    return foundry.applications.ux.TextEditor.implementation.enrichHTML(text, {
      rollData: actor.getRollData?.() ?? {},
      relativeTo: actor,
    });
  };
  const details = actor.system?.details ?? {};
  const view = buildInfoView(actor, {
    liveHp,
    disableHtml: await enrich(details.disable),
    resetHtml: await enrich(details.reset),
    descriptionHtml: await enrich(details.description),
    stealthHtml: await enrich(actor.system?.attributes?.stealth?.details),
  });
  if (view.empty) return '';
  return foundry.applications.handlebars.renderTemplate(TEMPLATE, view);
}

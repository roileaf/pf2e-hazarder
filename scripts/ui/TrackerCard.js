import { MODULE_ID, RANKS } from '../constants.js';
import { enforceRanks } from '../services/HazardRunner.js';
import { buildTag } from '../services/RollMatcher.js';
import {
  getOrCreateState,
  getOrDraftPlan,
  getTrackerMessageId,
  setTrackerMessageId,
} from '../stores/hazardStore.js';
import { buildTrackerView, skillLabel } from './trackerView.js';

const TEMPLATE = `modules/${MODULE_ID}/templates/tracker-card.hbs`;

export async function renderTrackerContent(tokenDoc) {
  const { plan } = getOrDraftPlan(tokenDoc.actor);
  const state = getOrCreateState(tokenDoc, plan);
  const view = buildTrackerView({ name: tokenDoc.name, plan, state, isGM: game.user.isGM });
  return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    ...view,
    tokenUuid: tokenDoc.uuid,
  });
}

export async function upsertTracker(tokenDoc) {
  const content = await renderTrackerContent(tokenDoc);
  const existing = game.messages.get(getTrackerMessageId(tokenDoc) ?? '');
  if (existing) {
    await existing.update({ content });
    return existing;
  }
  const msg = await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    flags: { [MODULE_ID]: { kind: 'tracker', tokenUuid: tokenDoc.uuid } },
  });
  await setTrackerMessageId(tokenDoc, msg.id);
  return msg;
}

/**
 * Whether `actor` may attempt a disable option (`{ skill, minRank }`): it needs the statistic and,
 * while proficiency is enforced, the rank. `reason` is 'no-statistic' or 'rank-too-low'.
 */
export function disableEligibility(actor, option) {
  const statistic =
    typeof actor?.getStatistic === 'function' ? actor.getStatistic(option.skill) : null;
  if (!statistic) return { ok: false, reason: 'no-statistic', statistic: null, rank: null };
  const rank = Number.isInteger(statistic.rank) ? statistic.rank : null;
  if (enforceRanks() && option.minRank && rank != null && rank < option.minRank) {
    return { ok: false, reason: 'rank-too-low', statistic, rank };
  }
  return { ok: true, reason: null, statistic, rank };
}

/**
 * Rolls a disable option, tagged so the result is applied to that hazard. Rolls as `actor` when
 * given, else the controlled token's actor or the user's character. `rollParams` are passed on to
 * the pf2e statistic roll (e.g. `{ event }`, `{ skipDialog: true }`). Resolves to the roll, or null
 * when nothing was rolled.
 */
export async function rollDisable({ tokenUuid, instanceKey, disableId, actor, rollParams }) {
  const tokenDoc = await fromUuid(tokenUuid);
  if (!tokenDoc?.actor) return null;
  const { plan } = getOrDraftPlan(tokenDoc.actor);
  const [componentId, index] = instanceKey.split(':');
  const disable = plan.components
    .find((c) => c.id === componentId)
    ?.disables.find((d) => d.id === disableId);
  if (!disable) return null;
  const controlled = canvas.tokens?.controlled?.[0]?.actor;
  const roller =
    actor ??
    (typeof controlled?.getStatistic === 'function'
      ? controlled
      : (game.user.character ?? controlled));
  if (!roller) {
    ui.notifications.warn(game.i18n.localize('PF2E_HAZARDER.Tracker.NoActor'));
    return null;
  }
  const { ok, reason, statistic } = disableEligibility(roller, disable);
  if (!ok) {
    ui.notifications.warn(
      reason === 'no-statistic'
        ? game.i18n.format('PF2E_HAZARDER.Tracker.NoStatistic', {
            actor: roller.name,
            skill: disable.skill,
          })
        : game.i18n.format('PF2E_HAZARDER.Tracker.RankTooLow', {
            actor: roller.name,
            rank: game.i18n.localize(`PF2E_HAZARDER.Rank.${RANKS[disable.minRank]}`),
            skill: skillLabel(disable.skill),
          }),
    );
    return null;
  }
  const tag = buildTag(tokenDoc.id, componentId, Number(index), disableId);
  return (await statistic.roll({ ...rollParams, ...buildDisableRollParams(disable, tag) })) ?? null;
}

/**
 * Mirrors pf2e's inline-check handler: every trait (including `action:<slug>`) becomes a roll
 * option, and only plain traits are passed as check traits.
 */
export function buildDisableRollParams(disable, tag) {
  const traits = disable.traits ?? [];
  return {
    dc: disable.dc != null ? { value: disable.dc, label: disable.label } : undefined,
    extraRollOptions: [...traits, tag],
    traits: traits.filter((t) => !t.includes(':')),
  };
}

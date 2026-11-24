import * as store from './stores/hazardStore.js';
import { HazardRunner, defaultCandidates } from './services/HazardRunner.js';
import { hazardSnapshot } from './services/hazardSnapshot.js';
import {
  disableEligibility,
  refreshTracker,
  rollDisable,
  upsertTracker,
} from './ui/TrackerCard.js';
import { confirmHpDisable, offerTriggerReaction, showTriggered } from './ui/TriggeredPrompt.js';
import { PlanPanel } from './ui/PlanPanel.js';

export function createRunner() {
  return new HazardRunner({
    getCandidates: () => defaultCandidates(store),
    resolveToken: (id) =>
      canvas.scene?.tokens.get(id) ??
      game.combat?.combatants.find((c) => c.tokenId === id)?.token ??
      null,
    store,
    ui: {
      upsertTracker,
      refreshTracker,
      confirmHpDisable,
      showTriggered,
      offerTriggerReaction,
      notify: (t) => ui.notifications.info(t),
      warn: (t) => ui.notifications.warn(t),
    },
    isWriter: () => !!game.users.activeGM?.isSelf,
    now: () => game.time.worldTime,
  });
}

// Players only learn DCs when pf2e's metagame "show DCs" setting allows it.
const showDC = () => game.user.isGM || game.pf2e?.settings?.metagame?.dcs !== false;

/**
 * The module's public API: `game.modules.get('pf2e-hazarder').api`.
 *
 * For other modules:
 * - `hazards()` — the hazards being tracked (in combat, or active on the viewed scene) and their open
 *   disable options; see `hazardSnapshot`. State lives on the token (`flags.pf2e-hazarder.state`),
 *   so an `updateToken` hook with that flag changed means "ask again".
 * - `hazard(tokenDoc)` — the same for one token, or null when it is not a tracked hazard.
 * - `canAttempt(actor, option)` — `{ ok, reason, rank }` for one of those options.
 * - `rollDisable({ tokenUuid, instanceKey, disableId, actor, rollParams })` — roll it; the result is
 *   applied to the hazard by the active GM's client.
 */
export function buildApi(runner) {
  const snapshot = ({ tokenDoc, plan, state }) =>
    hazardSnapshot({ tokenDoc, plan, state, showDC: showDC() });
  return {
    runner,
    openPlan: (actor) => PlanPanel.open(actor),
    startHazard: (tokenDoc) => runner.startHazard(tokenDoc),
    hazards: () => defaultCandidates(store).map(snapshot),
    hazard: (tokenDoc) => {
      if (tokenDoc?.actor?.type !== 'hazard' || !store.getState(tokenDoc)) return null;
      const { plan } = store.getOrDraftPlan(tokenDoc.actor);
      return snapshot({ tokenDoc, plan, state: store.getOrCreateState(tokenDoc, plan) });
    },
    canAttempt: (actor, option) => {
      const { ok, reason, rank } = disableEligibility(actor, option);
      return { ok, reason, rank };
    },
    rollDisable,
  };
}

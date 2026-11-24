import { MODULE_ID, OUTCOME_TO_DEGREE, RANKS, STATUS } from '../constants.js';
import { getSystemFlags } from '../systemCompat.js';
import * as Engine from './RulesEngine.js';
import { hpStage, stageWorsened } from './hpStage.js';
import { extractCheck, matchCheck } from './RollMatcher.js';
import { skillLabel } from '../ui/trackerView.js';

// Saving throws count too: a few hazards are disabled with one ("@Check[will|dc:28] to refuse to listen").
export const CHECK_TYPES = new Set(['skill-check', 'perception-check', 'saving-throw']);

export function defaultCandidates(store) {
  const seen = new Map();
  const add = (tokenDoc) => {
    if (!tokenDoc?.actor || tokenDoc.actor.type !== 'hazard' || seen.has(tokenDoc.id)) return;
    const { plan } = store.getOrDraftPlan(tokenDoc.actor);
    seen.set(tokenDoc.id, {
      tokenId: tokenDoc.id,
      tokenDoc,
      plan,
      state: store.getOrCreateState(tokenDoc, plan),
    });
  };
  for (const c of game.combat?.combatants ?? []) add(c.token);
  for (const t of canvas.scene?.tokens ?? []) {
    const s = t.getFlag(MODULE_ID, 'state');
    if (s && (s.status === STATUS.ACTIVE || s.status === STATUS.TRIGGERED)) add(t);
  }
  return [...seen.values()];
}

/** Whether disable options' minimum proficiency ranks are enforced (world setting, default on). */
export function enforceRanks() {
  return game.settings.get(MODULE_ID, 'enforceProficiency') !== false;
}

/** The rolling actor's rank in the checked statistic, or null when unknown or not enforced. */
export function rankFromMessage(message, statistic) {
  if (!statistic || !enforceRanks()) return null;
  const rank = message.actor?.getStatistic?.(statistic)?.rank;
  return Number.isInteger(rank) ? rank : null;
}

export class HazardRunner {
  constructor({ getCandidates, resolveToken, store, ui, isWriter, now }) {
    this.getCandidates = getCandidates;
    this.resolveToken = resolveToken;
    this.store = store;
    this.ui = ui;
    this.isWriter = isWriter;
    this.now = now;
  }

  #queues = new Map();

  #enqueue(tokenDoc, fn) {
    const id = tokenDoc.id;
    const prev = this.#queues.get(id) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    this.#queues.set(id, tail);
    tail.then(() => {
      if (this.#queues.get(id) === tail) this.#queues.delete(id);
    });
    return run;
  }

  async handleCheckMessage(message) {
    try {
      return await this.#handleCheckMessage(message);
    } catch (err) {
      console.error('pf2e-hazarder |', err);
      return { kind: 'error', applied: false };
    }
  }

  async #handleCheckMessage(message) {
    const skipped = { kind: 'skipped', applied: false };
    if (!this.isWriter()) return skipped;
    if (message.flags?.[MODULE_ID]?.applied) return skipped;
    const context = getSystemFlags(message)?.context ?? message.flags?.pf2e?.context;
    if (!context || !CHECK_TYPES.has(context.type)) return skipped;
    const degree = OUTCOME_TO_DEGREE[context.outcome];
    if (degree === undefined) return skipped;

    const check = extractCheck(context);
    const result = matchCheck(check, this.getCandidates());
    if (result.kind === 'ambiguous') {
      await message.setFlag(MODULE_ID, 'candidates', result.matches);
      return { kind: 'ambiguous', applied: false };
    }
    if (result.kind === 'none') return { kind: 'none', applied: false };
    const [m] = result.matches;
    const tokenDoc = this.resolveToken(m.tokenId);
    if (!tokenDoc) return { kind: result.kind, applied: false };
    const events = await this.apply(tokenDoc, {
      instanceKey: m.instanceKey,
      disableId: m.disableId,
      degree,
      actorUuid: message.speaker?.actor ?? null,
      messageId: message.id,
      userId: message.author?.id ?? null,
      isReroll: !!context.isReroll,
      rank: rankFromMessage(message, check.statistic),
      actorName: message.actor?.name ?? null,
    });
    if (events.every((e) => e.type === 'ignored')) return { kind: result.kind, applied: false };
    await message.setFlag(MODULE_ID, 'applied', true);
    return { kind: result.kind, applied: true };
  }

  async apply(tokenDoc, r) {
    const { events, plan } = await this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      const state = this.store.getOrCreateState(tokenDoc, plan);
      if (
        r.messageId &&
        !r.isReroll &&
        state.history?.some((h) => h.kind === 'result' && h.messageId === r.messageId)
      ) {
        return {
          events: [{ type: 'ignored', reason: 'duplicate-message', instanceKey: r.instanceKey }],
          plan,
        };
      }
      const { state: next, events } = Engine.applyResult(state, plan, { ...r, at: this.now() });
      if (events.every((e) => e.type === 'ignored')) {
        this.#warnRank(events, plan, r);
        return { events, plan };
      }
      await this.store.setState(tokenDoc, next);
      await this.#afterEvents(tokenDoc, events);
      // A roll just pushed the tracker up the log: bring it back down with the new progress.
      await this.ui.upsertTracker(tokenDoc, { bump: true });
      return { events, plan };
    });
    if (events.some((e) => e.type === 'hazardTriggered')) this.#promptTriggered(tokenDoc, plan);
    return events;
  }

  // Not awaited: the prompt must not hold up the roll that caused it.
  #promptTriggered(tokenDoc, plan) {
    Promise.resolve()
      .then(() => this.ui.showTriggered(tokenDoc, plan))
      .then((posted) => posted && this.#markTriggerPosted(tokenDoc))
      .catch((err) => console.error('pf2e-hazarder |', err));
  }

  #markTriggerPosted(tokenDoc) {
    return this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      const state = this.store.getOrCreateState(tokenDoc, plan);
      await this.store.setState(tokenDoc, { ...state, triggerPosted: true });
    });
  }

  /**
   * A hazard entering an encounter has just been triggered: offer the reaction that goes with it,
   * once per arming (a reset re-arms it). World setting: ask, always post, or never.
   */
  async offerTriggerReaction(tokenDoc) {
    if (!this.isWriter()) return false;
    const mode = game.settings.get(MODULE_ID, 'triggerReaction') ?? 'ask';
    if (mode === 'never') return false;
    const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
    if (!plan.reactionItemId) return false;
    const state = this.store.getOrCreateState(tokenDoc, plan);
    if (state.triggerPosted || state.status === STATUS.DISABLED) return false;
    const posted = await this.ui.offerTriggerReaction(tokenDoc, plan, { ask: mode !== 'always' });
    if (posted) await this.#markTriggerPosted(tokenDoc);
    return !!posted;
  }

  #warnRank(events, plan, r) {
    const e = events.find((ev) => ev.reason === 'rank-too-low');
    if (!e) return;
    const disable = plan.components
      .find((c) => c.id === e.instanceKey.split(':')[0])
      ?.disables.find((d) => d.id === e.disableId);
    this.ui.warn?.(
      game.i18n.format('PF2E_HAZARDER.Tracker.RankTooLow', {
        actor: r.actorName ?? '?',
        rank: game.i18n.localize(`PF2E_HAZARDER.Rank.${RANKS[e.minRank]}`),
        skill: disable ? skillLabel(disable.skill) : '',
      }),
    );
  }

  async #afterEvents(tokenDoc, events) {
    for (const e of events) {
      if (e.type !== 'hazardDisabled') continue;
      this.ui.notify(game.i18n.format('PF2E_HAZARDER.Disabled', { name: tokenDoc.name }));
      if (game.settings.get(MODULE_ID, 'removeDisabledFromCombat')) {
        const combatant = game.combat?.combatants?.find((c) => c.tokenId === tokenDoc.id);
        if (combatant) await combatant.delete();
      }
    }
  }

  async startHazard(tokenDoc, { tracker = true } = {}) {
    return this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      const state = Engine.activate(this.store.getOrCreateState(tokenDoc, plan));
      await this.store.setState(tokenDoc, state);
      if (tracker) await this.ui.upsertTracker(tokenDoc);
      return state;
    });
  }

  async undo(tokenDoc) {
    return this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      await this.store.setState(
        tokenDoc,
        Engine.undo(this.store.getOrCreateState(tokenDoc, plan), plan),
      );
      await this.ui.upsertTracker(tokenDoc);
    });
  }

  async reset(tokenDoc) {
    return this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      await this.store.setState(
        tokenDoc,
        Engine.reset(this.store.getOrCreateState(tokenDoc, plan), plan),
      );
      await this.ui.upsertTracker(tokenDoc);
    });
  }

  /** GM marks one part destroyed or disabled outright (or puts it back). */
  async toggleDisabled(tokenDoc, instanceKey) {
    return this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      const state = this.store.getOrCreateState(tokenDoc, plan);
      const inst = state.instances.find(
        (i) => Engine.instanceKey(i.componentId, i.index) === instanceKey,
      );
      if (!inst) return;
      const { state: next, events } = Engine.override(state, plan, {
        instanceKey,
        disabled: !inst.disabled,
      });
      await this.store.setState(tokenDoc, next);
      await this.#afterEvents(tokenDoc, events);
      await this.ui.upsertTracker(tokenDoc);
    });
  }

  /** Every part at once: the hazard as a whole was broken or destroyed. */
  async disableAll(tokenDoc) {
    return this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      let state = this.store.getOrCreateState(tokenDoc, plan);
      const events = [];
      for (const inst of state.instances.filter((i) => !i.disabled)) {
        const result = Engine.override(state, plan, {
          instanceKey: Engine.instanceKey(inst.componentId, inst.index),
          disabled: true,
        });
        state = result.state;
        events.push(...result.events);
      }
      await this.store.setState(tokenDoc, state);
      await this.#afterEvents(tokenDoc, events);
      await this.ui.upsertTracker(tokenDoc);
    });
  }

  /**
   * Outside an encounter: put the disable tracker in chat without setting the hazard off. It stays
   * armed; a critical failure on a check still triggers it.
   */
  async showTracker(tokenDoc) {
    return this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      await this.store.setState(tokenDoc, this.store.getOrCreateState(tokenDoc, plan));
      // Asked for by hand: one already in chat is brought down to where the GM is looking.
      await this.ui.upsertTracker(tokenDoc, { bump: true });
    });
  }

  /**
   * The GM sets the hazard off by hand (someone walked into it): it becomes triggered and its
   * reaction is posted, with whatever that reaction needs. A simple hazard is nothing more.
   */
  async trigger(tokenDoc) {
    if (!this.isWriter()) return false;
    const { plan } = await this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      const state = this.store.getOrCreateState(tokenDoc, plan);
      const armed = state.status === STATUS.ARMED || state.status === STATUS.RESET;
      await this.store.setState(tokenDoc, armed ? { ...state, status: STATUS.TRIGGERED } : state);
      await this.ui.refreshTracker?.(tokenDoc);
      return { plan };
    });
    if (!plan.reactionItemId) {
      this.ui.warn?.(game.i18n.format('PF2E_HAZARDER.Hud.NoReaction', { name: tokenDoc.name }));
      return false;
    }
    const posted = await this.ui.offerTriggerReaction(tokenDoc, plan, { ask: false });
    if (posted) await this.#markTriggerPosted(tokenDoc);
    return !!posted;
  }

  #hpChecks = new Set();

  /**
   * The hazard took damage or was repaired: refresh its tracker's hit points, and when damage
   * takes it to its Broken Threshold or to 0, ask the GM whether that disables it.
   */
  async handleHpChange(tokenDoc) {
    if (!this.isWriter() || !tokenDoc?.actor || this.#hpChecks.has(tokenDoc.id)) return;
    const state = this.store.getState(tokenDoc);
    if (!state) return;
    this.#hpChecks.add(tokenDoc.id);
    try {
      const next = hpStage(tokenDoc.actor.system?.attributes?.hp);
      const prev = tokenDoc.getFlag(MODULE_ID, 'hpStage') ?? 'ok';
      if (next !== prev) await tokenDoc.setFlag(MODULE_ID, 'hpStage', next);
      await this.ui.refreshTracker?.(tokenDoc);
      if (!stageWorsened(prev, next) || state.status === STATUS.DISABLED) return;
      if (await this.ui.confirmHpDisable(tokenDoc, next)) await this.disableAll(tokenDoc);
    } finally {
      this.#hpChecks.delete(tokenDoc.id);
    }
  }

  async overridePip(tokenDoc, instanceKey, disableId) {
    const { events, plan } = (await this.#enqueue(tokenDoc, async () => {
      const { plan } = this.store.getOrDraftPlan(tokenDoc.actor);
      const state = this.store.getOrCreateState(tokenDoc, plan);
      const inst = state.instances.find(
        (i) => Engine.instanceKey(i.componentId, i.index) === instanceKey,
      );
      const comp = plan.components.find((c) => c.id === inst?.componentId);
      const disable = comp?.disables.find((d) => d.id === disableId);
      if (!inst || !disable) return null;
      // Click fills the next pip; clicking a full row (or a full shared pool) empties this option.
      const have = inst.progress[disableId] ?? 0;
      const progress = have >= Engine.optionCap(comp, inst.progress, disableId) ? 0 : have + 1;
      const disabled = Engine.meetsDisable(comp, { ...inst.progress, [disableId]: progress });
      const { state: next, events } = Engine.override(state, plan, {
        instanceKey,
        disableId,
        progress,
        disabled,
      });
      await this.store.setState(tokenDoc, next);
      await this.#afterEvents(tokenDoc, events);
      await this.ui.upsertTracker(tokenDoc);
      return { events, plan };
    })) ?? { events: [] };
    if (events.some((e) => e.type === 'hazardTriggered')) this.#promptTriggered(tokenDoc, plan);
  }
}

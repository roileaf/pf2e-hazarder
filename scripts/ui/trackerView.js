import { RANKS } from '../constants.js';
import {
  actionsRemaining,
  instanceKey,
  optionCap,
  poolOf,
  poolTotal,
  sharedNeed,
} from '../services/RulesEngine.js';

const humanise = (slug) =>
  String(slug)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export function skillLabel(skill) {
  const configured = globalThis.CONFIG?.PF2E?.skills?.[skill]?.label;
  return configured ? game.i18n.localize(configured) : humanise(skill);
}

function extraLabel(label, skill, shownSkill) {
  if (!label) return null;
  const l = label.trim().toLowerCase();
  return l === skill.toLowerCase() || l === shownSkill.toLowerCase() ? null : label;
}

function buildActions(state, plan) {
  if (plan.actionsPerTurn == null) return null;
  const total = plan.actionsPerTurn;
  const remaining = actionsRemaining(state, plan);
  return {
    remaining,
    total,
    pips: Array.from({ length: total }, (_, i) => ({ spent: i >= remaining })),
  };
}

// Heads a group of options that earn successes together ("2 / 3 successes between Nature / Occultism").
function groupHead(component, disable, progress) {
  const { members, need } = poolOf(component, disable);
  const have = Math.min(need, poolTotal(members, progress));
  return {
    have,
    need,
    text: game.i18n.format('PF2E_HAZARDER.Tracker.GroupTotal', {
      have,
      need,
      skills: members.map((m) => skillLabel(m.skill)).join(' / '),
    }),
  };
}

function sharedView(progress, need) {
  const have = Math.min(
    need,
    Object.values(progress ?? {}).reduce((a, n) => a + (n ?? 0), 0),
  );
  return {
    have,
    need,
    text: game.i18n.format('PF2E_HAZARDER.Tracker.AnyCombination', { have, need }),
  };
}

export function buildTrackerView({ name, plan, state, isGM }) {
  // A hazard that is one thing gets its "destroyed" toggle in the footer; one with several parts
  // gets a toggle on each part.
  const solo = state.instances.length === 1 ? state.instances[0] : null;
  const components = plan.components.map((c) => {
    const shared = sharedNeed(c);
    const instances = state.instances
      .filter((i) => i.componentId === c.id)
      .map((inst) => ({
        key: instanceKey(c.id, inst.index),
        label: c.count > 1 ? `${c.name} ${inst.index + 1}` : c.name,
        showLabel: c.count > 1,
        disabled: inst.disabled,
        showToggle: !solo,
        hasRow: c.count > 1 || inst.disabled || !solo,
        // A header row that exists only for the GM's toggle is dropped for players.
        gmOnlyRow: !(c.count > 1 || inst.disabled),
        shared: shared != null ? sharedView(inst.progress, shared) : null,
        options: c.disables.map((d) => {
          const have = inst.progress?.[d.id] ?? 0;
          const grouped = shared == null && !!d.group;
          // Pooled: this option's own successes plus the slots still open to its pool.
          const need =
            shared != null || grouped
              ? optionCap(c, inst.progress, d.id)
              : (d.successesNeeded ?? 1);
          const heads = grouped && c.disables.find((m) => m.group === d.group).id === d.id;
          const shownSkill = skillLabel(d.skill);
          return {
            disableId: d.id,
            label: d.label,
            skill: d.skill,
            skillLabel: shownSkill,
            extraLabel: extraLabel(d.label, d.skill, shownSkill),
            dc: d.dc,
            dcText:
              d.dc != null ? game.i18n.format('PF2E_HAZARDER.Tracker.DC', { dc: d.dc }) : null,
            rankText: d.minRank
              ? game.i18n.localize(`PF2E_HAZARDER.Rank.${RANKS[d.minRank]}`)
              : null,
            grouped,
            groupHead: heads ? groupHead(c, d, inst.progress) : null,
            have,
            need,
            pips: Array.from({ length: need }, (_, i) => ({ filled: i < have })),
          };
        }),
      }));
    const counteract = c.counteract
      ? game.i18n.format('PF2E_HAZARDER.Tracker.Counteract', {
          spell: c.counteract.name,
          rank: c.counteract.rank ?? '?',
          dc: c.counteract.dc ?? '?',
        })
      : null;
    return {
      name: c.name,
      showHeading: plan.components.length > 1,
      counteract,
      counteractUuid: c.counteract?.spellUuid ?? null,
      instances,
    };
  });
  return {
    title: game.i18n.format('PF2E_HAZARDER.Tracker.Title', { name }),
    name,
    status: state.status,
    statusLabel: game.i18n.localize(`PF2E_HAZARDER.Status.${state.status}`),
    actions: buildActions(state, plan),
    empty: plan.components.every((c) => c.disables.length === 0),
    components,
    solo: solo ? { key: instanceKey(solo.componentId, solo.index), disabled: solo.disabled } : null,
    isGM,
  };
}

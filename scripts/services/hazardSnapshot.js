import { STATUS } from '../constants.js';
import { instanceKey, optionCap, poolOf } from './RulesEngine.js';

/**
 * A hazard token as other modules see it: its status and every disable option still open, one
 * entry per component instance. Plain data; safe to keep or diff.
 */
export function hazardSnapshot({ tokenDoc, plan, state, showDC = true }) {
  const options = [];
  for (const component of plan.components ?? []) {
    for (const inst of state.instances.filter((i) => i.componentId === component.id)) {
      if (inst.disabled) continue;
      for (const disable of component.disables) {
        const have = inst.progress?.[disable.id] ?? 0;
        const { members } = poolOf(component, disable);
        options.push({
          instanceKey: instanceKey(component.id, inst.index),
          // Null when the hazard is a single thing; "mannequin 2" when it has several parts.
          instanceLabel: component.count > 1 ? `${component.name} ${inst.index + 1}` : null,
          disableId: disable.id,
          skill: disable.skill,
          label: disable.label ?? disable.skill,
          dc: showDC ? (disable.dc ?? null) : null,
          minRank: disable.minRank ?? null,
          traits: [...(disable.traits ?? [])],
          have,
          // Successes this option can still add before it (or the pool it shares) is complete.
          successesLeft: Math.max(0, optionCap(component, inst.progress, disable.id) - have),
          // Other options on this instance whose successes count toward the same total.
          pooledWith: members.filter((m) => m.id !== disable.id).map((m) => m.id),
        });
      }
    }
  }
  return {
    tokenUuid: tokenDoc.uuid,
    tokenId: tokenDoc.id,
    name: tokenDoc.name,
    status: state.status,
    disabled: state.status === STATUS.DISABLED,
    options,
  };
}

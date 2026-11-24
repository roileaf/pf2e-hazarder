/**
 * The tracker as a player sees it: how many successes each option has, never how many it needs,
 * and nothing of how many actions the hazard has. The card is rendered by the GM with all of it,
 * so the action pool, the empty pips and the "2 / 3" totals are taken out here. Options that share
 * a total keep a line saying what has been earned so far.
 */
export function hideTrackerSecrets(root) {
  root.querySelectorAll('.hz-tracker .hz-pool').forEach((pool) => pool.remove());
  for (const pips of root.querySelectorAll('.hz-tracker .hz-pips')) {
    pips.querySelectorAll('.hz-pip:not(.filled)').forEach((pip) => pip.remove());
    delete pips.dataset.tooltip;
    pips.removeAttribute('data-tooltip');
  }
  for (const total of root.querySelectorAll('.hz-tracker .hz-shared')) {
    total.removeAttribute('data-tooltip');
    const text = total.dataset.playerText;
    if (text == null) continue;
    const icon = total.querySelector('i');
    total.replaceChildren(...(icon ? [icon, ' '] : []), text);
  }
}

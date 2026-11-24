const BUTTONS = [
  { action: 'trigger', icon: 'fa-solid fa-bolt', label: 'PF2E_HAZARDER.Hud.Trigger' },
  { action: 'tracker', icon: 'fa-solid fa-screwdriver-wrench', label: 'PF2E_HAZARDER.Hud.Tracker' },
];

/**
 * GM buttons on a hazard token's HUD, so a hazard can be run without an encounter: fire its
 * reaction (a simple trap is nothing more), or put its disable tracker in chat for the party.
 */
export function decorateTokenHud(runner, hud, html) {
  const tokenDoc = hud?.object?.document;
  if (!game.user.isGM || tokenDoc?.actor?.type !== 'hazard') return;
  const root = html?.jquery ? html[0] : html;
  const column = root?.querySelector?.('.col.right');
  if (!column || column.querySelector('.hz-hud')) return;
  for (const { action, icon, label } of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'control-icon hz-hud';
    button.dataset.hzHud = action;
    button.dataset.tooltip = game.i18n.localize(label);
    button.setAttribute('aria-label', game.i18n.localize(label));
    button.innerHTML = `<i class="${icon}"></i>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!runner.isWriter()) {
        ui.notifications.warn(game.i18n.localize('PF2E_HAZARDER.Errors.NotActiveGM'));
        return;
      }
      const run = action === 'trigger' ? runner.trigger(tokenDoc) : runner.showTracker(tokenDoc);
      Promise.resolve(run)
        // The tracker may be off screen in a scrolled-up log: go to it.
        .then(() => ui.chat?.scrollBottom?.())
        .catch((err) => console.error('pf2e-hazarder |', err));
    });
    column.append(button);
  }
}

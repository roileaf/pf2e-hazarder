import { hideTrackerSecrets } from '../../scripts/ui/trackerDom.js';

test('players see the successes earned, not how many are needed', () => {
  document.body.innerHTML = `
    <div class="hazarder-card hz-tracker">
      <div class="hz-pool"><span class="hz-action-pip">1</span><span class="hz-action-pip lost">1</span></div>
      <div class="hz-shared" data-tooltip="1 / 3" data-player-text="1 success so far"><i class="fa-solid fa-shuffle"></i> 1 / 3 successes, any combination</div>
      <div class="hz-option">
        <span class="hz-pips" data-tooltip="1 / 3">
          <span class="hz-pip filled"></span><span class="hz-pip"></span><span class="hz-pip"></span>
        </span>
      </div>
      <div class="hz-option">
        <span class="hz-pips" data-tooltip="0 / 2"><span class="hz-pip"></span><span class="hz-pip"></span></span>
      </div>
    </div>`;
  hideTrackerSecrets(document.body);
  expect(document.querySelector('.hz-pool')).toBeNull();
  const [first, second] = document.querySelectorAll('.hz-pips');
  expect(first.querySelectorAll('.hz-pip')).toHaveLength(1);
  expect(first.querySelectorAll('.hz-pip.filled')).toHaveLength(1);
  expect(second.querySelectorAll('.hz-pip')).toHaveLength(0);
  expect(first.hasAttribute('data-tooltip')).toBe(false);
  const shared = document.querySelector('.hz-shared');
  expect(shared.hasAttribute('data-tooltip')).toBe(false);
  expect(shared.textContent.trim()).toBe('1 success so far');
  expect(shared.querySelector('i')).not.toBeNull();
  expect(document.body.textContent).not.toContain('3');
});

test('other cards are left alone', () => {
  document.body.innerHTML =
    '<div class="hazarder-card hz-turn"><span class="hz-pips"><span class="hz-pip"></span></span></div>';
  hideTrackerSecrets(document.body);
  expect(document.querySelectorAll('.hz-pip')).toHaveLength(1);
});

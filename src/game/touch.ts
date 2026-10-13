import type { InputState } from './input';

/**
 * DOM-based touch overlay with separate controls: rotate-left / rotate-right /
 * THRUST buttons on the left, FIRE and BRAKE on the right. Pointer events with
 * per-button pointerId tracking keep all actions simultaneous. Attached only
 * when touch capability exists.
 */
export class TouchControls {
  private root: HTMLDivElement | null = null;
  private buttons: { el: HTMLButtonElement; pointers: Set<number> }[] = [];
  private input: InputState;

  constructor(input: InputState) {
    this.input = input;
  }

  private bindButton(
    el: HTMLButtonElement,
    on: () => void,
    off: () => void
  ): void {
    const state = { el, pointers: new Set<number>() };
    this.buttons.push(state);
    const down = (e: PointerEvent): void => {
      state.pointers.add(e.pointerId);
      on();
      el.classList.add('tc-button-active');
      e.preventDefault();
    };
    const up = (e: PointerEvent): void => {
      state.pointers.delete(e.pointerId);
      if (state.pointers.size === 0) {
        off();
        el.classList.remove('tc-button-active');
      }
    };
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  /** Mounts the overlay and hooks events. Returns false if no touch device. */
  attach(root: HTMLElement): boolean {
    const isTouch =
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
    if (!isTouch) return false;

    const el = document.createElement('div');
    el.className = 'tc-root';
    el.innerHTML = `
      <div class="tc-left">
        <button class="tc-button tc-thrust" type="button" aria-label="Thrust">THRUST</button>
        <div class="tc-rotate-row">
          <button class="tc-button tc-rotate" type="button" aria-label="Rotate left">&#9664;</button>
          <button class="tc-button tc-rotate" type="button" aria-label="Rotate right">&#9654;</button>
        </div>
      </div>
      <div class="tc-buttons">
        <button class="tc-button tc-brake" type="button" aria-label="Brake">BRAKE</button>
        <button class="tc-button tc-fire" type="button" aria-label="Fire">FIRE</button>
      </div>
    `;
    root.appendChild(el);
    this.root = el;

    const thrust = el.querySelector<HTMLButtonElement>('.tc-thrust');
    const rotateButtons = el.querySelectorAll<HTMLButtonElement>('.tc-rotate');
    const brake = el.querySelector<HTMLButtonElement>('.tc-brake');
    const fire = el.querySelector<HTMLButtonElement>('.tc-fire');
    if (!thrust || !brake || !fire || rotateButtons.length < 2) return false;

    this.bindButton(thrust, () => this.input.setVirtualThrust(true), () =>
      this.input.setVirtualThrust(false)
    );
    this.bindButton(rotateButtons[0], () => this.input.setVirtualRotate(-1), () =>
      this.input.setVirtualRotate(0)
    );
    this.bindButton(rotateButtons[1], () => this.input.setVirtualRotate(1), () =>
      this.input.setVirtualRotate(0)
    );
    this.bindButton(brake, () => this.input.setVirtualBrake(true), () =>
      this.input.setVirtualBrake(false)
    );
    this.bindButton(fire, () => this.input.setVirtualFire(true), () =>
      this.input.setVirtualFire(false)
    );

    // Block default gestures without breaking multi-touch routing
    el.addEventListener('touchstart', (e) => e.preventDefault(), {
      passive: false,
    });
    return true;
  }

  detach(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.buttons = [];
    this.input.clearVirtual();
  }
}

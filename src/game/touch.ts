import type { InputState } from './input';

/**
 * DOM-based touch overlay: rotate buttons + THRUST on the left, BRAKE + FIRE
 * on the right. A drag gesture pad behind the left cluster lets the left thumb
 * steer without buttons: drag left/right to rotate, drag up to thrust. Pointer
 * events with per-button pointerId tracking keep all actions simultaneous.
 * Attached only when touch capability exists.
 */
export class TouchControls {
  private root: HTMLDivElement | null = null;
  private buttons: { el: HTMLButtonElement; pointers: Set<number> }[] = [];
  private stickPointer: number | null = null;
  private stickBase: HTMLDivElement | null = null;
  private stickKnob: HTMLDivElement | null = null;
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

  private bindStick(zone: HTMLDivElement): void {
    const base = zone.querySelector<HTMLDivElement>('.tc-stick-base');
    const knob = zone.querySelector<HTMLDivElement>('.tc-stick-knob');
    if (!base || !knob) return;
    this.stickBase = base;
    this.stickKnob = knob;

    const MAX_R = 44;
    const ROTATE_DEADZONE = 14;
    const THRUST_DEADZONE = 20;

    const reset = (): void => {
      this.stickPointer = null;
      base.style.opacity = '0';
      this.input.setVirtualRotate(0);
      this.input.setVirtualThrust(false);
    };

    zone.addEventListener(
      'pointerdown',
      (e) => {
        if (this.stickPointer !== null) return;
        this.stickPointer = e.pointerId;
        zone.setPointerCapture(e.pointerId);
        base.style.left = `${e.clientX}px`;
        base.style.top = `${e.clientY}px`;
        base.style.opacity = '1';
        knob.style.transform = 'translate(-50%, -50%)';
        e.preventDefault();
      },
      { passive: false }
    );

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointer || !this.stickBase || !this.stickKnob) return;
      const rect = this.stickBase.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > MAX_R) {
        dx = (dx / len) * MAX_R;
        dy = (dy / len) * MAX_R;
      }
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.input.setVirtualRotate(
        Math.abs(dx) < ROTATE_DEADZONE ? 0 : Math.sign(dx)
      );
      this.input.setVirtualThrust(dy < -THRUST_DEADZONE);
    });

    zone.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.stickPointer) reset();
    });
    zone.addEventListener('pointercancel', (e) => {
      if (e.pointerId === this.stickPointer) reset();
    });
  }

  /** Mounts the overlay and hooks events. Returns false if no touch device. */
  attach(root: HTMLElement): boolean {
    const isTouch =
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
    if (!isTouch) return false;

    const el = document.createElement('div');
    el.className = 'tc-root';
    el.innerHTML = `
      <div class="tc-stick-zone">
        <div class="tc-stick-base"><div class="tc-stick-knob"></div></div>
      </div>
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
    const stickZone = el.querySelector<HTMLDivElement>('.tc-stick-zone');
    if (!thrust || !brake || !fire || !stickZone || rotateButtons.length < 2)
      return false;

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
    this.bindStick(stickZone);

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
    this.stickPointer = null;
    this.stickBase = null;
    this.stickKnob = null;
    this.input.clearVirtual();
  }
}

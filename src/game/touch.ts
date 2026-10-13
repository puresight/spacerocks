import type { InputState } from './input';

const JOYSTICK_MAX_RADIUS = 56;
const ROTATE_DEAD_ZONE = 0.18;
const THRUST_MIN_DY = 26;

/**
 * DOM-based touch overlay: floating joystick on the left half, FIRE and BRAKE
 * buttons on the right. Pointer events with pointerId tracking keep steering,
 * thrust, and fire simultaneous. Attached only when touch capability exists.
 */
export class TouchControls {
  private root: HTMLDivElement | null = null;
  private joystickZone: HTMLDivElement | null = null;
  private joystickBase: HTMLDivElement | null = null;
  private joystickKnob: HTMLDivElement | null = null;
  private fireButton: HTMLButtonElement | null = null;
  private brakeButton: HTMLButtonElement | null = null;

  private joystickPointerId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private firePointerIds = new Set<number>();
  private brakePointerIds = new Set<number>();

  constructor(private input: InputState) {}

  private onPointerDown = (e: PointerEvent): void => {
    if (this.joystickPointerId !== null) return;
    this.joystickPointerId = e.pointerId;
    this.joystickOrigin = { x: e.clientX, y: e.clientY };
    this.showJoystick(e.clientX, e.clientY);
    this.joystickZone?.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.joystickPointerId) return;
    const dx = e.clientX - this.joystickOrigin.x;
    const dy = e.clientY - this.joystickOrigin.y;

    const dist = Math.hypot(dx, dy);
    const scale = dist > JOYSTICK_MAX_RADIUS ? JOYSTICK_MAX_RADIUS / dist : 1;
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
    }

    const normX = dx / JOYSTICK_MAX_RADIUS;
    const rotate = Math.abs(normX) > ROTATE_DEAD_ZONE ? normX : 0;
    this.input.setVirtualRotate(Math.max(-1, Math.min(1, rotate)));
    this.input.setVirtualThrust(dy < -THRUST_MIN_DY);
    e.preventDefault();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.joystickPointerId) return;
    this.joystickPointerId = null;
    this.hideJoystick();
    this.input.setVirtualRotate(0);
    this.input.setVirtualThrust(false);
  };

  private onFireDown = (e: PointerEvent): void => {
    this.firePointerIds.add(e.pointerId);
    this.input.setVirtualFire(true);
    this.fireButton?.classList.add('tc-button-active');
    e.preventDefault();
  };

  private onFireUp = (e: PointerEvent): void => {
    this.firePointerIds.delete(e.pointerId);
    if (this.firePointerIds.size === 0) {
      this.input.setVirtualFire(false);
      this.fireButton?.classList.remove('tc-button-active');
    }
  };

  private onBrakeDown = (e: PointerEvent): void => {
    this.brakePointerIds.add(e.pointerId);
    this.input.setVirtualBrake(true);
    this.brakeButton?.classList.add('tc-button-active');
    e.preventDefault();
  };

  private onBrakeUp = (e: PointerEvent): void => {
    this.brakePointerIds.delete(e.pointerId);
    if (this.brakePointerIds.size === 0) {
      this.input.setVirtualBrake(false);
      this.brakeButton?.classList.remove('tc-button-active');
    }
  };

  private onRootPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId === this.joystickPointerId) this.onPointerUp(e);
    this.onFireUp(e);
    this.onBrakeUp(e);
  };

  private showJoystick(x: number, y: number): void {
    if (!this.joystickBase || !this.joystickKnob) return;
    this.joystickBase.style.left = `${x}px`;
    this.joystickBase.style.top = `${y}px`;
    this.joystickBase.style.opacity = '0.5';
    this.joystickKnob.style.opacity = '0.8';
    this.joystickKnob.style.transform = 'translate(-50%, -50%)';
  }

  private hideJoystick(): void {
    if (!this.joystickBase || !this.joystickKnob) return;
    this.joystickBase.style.opacity = '0';
    this.joystickKnob.style.opacity = '0';
  }

  /** Mounts the overlay and hooks events. Returns false if no touch device. */
  attach(root: HTMLElement): boolean {
    const isTouch =
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
    if (!isTouch) return false;

    const el = document.createElement('div');
    el.className = 'tc-root';
    el.innerHTML = `
      <div class="tc-joystick-zone">
        <div class="tc-joystick-base"><div class="tc-joystick-knob"></div></div>
      </div>
      <div class="tc-buttons">
        <button class="tc-button tc-brake" type="button" aria-label="Brake">BRAKE</button>
        <button class="tc-button tc-fire" type="button" aria-label="Fire">FIRE</button>
      </div>
    `;
    root.appendChild(el);
    this.root = el;
    this.joystickZone = el.querySelector('.tc-joystick-zone');
    this.joystickBase = el.querySelector('.tc-joystick-base');
    this.joystickKnob = el.querySelector('.tc-joystick-knob');
    this.fireButton = el.querySelector('.tc-fire');
    this.brakeButton = el.querySelector('.tc-brake');
    const zone = this.joystickZone;
    const fire = this.fireButton;
    const brake = this.brakeButton;
    if (!zone || !fire || !brake) return false;

    zone.addEventListener('pointerdown', this.onPointerDown, {
      passive: false,
    });
    zone.addEventListener('pointermove', this.onPointerMove, {
      passive: false,
    });
    el.addEventListener('pointerup', this.onRootPointerEnd);
    el.addEventListener('pointercancel', this.onRootPointerEnd);

    fire.addEventListener('pointerdown', this.onFireDown, {
      passive: false,
    });
    brake.addEventListener('pointerdown', this.onBrakeDown, {
      passive: false,
    });

    // Block default gestures without breaking multi-touch routing
    el.addEventListener('touchstart', (e) => e.preventDefault(), {
      passive: false,
    });
    return true;
  }

  detach(): void {
    if (!this.root) return;
    this.joystickZone?.removeEventListener('pointerdown', this.onPointerDown);
    this.joystickZone?.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onRootPointerEnd);
    this.root.removeEventListener('pointercancel', this.onRootPointerEnd);
    this.fireButton?.removeEventListener('pointerdown', this.onFireDown);
    this.brakeButton?.removeEventListener('pointerdown', this.onBrakeDown);
    this.root.remove();
    this.root = null;
    this.joystickZone = null;
    this.joystickBase = null;
    this.joystickKnob = null;
    this.fireButton = null;
    this.brakeButton = null;
    this.firePointerIds.clear();
    this.brakePointerIds.clear();
    this.joystickPointerId = null;
    this.input.clearVirtual();
  }
}

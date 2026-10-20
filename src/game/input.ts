import type { GamepadSnapshot } from './gamepad';

export class InputState {
  private down = new Set<string>();
  private virtual = { rotate: 0, thrust: false, fire: false, brake: false };
  private pad: GamepadSnapshot = {
    connected: false,
    rotateAxis: 0,
    thrust: false,
    fire: false,
    brake: false,
    start: false,
    active: false,
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.down.add(e.code);
    if (
      e.code === 'Space' ||
      e.code === 'ShiftLeft' ||
      e.code === 'ShiftRight' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onBlur = () => {
    this.down.clear();
  };

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.down.clear();
    this.clearVirtual();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  // Virtual (touch) control state, written by the on-screen controls
  setVirtualRotate(v: number): void {
    this.virtual.rotate = Math.max(-1, Math.min(1, v));
  }

  setVirtualThrust(on: boolean): void {
    this.virtual.thrust = on;
  }

  setVirtualFire(on: boolean): void {
    this.virtual.fire = on;
  }

  setVirtualBrake(on: boolean): void {
    this.virtual.brake = on;
  }

  // Gamepad snapshot, written by the engine loop each animation frame
  setGamepad(pad: GamepadSnapshot): void {
    this.pad = pad;
  }

  clearVirtual(): void {
    this.virtual.rotate = 0;
    this.virtual.thrust = false;
    this.virtual.fire = false;
    this.virtual.brake = false;
  }

  // Combined steering axis: keyboard, analog touch and gamepad stick merged
  get rotateAxis(): number {
    let axis = this.pad.rotateAxis + this.virtual.rotate;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) axis -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) axis += 1;
    return Math.max(-1, Math.min(1, axis));
  }

  get thrust(): boolean {
    return (
      this.pad.thrust ||
      this.virtual.thrust ||
      this.isDown('KeyW') ||
      this.isDown('ArrowUp') ||
      this.isDown('ShiftLeft') ||
      this.isDown('ShiftRight')
    );
  }

  get fire(): boolean {
    return this.pad.fire || this.virtual.fire || this.isDown('Space');
  }

  get brake(): boolean {
    return this.pad.brake || this.virtual.brake;
  }

  get restart(): boolean {
    return this.pad.start || this.isDown('KeyR') || this.isDown('Enter');
  }

  /** True when any non-Escape input is held (keyboard, touch, or gamepad). */
  get anyInput(): boolean {
    if (this.pad.active || this.virtual.thrust || this.virtual.fire || this.virtual.brake) {
      return true;
    }
    if (this.virtual.rotate !== 0) return true;
    for (const code of this.down) {
      if (code !== 'Escape') return true;
    }
    return false;
  }
}

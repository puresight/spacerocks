/**
 * Gamepad API support: first standard-mapped controller, polled manually
 * from the engine ticker. Analog axes get a 0.15 deadzone rescaled
 * smoothly to the full 0..1 range so light drift never rotates the ship.
 */
const DEADZONE = 0.15;

function deadzone(v: number): number {
  if (Math.abs(v) < DEADZONE) return 0;
  return Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

export interface GamepadSnapshot {
  connected: boolean;
  /** Analog rotation in -1..1, proportional to stick deflection. */
  rotateAxis: number;
  thrust: boolean;
  fire: boolean;
  brake: boolean;
  start: boolean;
  /** True when the player is actively using the pad this poll. */
  active: boolean;
}

function emptySnapshot(): GamepadSnapshot {
  return {
    connected: false,
    rotateAxis: 0,
    thrust: false,
    fire: false,
    brake: false,
    start: false,
    active: false,
  };
}

export class GamepadInput {
  private index: number | null = null;

  private onConnect = (e: Event): void => {
    const gp = (e as GamepadEvent).gamepad;
    if (gp.mapping === 'standard') this.index = gp.index;
  };

  private onDisconnect = (e: Event): void => {
    if ((e as GamepadEvent).gamepad.index === this.index) {
      this.index = null;
    }
  };

  attach(): void {
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
    // Chrome only fires the connect event after the first button press;
    // scan for pads that are already paired so reconnects work instantly.
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (gp && gp.mapping === 'standard') {
        this.index = gp.index;
        break;
      }
    }
  }

  detach(): void {
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
    this.index = null;
  }

  /** Called once per animation frame from the main loop. */
  poll(): GamepadSnapshot {
    const next = emptySnapshot();
    if (this.index !== null) {
      const gp = navigator.getGamepads?.()[this.index];
      if (gp && gp.connected && gp.mapping === 'standard') {
        next.connected = true;
        const btn = (i: number): boolean => !!gp.buttons[i]?.pressed;
        let axis = deadzone(gp.axes[0] ?? 0);
        if (btn(14)) axis -= 1;
        if (btn(15)) axis += 1;
        next.rotateAxis = Math.max(-1, Math.min(1, axis));
        next.thrust =
          (gp.axes[1] ?? 0) < -DEADZONE || btn(12) || btn(0) || btn(7);
        next.fire = btn(1) || btn(5) || btn(7);
        next.brake = btn(6);
        next.start = btn(9);
        next.active =
          next.rotateAxis !== 0 ||
          next.thrust ||
          next.fire ||
          next.brake ||
          next.start;
      } else {
        this.index = null;
      }
    }
    return next;
  }
}

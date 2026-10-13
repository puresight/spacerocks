export class InputState {
  private down = new Set<string>();

  private onKeyDown = (e: KeyboardEvent) => {
    this.down.add(e.code);
    if (
      e.code === 'Space' ||
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
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  get rotateLeft(): boolean {
    return this.isDown('KeyA') || this.isDown('ArrowLeft');
  }

  get rotateRight(): boolean {
    return this.isDown('KeyD') || this.isDown('ArrowRight');
  }

  get thrust(): boolean {
    return this.isDown('KeyW') || this.isDown('ArrowUp');
  }

  get fire(): boolean {
    return this.isDown('Space');
  }

  get restart(): boolean {
    return this.isDown('KeyR') || this.isDown('Enter');
  }
}

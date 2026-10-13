import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, SCORE } from './config';

export class Hud {
  readonly view = new Container();

  private scoreText: Text;
  private livesText: Text;
  private waveText: Text;

  private overlay: Graphics;
  private overlayTitle: Text;
  private overlaySub: Text;
  private overlayHint: Text;

  score = 0;
  lives = SCORE.startLives;
  wave = 1;

  constructor(width: number) {
    const style = {
      fontFamily: 'Courier New, monospace',
      fontSize: 22,
      fill: COLORS.hudText,
      fontWeight: 'bold' as const,
      letterSpacing: 2,
    };

    this.scoreText = new Text({ text: 'SCORE 0', style });
    this.livesText = new Text({ text: '', style });
    this.waveText = new Text({ text: 'WAVE 1', style });

    this.scoreText.position.set(24, 18);
    this.waveText.position.set(width / 2, 18);
    this.waveText.anchor.set(0.5, 0);
    this.livesText.position.set(width - 24, 18);
    this.livesText.anchor.set(1, 0);

    this.overlay = new Graphics();
    this.overlayTitle = new Text({
      text: '',
      style: {
        fontFamily: 'Courier New, monospace',
        fontSize: 56,
        fill: COLORS.title,
        fontWeight: 'bold',
        letterSpacing: 6,
      },
    });
    this.overlayTitle.anchor.set(0.5);
    this.overlaySub = new Text({
      text: '',
      style: {
        fontFamily: 'Courier New, monospace',
        fontSize: 24,
        fill: COLORS.overlayText,
        letterSpacing: 3,
      },
    });
    this.overlaySub.anchor.set(0.5);
    this.overlayHint = new Text({
      text: '',
      style: {
        fontFamily: 'Courier New, monospace',
        fontSize: 18,
        fill: COLORS.hudText,
        letterSpacing: 2,
      },
    });
    this.overlayHint.anchor.set(0.5);

    this.view.addChild(this.scoreText, this.waveText, this.livesText);
    this.view.addChild(this.overlay, this.overlayTitle, this.overlaySub, this.overlayHint);

    this.drawLives();
    this.hideOverlay();
  }

  resize(width: number, height: number): void {
    this.waveText.position.set(width / 2, 18);
    this.livesText.position.set(width - 24, 18);
    this.layoutOverlay(width, height);
  }

  private layoutOverlay(width: number, height: number): void {
    const cy = height / 2;
    this.overlayTitle.position.set(width / 2, cy - 60);
    this.overlaySub.position.set(width / 2, cy + 12);
    this.overlayHint.position.set(width / 2, cy + 70);
  }

  reset(): void {
    this.score = 0;
    this.lives = SCORE.startLives;
    this.wave = 1;
    this.scoreText.text = 'SCORE 0';
    this.setLives(SCORE.startLives);
    this.setWave(1);
  }

  addScore(points: number): void {
    this.score += points;
    this.scoreText.text = `SCORE ${this.score}`;
  }

  private drawLives(): void {
    // Simple triangle glyph per remaining life
    let s = '';
    for (let i = 0; i < this.lives; i++) s += '\u25B2 ';
    this.livesText.text = s.trim();
  }

  setLives(lives: number): void {
    this.lives = lives;
    this.drawLives();
  }

  setWave(wave: number): void {
    this.wave = wave;
    this.waveText.text = `WAVE ${wave}`;
  }

  showOverlay(title: string, sub: string, hint: string, width: number, height: number): void {
    this.layoutOverlay(width, height);
    const w = width;
    const h = height;
    this.overlay.clear();
    this.overlay.rect(0, 0, w, h).fill({ color: 0x05070c, alpha: 0.72 });
    this.overlayTitle.text = title;
    this.overlaySub.text = sub;
    this.overlayHint.text = hint;
    this.overlayTitle.visible = true;
    this.overlaySub.visible = true;
    this.overlayHint.visible = true;
  }

  hideOverlay(): void {
    this.overlay.clear();
    this.overlayTitle.visible = false;
    this.overlaySub.visible = false;
    this.overlayHint.visible = false;
  }
}

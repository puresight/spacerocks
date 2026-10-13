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
    if (this.overlayVisible) this.drawOverlayBg(width, height);
  }

  private overlayVisible = false;

  private drawOverlayBg(width: number, height: number): void {
    this.overlay.clear();
    this.overlay.rect(0, 0, width, height).fill({ color: 0x05070c, alpha: 0.72 });
  }

  private layoutOverlay(width: number, height: number): void {
    // Scale type down on narrow screens so centered text always fits
    const titleSize = Math.max(24, Math.min(56, width / 11));
    const subSize = Math.max(12, Math.min(24, width / 17));
    const hintSize = Math.max(10, Math.min(18, width / 24));
    this.overlayTitle.style.fontSize = titleSize;
    this.overlayTitle.style.letterSpacing = titleSize * 0.1;
    this.overlaySub.style.fontSize = subSize;
    this.overlaySub.style.letterSpacing = subSize * 0.12;
    this.overlaySub.style.wordWrap = true;
    this.overlaySub.style.wordWrapWidth = width * 0.88;
    this.overlaySub.style.lineHeight = subSize * 1.5;
    this.overlayHint.style.fontSize = hintSize;
    this.overlayHint.style.letterSpacing = hintSize * 0.11;
    this.overlayHint.style.wordWrap = true;
    this.overlayHint.style.wordWrapWidth = width * 0.88;

    const cy = height / 2;
    // blank line of breathing room between title and directions
    const gap = titleSize * 0.9;
    this.overlayTitle.position.set(width / 2, cy - titleSize * 1.1);
    this.overlaySub.position.set(width / 2, cy - titleSize * 1.1 + titleSize / 2 + gap + subSize);
    this.overlayHint.position.set(width / 2, cy - titleSize * 1.1 + titleSize / 2 + gap + subSize * 2.6 + hintSize * 1.6);
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
    this.drawOverlayBg(width, height);
    this.overlayTitle.text = title;
    this.overlaySub.text = sub;
    this.overlayHint.text = hint;
    this.overlayTitle.visible = true;
    this.overlaySub.visible = true;
    this.overlayHint.visible = true;
    this.overlayVisible = true;
  }

  hideOverlay(): void {
    this.overlay.clear();
    this.overlayTitle.visible = false;
    this.overlaySub.visible = false;
    this.overlayHint.visible = false;
    this.overlayVisible = false;
  }
}

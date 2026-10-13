import RAPIER from '@dimforge/rapier2d-compat';
import { Application, Container, Graphics } from 'pixi.js';
import { ASTEROID, BULLET, COLORS, MAX_STEPS_PER_FRAME, PHYSICS_HZ, SAFE_SPAWN_RADIUS, SCORE, SHIP, WORLD } from './config';
import { Hud } from './hud';
import { InputState } from './input';
import { initRapier } from './init';
import type { GameState, GameStateListener } from './state';
import { computeAsteroidInertia, computeAsteroidMass, computeShipInertia, genAsteroidPolygon, randRange, type Vec2 } from './utils';
import { TouchControls } from './touch';

type Body = RAPIER.RigidBody;

interface Entity {
  body: Body;
  view: Container;
  kind: 'ship' | 'asteroid' | 'bullet';
  sizeRank?: 0 | 1 | 2;
  polygon?: Vec2[];
  lifespan?: number;
}

const asteroidCollGroup = 0x0002;
const shipCollGroup = 0x0004;
const bulletCollGroup = 0x0001;

let nextEntityId = 1;

function makeEntityId(): number {
  return nextEntityId++;
}

export class GameEngine {
  private app = new Application();
  private world!: RAPIER.World;
  private hud!: Hud;
  private input = new InputState();
  private touch = new TouchControls(this.input);
  private entityLayer = new Container();
  private entities = new Map<number, Entity>();
  private ship: Entity | null = null;
  private bodiesToRemove: Body[] = [];
  private collidersToRemove: RAPIER.Collider[] = [];
  private collisionQueue: RAPIER.EventQueue | null = null;

  private accumulator = 0;
  private fireCooldown = 0;
  private invulnerability = 0;
  private respawnTimer = 0;
  private asteroidCount = 0;
  private extraLifeWatch = 0;

  private state: GameState = { phase: 'ready', wave: 1, score: 0, lives: 0 };
  private listeners = new Set<GameStateListener>();

  private worldWidth = 1280;
  private worldHeight = 720;
  private resizeHandler?: () => void;
  private visualViewportHandler?: () => void;

  async mount(container: HTMLElement): Promise<void> {
    await initRapier();
    this.world = new RAPIER.World(WORLD.gravity);
    this.collisionQueue = new RAPIER.EventQueue(true);

    await this.app.init({
      resizeTo: container,
      background: '#05070c',
      antialias: true,
      preference: 'webgpu',
      powerPreference: 'high-performance',
    });

    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }

    container.appendChild(this.app.canvas);
    this.worldWidth = this.app.screen.width;
    this.worldHeight = this.app.screen.height;

    this.app.stage.addChild(this.entityLayer);
    this.hud = new Hud(this.worldWidth);
    this.app.stage.addChild(this.hud.view);

    this.input.attach();
    this.touch.attach(container);
    this.app.ticker.add(this.update);
    this.resizeHandler = () => this.onResize();
    window.addEventListener('resize', this.resizeHandler);
    this.visualViewportHandler = () => this.onResize();
    window.visualViewport?.addEventListener('resize', this.visualViewportHandler);
    window.visualViewport?.addEventListener('scroll', this.visualViewportHandler);

    const isTouch =
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
    this.setState({ ...this.state, phase: 'ready', lives: 3, score: 0, wave: 1 });
    this.hud.showOverlay(
      'ASTEROIDS',
      isTouch
        ? 'TOUCH LEFT SIDE:\nDRAG TO TURN, PUSH UP TO FLY'
        : 'W A D / Arrows to move - SPACE to fire',
      isTouch ? 'TAP FIRE TO START' : 'PRESS ENTER TO START',
      this.worldWidth,
      this.worldHeight
    );
  }

  private destroyed = false;

  unmount(): void {
    this.destroyed = true;
    this.app.ticker.remove(this.update);
    this.input.detach();
    this.touch.detach();
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    if (this.visualViewportHandler) {
      window.visualViewport?.removeEventListener('resize', this.visualViewportHandler);
      window.visualViewport?.removeEventListener('scroll', this.visualViewportHandler);
    }
    if (!this.app.renderer) return;
    this.clearEntities();
    this.collisionQueue?.free();
    this.collisionQueue = null;
    this.app.destroy(true, { children: true });
  }

  onStateChange(listener: GameStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  startGame(): void {
    this.clearEntities();
    this.bodiesToRemove.length = 0;
    this.fireCooldown = 0;
    this.invulnerability = 0;
    this.respawnTimer = 0;
    this.extraLifeWatch = 0;
    this.gameoverAt = 0;
    this.setState({ phase: 'playing', wave: 1, score: 0, lives: SCORE.startLives });
    this.hud.reset();
    this.hud.hideOverlay();
    this.spawnShip();
    this.spawnWave(1);
  }

  private setState(next: GameState): void {
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }

  private clearEntities(): void {
    for (const e of this.entities.values()) {
      this.world.removeRigidBody(e.body);
      e.view.destroy({ children: true });
    }
    this.entities.clear();
    this.ship = null;
    this.asteroidCount = 0;
  }

  private onResize(): void {
    this.app.resize();
    this.worldWidth = this.app.screen.width;
    this.worldHeight = this.app.screen.height;
    this.hud.resize(this.worldWidth, this.worldHeight);
  }

  // ===== Update loop =====
  private update = (ticker: { deltaTime: number }): void => {
    this.checkStartInput();
    const clampedDelta = Math.min(ticker.deltaTime, 3);
    this.accumulator += clampedDelta / PHYSICS_HZ;

    let steps = 0;
    while (this.accumulator >= 1 / PHYSICS_HZ && steps < MAX_STEPS_PER_FRAME) {
      this.stepFixed(1 / PHYSICS_HZ);
      this.accumulator -= 1 / PHYSICS_HZ;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME && this.accumulator > 0.5) {
      this.accumulator = 0;
    }

    this.syncViews();
  };

  private stepFixed(dt: number): void {
    if (this.state.phase === 'playing') {
      this.handleShipControl(dt);
      this.handleFiring(dt);
      this.handleTimers(dt);
      this.wrapAll();
      this.world.step(this.collisionQueue!);
      this.handleCollisions();
      this.cleanupRemoved();
    }
  }

  // ===== Ship =====
  private spawnShip(): void {
    const cx = this.worldWidth / 2;
    const cy = this.worldHeight / 2;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(cx, cy)
        .setLinearDamping(SHIP.linearDamping)
        .setAngularDamping(SHIP.angularDamping)
    );
    body.setAdditionalMassProperties(
      SHIP.mass,
      { x: 0, y: 0 },
      computeShipInertia(),
      true
    );

    const view = new Container();
    const g = new Graphics();
    // classic vector ship: nose at +x
    g.moveTo(SHIP.radius * 1.25, 0)
      .lineTo(-SHIP.radius * 0.85, SHIP.radius * 0.8)
      .lineTo(-SHIP.radius * 0.45, 0)
      .lineTo(-SHIP.radius * 0.85, -SHIP.radius * 0.8)
      .closePath()
      .stroke({ width: 2, color: COLORS.ship, alpha: 1 });
    view.addChild(g);
    const flame = new Graphics();
    flame.visible = false;
    view.addChild(flame);
    view.label = 'ship';

    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.triangle(
        { x: SHIP.radius * 1.25, y: 0 },
        { x: -SHIP.radius * 0.85, y: SHIP.radius * 0.8 },
        { x: -SHIP.radius * 0.85, y: -SHIP.radius * 0.8 }
      )
        .setDensity(0)
        .setCollisionGroups((shipCollGroup << 16) | (asteroidCollGroup | shipCollGroup | bulletCollGroup))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    void collider;

    const e: Entity = { body, view, kind: 'ship', sizeRank: undefined };
    this.entities.set(makeEntityId(), e);
    this.entityLayer.addChild(view);
    this.ship = e;
    void collider;
    this.invulnerability = 2.0;
  }

  private handleShipControl(dt: number): void {
    if (!this.ship || this.respawnTimer > 0) return;
    const body = this.ship.body;
    const axis = this.input.rotateAxis;
    if (axis !== 0) {
      body.applyTorqueImpulse(axis * SHIP.torque * SHIP.angularInertia, true);
    }
    if (this.input.thrust) {
      const rot = body.rotation();
      const fx = Math.cos(rot);
      const fy = Math.sin(rot);
      body.applyImpulse({ x: fx * SHIP.thrust * dt, y: fy * SHIP.thrust * dt }, true);
      this.setFlameVisible(true);
    } else {
      this.setFlameVisible(false);
    }
    if (this.input.brake) {
      const lv = body.linvel();
      body.applyImpulse({ x: -lv.x * 0.08, y: -lv.y * 0.08 }, true);
      body.setAngvel(body.angvel() * 0.9, true);
    }
    // clamp max speed
    const lv = body.linvel();
    const speed = Math.hypot(lv.x, lv.y);
    if (speed > SHIP.maxLinearSpeed) {
      const s = SHIP.maxLinearSpeed / speed;
      body.setLinvel({ x: lv.x * s, y: lv.y * s }, true);
    }
    this.updateFlame(dt);
  }

  private flamePhase = 0;
  private updateFlame(dt: number): void {
    this.flamePhase += dt * 30;
  }

  private setFlameVisible(v: boolean): void {
    if (!this.ship) return;
    const flame = this.ship.view.children[1] as Graphics;
    flame.visible = v;
    if (v) this.drawFlame();
  }

  private drawFlame(): void {
    if (!this.ship) return;
    const flame = this.ship.view.children[1] as Graphics;
    flame.clear();
    const flick = 0.7 + 0.3 * Math.abs(Math.sin(this.flamePhase));
    const len = SHIP.radius * 1.5 * flick;
    flame
      .moveTo(-SHIP.radius * 0.8, SHIP.radius * 0.4)
      .lineTo(-SHIP.radius * 0.8 - len, 0)
      .lineTo(-SHIP.radius * 0.8, -SHIP.radius * 0.4)
      .closePath()
      .fill({ color: COLORS.thruster, alpha: 0.85 });
    flame
      .moveTo(-SHIP.radius * 0.8, SHIP.radius * 0.2)
      .lineTo(-SHIP.radius * 0.8 - len * 0.55, 0)
      .lineTo(-SHIP.radius * 0.8, -SHIP.radius * 0.2)
      .closePath()
      .fill({ color: COLORS.thrusterCore, alpha: 0.95 });
  }

  // ===== Firing =====
  private handleFiring(dt: number): void {
    this.fireCooldown -= dt;
    if (!this.input.fire || this.fireCooldown > 0 || !this.ship) return;
    let liveBullets = 0;
    for (const e of this.entities.values()) {
      if (e.kind === 'bullet') liveBullets++;
    }
    if (liveBullets >= BULLET.maxLive) return;

    this.fireCooldown = BULLET.fireCooldown;
    const body = this.ship.body;
    const rot = body.rotation();
    const pos = body.translation();
    const noseX = pos.x + Math.cos(rot) * SHIP.radius * 1.4;
    const noseY = pos.y + Math.sin(rot) * SHIP.radius * 1.4;
    const shipVel = body.linvel();
    const vx = Math.cos(rot) * BULLET.speed + shipVel.x;
    const vy = Math.sin(rot) * BULLET.speed + shipVel.y;

    const bulletBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(noseX, noseY)
        .setLinvel(vx, vy)
        .setCcdEnabled(true)
        .setLinearDamping(0)
        .setAngularDamping(0)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BULLET.radius)
        .setDensity(0)
        .setSensor(true)
        .setCollisionGroups((bulletCollGroup << 16) | asteroidCollGroup)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      bulletBody
    );

    const view = new Graphics();
    view.circle(0, 0, BULLET.radius * 1.4).fill({ color: COLORS.bullet });
    this.entityLayer.addChild(view);
    const e: Entity = { body: bulletBody, view, kind: 'bullet', lifespan: BULLET.lifespan };
    this.entities.set(makeEntityId(), e);
  }

  private handleTimers(dt: number): void {
    for (const e of this.entities.values()) {
      if (e.kind !== 'bullet') continue;
      e.lifespan = (e.lifespan ?? BULLET.lifespan) - dt;
      if (e.lifespan <= 0) {
        this.bodiesToRemove.push(e.body);
      }
    }
    if (this.invulnerability > 0) this.invulnerability -= dt;
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        if (this.state.lives > 0) {
          this.spawnShip();
        } else {
          this.gameOver();
        }
      }
    }
  }

  // ===== Asteroids =====
  private spawnWave(wave: number): void {
    const count = 3 + Math.min(wave - 1, 4);
    for (let i = 0; i < count; i++) {
      // spawn near edges, away from center where ship is
      let x = 0;
      let y = 0;
      do {
        x = Math.random() * this.worldWidth;
        y = Math.random() * this.worldHeight;
      } while (
        Math.hypot(x - this.worldWidth / 2, y - this.worldHeight / 2) < SAFE_SPAWN_RADIUS
      );
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(ASTEROID.baseSpeed.min, ASTEROID.baseSpeed.max) + (wave - 1) * ASTEROID.extraSpeedPerWave;
      this.spawnAsteroid(x, y, 0, angle, speed);
    }
  }

  private spawnAsteroid(
    x: number,
    y: number,
    sizeRank: 0 | 1 | 2,
    angle: number,
    speed: number
  ): void {
    const baseR = [48, 26, 13][sizeRank];
    const vertexCount = [11, 9, 7][sizeRank];
    const pts = genAsteroidPolygon(baseR, vertexCount);
    const mass = computeAsteroidMass(pts);
    const { com, inertia } = computeAsteroidInertia(pts, mass);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(Math.cos(angle) * speed, Math.sin(angle) * speed)
      .setAngularDamping(0)
      .setLinearDamping(0);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.convexHull(
      new Float32Array(pts.flatMap((p) => [p.x, p.y]))
    );
    if (colliderDesc) {
      colliderDesc
        .setDensity(0)
        .setRestitution(0.9)
        .setCollisionGroups((asteroidCollGroup << 16) | (asteroidCollGroup | shipCollGroup | bulletCollGroup))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      this.world.createCollider(colliderDesc, body);
    }
    body.setAdditionalMassProperties(mass, com, inertia, true);
    body.setAngvel(randRange(ASTEROID.spin.min, ASTEROID.spin.max), true);

    const g = new Graphics();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath().stroke({ width: 2, color: COLORS.asteroid, alpha: 1 });
    this.entityLayer.addChild(g);

    this.entities.set(makeEntityId(), { body, view: g, kind: 'asteroid', sizeRank, polygon: pts });
    this.asteroidCount++;
  }

  // ===== Collisions =====
  private handleCollisions(): void {
    if (!this.collisionQueue) return;
    this.collisionQueue.drainCollisionEvents((h1: number, h2: number, started: boolean) => {
      if (!started) return;
      const c1 = this.world.getCollider(h1);
      const c2 = this.world.getCollider(h2);
      if (!c1 || !c2) return;
      const b1 = c1.parent();
      const b2 = c2.parent();
      if (!b1 || !b2) return;

      const e1 = this.findByBody(b1);
      const e2 = this.findByBody(b2);
      if (!e1 || !e2) return;

      const pair = [e1, e2];
      const bullet = pair.find((p) => p.kind === 'bullet');
      const asteroid = pair.find((p) => p.kind === 'asteroid');
      const shipEnt = pair.find((p) => p.kind === 'ship');

      if (bullet && asteroid) {
        this.bodiesToRemove.push(bullet.body, asteroid.body);
        return;
      }
      if (shipEnt && asteroid && this.invulnerability <= 0) {
        this.killShip();
      }
    });
  }

  private findByBody(body: Body): Entity | null {
    for (const e of this.entities.values()) {
      if (e.body === body) return e;
    }
    return null;
  }

  private killShip(): void {
    if (!this.ship) return;
    const shipRef = this.ship;
    this.bodiesToRemove.push(shipRef.body);
    this.ship = null;
    this.setLivesDelta(-1);
    this.respawnTimer = 1.2;
    this.invulnerability = 0;
  }

  private setLivesDelta(d: number): void {
    const lives = Math.max(0, this.state.lives + d);
    this.setState({ ...this.state, lives });
    this.hud.setLives(lives);
  }

  private gameOver(): void {
    this.gameoverAt = performance.now();
    this.setState({ ...this.state, phase: 'gameover' });
    this.hud.showOverlay(
      'GAME OVER',
      `FINAL SCORE ${this.state.score}`,
      'PRESS ENTER TO RESTART',
      this.worldWidth,
      this.worldHeight
    );
  }

  // ===== Removal / splitting =====
  private cleanupRemoved(): void {
    if (this.bodiesToRemove.length === 0 && this.collidersToRemove.length === 0) return;
    for (const body of this.bodiesToRemove) {
      for (const [id, e] of this.entities) {
        if (e.body !== body) continue;
        this.entities.delete(id);
        const pos = body.translation();
        this.world.removeRigidBody(body);
        e.view.destroy({ children: true });
        if (e.kind === 'asteroid') {
          this.asteroidCount--;
          if (this.state.phase === 'playing') this.splitAsteroid(e, pos);
        }
      }
    }
    this.bodiesToRemove.length = 0;
    for (const c of this.collidersToRemove) this.world.removeCollider(c, true);
    this.collidersToRemove.length = 0;

    if (this.state.phase === 'playing' && this.asteroidCount === 0 && this.state.lives > 0) {
      this.advanceWave();
    }
  }

  private splitAsteroid(e: Entity, pos: { x: number; y: number }): void {
    const rank = e.sizeRank ?? 0;
    const ptsAwarded = [20, 50, 100][rank];
    this.hud.addScore(ptsAwarded);
    this.setState({ ...this.state, score: this.hud.score });
    this.checkExtraLife();

    if (rank >= 2) return;
    const baseR = [48, 26, 13][rank + 1];
    const nextRank = (rank + 1) as 0 | 1 | 2;
    const childSpeed = randRange(ASTEROID.baseSpeed.min, ASTEROID.baseSpeed.max) + (this.state.wave - 1) * ASTEROID.extraSpeedPerWave;
    for (let i = 0; i < 2; i++) {
      const angle = randRange(0, Math.PI * 2);
      this.spawnAsteroid(
        pos.x + Math.cos(angle) * baseR * 0.4,
        pos.y + Math.sin(angle) * baseR * 0.4,
        nextRank,
        angle,
        childSpeed
      );
    }
  }

  private checkExtraLife(): void {
    const before = this.extraLifeWatch;
    const after = this.hud.score;
    if (Math.floor(after / SCORE.extraLifeEvery) > Math.floor(before / SCORE.extraLifeEvery)) {
      if (this.state.lives < 6) {
        this.setLivesDelta(1);
      }
    }
    this.extraLifeWatch = after;
  }

  private advanceWave(): void {
    const wave = this.state.wave + 1;
    this.setState({ ...this.state, wave });
    this.hud.setWave(wave);
    this.spawnWave(wave);
  }

  // ===== Screen wrap =====
  private wrapAll(): void {
    for (const e of this.entities.values()) {
      const p = e.body.translation();
      const r = this.entityWrapMargin(e);
      const nx = ((p.x + r) % (this.worldWidth + 2 * r) + this.worldWidth + 2 * r) % (this.worldWidth + 2 * r) - r;
      const ny = ((p.y + r) % (this.worldHeight + 2 * r) + this.worldHeight + 2 * r) % (this.worldHeight + 2 * r) - r;
      if (nx !== p.x || ny !== p.y) {
        e.body.setTranslation({ x: nx, y: ny }, true);
      }
    }
  }

  private entityWrapMargin(e: Entity): number {
    if (e.kind === 'ship') return SHIP.radius * 1.3;
    if (e.kind === 'bullet') return BULLET.radius * 3;
    return (e.sizeRank !== undefined ? [48, 26, 13][e.sizeRank] : 48) * 1.2;
  }

  // ===== Render sync =====
  private syncViews(): void {
    for (const e of this.entities.values()) {
      const t = e.body.translation();
      e.view.position.set(t.x, t.y);
      e.view.rotation = e.body.rotation();
    }
    if (this.ship) {
      const flame = this.ship.view.children[1] as Graphics;
      if (flame.visible) this.drawFlame();
    }
  }

  // ===== Input entry point (polled from the main loop) =====
  private gameoverAt = 0;

  private checkStartInput(): void {
    if (this.state.phase !== 'ready' && this.state.phase !== 'gameover') return;
    if (this.input.restart || this.input.fire) {
      if (this.gameoverAt > 0 && performance.now() - this.gameoverAt < 600) return;
      this.startGame();
    }
  }
}

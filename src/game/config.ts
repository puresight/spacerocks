export const PHYSICS_HZ = 60;
export const FIXED_DT = 1 / PHYSICS_HZ;
export const MAX_STEPS_PER_FRAME = 5;

export const WORLD = {
  gravity: { x: 0, y: 0 },
};

export const SHIP = {
  radius: 13,
  mass: 1.0,
  angularInertia: 1.0,
  torque: 15.0,
  thrust: 180.0,
  linearDamping: 0.18,
  angularDamping: 3.0,
  maxLinearSpeed: 420,
};

export const BULLET = {
  speed: 620,
  radius: 2.2,
  lifespan: 0.9,
  fireCooldown: 0.22,
  maxLive: 8,
};

export const ASTEROID = {
  sizeRanks: [48, 26, 13] as const,
  density: 0.02,
  baseSpeed: { min: 24, max: 70 },
  extraSpeedPerWave: 7,
  spin: { min: -1.8, max: 1.8 },
  points: [20, 50, 100] as const,
  jaggedness: 0.32,
  minRadiusScale: 0.62,
  maxRadiusScale: 1.18,
};

export const SCORE = {
  extraLifeEvery: 10000,
  startLives: 3,
};

export const SAFE_SPAWN_RADIUS = 150;

export const COLORS = {
  ship: 0x7df9ff,
  thruster: 0xffa645,
  thrusterCore: 0xffe9b8,
  bullet: 0xb8ff5c,
  asteroid: 0x9aa7b8,
  hudText: 0xcfd8e3,
  overlayText: 0xe8eef6,
  title: 0x7df9ff,
};

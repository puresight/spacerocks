# Spacerocks

A classic vector-style arcade shooter built with React, TypeScript, PixiJS, and Rapier physics. Pilot a ship through drifting asteroid fields: rotate, thrust, and fire to shatter big rocks into faster, smaller ones — without getting hit.

## Gameplay

- **Goal:** destroy every asteroid in a wave to advance. Each wave spawns more, faster rocks.
- **Scoring:** small asteroids are worth the most (100 / 50 / 20 points by size). An extra life is awarded every 10,000 points.
- **Lives:** you start with 3. Getting hit destroys your ship; you respawn with brief invulnerability.

### Controls — keyboard

| Action  | Keys                     |
| ------- | ------------------------ |
| Rotate  | `A` / `D` or arrow keys  |
| Thrust  | `W` or up arrow          |
| Fire    | `Space`                  |
| Start / restart | `Enter` or `R`   |

### Controls — touch

On-screen buttons (shown only on touch devices):

- **Left side:** two arrow buttons to rotate, **THRUST** button above them
- **Right side:** **FIRE** button, **BRAKE** button beside it

All buttons support simultaneous presses, so you can turn, thrust, and fire at once. Brake is available on touch only.

## Tech stack

- **React 19 + TypeScript (strict)** — app shell and mounting
- **Vite** — dev server and production bundling
- **PixiJS 8** — WebGL/WebGPU rendering, vector graphics, HUD text
- **@dimforge/rapier2d-compat** — deterministic fixed-timestep physics (60 Hz) with interpolated rendering
- **TanStack patterns avoided here on purpose:** the game runs as an imperative engine outside React's render cycle; React only mounts the canvas host.

## Project structure

```
src/
├── App.tsx           # Mounts the game shell, loading/error states
├── main.tsx          # Entry point
├── index.css         # Global styles + touch-control overlay styles
└── game/
    ├── engine.ts     # Game loop, physics stepping, collisions, waves
    ├── config.ts     # All tunables (ship, bullets, asteroids, scoring)
    ├── hud.ts        # PixiJS score/lives/wave text + overlay screens
    ├── input.ts      # Keyboard + virtual (touch) input state
    ├── touch.ts      # DOM-based touch button overlay
    ├── state.ts      # Game state types and phase machine
    ├── init.ts       # Rapier WASM initialization
    └── utils.ts      # Math helpers, entity ids
```

## Getting started

### Prerequisites

- Node.js 18+ (20 recommended)
- npm

### Install and run

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). The dev server has hot module reload.

### Build for production

```bash
npm run build     # type-checks with tsc, then bundles to /dist
npm run preview   # serves the production build locally
```

### Lint

```bash
npm run lint
```

## Deployment

The build emits a static SPA in `/dist` configured for Cloudflare Workers static assets. `dist/_redirects` routes all paths to the app entry point, so a hard refresh on any URL works.

## Tuning the game

Almost every gameplay number lives in `src/game/config.ts`: ship thrust and torque, bullet speed and cooldown, asteroid sizes/speeds/points, scoring rules, and the color palette. Change a value and the dev server hot-reloads instantly.

## License

MIT.

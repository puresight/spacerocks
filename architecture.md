# Architecture

How Spacerocks is built, why each choice was made, and where to learn more.

## Overview

The app is a React SPA whose only job is to mount a full-screen canvas. Everything gameplay-related — rendering, physics, input, scoring — runs inside an imperative game engine that lives outside React's render cycle. React never re-renders during play; the engine talks to the browser directly. This split keeps the frame loop predictable (no React reconciliation in the hot path) while still using the standard Vite + React toolchain for the shell, styles, and build.

## Tech stack

### Vite

**What:** the dev server and bundler. [Vite documentation](https://vite.dev/guide/)

**Why:** instant startup and hot module replacement during development, and a production build pipeline (tree-shaking, minification, content-hashed assets) with no configuration beyond a few plugins. It is the de facto standard build tool for React SPAs.

**How:** `npm run dev` serves the app locally with HMR; `npm run build` type-checks with `tsc` and then emits a static SPA to `/dist`. TypeScript path aliasing (`@/*` → `./src/*`) is configured in both `tsconfig.json` and `vite.config.ts`.

### React 19

**What:** the UI shell. [React documentation](https://react.dev/learn)

**Why:** the app needs very little UI — a loading state, an error state, and a canvas host — but React gives that shell a predictable component structure, first-class TypeScript support, and the largest ecosystem of patterns and contributors. The game itself does not use React state; see [Rendering without React](#rendering-without-react) below.

**How:** `src/App.tsx` renders a full-viewport shell, kicks off async game initialization, and swaps between loading, error, and game views. StrictMode-compatible cleanup ensures the engine, Pixi application, and event listeners are torn down on unmount.

### TypeScript (strict)

**What:** the language for all source files. [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

**Why:** entity kinds, game phases, and size ranks are modeled as discriminated unions, which lets the compiler catch invalid state transitions (e.g. firing during the title screen) at build time. Strict mode also catches null-geometry or missing-entity bugs that would otherwise crash mid-game.

**How:** `tsconfig.app.json` enables `strict` and related flags; the build script runs `tsc -b` before bundling so type errors fail the build.

### PixiJS 8

**What:** WebGL/WebGPU renderer for all game graphics. [PixiJS guide](https://pixijs.download/dev/docs/index.html)

**Why:** the game draws hundreds of vector shapes (asteroids are generated jagged polygons, the ship is a line drawing, bullets are short segments) and re-draws some of them every frame. PixiJS batches these into GPU draw calls efficiently, auto-selects WebGL or WebGPU, and its `Graphics` API is a natural fit for the vector-arcade aesthetic — no image assets required.

**How:** a single `Application` owns the canvas inside `.game-canvas-host`. Each entity is a `Container` holding `Graphics` children; the engine syncs each container's position and rotation from its physics body every frame. The HUD (score, lives, wave, overlay screens) is rendered with Pixi `Text` objects so it scales with the world.

### Rapier 2D

**What:** the physics engine (`@dimforge/rapier2d-compat`). [Rapier documentation](https://rapier.rs/docs/user_guides/javascript/getting_started_js)

**Why:** asteroid shattering, ship momentum, and collisions are rigid-body problems; hand-rolling them would be error-prone. Rapier is written in Rust, compiled to WASM, and deterministic — the same inputs produce the same simulation, which matters for a fixed-timestep game loop.

**How:** the world runs at a fixed 60 Hz (`FIXED_DT` in `src/game/config.ts`). Each animation frame the engine accumulates real elapsed time and steps the world in fixed increments (capped at 5 steps per frame to avoid spiral-of-death after a tab stall), then interpolates nothing — it simply syncs views to the latest body transforms. The WASM module is initialized once at startup in `src/game/init.ts` before the engine is constructed.

## Rendering without React

**What:** an imperative engine class (`src/game/engine.ts`) driven by Pixi's ticker.

**Why:** a 60 fps game cannot afford React re-renders per frame, and game state (positions, velocities, entity maps) changes far too often to be meaningful as React state. React state and the game state serve different masters here: React owns "is the game loaded," the engine owns "where is every asteroid."

**How:**

- `src/game/state.ts` defines a small phase machine (`ready → playing → gameover`) plus score/lives/wave.
- The engine owns an instance of that state internally; React never reads it during play.
- Input is polled, not evented into React: `src/game/input.ts` merges keyboard state with a virtual touch state exposed by `src/game/touch.ts`.
- The touch overlay is plain DOM (buttons with pointer-event handlers) rather than React components, because it must respond to simultaneous multi-finger presses with zero latency and no reconciliation.

## Tuning

Gameplay constants — ship thrust and torque, bullet speed and cooldown, asteroid sizes and speeds, scoring, colors — all live in `src/game/config.ts` as named, typed constants. Nothing gameplay-related is buried in engine code; changing a value there changes the game on the next reload.

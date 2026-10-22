# System Architecture Specification: Asteroids Web

## 0. Status

### Done

- **Runtime & Toolchain Scaffolding:** Initialized Vite + TypeScript toolchain operational inside browser-based WebContainers without native toolchain dependencies.
- **Renderer Foundation:** Integrated PixiJS v8 supporting WebGPU preference with seamless WebGL fallback; full-screen responsive canvas scaling.
- **Physics Engine Integration:** Embedded `@dimforge/rapier2d-compat` WebAssembly package with zero-gravity setup, fixed-timestep 60Hz physics accumulator, and rigid body transform synchronization to PixiJS visual nodes.
- **Core Gameplay Mechanics:** Implemented classic inertial ship handling (thrust impulses, rotational torque, damping), continuous boundary screen-wrap for all dynamic bodies, projectile spawning with rate-limiting, and polygonal asteroid splitting on impact.
- **Mobile Multi-Touch Subsystem:** Dual-zone touch overlay with viewport gesture prevention (`touch-action: none`), floating origin joystick for rotation/thrust on the left, and dedicated multi-touch action buttons for fire and hyperspace on the right.
- **Procedural Audio Engine:** Web Audio API implementation with auto-unlocking `AudioContext`, downward-sweeping laser synthesis with bandpass noise puff, ship thrust noise loop with gain ramping, and a multi-stage asteroid fracture model using Brownian random-walk noise, ring modulation crunch, and `ConvolverNode` spatial reverb.
- **Gamepad API Integration:** Gamepad discovery via connection events and tick-based polling (`navigator.getGamepads`), standard mapping extraction, deadzone normalization, analog axis steering/thrust, and HUD touch-control auto-hiding on active controller input.

### TODO

- **Zero-Allocation Entity Component System (ECS):** Migrate ad-hoc entity arrays to a cache-friendly, typed-array ECS model (`bitecs`) to eliminate garbage collection pauses during high-density asteroid fragment bursts.
- **High-Score & Session Persistence:** Implement local storage serialization for session records, audio volume preferences, and custom gamepad axis remapping profiles.
- **Sprite Batching & Draw Call Optimization:** Transition from direct vector `Graphics` redrawing to pre-rendered texture atlases and instanced particle containers for thruster plumes and explosion debris.
- **Audio Worklet Migration:** Offload Brownian noise generation and synthesis graph modulation to dedicated Web Audio `AudioWorklet` threads to prevent main-thread UI jank from causing buffer underruns.
- **PWA Manifest & Offline Caching:** Package service worker recipes to enable full offline caching, desktop installation, and full-screen standalone execution.

---

## 1. System Overview & Technology Stack

The Asteroids engine executes entirely within modern web standards, designed to run both within constrained browser sandboxes (WebContainers) and standalone web/PWA deployments.

- **Build Pipeline:** Vite + TypeScript targeting ES2022. Modules execute as native ECMAScript modules in modern browsers.
- **Rendering Pipeline:** PixiJS v8. Utilizes WebGPU as primary rendering context with automatic, graceful fallback to WebGL 2. The pipeline focuses on dynamic 2D transforms and vector batching.
- **Physics Core:** `@dimforge/rapier2d-compat`. Executes as a pre-compiled WebAssembly module instantiated via browser-native `WebAssembly.instantiateStreaming` / inline binary buffers, avoiding native compilation tools.
- **Audio Synthesizer:** Browser-native Web Audio API using dynamically synthesized graphs, algorithmic impulse responses, and noise buffers—requiring zero external asset downloads.

---

## 2. Rendering & Physics Integration

```
+--------------------------------------------------------------+
|                      Main Game Loop                          |
|  (Fixed Timestep 60Hz Accumulator via requestAnimationFrame) |
+-------------------------------+------------------------------+
                                |
        +-----------------------+-----------------------+
        v                                               v
+-------------------------------+       +-------------------------------+
|     Rapier 2D Wasm World      |       |      Input Subsystem          |
| - Apply Torques & Impulses    | <---+ | - Keyboard (A/D/W, Arrows)    |
| - Step Physics Simulation     |       | - Multi-touch Dual Zone       |
| - Boundary Screen Wrap Check  |       | - Gamepad API Polling         |
+---------------+---------------+       +-------------------------------+
                |
                v (Read Transform State)
+-------------------------------+
|      PixiJS v8 Renderer       |
| - Sync Position & Rotation    |
| - Draw Procedural Meshes      |
| - Render Vector HUD & FX      |
+-------------------------------+

```

### Physics Simulation Loop

Physics calculations run on a fixed 60Hz delta accumulator to preserve deterministic projectile ballistics, collision responses, and rotational momentum independent of screen refresh rates (60Hz, 120Hz, 144Hz):

$$\Delta t = \frac{1}{60} \approx 0.01667\text{ s}$$

- **Zero-Gravity World:** The world environment vector is locked to $g = (0, 0)$. Inertia is governed solely by linear damping ($c_{l}$) and angular damping ($c_{a}$).
- **Impulse & Torque:** Ship thrust applies a directional impulse along the forward vector:

$$\vec{F} = (\cos\theta, \sin\theta) \cdot I_{\text{thrust}}$$

Steering applies direct scalar torque to modify angular velocity.

- **Boundary Screen Wrap:** Coordinate monitoring operates immediately post-step. When a rigid body's position $(x, y)$ exceeds world bounds $[0, W] \times [0, H]$, its translation coordinates are reset to the inverse perimeter:

$$x_{\text{new}} = (x + W) \bmod W, \quad y_{\text{new}} = (y + H) \bmod H$$

Rapier kinematic and dynamic translations are updated directly via `setTranslation()`, ensuring both collider and visual sprite cross seamlessly without killing velocity vectors.

---

## 3. Input Subsystem Architecture

The input layer multiplexes three concurrent input sources into a single normalized `PlayerIntent` control schema.

```
[Keyboard Listeners] ----+
[Multi-Touch Zones]  ----+---> [Input Normalizer] ---> [PlayerIntent Object] ---> [Physics Impulses]
[Gamepad Polling]    ----+     (Deadzone, Clamping)     - thrust: [0..1]
                                                        - steer: [-1..1]
                                                        - fire: boolean
                                                        - hyperspace: boolean

```

### 1. Keyboard

Standard event handlers (`keydown`, `keyup`) capture raw key states with propagation cancellation for game keys.

### 2. Multi-Touch Subsystem

- **Touch Isolation:** Root canvas applies `touch-action: none` to disable default browser pan, zoom, and swipe-to-refresh gestures.
- **Left Zone (Dynamic Float Stick):** Active on the left 50% of the viewport width. Origin coordinates $(x_0, y_0)$ anchor on the initial `pointerdown` event. Active drag offset $(\Delta x, \Delta y)$ calculates rotational torque from horizontal displacement and thrust intensity from negative vertical displacement.
- **Right Zone (Action Trigger):** Fixed buttons for instantaneous weapon firing and optional defense utilities. Supports simultaneous multi-touch pointer IDs to ensure continuous firing while thrusting.

### 3. Gamepad API

- **Lifecycle:** Connect/disconnect events toggle availability flags.
- **Frame-Synchronous Polling:** `navigator.getGamepads()` is polled once at the start of each accumulator step.
- **Deadzone Normalization:** Evaluates raw analog stick inputs through a deadband threshold:

$$f(v) = \begin{cases} 0 & \vert{}v\vert{} \le \delta \\ \text{sgn}(v) \cdot \frac{\vert{}v\vert{} - \delta}{1 - \delta} & \vert{}v\vert{} > \delta \end{cases} \quad \text{where } \delta = 0.15$$

- **Automatic UI Caching:** Active gamepad axis or button input suppresses mobile on-screen touch overlays to maximize screen real estate, reactivating them immediately upon raw pointer contact.

---

## 4. Procedural Audio Engine Architecture

All sound generation executes via the browser-native `AudioContext`, preventing external asset latency and network payload dependencies.

### Audio Graph Layout

```
[ Master GainNode ] ---> [ AudioDestinationNode ]
         ^
         |
         +--- [ Laser Graph: Swept Oscillator + Bandpass Noise Puff ]
         |
         +--- [ Thrust Graph: Looping Resonant Noise Generator ]
         |
         +--- [ Asteroid Impact Bus ]
                     |
                     +---> [ Dry Gain ] -----------------------+
                     |                                         |
                     +---> [ ConvolverNode (Algorithmic IR) ] -+
                                         ^
                                         |
                      [ Impact Composite Signal Graph ]
                      - Layer 1: Fracturing Micro-Impulses (Snap)
                      - Layer 2: Brown Noise Random Walk
                      - Layer 3: Ring Modulator (LFO Grinding Grit)
                      - Layer 4: WaveShaperNode (Soft Saturation)

```

### Synthesis Specifications

| Effect                | Primary Sound Source                                                  | Modulation & Filtering                                                                                                                  | Envelope / Dynamics                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Laser Fire**        | High-frequency oscillator (sine/triangle blend) + white noise buffer  | Downward exponential frequency sweep ($2400\text{ Hz} \to 600\text{ Hz}$); bandpass noise puff centered at $3500\text{ Hz}$ ($Q = 3.0$) | Fast exponential decay over $60\text{–}80\text{ ms}$; noise transient drops in $30\text{ ms}$.                                                                       |
| **Engine Thrust**     | Low-frequency pink/brown noise                                        | Resonant low-pass filter ($Q = 2.0$, cutoff $80\text{ Hz}$)                                                                             | Linear ramp up over $50\text{ ms}$; smooth release ramp on key/stick release to prevent DC pop.                                                                      |
| **Asteroid Fracture** | Leaky integrator Brownian noise (`val = (last + 0.02 * rand) / 1.02`) | Ring-modulated with low-frequency oscillator ($40\text{–}70\text{ Hz}$) to generate irregular crunch; soft-clipped via `WaveShaperNode` | Multi-stage: $10\text{ ms}$ initial kinetic crack $\to$ resonant filter drop ($1200\text{ Hz} \to 150\text{ Hz}$) $\to$ sub-bass rumble tail down to $30\text{ Hz}$. |
| **Reverb Space**      | Synthetic impulse response                                            | Convolver buffer filled with decaying brown/pink noise across a $1.0\text{ s}$ duration                                                 | $35\%$ wet mix providing atmospheric cavernous dispersion in zero-g vacuum.                                                                                          |

---

## 5. Directory Structure & Modular Layout

```
src/
├── audio/
│   ├── AudioEngine.ts        # Singleton AudioContext, master gain, unlock handlers
│   ├── SynthesisGraphs.ts    # Laser, thrust, and modular asteroid synth nodes
│   └── ReverbConvolver.ts    # Algorithmic impulse response generators
├── core/
│   ├── Game.ts               # Main loop, accumulator, sub-system initialization
│   ├── Constants.ts          # Physical limits, tuning variables, collision layers
│   └── StateManager.ts       # Wave progression, score tracking, life count, game over
├── entities/
│   ├── Ship.ts               # Ship rigid body, visual geometry, thruster sync
│   ├── Asteroid.ts           # Polygonal vector geometry, scale levels, split logic
│   └── Bullet.ts             # High-velocity sensor colliders, lifespan timers
├── input/
│   ├── InputManager.ts       # Input unification and state dispatch
│   ├── KeyboardHandler.ts    # Discrete key states
│   ├── TouchController.ts    # Canvas-mapped dual-zone virtual joystick
│   └── GamepadHandler.ts     # Gamepad API connection events and polling loop
└── physics/
    ├── PhysicsWorld.ts       # Rapier Wasm initialization and stepped physics tick
    └── ScreenWrap.ts         # Toroidal world boundary coordinate wrapping

```

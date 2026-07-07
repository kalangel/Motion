# RTX 6000 — Enter the Silicon

A cinematic, scroll-driven product reveal for the NVIDIA RTX 6000. One continuous
camera move takes the viewer from a floating graphics card, through a physically
exploded view of every component, straight into the AD102 die — where the GPU
architecture unfolds as a glowing silicon city.

## The journey (driven entirely by scrolling)

1. **Hero** — the card floats in space, fans spinning, studio reflections.
2. **Showcase** — a slow full rotation reveals the industrial design.
3. **Exploded view** — shroud, axial fans, fin stack, vapor chamber, GDDR6
   memory, AD102 die, PCB, backplate and screws separate with smooth physical
   motion; animated dashed connectors trace the assembly axis and every part
   receives an elegant label.
4. **Fly-through** — the camera keeps moving forward *through* the exploded
   stack; each layer dissolves as you pass it.
5. **The dive** — the die energizes and the camera plunges through its surface.
6. **Inside the chip** — a seven-stop architecture tour: CUDA Cores, Tensor
   Cores, RT Cores, L2 Cache, Memory Controller, AI Processing (live data-flow
   particles) and the Ray Tracing Pipeline (a bouncing light beam), ending on a
   full-die overview with the closing statement.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** for the UI layer
- **three.js + @react-three/fiber + drei** — fully procedural 3D (no model
  files, no external assets; even the die floorplan and logotype are canvas
  textures generated at runtime)
- **GSAP ScrollTrigger** — writes a single normalized progress value
- **Framer Motion** — hero entrance, nav and micro-interactions
- **@react-three/postprocessing** — subtle bloom + vignette

## How the animation system works

`lib/scroll.ts` holds one `scrollState` object. GSAP's ScrollTrigger writes
`target`; the render loop critically damps `current` toward it every frame, so
all downstream animation is buttery regardless of wheel input. `lib/phases.ts`
defines the chapter boundaries; the camera rig, the exploded model, the die
world and the DOM overlay all read the same damped progress — everything stays
perfectly in sync at 60 fps with zero React re-renders during scroll.

## Run

```bash
npm install
npm run dev    # http://localhost:3000
npm run build && npm start
```

Deploys to Vercel with zero configuration (framework preset: Next.js).

## Structure

```
app/                    layout, page, global styles
components/Experience   Canvas + GSAP scroll driver + lighting
components/Overlay      nav, hero, captions, stage panels, finale
components/scene/
  GPUCard     procedural RTX 6000 + exploded view + labels + connectors
  DieWorld    the silicon city (instanced cores, shaders, particles, beam)
  CameraRig   one camera choreography across both worlds
lib/scroll.ts           damped scroll state + easing helpers
lib/phases.ts           master timeline + architecture tour content
```

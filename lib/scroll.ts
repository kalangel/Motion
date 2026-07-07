/**
 * Single source of truth for scroll progress.
 * GSAP ScrollTrigger writes `target`; the render loop critically damps
 * `current` toward it, so every animation downstream is buttery regardless
 * of how choppy the wheel input is.
 */
export const scrollState = {
  target: 0,
  current: 0,
};

/** Frame-rate independent exponential damping. */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Normalized sub-range of the master progress, clamped to [0,1]. */
export function range(p: number, a: number, b: number) {
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

/** Hermite smoothstep. */
export function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Quintic ease-in-out — the "professional" curve for big camera moves. */
export function easeInOutQuint(t: number) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Bell curve: 0→1→0 across [a,b], with plateau fraction `flat` in the middle. */
export function bell(p: number, a: number, b: number, flat = 0.35) {
  const t = range(p, a, b);
  const edge = (1 - flat) / 2;
  if (t < edge) return smooth(t / edge);
  if (t > 1 - edge) return smooth((1 - t) / edge);
  return 1;
}

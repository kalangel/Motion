/**
 * Master timeline. One normalized progress value (0..1) drives the whole
 * experience; these are the chapter boundaries.
 */
export const PH = {
  /** Hero — card floats, title on screen. */
  hero: [0.0, 0.08] as const,
  /** Slow showcase rotation. */
  rotate: [0.08, 0.2] as const,
  /** Components separate into the exploded view. */
  explode: [0.2, 0.36] as const,
  /** Labels + connectors are readable. */
  labels: [0.235, 0.42] as const,
  /** Camera travels forward through the exploded layers. */
  traverse: [0.42, 0.58] as const,
  /** Approach the die — everything else falls away. */
  approach: [0.58, 0.63] as const,
  /** Dive through the die surface (fade to black at the midpoint). */
  dive: [0.63, 0.675] as const,
  /** Inside the silicon — architecture tour (starts after the fade clears). */
  inside: [0.7, 0.96] as const,
  /** Finale — overview + closing statement. */
  finale: [0.96, 1.0] as const,
};

export type Stage = {
  id: string;
  index: string;
  title: string;
  stat: string;
  copy: string;
};

/** The seven architecture stops inside the die. */
export const STAGES: Stage[] = [
  {
    id: "cuda",
    index: "01",
    title: "CUDA Cores",
    stat: "18,176 cores · 91.1 TFLOPS FP32",
    copy: "The parallel engine. Thousands of threads in flight at once, scheduled in hardware across 142 streaming multiprocessors.",
  },
  {
    id: "tensor",
    index: "02",
    title: "Tensor Cores",
    stat: "568 fourth-gen · 1,457 AI TOPS",
    copy: "Matrix math at the speed of thought. FP8 precision with the Transformer Engine doubles throughput for training and inference.",
  },
  {
    id: "rt",
    index: "03",
    title: "RT Cores",
    stat: "142 third-gen · 211 RT TFLOPS",
    copy: "Ray–triangle intersection cast in silicon. Opacity micromaps and displaced micro-meshes trace geometry that never touches a shader.",
  },
  {
    id: "cache",
    index: "04",
    title: "L2 Cache",
    stat: "96 MB unified",
    copy: "A reservoir at the center of the die. Sixteen times larger than the previous generation, feeding every core at terabytes per second.",
  },
  {
    id: "memory",
    index: "05",
    title: "Memory Controller",
    stat: "384-bit · 960 GB/s",
    copy: "Twelve controllers ring the die, streaming 48 GB of GDDR6 ECC memory — error-corrected bandwidth for datasets that don't fit anywhere else.",
  },
  {
    id: "ai",
    index: "06",
    title: "AI Processing",
    stat: "FP8 Transformer Engine",
    copy: "Tensors flow through the fabric like traffic through a city at night — routed, fused and quantized on the fly, without leaving the chip.",
  },
  {
    id: "pipeline",
    index: "07",
    title: "Ray Tracing Pipeline",
    stat: "Shader Execution Reordering",
    copy: "Rays scatter, bounce and converge. SER reorders divergent work mid-flight for coherence — light, simulated at full fidelity.",
  },
];

/** Sub-range of a stage inside PH.inside. */
export function stageRange(i: number): [number, number] {
  const [a, b] = PH.inside;
  const w = (b - a) / STAGES.length;
  return [a + i * w, a + (i + 1) * w];
}

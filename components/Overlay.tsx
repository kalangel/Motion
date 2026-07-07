"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { scrollState, range, smooth, bell } from "@/lib/scroll";
import { PH, STAGES, stageRange } from "@/lib/phases";

const CAPTIONS = [
  {
    id: "c0",
    a: 0.095,
    b: 0.185,
    title: "Precision, machined.",
    copy: "A unibody of die-cast aluminum, milled to a tenth of a millimeter. Form that exists only to move air.",
  },
  {
    id: "c1",
    a: 0.212,
    b: 0.27,
    title: "Anatomy of performance.",
    copy: "Nine assemblies. One thermal circuit. Every layer engineered as a single instrument.",
  },
  {
    id: "c2",
    a: 0.445,
    b: 0.555,
    title: "Follow the thermal path.",
    copy: "Air over copper, copper over silicon. 300 watts drawn silently away from the die.",
  },
  {
    id: "c3",
    a: 0.585,
    b: 0.648,
    title: "Enter the die.",
    copy: "76.3 billion transistors in 608 mm² of 4-nanometer silicon. Beyond this point, physics becomes architecture.",
  },
];

const SPECS = [
  { v: "18,176", k: "CUDA Cores" },
  { v: "48 GB", k: "GDDR6 ECC" },
  { v: "91.1", k: "TFLOPS FP32" },
  { v: "1,457", k: "AI TOPS" },
];

const easeReveal = [0.16, 1, 0.3, 1] as const;

export default function Overlay() {
  const heroRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const capRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const finaleRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = scrollState.current;

      if (heroRef.current) {
        const a = 1 - smooth(range(p, 0.012, 0.052));
        heroRef.current.style.opacity = String(a);
        heroRef.current.style.transform = `translateY(${(1 - a) * -46}px)`;
        heroRef.current.style.visibility = a < 0.004 ? "hidden" : "visible";
      }
      if (cueRef.current) {
        cueRef.current.style.opacity = String(1 - smooth(range(p, 0.004, 0.025)));
      }
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${p})`;
      }
      if (fadeRef.current) {
        fadeRef.current.style.opacity = String(bell(p, 0.645, 0.705, 0.3));
      }

      CAPTIONS.forEach((c, i) => {
        const el = capRefs.current[i];
        if (!el) return;
        const a = bell(p, c.a, c.b, 0.5);
        el.style.opacity = String(a);
        el.style.transform = `translateY(${(1 - a) * 26}px)`;
        el.style.visibility = a < 0.004 ? "hidden" : "visible";
      });

      let active = -1;
      STAGES.forEach((_, i) => {
        const el = stageRefs.current[i];
        const [a0, b0] = stageRange(i);
        const a = bell(p, a0 + 0.006, b0 + 0.004, 0.45);
        if (a > 0.5) active = i;
        if (!el) return;
        el.style.opacity = String(a);
        el.style.transform = `translateY(${(1 - a) * 30}px)`;
        el.style.visibility = a < 0.004 ? "hidden" : "visible";
      });

      if (railRef.current) {
        const ra = smooth(range(p, PH.inside[0], PH.inside[0] + 0.02)) * (1 - smooth(range(p, PH.finale[0] - 0.01, PH.finale[0] + 0.015)));
        railRef.current.style.opacity = String(ra);
      }
      dotRefs.current.forEach((d, i) => {
        if (!d) return;
        d.style.background = i === active ? "#76b900" : "rgba(255,255,255,0.22)";
        d.style.transform = i === active ? "scale(1.5)" : "scale(1)";
      });

      if (finaleRef.current) {
        const a = smooth(range(p, PH.finale[0] + 0.004, 0.995));
        if (scrimRef.current) scrimRef.current.style.opacity = String(a * 0.72);
        finaleRef.current.style.opacity = String(a);
        finaleRef.current.style.transform = `translateY(${(1 - a) * 34}px)`;
        finaleRef.current.style.pointerEvents = a > 0.6 ? "auto" : "none";
        finaleRef.current.style.visibility = a < 0.004 ? "hidden" : "visible";
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {/* cinematic vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* progress hairline */}
      <div className="absolute left-0 top-0 h-px w-full bg-white/5">
        <div
          ref={progressRef}
          className="h-full w-full origin-left"
          style={{
            transform: "scaleX(0)",
            background: "linear-gradient(90deg, #76b900, rgba(118,185,0,0.35))",
          }}
        />
      </div>

      {/* nav */}
      <motion.nav
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.35, ease: easeReveal }}
        className="pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between px-6 py-5 md:px-12"
      >
        <div className="flex items-center gap-3">
          <span className="block h-[18px] w-[18px] bg-accent" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 38% 100%, 38% 38%, 0 38%)" }} />
          <span className="text-[13px] font-semibold tracking-[0.22em] text-white/90">
            NVIDIA RTX
          </span>
        </div>
        <div className="hidden items-center gap-9 text-[13px] font-medium text-white/55 md:flex">
          <span className="transition-colors hover:text-white">Overview</span>
          <span className="transition-colors hover:text-white">Silicon</span>
          <span className="transition-colors hover:text-white">Specifications</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="rounded-full border border-white/20 px-5 py-2 text-[13px] font-medium text-white/90 transition-colors hover:border-white/50"
        >
          Reserve
        </motion.button>
      </motion.nav>

      {/* hero */}
      <div
        ref={heroRef}
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.55, ease: easeReveal }}
          className="eyebrow text-accent"
        >
          Ada Lovelace Architecture
        </motion.p>
        <div className="overflow-hidden py-2">
          <motion.h1
            initial={{ y: "108%" }}
            animate={{ y: 0 }}
            transition={{ duration: 1.35, delay: 0.72, ease: easeReveal }}
            className="display text-[17vw] leading-none text-white md:text-[10.5rem]"
          >
            RTX 6000
          </motion.h1>
        </div>
        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 1.0, ease: easeReveal }}
          className="text-balance mt-4 max-w-md px-6 text-[15px] leading-relaxed text-white/55 md:text-base"
        >
          48 GB of GDDR6. 76.3 billion transistors.
          <br className="hidden md:block" /> Scroll to take it apart.
        </motion.p>
      </div>

      {/* scroll cue */}
      <div
        ref={cueRef}
        className="absolute bottom-9 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"
      >
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.6 }}
          className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40"
        >
          Scroll
        </motion.span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.75 }}
          className="relative block h-10 w-px overflow-hidden bg-white/15"
        >
          <motion.span
            animate={{ y: [-40, 40] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-0 top-0 h-1/2 w-full bg-accent"
          />
        </motion.span>
      </div>

      {/* chapter captions */}
      {CAPTIONS.map((c, i) => (
        <div
          key={c.id}
          ref={(el) => {
            capRefs.current[i] = el;
          }}
          className="absolute left-[7vw] top-[26vh] max-w-sm opacity-0"
          style={{ visibility: "hidden" }}
        >
          <h2 className="display text-4xl text-white md:text-5xl">{c.title}</h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/50 md:text-[15px]">
            {c.copy}
          </p>
        </div>
      ))}

      {/* architecture stage panels */}
      {STAGES.map((s, i) => (
        <div
          key={s.id}
          ref={(el) => {
            stageRefs.current[i] = el;
          }}
          className="absolute bottom-[10vh] left-[7vw] max-w-md opacity-0"
          style={{ visibility: "hidden" }}
        >
          <p className="eyebrow text-white/35">
            {s.index} <span className="mx-1 text-white/20">/</span> 07
          </p>
          <h2 className="display mt-3 text-4xl text-white md:text-[3.4rem]">{s.title}</h2>
          <p className="mt-3 text-[13px] font-semibold tracking-[0.08em] text-accent">
            {s.stat}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-white/50 md:text-[15px]">
            {s.copy}
          </p>
        </div>
      ))}

      {/* stage rail */}
      <div
        ref={railRef}
        className="absolute right-6 top-1/2 flex -translate-y-1/2 flex-col gap-3 opacity-0 md:right-10"
      >
        {STAGES.map((s, i) => (
          <div
            key={s.id}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            className="h-1.5 w-1.5 rounded-full transition-all duration-300"
            style={{ background: "rgba(255,255,255,0.22)" }}
          />
        ))}
      </div>

      {/* finale scrim — keeps the closing type readable over the city */}
      <div
        ref={scrimRef}
        className="absolute inset-0 opacity-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 50%, rgba(3,4,5,0.82) 0%, rgba(3,4,5,0.45) 60%, rgba(3,4,5,0.2) 100%)",
        }}
      />

      {/* finale */}
      <div
        ref={finaleRef}
        className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center opacity-0"
        style={{ visibility: "hidden" }}
      >
        <p className="eyebrow text-accent">NVIDIA RTX 6000</p>
        <h2 className="display text-balance mt-4 text-5xl text-white md:text-7xl">
          One card.
          <br />
          Infinite worlds.
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button className="rounded-full bg-white px-7 py-3 text-[14px] font-semibold text-black transition-transform duration-300 hover:scale-[1.04]">
            Configure yours
          </button>
          <button className="rounded-full border border-white/25 px-7 py-3 text-[14px] font-medium text-white/90 transition-colors duration-300 hover:border-white/60">
            Download spec sheet
          </button>
        </div>
        <div className="glass mt-14 grid grid-cols-2 gap-x-12 gap-y-6 rounded-2xl px-10 py-7 md:grid-cols-4">
          {SPECS.map((s) => (
            <div key={s.k}>
              <p className="display text-2xl text-white md:text-3xl">{s.v}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">
                {s.k}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* dive fade */}
      <div ref={fadeRef} className="absolute inset-0 bg-black opacity-0" />
    </div>
  );
}

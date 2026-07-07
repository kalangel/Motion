"use client";

import dynamic from "next/dynamic";

const Experience = dynamic(() => import("@/components/Experience"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink">
      <span
        className="block h-6 w-6 animate-pulse bg-accent"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 38% 100%, 38% 38%, 0 38%)" }}
      />
      <span className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/40">
        NVIDIA RTX
      </span>
    </div>
  ),
});

export default function Page() {
  return (
    <main>
      <Experience />
    </main>
  );
}

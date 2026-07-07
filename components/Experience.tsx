"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scrollState } from "@/lib/scroll";
import GPUCard from "@/components/scene/GPUCard";
import DieWorld from "@/components/scene/DieWorld";
import CameraRig, { pointerState } from "@/components/scene/CameraRig";
import Overlay from "@/components/Overlay";

/** Faint dust suspended around the card — depth without noise. */
function Dust() {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    const N = 260;
    const pos = new Float32Array(N * 3);
    let seed = 23;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < N; i++) {
      const r = 3 + rnd() * 7;
      const a = rnd() * Math.PI * 2;
      const y = (rnd() - 0.5) * 7;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r - 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state) => {
    const p = scrollState.current;
    ref.current.visible = p < 0.66;
    ref.current.rotation.y = state.clock.elapsedTime * 0.012;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.016}
        color="#9db4c8"
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export default function Experience() {
  const spacer = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: spacer.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        scrollState.target = self.progress;
      },
      onRefresh: (self) => {
        scrollState.target = self.progress;
        scrollState.current = self.progress;
      },
    });
    const onMove = (e: PointerEvent) => {
      pointerState.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerState.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      st.kill();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <>
      {/* scroll runway — the whole story lives in this distance */}
      <div ref={spacer} style={{ height: "1600vh" }} aria-hidden />

      <div className="fixed inset-0 z-0">
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{ fov: 42, near: 0.05, far: 160, position: [1.15, 0.32, 4.55] }}
        >
          <color attach="background" args={["#050607"]} />
          <Suspense fallback={null}>
            {/* studio reflections — fully procedural, no assets */}
            <Environment resolution={128} frames={1}>
              <Lightformer
                intensity={2.4}
                position={[0, 4, 2]}
                rotation-x={-Math.PI / 2}
                scale={[9, 6, 1]}
              />
              <Lightformer
                intensity={1.2}
                color="#9fb8ff"
                position={[-5, 1, 1]}
                rotation-y={Math.PI / 2}
                scale={[6, 3, 1]}
              />
              <Lightformer
                intensity={0.7}
                color="#ffe2c4"
                position={[5, 0, -1]}
                rotation-y={-Math.PI / 2}
                scale={[6, 3, 1]}
              />
              <Lightformer
                intensity={0.5}
                position={[0, -4, 3]}
                rotation-x={Math.PI / 2}
                scale={[8, 5, 1]}
              />
            </Environment>

            <directionalLight position={[3, 4, 5]} intensity={1.15} />
            <directionalLight position={[-4, -1, -3]} intensity={0.25} color="#7d9fff" />

            <GPUCard mobile={mobile} />
            <DieWorld />
            <Dust />
            <CameraRig mobile={mobile} />

            <EffectComposer multisampling={0}>
              <Bloom luminanceThreshold={0.85} intensity={0.8} mipmapBlur radius={0.7} />
              <Vignette eskil={false} offset={0.26} darkness={0.6} />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </div>

      <Overlay />
    </>
  );
}

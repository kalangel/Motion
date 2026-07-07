"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState, damp, range, smooth, lerp } from "@/lib/scroll";
import { PH, STAGES } from "@/lib/phases";
import { CITY_POS } from "./DieWorld";

/** Pointer parallax, written by the Experience wrapper. */
export const pointerState = { x: 0, y: 0 };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export default function CameraRig({ mobile }: { mobile: boolean }) {
  /* ---------------- GPU-world keyframes ---------------- */
  const gpu = useMemo(() => {
    const zoomOut = mobile ? 1.45 : 1;
    return {
      k0: V(1.15, 0.32, 4.55 * zoomOut),
      k1: V(0.72, 0.22, 4.3 * zoomOut),
      k2: V(0.18, 0.12, 4.35 * zoomOut),
      k3: V(0.35, 0.52, 5.65 * zoomOut),
      k4: V(0.28, 0.4, 5.5 * zoomOut),
      traverse: new THREE.CatmullRomCurve3([
        V(0.28, 0.4, 5.5 * zoomOut),
        V(-0.35, 0.22, 4.1),
        V(0.15, 0.1, 2.7),
        V(0, 0.06, 1.15),
      ]),
      approachEnd: V(0, 0.03, 0.22),
      diveEnd: V(0, 0.02, -0.31),
      lookHero: V(0, 0.2, 0),
      lookCenter: V(0, 0, 0),
      lookExplode: V(0, 0.05, 0.25),
      lookDie: V(0, 0.02, -0.25 * (mobile ? 0.78 : 1)),
    };
  }, [mobile]);

  /* ---------------- City path (local coords, added to CITY_POS) ---------------- */
  const city = useMemo(() => {
    const stops = [
      V(-20, 4.5, 15), // entry
      V(-10.2, 2.0, 9.2), // 1 CUDA
      V(-2.6, 1.7, 8.4), // 2 Tensor
      V(3.4, 1.5, 11.6), // 3 RT
      V(0.5, 5.2, 6.0), // 4 Cache
      V(12.0, 2.6, 4.2), // 5 Memory
      V(7.0, 1.9, 0.6), // 6 AI
      V(-3.0, 5.8, -7.5), // 7 Pipeline
      V(0, 24, 26), // finale
    ];
    const looks = [
      V(-12.6, 0.5, 5),
      V(-12.6, 0.4, 5),
      V(-4.2, 0.9, 5),
      V(7.5, 0.7, 8.8),
      V(0, 0.5, 0),
      V(16.8, 0.7, 0),
      V(-8, 1.0, 0),
      V(4, 1.5, -3),
      V(0, 0, 0),
    ];
    return { curve: new THREE.CatmullRomCurve3(stops, false, "centripetal", 0.6), stops, looks };
  }, []);

  const tmp = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
    }),
    []
  );

  useFrame((state, dt) => {
    /* master damping — the only writer of scrollState.current */
    scrollState.current = damp(scrollState.current, scrollState.target, 5.2, Math.min(dt, 0.05));
    const p = scrollState.current;
    const cam = state.camera as THREE.PerspectiveCamera;
    const { pos, look, a, b } = tmp;

    let fov = mobile ? 50 : 42;

    if (p < PH.dive[1]) {
      /* ----------------------- GPU world ----------------------- */
      if (p < PH.hero[1]) {
        pos.lerpVectors(gpu.k0, gpu.k1, smooth(range(p, 0, PH.hero[1])));
        look.copy(gpu.lookHero);
      } else if (p < PH.rotate[1]) {
        const t = smooth(range(p, PH.rotate[0], PH.rotate[1]));
        pos.lerpVectors(gpu.k1, gpu.k2, t);
        look.lerpVectors(gpu.lookHero, gpu.lookCenter, t);
      } else if (p < PH.explode[1]) {
        const t = smooth(range(p, PH.explode[0], PH.explode[1]));
        pos.lerpVectors(gpu.k2, gpu.k3, t);
        look.lerpVectors(gpu.lookCenter, gpu.lookExplode, t);
      } else if (p < PH.traverse[0]) {
        const t = smooth(range(p, PH.explode[1], PH.traverse[0]));
        pos.lerpVectors(gpu.k3, gpu.k4, t);
        look.copy(gpu.lookExplode);
      } else if (p < PH.traverse[1]) {
        const t = smooth(range(p, PH.traverse[0], PH.traverse[1]));
        gpu.traverse.getPoint(t, pos);
        look.lerpVectors(gpu.lookExplode, gpu.lookDie, t);
      } else if (p < PH.approach[1]) {
        const t = smooth(range(p, PH.approach[0], PH.approach[1]));
        gpu.traverse.getPoint(1, a);
        pos.lerpVectors(a, gpu.approachEnd, t);
        look.copy(gpu.lookDie);
        fov = lerp(fov, 34, t);
      } else {
        const t = smooth(range(p, PH.dive[0], PH.dive[1]));
        pos.lerpVectors(gpu.approachEnd, gpu.diveEnd, t);
        look.copy(gpu.lookDie);
        look.z -= t * 0.5; // keep looking "through" the silicon
        fov = lerp(34, 58, t);
      }

      /* pointer parallax — hero & rotate chapters only */
      const par = (1 - smooth(range(p, 0.16, 0.24))) * (mobile ? 0 : 1);
      pos.x += pointerState.x * 0.22 * par;
      pos.y += -pointerState.y * 0.14 * par;
    } else {
      /* ----------------------- inside the die ----------------------- */
      fov = mobile ? 62 : 55;
      const n = STAGES.length + 1; // entry→s1 ... s7→finale = 8 segments
      const u = range(p, PH.inside[0], 1);
      const seg = Math.min(n - 1, Math.floor(u * n));
      const t = smooth(Math.min(1, Math.max(0, u * n - seg)));
      city.curve.getPoint((seg + t) / n, pos);
      a.copy(city.looks[seg]);
      b.copy(city.looks[Math.min(seg + 1, city.looks.length - 1)]);
      look.lerpVectors(a, b, t);
      pos.add(CITY_POS);
      look.add(CITY_POS);
      /* gentle drift so held frames stay alive */
      pos.y += Math.sin(state.clock.elapsedTime * 0.5) * 0.06;
    }

    /* subtle breathing at all times */
    pos.x += Math.sin(state.clock.elapsedTime * 0.31) * 0.008;
    pos.y += Math.cos(state.clock.elapsedTime * 0.42) * 0.006;

    cam.position.copy(pos);
    cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 6, dt);
      cam.updateProjectionMatrix();
    }
  }, -50);

  return null;
}

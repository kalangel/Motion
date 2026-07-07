"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { scrollState, range, smooth, lerp } from "@/lib/scroll";
import { PH } from "@/lib/phases";

/* ------------------------------------------------------------------ */
/* Part layout: assembled (home) → exploded positions, in card space.  */
/* The explosion spreads along local Z so the camera can fly through.  */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];

const PARTS: Record<string, { home: V3; exp: V3 }> = {
  shroud: { home: [0, 0, 0.27], exp: [0, 0, 2.3] },
  fanL: { home: [-0.85, 0, 0.235], exp: [-1.06, 0, 1.55] },
  fanR: { home: [0.85, 0, 0.235], exp: [1.06, 0, 1.55] },
  heatsink: { home: [0, 0, 0.1], exp: [0, 0, 0.9] },
  vapor: { home: [0, 0, -0.005], exp: [0, 0, 0.35] },
  die: { home: [0, 0.02, -0.068], exp: [0, 0.02, -0.25] },
  memory: { home: [0, 0, -0.062], exp: [0, 0, -0.5] },
  pcb: { home: [0, 0, -0.105], exp: [0, 0, -0.9] },
  backplate: { home: [0, 0, -0.15], exp: [0, 0, -1.55] },
};

const SCREWS: { home: V3; exp: V3 }[] = [
  { home: [-1.55, 0.62, 0.27], exp: [-1.86, 0.84, 2.85] },
  { home: [1.55, 0.62, 0.27], exp: [1.86, 0.84, 2.85] },
  { home: [-1.55, -0.62, 0.27], exp: [-1.86, -0.84, 2.85] },
  { home: [1.55, -0.62, 0.27], exp: [1.86, -0.84, 2.85] },
];

const LABELS: {
  part: keyof typeof PARTS;
  name: string;
  desc: string;
  side: "up" | "down";
  anchor: V3;
}[] = [
  { part: "shroud", name: "Airflow Shroud", desc: "Machined aluminum unibody", side: "up", anchor: [0, 0.85, 0] },
  { part: "fanL", name: "Axial Fans", desc: "2× 90 mm · fluid-dynamic bearings", side: "down", anchor: [0.21, -0.85, 0] },
  { part: "heatsink", name: "Fin Stack", desc: "Vapor-cooled aluminum array", side: "up", anchor: [0, 0.85, 0] },
  { part: "vapor", name: "Vapor Chamber", desc: "Full-coverage copper", side: "down", anchor: [0, -0.85, 0] },
  { part: "die", name: "AD102 GPU", desc: "76.3 B transistors · 4 nm", side: "up", anchor: [0, 0.8, 0] },
  { part: "memory", name: "GDDR6 Memory", desc: "48 GB ECC · 960 GB/s", side: "down", anchor: [0, -0.85, 0] },
  { part: "pcb", name: "12-Layer PCB", desc: "18-phase power delivery", side: "up", anchor: [0, 0.85, 0] },
  { part: "backplate", name: "Backplate", desc: "Structural thermal exhaust", side: "down", anchor: [0, -0.85, 0] },
];

/* Connector chain through the exploded stack (drawn only when exploded). */
const CHAIN: V3[] = [
  [0, 0, 2.85],
  [0, 0, 2.3],
  [0, 0, 1.55],
  [0, 0, 0.9],
  [0, 0, 0.35],
  [0, 0, -0.25],
  [0, 0, -0.5],
  [0, 0, -0.9],
  [0, 0, -1.55],
];
const TICKS: V3[] = CHAIN.flatMap((c) => [
  [c[0], c[1] - 0.07, c[2]] as V3,
  [c[0], c[1] + 0.07, c[2]] as V3,
]);

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */

function makeLogoTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 256);
  ctx.fillStyle = "#dfe3e8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 30px Inter, -apple-system, sans-serif";
  ctx.fillText("N V I D I A", 256, 92);
  ctx.font = "700 58px Inter, -apple-system, sans-serif";
  ctx.fillText("RTX 6000", 256, 156);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeDieTexture() {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#04070a";
  ctx.fillRect(0, 0, s, s);

  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // floorplan blocks
  const cols = 10;
  const rows = 8;
  const cw = (s - 48) / cols;
  const ch = (s - 48) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = 24 + i * cw;
      const y = 24 + j * ch;
      const central = j >= 3 && j <= 4;
      ctx.fillStyle = central ? "#0d1a1e" : "#081114";
      ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      ctx.strokeStyle = `rgba(110, 240, 200, ${central ? 0.5 : 0.28})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, cw - 5, ch - 5);
      // inner subdivisions
      const n = 2 + Math.floor(rnd() * 3);
      ctx.strokeStyle = "rgba(110, 240, 200, 0.14)";
      for (let k = 1; k < n; k++) {
        ctx.beginPath();
        ctx.moveTo(x + 2 + ((cw - 4) * k) / n, y + 4);
        ctx.lineTo(x + 2 + ((cw - 4) * k) / n, y + ch - 4);
        ctx.stroke();
      }
    }
  }
  // bus lines
  ctx.strokeStyle = "rgba(140, 255, 220, 0.5)";
  ctx.lineWidth = 2;
  for (const fy of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(24, s * fy);
    ctx.lineTo(s - 24, s * fy);
    ctx.stroke();
  }
  // glinting vias
  for (let i = 0; i < 260; i++) {
    const a = 0.25 + rnd() * 0.65;
    ctx.fillStyle = `rgba(160, 255, 225, ${a})`;
    const r = rnd() < 0.85 ? 1 : 2;
    ctx.fillRect(24 + rnd() * (s - 48), 24 + rnd() * (s - 48), r, r);
  }
  // border
  ctx.strokeStyle = "rgba(150, 255, 225, 0.8)";
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, s - 28, s - 28);

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* Materials — created per part so pass-through fades stay independent. */
/* ------------------------------------------------------------------ */

const silver = () =>
  new THREE.MeshStandardMaterial({ color: "#82878f", metalness: 0.95, roughness: 0.26 });
const gunmetal = () =>
  new THREE.MeshStandardMaterial({ color: "#16181c", metalness: 0.85, roughness: 0.42 });
const blackPlastic = () =>
  new THREE.MeshStandardMaterial({ color: "#0b0c0f", metalness: 0.2, roughness: 0.6 });
const copper = () =>
  new THREE.MeshStandardMaterial({ color: "#b06b35", metalness: 1, roughness: 0.28 });
const pcbMat = () =>
  new THREE.MeshStandardMaterial({ color: "#0a1410", metalness: 0.35, roughness: 0.55 });
const gold = () =>
  new THREE.MeshStandardMaterial({ color: "#c9a24a", metalness: 1, roughness: 0.35 });

/* ------------------------------------------------------------------ */

export default function GPUCard({ mobile }: { mobile: boolean }) {
  const root = useRef<THREE.Group>(null!);
  const card = useRef<THREE.Group>(null!);
  const partRefs = useRef<Record<string, THREE.Group | null>>({});
  const screwRefs = useRef<(THREE.Group | null)[]>([]);
  const fanHubL = useRef<THREE.Group>(null!);
  const fanHubR = useRef<THREE.Group>(null!);
  const chipRefs = useRef<(THREE.Mesh | null)[]>([]);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelGrpRefs = useRef<(THREE.Group | null)[]>([]);
  const chainRef = useRef<any>(null);
  const railARef = useRef<any>(null);
  const railBRef = useRef<any>(null);
  const tickRef = useRef<any>(null);
  const dieGlow = useRef<THREE.PointLight>(null!);

  const logoTex = useMemo(makeLogoTexture, []);
  const dieTex = useMemo(makeDieTexture, []);

  const dieMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0a0f10",
        metalness: 0.4,
        roughness: 0.35,
        emissive: new THREE.Color("#8ffce0"),
        emissiveMap: dieTex,
        emissiveIntensity: 0.55,
      }),
    [dieTex]
  );

  /* Per-part material registry for the pass-through dissolve. */
  const partMats = useRef<Record<string, THREE.Material[]>>({});
  useEffect(() => {
    const reg: Record<string, THREE.Material[]> = {};
    for (const id of Object.keys(PARTS)) {
      const g = partRefs.current[id];
      if (!g) continue;
      const mats: THREE.Material[] = [];
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && !mats.includes(m)) mats.push(m);
      });
      reg[id] = mats;
    }
    partMats.current = reg;
  }, []);

  /* Memory chip base positions (spread radially when exploded). */
  const chipBases = useMemo(() => {
    const b: { x: number; y: number; rot: number }[] = [];
    for (const x of [-0.51, -0.17, 0.17, 0.51]) b.push({ x, y: 0.35, rot: 0 });
    for (const x of [-0.51, -0.17, 0.17, 0.51]) b.push({ x, y: -0.35, rot: 0 });
    for (const y of [-0.12, 0.12]) b.push({ x: -0.74, y, rot: Math.PI / 2 });
    for (const y of [-0.12, 0.12]) b.push({ x: 0.74, y, rot: Math.PI / 2 });
    return b;
  }, []);

  /* PCB surface components (instanced). */
  const pcbInst = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const m = pcbInst.current;
    if (!m) return;
    const d = new THREE.Object3D();
    let seed = 31;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let i = 0;
    let guard = 0;
    while (i < 90 && guard++ < 4000) {
      const x = -1.5 + rnd() * 3.0;
      const y = -0.62 + rnd() * 1.24;
      if (Math.abs(x) < 0.95 && Math.abs(y) < 0.55) continue; // keep die/memory area clear
      const w = 0.03 + rnd() * 0.09;
      const h = 0.02 + rnd() * 0.07;
      const t = 0.01 + rnd() * 0.03;
      d.position.set(x, y, 0.016 + t / 2);
      d.scale.set(w / 0.05, h / 0.05, t / 0.05);
      d.rotation.z = rnd() < 0.5 ? 0 : Math.PI / 2;
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
  }, []);

  /* Heatsink fins (instanced). */
  const finInst = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const m = finInst.current;
    if (!m) return;
    const d = new THREE.Object3D();
    const N = 64;
    for (let i = 0; i < N; i++) {
      d.position.set(-1.53 + (3.06 * i) / (N - 1), 0, 0);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);

  const tmpV = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const p = scrollState.current;
    const t = state.clock.elapsedTime;
    const g = card.current;
    if (!g) return;

    root.current.visible = p < PH.dive[1] + 0.01;
    if (!root.current.visible) return;

    /* ---- card rotation & float ---- */
    const floatAmt = 1 - smooth(range(p, 0.18, 0.3));
    g.position.y = Math.sin(t * 0.7) * 0.04 * floatAmt;
    const idleYaw = Math.sin(t * 0.22) * 0.06 * floatAmt;

    const rt = smooth(range(p, PH.rotate[0], PH.rotate[1]));
    const ex = smooth(range(p, PH.explode[0], PH.explode[1]));
    const back = smooth(range(p, 0.42, 0.5));

    let yaw = -0.38 + rt * TAU; // one full showcase turn
    yaw = lerp(yaw, TAU - 1.12, ex); // settle side-on for the exploded view
    yaw = lerp(yaw, TAU, back); // re-align for the fly-through
    g.rotation.y = yaw + idleYaw;

    let pitch = Math.sin(t * 0.35) * 0.02 * floatAmt + Math.sin(rt * Math.PI) * 0.22;
    pitch = lerp(pitch, 0.09, ex);
    pitch = lerp(pitch, 0, back);
    g.rotation.x = pitch;
    g.rotation.z = Math.sin(t * 0.5) * 0.012 * floatAmt;

    /* ---- explosion ---- */
    const spread = mobile ? 0.78 : 1;
    for (const [id, def] of Object.entries(PARTS)) {
      const pr = partRefs.current[id];
      if (!pr) continue;
      pr.position.set(
        lerp(def.home[0], def.exp[0] * spread, ex),
        lerp(def.home[1], def.exp[1], ex),
        lerp(def.home[2], def.exp[2] * spread, ex)
      );
    }
    SCREWS.forEach((s, i) => {
      const pr = screwRefs.current[i];
      if (!pr) return;
      pr.position.set(
        lerp(s.home[0], s.exp[0] * spread, ex),
        lerp(s.home[1], s.exp[1], ex),
        lerp(s.home[2], s.exp[2] * spread, ex)
      );
      pr.rotation.z = ex * Math.PI * 3 * (i % 2 ? 1 : -1); // unscrew
    });
    chipRefs.current.forEach((chip, i) => {
      if (!chip) return;
      const b = chipBases[i];
      const k = 1 + 0.5 * ex;
      chip.position.set(b.x * k, b.y * k, 0.02);
    });

    /* ---- fans ---- */
    const fanSpeed = 5.5 * (1 - smooth(range(p, 0.05, 0.24))) + 0.35;
    if (fanHubL.current) fanHubL.current.rotation.z += dt * fanSpeed;
    if (fanHubR.current) fanHubR.current.rotation.z -= dt * fanSpeed;

    /* ---- pass-through dissolve during the traverse ---- */
    const inTraverse = p > 0.4 && p < PH.dive[1] + 0.01;
    const camZ = state.camera.position.z;
    for (const [id, mats] of Object.entries(partMats.current)) {
      if (id === "die") continue;
      const pr = partRefs.current[id];
      if (!pr) continue;
      let vis = 1;
      if (inTraverse) {
        pr.getWorldPosition(tmpV);
        vis = THREE.MathUtils.clamp((camZ - (tmpV.z + 0.28)) / 0.85, 0, 1);
      }
      const s = 0.9 + 0.1 * vis;
      pr.scale.setScalar(s);
      pr.visible = vis > 0.003;
      for (const m of mats) {
        (m as THREE.MeshStandardMaterial).transparent = inTraverse;
        (m as THREE.MeshStandardMaterial).opacity = inTraverse ? vis : 1;
      }
    }

    /* ---- die energizes on approach ---- */
    const heat = smooth(range(p, PH.approach[0], PH.dive[0] + 0.02));
    dieMat.emissiveIntensity = 0.55 + heat * 3.2;
    if (dieGlow.current) dieGlow.current.intensity = heat * 2.2;

    /* ---- labels (anchored to their moving parts) ---- */
    const la = PH.labels[0];
    labelRefs.current.forEach((el, i) => {
      const lg = labelGrpRefs.current[i];
      const part = partRefs.current[LABELS[i].part];
      if (lg && part) {
        lg.position.set(
          part.position.x + LABELS[i].anchor[0],
          part.position.y + LABELS[i].anchor[1],
          part.position.z + LABELS[i].anchor[2]
        );
      }
      if (!el) return;
      const a =
        smooth(range(p, la + i * 0.016, la + i * 0.016 + 0.035)) *
        (1 - smooth(range(p, 0.42, 0.455)));
      const wrap = el.parentElement?.parentElement as HTMLElement | null;
      if (wrap) wrap.style.display = a < 0.004 ? "none" : "";
      el.style.opacity = String(a);
      el.style.transform = `translateY(${(1 - a) * 10}px)`;
    });

    /* ---- connectors ---- */
    const ca =
      smooth(range(p, 0.252, 0.3)) * (1 - smooth(range(p, 0.435, 0.475)));
    for (const r of [chainRef, railARef, railBRef, tickRef]) {
      const line = r.current;
      if (!line) continue;
      line.visible = ca > 0.004;
      const m = line.material;
      if (m) {
        m.opacity = ca * (r === chainRef ? 0.85 : 0.4);
        m.dashOffset = -t * 0.22;
      }
    }
  });

  const spread = mobile ? 0.78 : 1;
  const chainPts = useMemo(
    () => CHAIN.map((c) => [c[0], c[1], c[2] * spread] as V3),
    [spread]
  );
  const tickPts = useMemo(
    () => TICKS.map((c) => [c[0], c[1], c[2] * spread] as V3),
    [spread]
  );

  return (
    <group ref={root} scale={mobile ? 0.72 : 1}>
      <group ref={card}>
        {/* ======================= SHROUD ======================= */}
        <group ref={(r) => void (partRefs.current.shroud = r)}>
          {/* frame */}
          <mesh position={[0, 0.71, 0]} material={silver()}>
            <boxGeometry args={[3.42, 0.13, 0.13]} />
          </mesh>
          <mesh position={[0, -0.71, 0]} material={silver()}>
            <boxGeometry args={[3.42, 0.13, 0.13]} />
          </mesh>
          <mesh position={[-1.66, 0, 0]} material={silver()}>
            <boxGeometry args={[0.13, 1.55, 0.13]} />
          </mesh>
          <mesh position={[1.66, 0, 0]} material={silver()}>
            <boxGeometry args={[0.13, 1.55, 0.13]} />
          </mesh>
          {/* X brace */}
          <mesh rotation={[0, 0, 0.71]} material={gunmetal()}>
            <boxGeometry args={[1.95, 0.3, 0.11]} />
          </mesh>
          <mesh rotation={[0, 0, -0.71]} material={gunmetal()}>
            <boxGeometry args={[1.95, 0.3, 0.11]} />
          </mesh>
          {/* center plate + logotype */}
          <mesh material={gunmetal()}>
            <boxGeometry args={[0.66, 0.52, 0.12]} />
          </mesh>
          <mesh position={[0, 0, 0.062]}>
            <planeGeometry args={[0.58, 0.29]} />
            <meshBasicMaterial map={logoTex} transparent toneMapped={false} />
          </mesh>
          {/* fan rings */}
          <mesh position={[-0.85, 0, 0]} material={silver()}>
            <torusGeometry args={[0.62, 0.038, 12, 64]} />
          </mesh>
          <mesh position={[0.85, 0, 0]} material={silver()}>
            <torusGeometry args={[0.62, 0.038, 12, 64]} />
          </mesh>
        </group>

        {/* ======================= FANS ======================= */}
        {(["L", "R"] as const).map((side) => (
          <group
            key={side}
            ref={(r) => void (partRefs.current[side === "L" ? "fanL" : "fanR"] = r)}
          >
            <mesh material={blackPlastic()}>
              <torusGeometry args={[0.58, 0.025, 10, 48]} />
            </mesh>
            <group ref={side === "L" ? fanHubL : fanHubR}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.16, 0.16, 0.07, 32]} />
                <meshStandardMaterial color="#101114" metalness={0.6} roughness={0.35} />
              </mesh>
              {Array.from({ length: 9 }).map((_, i) => (
                <group key={i} rotation={[0, 0, (i / 9) * TAU]}>
                  <mesh position={[0.34, 0, 0]} rotation={[0.5, 0, 0.12]}>
                    <boxGeometry args={[0.4, 0.14, 0.016]} />
                    <meshStandardMaterial color="#0c0d10" metalness={0.35} roughness={0.5} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        ))}

        {/* ======================= HEATSINK ======================= */}
        <group ref={(r) => void (partRefs.current.heatsink = r)}>
          <instancedMesh ref={finInst} args={[undefined, undefined, 64]}>
            <boxGeometry args={[0.016, 1.38, 0.34]} />
            <meshStandardMaterial color="#82878f" metalness={0.95} roughness={0.38} />
          </instancedMesh>
          {/* base plate — blocks see-through, grounds the fin array */}
          <mesh position={[0, 0, -0.185]}>
            <boxGeometry args={[3.08, 1.4, 0.03]} />
            <meshStandardMaterial color="#4c5158" metalness={0.9} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[3.1, 0.02, 0.34]} />
            <meshStandardMaterial color="#6d727a" metalness={0.95} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.7, 0]}>
            <boxGeometry args={[3.1, 0.02, 0.34]} />
            <meshStandardMaterial color="#6d727a" metalness={0.95} roughness={0.4} />
          </mesh>
        </group>

        {/* ======================= VAPOR CHAMBER ======================= */}
        <group ref={(r) => void (partRefs.current.vapor = r)}>
          <mesh material={copper()}>
            <boxGeometry args={[3.02, 1.32, 0.05]} />
          </mesh>
          {[-0.42, -0.14, 0.14, 0.42].map((y, i) => (
            <mesh key={i} position={[0, y, 0.045]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.028, 0.028, 2.86, 12]} />
              <meshStandardMaterial color="#8f5527" metalness={1} roughness={0.32} />
            </mesh>
          ))}
        </group>

        {/* ======================= GPU DIE ======================= */}
        <group ref={(r) => void (partRefs.current.die = r)}>
          {/* substrate */}
          <mesh position={[0, 0, -0.006]}>
            <boxGeometry args={[0.66, 0.66, 0.018]} />
            <meshStandardMaterial color="#12331f" metalness={0.3} roughness={0.45} />
          </mesh>
          {/* silicon */}
          <mesh position={[0, 0, 0.012]} material={dieMat}>
            <boxGeometry args={[0.46, 0.46, 0.016]} />
          </mesh>
          <pointLight ref={dieGlow} color="#7cf5d4" intensity={0} distance={2.5} />
        </group>

        {/* ======================= MEMORY ======================= */}
        <group ref={(r) => void (partRefs.current.memory = r)}>
          {Array.from({ length: 12 }).map((_, i) => (
            <mesh
              key={i}
              ref={(m) => void (chipRefs.current[i] = m)}
              rotation={[0, 0, i >= 8 ? Math.PI / 2 : 0]}
            >
              <boxGeometry args={[0.27, 0.15, 0.015]} />
              <meshStandardMaterial color="#0b0c10" metalness={0.55} roughness={0.4} />
            </mesh>
          ))}
        </group>

        {/* ======================= PCB ======================= */}
        <group ref={(r) => void (partRefs.current.pcb = r)}>
          <mesh material={pcbMat()}>
            <boxGeometry args={[3.3, 1.44, 0.03]} />
          </mesh>
          {/* PCIe edge fingers */}
          <mesh position={[-0.45, -0.755, 0]} material={gold()}>
            <boxGeometry args={[1.15, 0.07, 0.026]} />
          </mesh>
          {/* IO bracket */}
          <mesh position={[-1.72, -0.05, 0.1]}>
            <boxGeometry args={[0.05, 1.34, 0.5]} />
            <meshStandardMaterial color="#9ba1a9" metalness={0.9} roughness={0.4} />
          </mesh>
          {/* surface components */}
          <instancedMesh ref={pcbInst} args={[undefined, undefined, 90]}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshStandardMaterial color="#23262c" metalness={0.5} roughness={0.5} />
          </instancedMesh>
        </group>

        {/* ======================= BACKPLATE ======================= */}
        <group ref={(r) => void (partRefs.current.backplate = r)}>
          <mesh material={gunmetal()}>
            <boxGeometry args={[3.36, 1.48, 0.024]} />
          </mesh>
          {[0.95, 1.1, 1.25, 1.4].map((x, i) => (
            <mesh key={i} position={[x, 0, -0.014]}>
              <boxGeometry args={[0.06, 1.2, 0.01]} />
              <meshStandardMaterial color="#000205" roughness={0.9} />
            </mesh>
          ))}
          {/* accent line */}
          <mesh position={[-1.6, 0, -0.014]}>
            <boxGeometry args={[0.02, 1.3, 0.006]} />
            <meshStandardMaterial
              color="#76b900"
              emissive="#76b900"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* ======================= SCREWS ======================= */}
        {SCREWS.map((_, i) => (
          <group key={i} ref={(r) => void (screwRefs.current[i] = r)}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={silver()}>
              <cylinderGeometry args={[0.02, 0.02, 0.05, 12]} />
            </mesh>
            <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={silver()}>
              <cylinderGeometry args={[0.036, 0.036, 0.018, 6]} />
            </mesh>
          </group>
        ))}

        {/* ======================= CONNECTORS ======================= */}
        <Line
          ref={chainRef}
          points={chainPts}
          color="#9fd6b8"
          lineWidth={1}
          dashed
          dashSize={0.06}
          gapSize={0.05}
          transparent
          opacity={0}
        />
        <Line
          ref={railARef}
          points={[
            [-1.5 * spread, 0.58, 2.85 * spread],
            [-1.5 * spread, 0.58, -1.55 * spread],
          ]}
          color="#ffffff"
          lineWidth={0.7}
          dashed
          dashSize={0.04}
          gapSize={0.07}
          transparent
          opacity={0}
        />
        <Line
          ref={railBRef}
          points={[
            [1.5 * spread, -0.58, 2.85 * spread],
            [1.5 * spread, -0.58, -1.55 * spread],
          ]}
          color="#ffffff"
          lineWidth={0.7}
          dashed
          dashSize={0.04}
          gapSize={0.07}
          transparent
          opacity={0}
        />
        <Line
          ref={tickRef}
          points={tickPts}
          segments
          color="#ffffff"
          lineWidth={1}
          transparent
          opacity={0}
        />

        {/* ======================= LABELS ======================= */}
        {LABELS.map((l, i) => {
          const def = PARTS[l.part];
          const pos: V3 = [
            def.exp[0] * spread + l.anchor[0],
            def.exp[1] + l.anchor[1],
            def.exp[2] * spread + l.anchor[2],
          ];
          return (
            <group
              key={l.part}
              position={pos}
              ref={(g) => void (labelGrpRefs.current[i] = g)}
            >
              <Html zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
                <div className={l.side === "up" ? "lbl-pos-up" : "lbl-pos-down"}>
                  <div
                    ref={(el) => void (labelRefs.current[i] = el)}
                    className={`gpu-label gpu-label--${l.side}`}
                    style={{ opacity: 0 }}
                  >
                    <span className="dot" />
                    <span className="rule" />
                    <span className="txt">
                      <span className="name">{l.name}</span>
                      <span className="desc">{l.desc}</span>
                    </span>
                  </div>
                </div>
              </Html>
            </group>
          );
        })}
      </group>
    </group>
  );
}

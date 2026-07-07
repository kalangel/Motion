"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { scrollState, bell } from "@/lib/scroll";
import { PH, STAGES, stageRange } from "@/lib/phases";

/** World-space anchor for the inside-the-silicon city. */
export const CITY_POS = new THREE.Vector3(0, -220, 0);

const CLUSTER_X = [-12.6, -4.2, 4.2, 12.6];
const CLUSTER_Z = [-5, 5];

/* ------------------------------------------------------------------ */
/* Floor: procedural silicon grid                                      */
/* ------------------------------------------------------------------ */

const floorVert = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const floorFrag = /* glsl */ `
  varying vec3 vPos;
  float gridLine(vec2 p, float scale, float width) {
    vec2 g = abs(fract(p / scale - 0.5) - 0.5) * scale;
    float d = min(g.x, g.y);
    return 1.0 - smoothstep(0.0, width, d);
  }
  void main() {
    vec2 p = vPos.xy; // plane is rotated; xy is the surface
    float minor = gridLine(p, 1.0, 0.03) * 0.16;
    float major = gridLine(p, 4.0, 0.045) * 0.38;
    float r = length(p) / 26.0;
    float fade = 1.0 - smoothstep(0.55, 1.15, r);
    vec3 base = vec3(0.012, 0.016, 0.02);
    vec3 line = vec3(0.32, 0.85, 0.68);
    vec3 col = base + line * (minor + major) * fade;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/* Data-flow particles                                                 */
/* ------------------------------------------------------------------ */

const partVert = /* glsl */ `
  attribute float aSpeed;
  attribute float aSize;
  attribute float aTint;
  uniform float uTime;
  varying float vTint;
  varying float vFadeX;
  void main() {
    vTint = aTint;
    vec3 p = position;
    p.x = mod(p.x + uTime * aSpeed, 38.0) - 19.0;
    vFadeX = 1.0 - smoothstep(15.0, 19.0, abs(p.x));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(aSize * (110.0 / -mv.z), 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const partFrag = /* glsl */ `
  uniform float uOpacity;
  varying float vTint;
  varying float vFadeX;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.05, d) * uOpacity * vFadeX;
    vec3 green = vec3(0.55, 0.95, 0.45);
    vec3 white = vec3(0.85, 0.95, 1.0);
    gl_FragColor = vec4(mix(green, white, vTint), a);
  }
`;

/* ------------------------------------------------------------------ */

export default function DieWorld() {
  const root = useRef<THREE.Group>(null!);

  /* materials that get stage-highlighted (shared across their meshes) */
  const cudaMat = useRef<THREE.MeshStandardMaterial>(null!);
  const cacheMat = useRef<THREE.MeshStandardMaterial>(null!);
  const tensorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1c1206",
        metalness: 0.6,
        roughness: 0.35,
        emissive: new THREE.Color("#ffb454"),
        emissiveIntensity: 0.28,
      }),
    []
  );
  const rtMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#04140d",
        metalness: 0.6,
        roughness: 0.35,
        emissive: new THREE.Color("#3ddc84"),
        emissiveIntensity: 0.28,
      }),
    []
  );
  const memMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#04141c",
        metalness: 0.6,
        roughness: 0.35,
        emissive: new THREE.Color("#22d3ee"),
        emissiveIntensity: 0.28,
      }),
    []
  );
  const beamGroup = useRef<THREE.Group>(null!);
  const beamRef = useRef<any>(null);
  const pulseA = useRef<THREE.Mesh>(null!);
  const pulseB = useRef<THREE.Mesh>(null!);

  /* CUDA core field — one InstancedMesh, 8 clusters */
  const cudaInst = useRef<THREE.InstancedMesh>(null!);
  const CUDA_PER = 12 * 8;
  const CUDA_COUNT = CUDA_PER * CLUSTER_X.length * CLUSTER_Z.length;

  useEffect(() => {
    const m = cudaInst.current;
    if (!m) return;
    const d = new THREE.Object3D();
    let seed = 5;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let i = 0;
    for (const cx of CLUSTER_X) {
      for (const cz of CLUSTER_Z) {
        for (let a = 0; a < 12; a++) {
          for (let b = 0; b < 8; b++) {
            const h = 0.3 + rnd() * 0.55;
            d.position.set(cx - 2.75 + a * 0.5, h / 2, cz - 1.75 + b * 0.5);
            d.scale.set(1, h / 0.4, 1);
            d.updateMatrix();
            m.setMatrixAt(i++, d.matrix);
          }
        }
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);

  /* particles */
  const particleGeo = useMemo(() => {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const speed = new Float32Array(N);
    const size = new Float32Array(N);
    const tint = new Float32Array(N);
    let seed = 17;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const lanesZ = [0, 0, 0, 7.0, -7.0]; // central avenue + two streets
    for (let i = 0; i < N; i++) {
      const lane = lanesZ[Math.floor(rnd() * lanesZ.length)];
      pos[i * 3] = rnd() * 38 - 19;
      pos[i * 3 + 1] = 0.3 + rnd() * 2.1;
      pos[i * 3 + 2] = lane + (rnd() - 0.5) * (lane === 0 ? 3.6 : 1.6);
      speed[i] = (2.5 + rnd() * 6) * (rnd() < 0.2 ? -1 : 1);
      size[i] = 0.32 + rnd() * 0.85;
      tint[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
    return g;
  }, []);

  const particleMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: partVert,
        fragmentShader: partFrag,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.5 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const floorMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: floorFrag,
      }),
    []
  );

  /* ray-tracing beam */
  const beamCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-17, 6.5, -9.5),
        new THREE.Vector3(-8, 1.1, -4),
        new THREE.Vector3(-1, 6.8, -8.5),
        new THREE.Vector3(6, 1.1, -2),
        new THREE.Vector3(12, 5.2, -6.5),
        new THREE.Vector3(17.5, 1.8, -9.5),
      ]),
    []
  );
  const beamPts = useMemo(
    () => beamCurve.getPoints(120).map((v) => [v.x, v.y, v.z] as [number, number, number]),
    [beamCurve]
  );

  const tmpV = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const p = scrollState.current;
    const g = root.current;
    if (!g) return;
    g.visible = p > PH.dive[0] - 0.01;
    if (!g.visible) return;

    const t = state.clock.elapsedTime;
    particleMat.uniforms.uTime.value = t;

    /* stage weights */
    const w = STAGES.map((_, i) => {
      const [a, b] = stageRange(i);
      return bell(p, a, b, 0.4);
    });
    const finale = bell(p, PH.finale[0], 1.02, 0.9); // stays on at the end

    if (cudaMat.current) cudaMat.current.emissiveIntensity = 0.16 + w[0] * 1.1 + finale * 0.35;
    tensorMat.emissiveIntensity = 0.28 + w[1] * 1.7 + w[5] * 0.7 + finale * 0.25;
    rtMat.emissiveIntensity = 0.28 + w[2] * 1.7 + w[6] * 0.8 + finale * 0.25;
    if (cacheMat.current) cacheMat.current.emissiveIntensity = 0.22 + w[3] * 1.4 + finale * 0.25;
    memMat.emissiveIntensity = 0.28 + w[4] * 1.5 + finale * 0.25;
    particleMat.uniforms.uOpacity.value = 0.3 + w[5] * 0.6 + finale * 0.15;

    /* beam + pulses (ray tracing pipeline) */
    const beamOn = Math.max(w[6], finale * 0.5);
    if (beamGroup.current) beamGroup.current.visible = beamOn > 0.01;
    if (beamRef.current?.material) beamRef.current.material.opacity = beamOn * 0.55;
    if (beamGroup.current.visible) {
      const u1 = (t * 0.16) % 1;
      const u2 = (t * 0.16 + 0.45) % 1;
      beamCurve.getPoint(u1, tmpV);
      pulseA.current.position.copy(tmpV);
      (pulseA.current.material as THREE.MeshBasicMaterial).opacity = beamOn;
      beamCurve.getPoint(u2, tmpV);
      pulseB.current.position.copy(tmpV);
      (pulseB.current.material as THREE.MeshBasicMaterial).opacity = beamOn * 0.8;
    }
  });

  return (
    <group ref={root} position={CITY_POS} visible={false}>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={floorMat}>
        <planeGeometry args={[52, 36]} />
      </mesh>

      {/* die border frame */}
      {[
        { pos: [0, 0.12, -12.5], scale: [37, 0.24, 0.12] },
        { pos: [0, 0.12, 12.5], scale: [37, 0.24, 0.12] },
        { pos: [-18.5, 0.12, 0], scale: [0.12, 0.24, 25] },
        { pos: [18.5, 0.12, 0], scale: [0.12, 0.24, 25] },
      ].map((b, i) => (
        <mesh key={i} position={b.pos as [number, number, number]}>
          <boxGeometry args={b.scale as [number, number, number]} />
          <meshStandardMaterial
            color="#0c1a18"
            emissive="#3ddcaa"
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* CUDA cores */}
      <instancedMesh ref={cudaInst} args={[undefined, undefined, CUDA_COUNT]}>
        <boxGeometry args={[0.34, 0.4, 0.34]} />
        <meshStandardMaterial
          ref={cudaMat}
          color="#131b1e"
          metalness={0.5}
          roughness={0.4}
          emissive="#9adfc8"
          emissiveIntensity={0.16}
        />
      </instancedMesh>

      {/* Tensor cores — one monolith per cluster */}
      {CLUSTER_X.flatMap((cx) =>
        CLUSTER_Z.map((cz) => (
          <mesh key={`t${cx}${cz}`} position={[cx, 0.85, cz]} material={tensorMat}>
            <boxGeometry args={[1.15, 1.7, 1.15]} />
          </mesh>
        ))
      )}

      {/* RT cores — diamond prisms along the outer edges */}
      {Array.from({ length: 24 }).map((_, i) => {
        const row = i < 12 ? -8.8 : 8.8;
        const x = -13.75 + (i % 12) * 2.5;
        return (
          <mesh
            key={i}
            position={[x, 0.75, row]}
            rotation={[0, Math.PI / 4, 0]}
            material={rtMat}
          >
            <boxGeometry args={[0.8, 1.3, 0.8]} />
          </mesh>
        );
      })}

      {/* L2 cache — the central reservoir */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[26, 0.9, 3.4]} />
        <meshStandardMaterial
          ref={cacheMat}
          color="#120e1e"
          metalness={0.6}
          roughness={0.3}
          emissive="#a78bfa"
          emissiveIntensity={0.22}
        />
      </mesh>

      {/* memory controllers along both edges */}
      {[-16.8, 16.8].flatMap((x) =>
        Array.from({ length: 6 }).map((_, i) => (
          <mesh key={`m${x}${i}`} position={[x, 0.35, -8.75 + i * 3.5]} material={memMat}>
            <boxGeometry args={[1.1, 0.7, 2.2]} />
          </mesh>
        ))
      )}

      {/* data-flow particles */}
      <points geometry={particleGeo} material={particleMat} />

      {/* ray-tracing beam */}
      <group ref={beamGroup} visible={false}>
        <Line
          ref={beamRef}
          points={beamPts}
          color="#7cffc4"
          lineWidth={1.2}
          transparent
          opacity={0}
        />
        <mesh ref={pulseA}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshBasicMaterial color="#d9ffe9" transparent opacity={0} toneMapped={false} />
        </mesh>
        <mesh ref={pulseB}>
          <sphereGeometry args={[0.11, 16, 16]} />
          <meshBasicMaterial color="#8effc8" transparent opacity={0} toneMapped={false} />
        </mesh>
      </group>

      {/* cool ambient for the city */}
      <ambientLight intensity={0.18} />
      <directionalLight position={[8, 20, 10]} intensity={0.5} color="#bfd8ff" />
    </group>
  );
}

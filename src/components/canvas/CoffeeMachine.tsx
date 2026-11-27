import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScrollState } from '../../hooks/useScrollRig';
import { createWaterSaturationMaterial } from '../../shaders/liquidShader';
import { createXrayShellMaterial } from '../../shaders/xrayMaterial';

interface CoffeeMachineProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const _dummy = new THREE.Object3D();

function createBeveledPanelGeo(
  width: number,
  height: number,
  depth: number,
  radius = 0.06,
  bevel = 0.02,
): THREE.BufferGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw * 0.4, hh * 0.4);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 20,
  });
  raw.center();
  const creased = BufferGeometryUtils.toCreasedNormals(raw, Math.PI / 4.5);
  raw.dispose();
  return creased;
}

function createCleanLathe(
  points: THREE.Vector2[],
  segments = 56,
  creaseAngle = Math.PI / 5,
): THREE.BufferGeometry {
  const raw = new THREE.LatheGeometry(points, segments);
  const creased = BufferGeometryUtils.toCreasedNormals(raw, creaseAngle);
  raw.dispose();
  return creased;
}

function createWalnutCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4e2c18';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 240; i++) {
    const y = (i / 240) * 512;
    const wave = Math.sin(i * 0.14) * 14;
    ctx.strokeStyle =
      i % 3 === 0 ? 'rgba(24, 12, 5, 0.42)' : 'rgba(116, 70, 42, 0.30)';
    ctx.lineWidth = 1.2 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + wave, 340, y - wave, 512, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createGaugeTexture(maxVal: number, label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;
  const grad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 246);
  grad.addColorStop(0, '#221e1a');
  grad.addColorStop(0.85, '#141210');
  grad.addColorStop(1, '#0c0b09');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 246, 0, Math.PI * 2);
  ctx.fill();

  const startAngle = Math.PI * 0.75;
  const totalSweep = Math.PI * 1.5;
  ctx.strokeStyle = '#d98a4e';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    186,
    startAngle + (maxVal === 15 ? 8 / 15 : 1.1 / 3) * totalSweep,
    startAngle + (maxVal === 15 ? 10.5 / 15 : 1.6 / 3) * totalSweep,
  );
  ctx.stroke();

  for (let i = 0; i <= 24; i++) {
    const frac = i / 24;
    const angle = startAngle + frac * totalSweep;
    const major = i % 4 === 0;
    ctx.strokeStyle = major ? '#f5f1eb' : '#857c71';
    ctx.lineWidth = major ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (major ? 182 : 196), cy + Math.sin(angle) * (major ? 182 : 196));
    ctx.lineTo(cx + Math.cos(angle) * 212, cy + Math.sin(angle) * 212);
    ctx.stroke();
  }

  ctx.fillStyle = '#c87a4b';
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BAR', cx, cy + 84);
  ctx.fillStyle = '#a89e92';
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(label, cx, cy - 60);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function CoffeeMachine({ scrollStateRef }: CoffeeMachineProps) {
  const lidPivotRef = useRef<THREE.Group | null>(null);
  const solidShellRef = useRef<THREE.Group | null>(null);
  const xrayShellRef = useRef<THREE.Group | null>(null);
  const burrRotorRef = useRef<THREE.Group | null>(null);
  const pistonRef = useRef<THREE.Group | null>(null);
  const puckRef = useRef<THREE.Mesh | null>(null);
  const needleRef = useRef<THREE.Group | null>(null);
  const boilerCoilMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const puckSaturationMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const teethMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const grateMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const fBoltsRef = useRef<THREE.InstancedMesh | null>(null);

  const xrayMat = useMemo(() => createXrayShellMaterial(), []);
  const waterFlowMat = useMemo(() => createWaterSaturationMaterial(), []);
  const walnutTex = useMemo(() => createWalnutCanvasTexture(), []);
  const brewGaugeTex = useMemo(() => createGaugeTexture(15, 'BREW'), []);
  const steamGaugeTex = useMemo(() => createGaugeTexture(3, 'STEAM'), []);

  // Reusable PBR materials for clean solid <-> X-ray transition
  const matteBlackMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x201e1c,
        roughness: 0.42,
        metalness: 0.48,
        clearcoat: 0.2,
        clearcoatRoughness: 0.35,
        transparent: true,
        opacity: 1,
      }),
    [],
  );

  const brushedSteelMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xe2e5e9,
        roughness: 0.17,
        metalness: 0.92,
        clearcoat: 0.35,
        transparent: true,
        opacity: 1,
      }),
    [],
  );

  // Geometries built cleanly with creased normals
  const geos = useMemo(() => {
    const basePlinth = createBeveledPanelGeo(2.26, 2.04, 0.28, 0.14, 0.024);
    basePlinth.rotateX(Math.PI / 2);
    const trayDeck = createBeveledPanelGeo(1.94, 0.90, 0.036, 0.05, 0.008);
    trayDeck.rotateX(Math.PI / 2);

    const rearSpine = createBeveledPanelGeo(2.22, 3.68, 0.36, 0.1, 0.022);
    const sideWall = createBeveledPanelGeo(1.22, 3.68, 0.16, 0.08, 0.02);
    const frontLower = createBeveledPanelGeo(1.94, 2.02, 0.12, 0.06, 0.018);
    const splashMirror = createBeveledPanelGeo(1.66, 1.52, 0.025, 0.04, 0.006);
    const frontUpper = createBeveledPanelGeo(1.98, 1.32, 0.74, 0.08, 0.022);
    const topDeck = createBeveledPanelGeo(2.26, 1.68, 0.14, 0.12, 0.02);
    topDeck.rotateX(Math.PI / 2);
    const warmerPlate = createBeveledPanelGeo(1.94, 1.38, 0.025, 0.08, 0.006);
    warmerPlate.rotateX(Math.PI / 2);
    const lidHandle = createBeveledPanelGeo(0.32, 0.045, 0.12, 0.02, 0.008);
    const groupBridge = createBeveledPanelGeo(0.76, 0.34, 0.78, 0.08, 0.018);

    const railCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.96, 4.24, 0.56),
      new THREE.Vector3(-0.96, 4.24, -0.76),
      new THREE.Vector3(0.96, 4.24, -0.76),
      new THREE.Vector3(0.96, 4.24, 0.56),
    ]);
    const galleryRail = new THREE.TubeGeometry(railCurve, 56, 0.02, 14, false);

    const collar = createCleanLathe(
      [
        new THREE.Vector2(0.54, 0),
        new THREE.Vector2(0.69, 0),
        new THREE.Vector2(0.69, 0.055),
        new THREE.Vector2(0.64, 0.095),
        new THREE.Vector2(0.56, 0.095),
        new THREE.Vector2(0.54, 0.04),
        new THREE.Vector2(0.54, 0),
      ],
      56,
      Math.PI / 6,
    );

    const lidBezel = createCleanLathe(
      [
        new THREE.Vector2(0.54, -0.02),
        new THREE.Vector2(0.67, -0.02),
        new THREE.Vector2(0.67, 0.03),
        new THREE.Vector2(0.62, 0.065),
        new THREE.Vector2(0.55, 0.065),
        new THREE.Vector2(0.54, 0.02),
      ],
      56,
      Math.PI / 6,
    );

    const funnel = createCleanLathe(
      [
        new THREE.Vector2(0.14, 0.0),
        new THREE.Vector2(0.32, 0.16),
        new THREE.Vector2(0.51, 0.44),
        new THREE.Vector2(0.56, 0.62),
      ],
      48,
    );

    const burrCone = createCleanLathe(
      [
        new THREE.Vector2(0.0, 0.24),
        new THREE.Vector2(0.06, 0.20),
        new THREE.Vector2(0.16, 0.04),
        new THREE.Vector2(0.26, -0.14),
        new THREE.Vector2(0.26, -0.18),
        new THREE.Vector2(0.0, -0.18),
      ],
      40,
    );

    const chute = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.92, 0.06),
        new THREE.Vector3(0, 2.65, 0.40),
        new THREE.Vector3(0, 2.38, 0.75),
        new THREE.Vector3(0, 2.12, 0.82),
      ]),
      32,
      0.115,
      20,
      false,
    );

    const helixPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * Math.PI * 2 * 7;
      helixPts.push(new THREE.Vector3(Math.cos(a) * 0.328, -0.42 + t * 0.84, Math.sin(a) * 0.328));
    }
    const heatingCoil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), 130, 0.024, 14, false);

    const waterPipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.48, 2.74, -0.18),
      new THREE.Vector3(-0.38, 2.88, 0.20),
      new THREE.Vector3(-0.15, 2.76, 0.62),
      new THREE.Vector3(0, 2.48, 0.82),
    ]);
    const waterPipe = new THREE.TubeGeometry(waterPipeCurve, 44, 0.038, 16, false);
    const waterPulsePipe = new THREE.TubeGeometry(waterPipeCurve, 44, 0.026, 14, false);

    const e61Bell = createCleanLathe(
      [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.36, 0.0),
        new THREE.Vector2(0.38, 0.06),
        new THREE.Vector2(0.35, 0.09),
        new THREE.Vector2(0.35, 0.24),
        new THREE.Vector2(0.41, 0.29),
        new THREE.Vector2(0.41, 0.36),
        new THREE.Vector2(0.33, 0.42),
        new THREE.Vector2(0.29, 0.56),
        new THREE.Vector2(0.0, 0.58),
      ],
      48,
      Math.PI / 6,
    );

    const basketCup = createCleanLathe(
      [
        new THREE.Vector2(0.0, -0.12),
        new THREE.Vector2(0.18, -0.11),
        new THREE.Vector2(0.27, -0.04),
        new THREE.Vector2(0.33, 0.08),
        new THREE.Vector2(0.35, 0.12),
        new THREE.Vector2(0.31, 0.13),
        new THREE.Vector2(0.29, 0.08),
        new THREE.Vector2(0.0, 0.08),
      ],
      44,
      Math.PI / 6,
    );

    const walnutHandle = createCleanLathe(
      [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.042, 0.02),
        new THREE.Vector2(0.052, 0.14),
        new THREE.Vector2(0.046, 0.30),
        new THREE.Vector2(0.068, 0.56),
        new THREE.Vector2(0.072, 0.68),
        new THREE.Vector2(0.052, 0.72),
        new THREE.Vector2(0.0, 0.72),
      ],
      32,
    );
    walnutHandle.rotateX(Math.PI / 2);

    const spoutL = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.10, 0),
        new THREE.Vector3(-0.08, -0.16, 0),
        new THREE.Vector3(-0.105, -0.23, 0),
      ]),
      18,
      0.026,
      14,
      false,
    );
    const spoutR = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.10, 0),
        new THREE.Vector3(0.08, -0.16, 0),
        new THREE.Vector3(0.105, -0.23, 0),
      ]),
      18,
      0.026,
      14,
      false,
    );

    const steamWand = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.68, 2.66, 0.56),
        new THREE.Vector3(-0.78, 2.38, 0.64),
        new THREE.Vector3(-0.74, 1.88, 0.70),
        new THREE.Vector3(-0.66, 1.44, 0.78),
      ]),
      36,
      0.024,
      16,
      false,
    );

    // Smooth rounded porcelain mug profile (zero crease black lines)
    const mug = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.24, 0.0),
        new THREE.Vector2(0.272, 0.012),
        new THREE.Vector2(0.292, 0.036),
        new THREE.Vector2(0.32, 0.10),
        new THREE.Vector2(0.355, 0.28),
        new THREE.Vector2(0.386, 0.58),
        new THREE.Vector2(0.394, 0.745),
        new THREE.Vector2(0.391, 0.775),
        new THREE.Vector2(0.376, 0.792),
        new THREE.Vector2(0.358, 0.790),
        new THREE.Vector2(0.345, 0.772),
        new THREE.Vector2(0.338, 0.735),
        new THREE.Vector2(0.305, 0.38),
        new THREE.Vector2(0.255, 0.11),
        new THREE.Vector2(0.21, 0.075),
        new THREE.Vector2(0.0, 0.07),
      ],
      72,
    );

    const mugHandle = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.34, 0.62, 0),
        new THREE.Vector3(0.55, 0.64, 0),
        new THREE.Vector3(0.60, 0.42, 0),
        new THREE.Vector3(0.53, 0.22, 0),
        new THREE.Vector3(0.31, 0.18, 0),
      ]),
      40,
      0.044,
      20,
      false,
    );

    return {
      basePlinth,
      trayDeck,
      rearSpine,
      sideWall,
      frontLower,
      splashMirror,
      frontUpper,
      topDeck,
      warmerPlate,
      lidHandle,
      groupBridge,
      galleryRail,
      collar,
      lidBezel,
      funnel,
      burrCone,
      chute,
      heatingCoil,
      waterPipe,
      waterPulsePipe,
      e61Bell,
      basketCup,
      walnutHandle,
      spoutL,
      spoutR,
      steamWand,
      mug,
      mugHandle,
    };
  }, []);

  useEffect(() => {
    if (teethMeshRef.current) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        _dummy.position.set(Math.cos(a) * 0.17, 0.01, Math.sin(a) * 0.17);
        _dummy.rotation.set(0.36, -a, 0.22);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        teethMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      teethMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (grateMeshRef.current) {
      for (let i = 0; i < 22; i++) {
        _dummy.position.set(0, 0.388, 0.34 + (i / 21) * 0.75);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        grateMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      grateMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (fBoltsRef.current) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        _dummy.position.set(Math.cos(a) * 0.29, 0.55, Math.sin(a) * 0.29);
        _dummy.rotation.set(0, a, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        fBoltsRef.current.setMatrixAt(i, _dummy.matrix);
      }
      fBoltsRef.current.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geos).forEach((g) => g.dispose());
      xrayMat.dispose();
      waterFlowMat.dispose();
      walnutTex.dispose();
      brewGaugeTex.dispose();
      steamGaugeTex.dispose();
      matteBlackMat.dispose();
      brushedSteelMat.dispose();
    };
  }, [
    geos,
    xrayMat,
    waterFlowMat,
    walnutTex,
    brewGaugeTex,
    steamGaugeTex,
    matteBlackMat,
    brushedSteelMat,
  ]);

  useFrame((state, delta) => {
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;

    // Stage 1: Lid hinges open smoothly (0.04 -> 0.18), closes after Stage 3 (0.68 -> 0.78)
    const lidOpen =
      THREE.MathUtils.smoothstep(p, 0.04, 0.18) *
      (1 - THREE.MathUtils.smoothstep(p, 0.68, 0.78));
    if (lidPivotRef.current) {
      lidPivotRef.current.rotation.x = -lidOpen * (Math.PI * 0.44);
    }

    // Stages 2 & 3 (0.20 - 0.75): Outer shell transitions into translucent X-ray cutaway shader
    const xrayIn = THREE.MathUtils.smoothstep(p, 0.18, 0.28);
    const xrayOut = 1 - THREE.MathUtils.smoothstep(p, 0.70, 0.80);
    const xrayAmount = xrayIn * xrayOut;

    xrayMat.uniforms.uTime.value = t;
    xrayMat.uniforms.uXrayAmount.value = xrayAmount;

    matteBlackMat.opacity = 1 - xrayAmount;
    brushedSteelMat.opacity = 1 - xrayAmount;
    if (solidShellRef.current) {
      solidShellRef.current.visible = xrayAmount < 0.96;
    }
    if (xrayShellRef.current) {
      xrayShellRef.current.visible = xrayAmount > 0.03;
    }

    // Stage 2 (0.20 - 0.45): Conical burrs spin rapidly
    const grindSpeed =
      THREE.MathUtils.smoothstep(p, 0.20, 0.28) *
      (1 - THREE.MathUtils.smoothstep(p, 0.42, 0.48));
    if (burrRotorRef.current && grindSpeed > 0.01) {
      burrRotorRef.current.rotation.y += delta * (4.0 + grindSpeed * 12.0);
    }

    // Stage 3 (0.45 - 0.70): Tamper presses down onto puck, 93C water saturates chamber
    const tampProgress = THREE.MathUtils.smoothstep(p, 0.45, 0.56);
    if (pistonRef.current) {
      pistonRef.current.position.y = THREE.MathUtils.lerp(0.24, -0.10, tampProgress);
    }
    if (puckRef.current) {
      puckRef.current.scale.y = THREE.MathUtils.lerp(1.26, 0.72, tampProgress);
    }

    const thermalIntensity =
      THREE.MathUtils.smoothstep(p, 0.52, 0.62) *
      (1 - THREE.MathUtils.smoothstep(p, 0.74, 0.84));
    waterFlowMat.uniforms.uTime.value = t;
    waterFlowMat.uniforms.uIntensity.value = thermalIntensity;

    if (boilerCoilMatRef.current) {
      boilerCoilMatRef.current.emissiveIntensity = 0.16 + thermalIntensity * 1.45;
    }
    if (puckSaturationMatRef.current) {
      puckSaturationMatRef.current.emissiveIntensity = thermalIntensity * 0.45;
    }

    if (needleRef.current) {
      const pressureBar =
        THREE.MathUtils.smoothstep(p, 0.52, 0.68) *
        (1 - THREE.MathUtils.smoothstep(p, 0.96, 1.0) * 0.4) *
        9.0;
      needleRef.current.rotation.z =
        Math.PI * 0.75 + (pressureBar / 15) * (-Math.PI * 1.5) - Math.PI / 2;
    }
  });

  return (
    <group>
      {/* Base Plinth & Drip Tray (Always Solid) */}
      <mesh geometry={geos.basePlinth} position={[0, 0.22, 0.18]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#201e1c" roughness={0.42} metalness={0.5} clearcoat={0.22} />
      </mesh>
      <mesh geometry={geos.trayDeck} position={[0, 0.368, 0.72]} receiveShadow>
        <meshPhysicalMaterial color="#e2e5e9" roughness={0.16} metalness={0.92} />
      </mesh>
      <instancedMesh ref={grateMeshRef} args={[undefined, undefined, 22]}>
        <boxGeometry args={[1.76, 0.012, 0.014]} />
        <meshStandardMaterial color="#181614" roughness={0.55} metalness={0.4} />
      </instancedMesh>

      {/* Top Deck & Gallery Rail */}
      <mesh geometry={geos.topDeck} position={[0, 4.02, -0.04]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#201e1c" roughness={0.42} metalness={0.5} />
      </mesh>
      <mesh geometry={geos.warmerPlate} position={[0, 4.085, -0.04]}>
        <meshPhysicalMaterial color="#e2e5e9" roughness={0.18} metalness={0.92} />
      </mesh>
      <mesh geometry={geos.galleryRail} castShadow>
        <meshPhysicalMaterial color="#e5e8ec" roughness={0.14} metalness={0.95} />
      </mesh>

      {/* Smoked Amber Glass Hopper & Funnel */}
      <mesh geometry={geos.collar} position={[0, 4.07, 0.05]} castShadow>
        <meshPhysicalMaterial color="#c87a4b" roughness={0.22} metalness={0.88} />
      </mesh>
      <mesh position={[0, 3.74, 0.05]} renderOrder={4}>
        <cylinderGeometry args={[0.59, 0.52, 0.68, 48, 1, true]} />
        <meshPhysicalMaterial
          color="#5b3d24"
          roughness={0.08}
          metalness={0.04}
          transparent
          opacity={0.46}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={geos.funnel} position={[0, 3.36, 0.05]}>
        <meshPhysicalMaterial color="#dfe3e8" roughness={0.18} metalness={0.92} />
      </mesh>

      {/* Hinged Walnut & Brushed Steel Top Lid */}
      <group ref={lidPivotRef} position={[0, 4.165, -0.59]}>
        <mesh geometry={geos.lidBezel} position={[0, 0, 0.64]} castShadow>
          <meshPhysicalMaterial color="#e2e5e9" roughness={0.16} metalness={0.94} />
        </mesh>
        <mesh position={[0, 0.02, 0.64]} renderOrder={5}>
          <cylinderGeometry args={[0.575, 0.575, 0.05, 52]} />
          <meshPhysicalMaterial
            color="#5b3d24"
            roughness={0.08}
            transparent
            opacity={0.48}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={geos.lidHandle} position={[0, 0.035, 1.29]} castShadow>
          <meshStandardMaterial map={walnutTex} roughness={0.44} metalness={0.04} />
        </mesh>
      </group>

      {/* SOLID OUTER SHELL (Fades out smoothly into X-ray during Stages 2 & 3) */}
      <group ref={solidShellRef}>
        <mesh geometry={geos.rearSpine} position={[0, 2.21, -0.72]} material={matteBlackMat} castShadow />
        <mesh geometry={geos.sideWall} position={[-1.03, 2.21, -0.25]} rotation={[0, Math.PI / 2, 0]} material={matteBlackMat} castShadow />
        <mesh geometry={geos.sideWall} position={[1.03, 2.21, -0.25]} rotation={[0, Math.PI / 2, 0]} material={matteBlackMat} castShadow />
        <mesh geometry={geos.frontLower} position={[0, 1.38, 0.25]} material={matteBlackMat} castShadow />
        <mesh geometry={geos.splashMirror} position={[0, 1.24, 0.31]} material={brushedSteelMat} />
        <mesh geometry={geos.frontUpper} position={[0, 3.36, 0.28]} material={matteBlackMat} castShadow />
        <mesh geometry={geos.groupBridge} position={[0, 2.58, 0.54]} material={brushedSteelMat} castShadow />
        <mesh geometry={geos.e61Bell} position={[0, 2.04, 0.82]} material={brushedSteelMat} castShadow />
        <mesh geometry={geos.steamWand} material={brushedSteelMat} castShadow />

        {/* Dual Analog Pressure Gauges */}
        <group position={[-0.44, 3.44, 0.66]}>
          <mesh>
            <torusGeometry args={[0.195, 0.024, 16, 40]} />
            <meshPhysicalMaterial color="#c87a4b" roughness={0.22} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.008]}>
            <circleGeometry args={[0.18, 40]} />
            <meshStandardMaterial map={brewGaugeTex} roughness={0.3} />
          </mesh>
          <group ref={needleRef} position={[0, 0, 0.018]}>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[0.012, 0.135, 0.006]} />
              <meshStandardMaterial color="#d98a4e" />
            </mesh>
          </group>
        </group>

        <group position={[0.44, 3.44, 0.66]}>
          <mesh>
            <torusGeometry args={[0.195, 0.024, 16, 40]} />
            <meshPhysicalMaterial color="#c87a4b" roughness={0.22} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.008]}>
            <circleGeometry args={[0.18, 40]} />
            <meshStandardMaterial map={steamGaugeTex} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* X-RAY GLSL CUTAWAY SHELL (Visible during Stages 2 & 3) */}
      <group ref={xrayShellRef} visible={false}>
        <mesh geometry={geos.rearSpine} position={[0, 2.21, -0.72]} material={xrayMat} />
        <mesh geometry={geos.sideWall} position={[-1.03, 2.21, -0.25]} rotation={[0, Math.PI / 2, 0]} material={xrayMat} />
        <mesh geometry={geos.sideWall} position={[1.03, 2.21, -0.25]} rotation={[0, Math.PI / 2, 0]} material={xrayMat} />
        <mesh geometry={geos.frontLower} position={[0, 1.38, 0.25]} material={xrayMat} />
        <mesh geometry={geos.frontUpper} position={[0, 3.36, 0.28]} material={xrayMat} />
        <mesh geometry={geos.e61Bell} position={[0, 2.04, 0.82]} material={xrayMat} />
      </group>

      {/* INTERNAL MECHANICAL HEART */}
      {/* 1. Conical Steel Burr Grinder (Stage 2) */}
      <group position={[0, 3.10, 0.05]}>
        <mesh renderOrder={3}>
          <cylinderGeometry args={[0.39, 0.35, 0.36, 40, 1, true]} />
          <meshPhysicalMaterial color="#e2dbd0" transparent opacity={0.26} roughness={0.1} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
          <torusGeometry args={[0.395, 0.028, 14, 48]} />
          <meshStandardMaterial color="#d49d52" metalness={0.88} roughness={0.24} />
        </mesh>
        <group ref={burrRotorRef}>
          <mesh geometry={geos.burrCone}>
            <meshStandardMaterial color="#b2b9c2" metalness={0.95} roughness={0.18} />
          </mesh>
          <instancedMesh ref={teethMeshRef} args={[undefined, undefined, 24]}>
            <boxGeometry args={[0.02, 0.32, 0.042]} />
            <meshStandardMaterial color="#edf0f4" metalness={0.95} roughness={0.15} />
          </instancedMesh>
          <mesh position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.78, 20]} />
            <meshStandardMaterial color="#c87a4b" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      </group>

      {/* Transparent Dosing Chute */}
      <mesh geometry={geos.chute} renderOrder={3}>
        <meshPhysicalMaterial color="#e5ded3" transparent opacity={0.22} roughness={0.1} depthWrite={false} />
      </mesh>

      {/* 2. Thermal Brass Boiler & Glowing 93C Water Conduit (Stage 3) */}
      <group position={[-0.48, 2.02, -0.18]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.28, 1.06, 36]} />
          <meshStandardMaterial color="#cfa056" metalness={0.86} roughness={0.26} />
        </mesh>
        <mesh position={[0, 0.52, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.05, 36]} />
          <meshStandardMaterial color="#c87a4b" metalness={0.88} roughness={0.22} />
        </mesh>
        <instancedMesh ref={fBoltsRef} args={[undefined, undefined, 10]}>
          <cylinderGeometry args={[0.016, 0.016, 0.03, 6]} />
          <meshStandardMaterial color="#e5e8ec" metalness={0.95} roughness={0.15} />
        </instancedMesh>
        <mesh geometry={geos.heatingCoil}>
          <meshStandardMaterial
            ref={boilerCoilMatRef}
            color="#e27f3c"
            emissive="#ff6b1a"
            emissiveIntensity={0.2}
            metalness={0.75}
            roughness={0.22}
          />
        </mesh>
      </group>

      <mesh geometry={geos.waterPipe}>
        <meshPhysicalMaterial color="#d8a272" transparent opacity={0.35} roughness={0.14} depthWrite={false} />
      </mesh>
      <mesh geometry={geos.waterPulsePipe} material={waterFlowMat} />

      {/* 3. Calibrated Steel Tamper & Coffee Puck Chamber (Stage 3) */}
      <group position={[0, 1.98, 0.82]}>
        <mesh renderOrder={3}>
          <cylinderGeometry args={[0.32, 0.30, 0.72, 40, 1, true]} />
          <meshPhysicalMaterial color="#e5ded3" transparent opacity={0.22} roughness={0.1} depthWrite={false} />
        </mesh>
        <group ref={pistonRef} position={[0, 0.24, 0]}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.062, 0.062, 0.55, 22]} />
            <meshStandardMaterial color="#e6e9ee" metalness={0.96} roughness={0.14} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.265, 0.275, 0.10, 36]} />
            <meshStandardMaterial color="#d6a156" metalness={0.9} roughness={0.22} />
          </mesh>
        </group>
        <mesh ref={puckRef} position={[0, -0.24, 0]}>
          <cylinderGeometry args={[0.275, 0.265, 0.14, 36]} />
          <meshStandardMaterial
            ref={puckSaturationMatRef}
            color="#3d2010"
            emissive="#c95a18"
            emissiveIntensity={0}
            roughness={0.86}
          />
        </mesh>
      </group>

      {/* PORTAFILTER & WALNUT HANDLE */}
      <group position={[0, 1.64, 0.82]}>
        <mesh geometry={geos.basketCup} castShadow>
          <meshPhysicalMaterial color="#e6e9ee" metalness={0.94} roughness={0.14} />
        </mesh>
        <mesh position={[0, 0.04, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.044, 0.052, 0.24, 22]} />
          <meshPhysicalMaterial color="#e6e9ee" metalness={0.94} roughness={0.14} />
        </mesh>
        <mesh geometry={geos.walnutHandle} position={[0, 0.04, 0.54]} castShadow>
          <meshStandardMaterial map={walnutTex} roughness={0.44} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.04, 1.26]}>
          <sphereGeometry args={[0.054, 22, 16]} />
          <meshStandardMaterial color="#c87a4b" metalness={0.9} roughness={0.22} />
        </mesh>
        <mesh geometry={geos.spoutL} castShadow>
          <meshPhysicalMaterial color="#e6e9ee" metalness={0.94} roughness={0.14} />
        </mesh>
        <mesh geometry={geos.spoutR} castShadow>
          <meshPhysicalMaterial color="#e6e9ee" metalness={0.94} roughness={0.14} />
        </mesh>
      </group>

      {/* HEAVY MINIMALIST WHITE PORCELAIN MUG (Zero black corner/rim lines) */}
      <group position={[0, 0.394, 0.82]}>
        <mesh geometry={geos.mug} castShadow>
          <meshPhysicalMaterial
            color="#faf7f2"
            roughness={0.18}
            metalness={0}
            clearcoat={0.55}
            clearcoatRoughness={0.14}
            sheen={0.25}
            sheenColor="#ffffff"
            emissive="#1e1b18"
            emissiveIntensity={0.08}
          />
        </mesh>
        <mesh geometry={geos.mugHandle} castShadow>
          <meshPhysicalMaterial
            color="#faf7f2"
            roughness={0.18}
            metalness={0}
            clearcoat={0.55}
            clearcoatRoughness={0.14}
            sheen={0.25}
            sheenColor="#ffffff"
            emissive="#1e1b18"
            emissiveIntensity={0.08}
          />
        </mesh>
      </group>
    </group>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ScrollState } from '../../hooks/useScrollRig';

interface BeansInstancedProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const BEAN_COUNT = 56;
const GROUND_COUNT = 160;
const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _curvePt = new THREE.Vector3();
const _tmpColor = new THREE.Color();

const BEAN_PALETTE = [
  new THREE.Color(0x3a2011),
  new THREE.Color(0x4a2915),
  new THREE.Color(0x2d170b),
  new THREE.Color(0x543018),
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function createSharedBeanGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x;
    const ny = v.y;
    const nz = v.z;

    const endTaper = 1 - 0.14 * nz * nz;
    let x = nx * 0.082 * endTaper;
    const z = nz * 0.118;

    const yScale = THREE.MathUtils.lerp(0.046, 0.068, smoothstep(-0.35, 0.35, ny));
    let y = ny * yScale * endTaper;

    const bellyMask = smoothstep(0.08, -0.45, ny);
    if (bellyMask > 0.001) {
      const lenMask = Math.pow(Math.max(0, 1 - nz * nz), 0.75);
      const seamX = 0.011 * Math.sin(nz * Math.PI * 1.2);
      const dx = x - seamX;
      const absDx = Math.abs(dx);

      const groove = Math.exp(-(absDx * absDx) / (0.013 * 0.013)) * lenMask * bellyMask;
      const lipOffset = absDx - 0.022;
      const lipRidge = Math.exp(-(lipOffset * lipOffset) / (0.016 * 0.016)) * lenMask * bellyMask;

      y += groove * 0.026;
      y -= lipRidge * 0.0055;
      if (absDx > 0.001) {
        x += Math.sign(dx) * groove * 0.0045;
      }
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createSharedGroundGeometry(): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(0.017, 0);
  geo.computeVertexNormals();
  return geo;
}

export function BeansInstanced({ scrollStateRef }: BeansInstancedProps) {
  const beansRef = useRef<THREE.InstancedMesh | null>(null);
  const groundsRef = useRef<THREE.InstancedMesh | null>(null);
  const lastBeanScrollRef = useRef<number>(-1);

  // Single shared geometry & material per particle type
  const beanResources = useMemo(() => {
    const geometry = createSharedBeanGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.38,
      metalness: 0.04,
      flatShading: false,
    });
    return { geometry, material };
  }, []);

  const groundResources = useMemo(() => {
    const geometry = createSharedGroundGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: '#3c2010',
      roughness: 0.9,
      metalness: 0.02,
      flatShading: false,
    });
    return { geometry, material };
  }, []);

  // Flat typed-array particle buffers for zero-GC frame updates
  const beanBuffers = useMemo(() => {
    const startXYZ = new Float32Array(BEAN_COUNT * 3);
    const hopperXYZ = new Float32Array(BEAN_COUNT * 3);
    const rotSpeedXYZ = new Float32Array(BEAN_COUNT * 3);
    const baseRotXYZ = new Float32Array(BEAN_COUNT * 3);
    const params = new Float32Array(BEAN_COUNT * 3); // delay, scale, phase

    for (let i = 0; i < BEAN_COUNT; i++) {
      const r1 = rand(i * 3 + 1);
      const r2 = rand(i * 3 + 2);
      const r3 = rand(i * 3 + 3);
      const r4 = rand(i * 3 + 4);
      const i3 = i * 3;

      const angle = r1 * Math.PI * 2;
      const radius = 0.05 + Math.sqrt(r2) * 0.42;

      startXYZ[i3] = (r3 - 0.5) * 0.38;
      startXYZ[i3 + 1] = 6.35 + r4 * 1.45;
      startXYZ[i3 + 2] = 0.08 + (r2 - 0.5) * 0.34;

      hopperXYZ[i3] = Math.cos(angle) * radius;
      hopperXYZ[i3 + 1] = 3.55 + (i / BEAN_COUNT) * 0.34;
      hopperXYZ[i3 + 2] = 0.05 + Math.sin(angle) * radius * 0.88;

      rotSpeedXYZ[i3] = (r1 - 0.5) * 9;
      rotSpeedXYZ[i3 + 1] = (r2 - 0.5) * 9;
      rotSpeedXYZ[i3 + 2] = (r3 - 0.5) * 9;

      baseRotXYZ[i3] = r1 * Math.PI;
      baseRotXYZ[i3 + 1] = r2 * Math.PI;
      baseRotXYZ[i3 + 2] = r3 * Math.PI;

      params[i3] = (i / BEAN_COUNT) * 0.54;
      params[i3 + 1] = 0.86 + r4 * 0.24;
      params[i3 + 2] = r1 * Math.PI * 2;
    }

    return { startXYZ, hopperXYZ, rotSpeedXYZ, baseRotXYZ, params };
  }, []);

  const groundBuffers = useMemo(() => {
    const speed = new Float32Array(GROUND_COUNT);
    const jitterX = new Float32Array(GROUND_COUNT);
    const jitterZ = new Float32Array(GROUND_COUNT);
    const baseScale = new Float32Array(GROUND_COUNT);

    for (let i = 0; i < GROUND_COUNT; i++) {
      speed[i] = 0.72 + rand(i) * 0.48;
      jitterX[i] = (rand(i * 2) - 0.5) * 0.11;
      jitterZ[i] = (rand(i * 3) - 0.5) * 0.11;
      baseScale[i] = 0.65 + rand(i * 5) * 0.75;
    }

    return { speed, jitterX, jitterZ, baseScale };
  }, []);

  const chuteCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.92, 0.05),
        new THREE.Vector3(0, 2.66, 0.36),
        new THREE.Vector3(0, 2.40, 0.72),
        new THREE.Vector3(0, 2.02, 0.82),
      ]),
    [],
  );

  // Initialize instance colors, DynamicDrawUsage, and clean lifecycle disposal
  useEffect(() => {
    const beansMesh = beansRef.current;
    const groundsMesh = groundsRef.current;

    if (beansMesh) {
      beansMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < BEAN_COUNT; i++) {
        _tmpColor.copy(BEAN_PALETTE[i % BEAN_PALETTE.length]);
        _tmpColor.offsetHSL(0, 0, (rand(i * 7) - 0.5) * 0.04);
        beansMesh.setColorAt(i, _tmpColor);
      }
      if (beansMesh.instanceColor) {
        beansMesh.instanceColor.needsUpdate = true;
      }
    }

    if (groundsMesh) {
      groundsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      groundsMesh.visible = false;
    }

    return () => {
      lastBeanScrollRef.current = -1;
      beansMesh?.dispose();
      groundsMesh?.dispose();
      beanResources.geometry.dispose();
      beanResources.material.dispose();
      groundResources.geometry.dispose();
      groundResources.material.dispose();
    };
  }, [beanResources, groundResources]);

  useFrame((state) => {
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;

    const dropProgress = THREE.MathUtils.smoothstep(p, 0.04, 0.22);
    const grindProgress =
      THREE.MathUtils.smoothstep(p, 0.20, 0.30) *
      (1 - THREE.MathUtils.smoothstep(p, 0.42, 0.48));
    const funnelSink = THREE.MathUtils.smoothstep(p, 0.22, 0.45);

    const beansMesh = beansRef.current;
    const needsBeanUpdate =
      p < 0.72 && (grindProgress > 0.02 || Math.abs(p - lastBeanScrollRef.current) > 0.0002);

    if (beansMesh) {
      beansMesh.visible = p < 0.72;
    }

    if (beansMesh && beansMesh.visible && needsBeanUpdate) {
      lastBeanScrollRef.current = p;
      const { startXYZ, hopperXYZ, rotSpeedXYZ, baseRotXYZ, params } = beanBuffers;

      for (let i = 0; i < BEAN_COUNT; i++) {
        const i3 = i * 3;
        const delay = params[i3];
        const baseScale = params[i3 + 1];
        const phase = params[i3 + 2];

        const localT = THREE.MathUtils.clamp((dropProgress - delay) / (1 - delay * 0.82), 0, 1);

        if (localT <= 0.001) {
          _dummy.position.set(startXYZ[i3], startXYZ[i3 + 1] + 4, startXYZ[i3 + 2]);
          _dummy.scale.setScalar(0.001);
        } else {
          const ease =
            localT < 0.82
              ? Math.pow(localT / 0.82, 1.85)
              : 1 -
                Math.abs(Math.sin(((localT - 0.82) / 0.18) * Math.PI)) * 0.06 * (1 - localT);
          const clampedEase = Math.min(ease, 1);

          _pos.set(
            THREE.MathUtils.lerp(startXYZ[i3], hopperXYZ[i3], clampedEase),
            THREE.MathUtils.lerp(startXYZ[i3 + 1], hopperXYZ[i3 + 1], clampedEase),
            THREE.MathUtils.lerp(startXYZ[i3 + 2], hopperXYZ[i3 + 2], clampedEase),
          );

          _pos.y -= funnelSink * (0.28 + (i % 5) * 0.05);
          const pull = 1 - funnelSink * 0.42;
          _pos.x *= pull;
          _pos.z = 0.05 + (_pos.z - 0.05) * pull;

          if (grindProgress > 0.02) {
            _pos.x += Math.sin(t * 24 + phase) * 0.008 * grindProgress;
            _pos.z += Math.cos(t * 20 + phase) * 0.008 * grindProgress;
          }

          const shrinkAtBurrs = 1 - THREE.MathUtils.smoothstep(p, 0.36, 0.48) * 0.65;
          _dummy.position.copy(_pos);
          _dummy.rotation.set(
            baseRotXYZ[i3] + rotSpeedXYZ[i3] * localT * 1.4,
            baseRotXYZ[i3 + 1] + rotSpeedXYZ[i3 + 1] * localT * 1.4 + funnelSink * 1.4,
            baseRotXYZ[i3 + 2] + rotSpeedXYZ[i3 + 2] * localT * 1.4,
          );
          _dummy.scale.setScalar(
            baseScale * THREE.MathUtils.smoothstep(localT, 0, 0.08) * shrinkAtBurrs,
          );
        }
        _dummy.updateMatrix();
        beansMesh.setMatrixAt(i, _dummy.matrix);
      }
      beansMesh.instanceMatrix.needsUpdate = true;
    }

    const groundsMesh = groundsRef.current;
    if (groundsMesh) {
      const showGrounds = grindProgress >= 0.02;
      groundsMesh.visible = showGrounds;
      if (showGrounds) {
        const { speed, jitterX, jitterZ, baseScale } = groundBuffers;
        const grindCap = Math.min(grindProgress * 2.2, 1);

        for (let i = 0; i < GROUND_COUNT; i++) {
          const u = (t * speed[i] + i / GROUND_COUNT) % 1;
          chuteCurve.getPointAt(u, _curvePt);
          _dummy.position.set(_curvePt.x + jitterX[i], _curvePt.y, _curvePt.z + jitterZ[i]);
          _dummy.rotation.set(t * 4 + i, t * 3, i);
          const s = baseScale[i] * Math.sin(u * Math.PI) * grindCap;
          _dummy.scale.setScalar(Math.max(s, 0.001));
          _dummy.updateMatrix();
          groundsMesh.setMatrixAt(i, _dummy.matrix);
        }
        groundsMesh.instanceMatrix.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <instancedMesh
        ref={beansRef}
        args={[beanResources.geometry, beanResources.material, BEAN_COUNT]}
        castShadow
        frustumCulled={false}
      />

      <instancedMesh
        ref={groundsRef}
        args={[groundResources.geometry, groundResources.material, GROUND_COUNT]}
        frustumCulled={false}
      />
    </group>
  );
}

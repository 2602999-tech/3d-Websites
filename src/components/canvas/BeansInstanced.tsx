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

function createCoffeeBeanGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.105, 20, 16);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.z *= 1.38;
    v.x *= 1.02;
    v.y *= 0.72;

    if (v.y < 0) {
      v.y *= 0.42;
      const seamCurve = Math.sin(v.z * 16) * 0.012;
      const distFromSeam = Math.abs(v.x - seamCurve);
      if (distFromSeam < 0.032) {
        const groove = (1 - distFromSeam / 0.032) * 0.035;
        v.y += groove;
      }
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function BeansInstanced({ scrollStateRef }: BeansInstancedProps) {
  const beansRef = useRef<THREE.InstancedMesh | null>(null);
  const groundsRef = useRef<THREE.InstancedMesh | null>(null);

  const beanGeo = useMemo(() => createCoffeeBeanGeometry(), []);
  const groundGeo = useMemo(() => new THREE.DodecahedronGeometry(0.017, 0), []);

  const beanData = useMemo(() => {
    return Array.from({ length: BEAN_COUNT }, (_, i) => {
      const r1 = rand(i * 3 + 1);
      const r2 = rand(i * 3 + 2);
      const r3 = rand(i * 3 + 3);
      const r4 = rand(i * 3 + 4);

      const angle = r1 * Math.PI * 2;
      const radius = 0.05 + Math.sqrt(r2) * 0.42;
      const layerY = 3.55 + (i / BEAN_COUNT) * 0.34;

      return {
        startPos: new THREE.Vector3(
          (r3 - 0.5) * 0.38,
          6.35 + r4 * 1.45,
          0.08 + (r2 - 0.5) * 0.34,
        ),
        hopperPos: new THREE.Vector3(
          Math.cos(angle) * radius,
          layerY,
          0.05 + Math.sin(angle) * radius * 0.88,
        ),
        rotSpeed: new THREE.Vector3(
          (r1 - 0.5) * 9,
          (r2 - 0.5) * 9,
          (r3 - 0.5) * 9,
        ),
        baseRot: new THREE.Euler(r1 * Math.PI, r2 * Math.PI, r3 * Math.PI),
        delay: (i / BEAN_COUNT) * 0.54,
        scale: 0.84 + r4 * 0.28,
        phase: r1 * Math.PI * 2,
      };
    });
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

  useEffect(() => {
    if (!beansRef.current) return;
    const palette = [
      new THREE.Color(0x3a2011),
      new THREE.Color(0x4a2915),
      new THREE.Color(0x2d170b),
      new THREE.Color(0x543018),
    ];
    for (let i = 0; i < BEAN_COUNT; i++) {
      const c = palette[i % palette.length].clone();
      c.offsetHSL(0, 0, (rand(i * 7) - 0.5) * 0.04);
      beansRef.current.setColorAt(i, c);
    }
    if (beansRef.current.instanceColor) {
      beansRef.current.instanceColor.needsUpdate = true;
    }
  }, []);

  useEffect(() => {
    return () => {
      beanGeo.dispose();
      groundGeo.dispose();
    };
  }, [beanGeo, groundGeo]);

  useFrame((state) => {
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;

    // Stage 1 (0.04 - 0.22): Beans drop into opening hopper
    const dropProgress = THREE.MathUtils.smoothstep(p, 0.04, 0.22);
    // Stage 2 (0.20 - 0.45): Beans funnel down into spinning burrs & grind
    const grindProgress =
      THREE.MathUtils.smoothstep(p, 0.20, 0.30) *
      (1 - THREE.MathUtils.smoothstep(p, 0.42, 0.48));
    const funnelSink = THREE.MathUtils.smoothstep(p, 0.22, 0.45);

    if (beansRef.current) {
      for (let i = 0; i < BEAN_COUNT; i++) {
        const b = beanData[i];
        const localT = THREE.MathUtils.clamp(
          (dropProgress - b.delay) / (1 - b.delay * 0.82),
          0,
          1,
        );

        if (localT <= 0.001) {
          _dummy.position.set(b.startPos.x, b.startPos.y + 4, b.startPos.z);
          _dummy.scale.setScalar(0.001);
        } else {
          const ease =
            localT < 0.82
              ? Math.pow(localT / 0.82, 1.85)
              : 1 -
                Math.abs(Math.sin(((localT - 0.82) / 0.18) * Math.PI)) *
                  0.06 *
                  (1 - localT);
          _pos.lerpVectors(b.startPos, b.hopperPos, Math.min(ease, 1));

          // Spiral down toward burr throat as grinding advances
          _pos.y -= funnelSink * (0.28 + (i % 5) * 0.05);
          const pull = 1 - funnelSink * 0.42;
          _pos.x *= pull;
          _pos.z = 0.05 + (_pos.z - 0.05) * pull;

          if (grindProgress > 0.02) {
            _pos.x += Math.sin(t * 24 + b.phase) * 0.008 * grindProgress;
            _pos.z += Math.cos(t * 20 + b.phase) * 0.008 * grindProgress;
          }

          const shrinkAtBurrs = 1 - THREE.MathUtils.smoothstep(p, 0.36, 0.48) * 0.65;
          _dummy.position.copy(_pos);
          _dummy.rotation.set(
            b.baseRot.x + b.rotSpeed.x * localT * 1.4,
            b.baseRot.y + b.rotSpeed.y * localT * 1.4 + funnelSink * 1.4,
            b.baseRot.z + b.rotSpeed.z * localT * 1.4,
          );
          _dummy.scale.setScalar(
            b.scale * THREE.MathUtils.smoothstep(localT, 0, 0.08) * shrinkAtBurrs,
          );
        }
        _dummy.updateMatrix();
        beansRef.current.setMatrixAt(i, _dummy.matrix);
      }
      beansRef.current.instanceMatrix.needsUpdate = true;
    }

    // Coffee grounds particle stream from bottom of conical burrs into portafilter basket
    if (groundsRef.current) {
      for (let i = 0; i < GROUND_COUNT; i++) {
        if (grindProgress < 0.02) {
          _dummy.position.set(0, -10, 0);
          _dummy.scale.setScalar(0.001);
        } else {
          const speed = 0.72 + rand(i) * 0.48;
          const u = (t * speed + i / GROUND_COUNT) % 1;
          const pt = chuteCurve.getPointAt(u);
          _dummy.position.set(
            pt.x + (rand(i * 2) - 0.5) * 0.11,
            pt.y,
            pt.z + (rand(i * 3) - 0.5) * 0.11,
          );
          _dummy.rotation.set(t * 4 + i, t * 3, i);
          const s =
            (0.65 + rand(i * 5) * 0.75) *
            Math.sin(u * Math.PI) *
            Math.min(grindProgress * 2.2, 1);
          _dummy.scale.setScalar(Math.max(s, 0.001));
        }
        _dummy.updateMatrix();
        groundsRef.current.setMatrixAt(i, _dummy.matrix);
      }
      groundsRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={beansRef}
        args={[beanGeo, undefined, BEAN_COUNT]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#ffffff" roughness={0.34} metalness={0.06} />
      </instancedMesh>

      <instancedMesh
        ref={groundsRef}
        args={[groundGeo, undefined, GROUND_COUNT]}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#3c2010" roughness={0.9} metalness={0.02} />
      </instancedMesh>
    </group>
  );
}

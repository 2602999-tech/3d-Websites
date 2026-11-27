import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ScrollState } from '../../hooks/useScrollRig';
import {
  createCremaSurfaceMaterial,
  createEspressoStreamMaterial,
} from '../../shaders/liquidShader';

interface LiquidStreamProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const DROPLET_COUNT = 18;
const _dummy = new THREE.Object3D();

export function LiquidStream({ scrollStateRef }: LiquidStreamProps) {
  const streamLeftRef = useRef<THREE.Mesh | null>(null);
  const streamRightRef = useRef<THREE.Mesh | null>(null);
  const liquidBodyRef = useRef<THREE.Mesh | null>(null);
  const cremaRef = useRef<THREE.Mesh | null>(null);
  const dropletsRef = useRef<THREE.InstancedMesh | null>(null);

  const streamMat = useMemo(() => createEspressoStreamMaterial(), []);
  const cremaMat = useMemo(() => createCremaSurfaceMaterial(), []);
  const dropletGeo = useMemo(() => new THREE.SphereGeometry(0.013, 10, 8), []);

  useEffect(() => {
    return () => {
      streamMat.dispose();
      cremaMat.dispose();
      dropletGeo.dispose();
    };
  }, [streamMat, cremaMat, dropletGeo]);

  useFrame((state) => {
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;

    streamMat.uniforms.uTime.value = t;
    cremaMat.uniforms.uTime.value = t;

    // Stage 3 (0.58 - 0.72): Viscous micro-droplets seeping beneath filter screen
    const seepActive =
      THREE.MathUtils.smoothstep(p, 0.56, 0.62) *
      (1 - THREE.MathUtils.smoothstep(p, 0.70, 0.76));

    if (dropletsRef.current) {
      for (let i = 0; i < DROPLET_COUNT; i++) {
        if (seepActive < 0.02) {
          _dummy.position.set(0, -10, 0);
          _dummy.scale.setScalar(0.001);
        } else {
          const cycle = (t * (0.65 + (i % 4) * 0.14) + i / DROPLET_COUNT) % 1;
          const xOff = ((i % 5) - 2) * 0.045;
          const zOff = (Math.floor(i / 5) - 1.5) * 0.045;
          _dummy.position.set(xOff, 1.52 - cycle * 0.14, 0.82 + zOff);
          _dummy.scale.set(0.8, 1.3, 0.8);
          _dummy.scale.multiplyScalar(seepActive * Math.sin(cycle * Math.PI));
        }
        _dummy.updateMatrix();
        dropletsRef.current.setMatrixAt(i, _dummy.matrix);
      }
      dropletsRef.current.instanceMatrix.needsUpdate = true;
    }

    // Stage 5 (0.84 - 1.00): Final twin espresso pour & rising crema inside white mug
    const pourActive =
      THREE.MathUtils.smoothstep(p, 0.83, 0.87) *
      (1 - THREE.MathUtils.smoothstep(p, 0.985, 1.0));
    const fillLevel = THREE.MathUtils.smoothstep(p, 0.85, 0.99);

    const mugBaseWorldY = 0.394;
    const spoutWorldY = 1.41;
    const maxLiquidHeight = 0.61;
    const currentLiquidHeight = Math.max(0.01, fillLevel * maxLiquidHeight);
    const liquidSurfaceWorldY = mugBaseWorldY + 0.08 + currentLiquidHeight;

    streamMat.uniforms.uOpacity.value = pourActive;
    cremaMat.uniforms.uPourImpact.value = pourActive;

    const showStreams = pourActive > 0.02 && fillLevel < 0.995;
    if (streamLeftRef.current && streamRightRef.current) {
      streamLeftRef.current.visible = showStreams;
      streamRightRef.current.visible = showStreams;
      if (showStreams) {
        const len = Math.max(0.05, spoutWorldY - liquidSurfaceWorldY);
        const midY = liquidSurfaceWorldY + len * 0.5;
        const thickness = THREE.MathUtils.smoothstep(pourActive, 0, 0.25);

        streamLeftRef.current.position.set(-0.105, midY, 0.82);
        streamRightRef.current.position.set(0.105, midY, 0.82);
        streamLeftRef.current.scale.set(thickness, len, thickness);
        streamRightRef.current.scale.set(thickness, len, thickness);
      }
    }

    if (liquidBodyRef.current && cremaRef.current) {
      const showLiquid = fillLevel > 0.005;
      liquidBodyRef.current.visible = showLiquid;
      cremaRef.current.visible = showLiquid;
      if (showLiquid) {
        const radScale = 0.84 + fillLevel * 0.15;
        liquidBodyRef.current.scale.set(radScale, currentLiquidHeight, radScale);
        liquidBodyRef.current.position.set(
          0,
          mugBaseWorldY + 0.08 + currentLiquidHeight * 0.5,
          0.82,
        );

        const discScale = 0.82 + fillLevel * 0.175;
        cremaRef.current.position.set(0, liquidSurfaceWorldY + 0.003, 0.82);
        cremaRef.current.scale.set(discScale, discScale, 1);
      }
    }
  });

  return (
    <group>
      {/* Stage 3 micro-droplets seeping beneath filter */}
      <instancedMesh
        ref={dropletsRef}
        args={[dropletGeo, undefined, DROPLET_COUNT]}
        frustumCulled={false}
      >
        <meshPhysicalMaterial
          color="#240e04"
          roughness={0.12}
          clearcoat={0.9}
          emissive="#4a1d08"
          emissiveIntensity={0.25}
        />
      </instancedMesh>

      {/* Stage 5 twin viscous espresso streams */}
      <mesh ref={streamLeftRef} material={streamMat} visible={false}>
        <cylinderGeometry args={[0.014, 0.01, 1.0, 18, 12]} />
      </mesh>
      <mesh ref={streamRightRef} material={streamMat} visible={false}>
        <cylinderGeometry args={[0.014, 0.01, 1.0, 18, 12]} />
      </mesh>

      {/* Rising espresso volume inside white mug */}
      <mesh ref={liquidBodyRef} visible={false}>
        <cylinderGeometry args={[0.335, 0.26, 1.0, 48]} />
        <meshPhysicalMaterial
          color="#210d05"
          roughness={0.12}
          clearcoat={0.85}
          clearcoatRoughness={0.12}
        />
      </mesh>

      {/* Swirling golden-tan crema top surface */}
      <mesh
        ref={cremaRef}
        rotation={[-Math.PI / 2, 0, 0]}
        material={cremaMat}
        visible={false}
      >
        <circleGeometry args={[0.34, 48]} />
      </mesh>
    </group>
  );
}

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

function createViscousExtrudeTrailGeometry(xSign: number): THREE.BufferGeometry {
  const sides = 7;
  const radius = 0.0105;
  const crossSection = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) crossSection.moveTo(px, py);
    else crossSection.lineTo(px, py);
  }
  crossSection.closePath();

  const pourPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(xSign * 0.0018, -0.22, 0.0024),
      new THREE.Vector3(-xSign * 0.0014, -0.54, -0.002),
      new THREE.Vector3(xSign * 0.0012, -0.82, 0.0015),
      new THREE.Vector3(0, -1.0, 0),
    ],
    false,
    'catmullrom',
    0.45,
  );

  // ExtrudeGeometry leaves clean flat-shaded facets along the curve steps for crisp low-poly glints
  return new THREE.ExtrudeGeometry(crossSection, {
    steps: 18,
    bevelEnabled: false,
    curveSegments: 1,
    extrudePath: pourPath,
  });
}

export function LiquidStream({ scrollStateRef }: LiquidStreamProps) {
  const streamLeftRef = useRef<THREE.Mesh | null>(null);
  const streamRightRef = useRef<THREE.Mesh | null>(null);
  const liquidBodyRef = useRef<THREE.Mesh | null>(null);
  const cremaRef = useRef<THREE.Mesh | null>(null);
  const dropletsRef = useRef<THREE.InstancedMesh | null>(null);

  const streamMatLeft = useMemo(() => {
    const mat = createEspressoStreamMaterial();
    mat.uniforms.uPhaseOffset.value = 0.0;
    return mat;
  }, []);
  const streamMatRight = useMemo(() => {
    const mat = createEspressoStreamMaterial();
    mat.uniforms.uPhaseOffset.value = 2.15;
    return mat;
  }, []);
  const cremaMat = useMemo(() => createCremaSurfaceMaterial(), []);
  const dropletMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#240e04',
        roughness: 0.12,
        metalness: 0.08,
        emissive: '#4a1d08',
        emissiveIntensity: 0.25,
        flatShading: false,
      }),
    [],
  );
  const liquidBodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#210d05',
        roughness: 0.12,
        metalness: 0.06,
        flatShading: false,
      }),
    [],
  );

  const dropletGeo = useMemo(() => new THREE.SphereGeometry(0.013, 32, 24), []);
  const trailGeoLeft = useMemo(() => createViscousExtrudeTrailGeometry(-1), []);
  const trailGeoRight = useMemo(() => createViscousExtrudeTrailGeometry(1), []);
  const liquidBodyGeo = useMemo(() => new THREE.CylinderGeometry(0.335, 0.26, 1.0, 128), []);
  const cremaGeo = useMemo(() => new THREE.CircleGeometry(0.34, 128), []);

  useEffect(() => {
    const dropletsMesh = dropletsRef.current;
    if (dropletsMesh) {
      dropletsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    return () => {
      dropletsMesh?.dispose();
      streamMatLeft.dispose();
      streamMatRight.dispose();
      cremaMat.dispose();
      dropletMat.dispose();
      liquidBodyMat.dispose();
      dropletGeo.dispose();
      trailGeoLeft.dispose();
      trailGeoRight.dispose();
      liquidBodyGeo.dispose();
      cremaGeo.dispose();
    };
  }, [
    streamMatLeft,
    streamMatRight,
    cremaMat,
    dropletMat,
    liquidBodyMat,
    dropletGeo,
    trailGeoLeft,
    trailGeoRight,
    liquidBodyGeo,
    cremaGeo,
  ]);

  useFrame((state) => {
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;

    streamMatLeft.uniforms.uTime.value = t;
    streamMatRight.uniforms.uTime.value = t;
    cremaMat.uniforms.uTime.value = t;

    const seepActive =
      THREE.MathUtils.smoothstep(p, 0.56, 0.62) *
      (1 - THREE.MathUtils.smoothstep(p, 0.70, 0.76));

    if (dropletsRef.current) {
      const showDroplets = seepActive >= 0.02;
      dropletsRef.current.visible = showDroplets;
      if (showDroplets) {
        for (let i = 0; i < DROPLET_COUNT; i++) {
          const cycle = (t * (0.65 + (i % 4) * 0.14) + i / DROPLET_COUNT) % 1;
          const xOff = ((i % 5) - 2) * 0.045;
          const zOff = (Math.floor(i / 5) - 1.5) * 0.045;
          _dummy.position.set(xOff, 1.52 - cycle * 0.14, 0.82 + zOff);
          _dummy.scale.set(0.8, 1.3, 0.8);
          _dummy.scale.multiplyScalar(seepActive * Math.sin(cycle * Math.PI));
          _dummy.updateMatrix();
          dropletsRef.current.setMatrixAt(i, _dummy.matrix);
        }
        dropletsRef.current.instanceMatrix.needsUpdate = true;
      }
    }

    const pourActive = THREE.MathUtils.smoothstep(p, 0.83, 0.87);
    const fillLevel = THREE.MathUtils.smoothstep(p, 0.85, 0.95);

    const mugBaseWorldY = 0.394;
    // Exact spout tip outlet bore position in machine coordinates (1.64 - 0.225 - 0.011 = 1.404)
    const spoutOutletY = 1.404;
    const maxLiquidHeight = 0.58;
    const currentLiquidHeight = Math.max(0.01, fillLevel * maxLiquidHeight);
    const liquidSurfaceWorldY = mugBaseWorldY + 0.08 + currentLiquidHeight;

    cremaMat.uniforms.uPourImpact.value = pourActive;

    const showStreams = p >= 0.83;
    if (streamLeftRef.current && streamRightRef.current) {
      streamLeftRef.current.visible = showStreams;
      streamRightRef.current.visible = showStreams;
      if (showStreams) {
        const fullDropLen = Math.max(0.04, spoutOutletY - liquidSurfaceWorldY);
        const extendFrac = THREE.MathUtils.smoothstep(p, 0.83, 0.858);
        const activeLen = fullDropLen * extendFrac;
        const thickness = 0.85 + THREE.MathUtils.smoothstep(p, 0.83, 0.88) * 0.15;

        streamLeftRef.current.position.set(-0.105, spoutOutletY, 0.82);
        streamRightRef.current.position.set(0.105, spoutOutletY, 0.82);

        streamMatLeft.uniforms.uLength.value = activeLen;
        streamMatRight.uniforms.uLength.value = activeLen;
        streamMatLeft.uniforms.uThickness.value = thickness;
        streamMatRight.uniforms.uThickness.value = thickness * 0.96;
        streamMatLeft.uniforms.uOpacity.value = 1.0;
        streamMatRight.uniforms.uOpacity.value = 1.0;
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
      <instancedMesh
        ref={dropletsRef}
        args={[dropletGeo, dropletMat, DROPLET_COUNT]}
        frustumCulled={false}
      />

      <mesh
        ref={streamLeftRef}
        geometry={trailGeoLeft}
        material={streamMatLeft}
        frustumCulled={false}
        visible={false}
      />
      <mesh
        ref={streamRightRef}
        geometry={trailGeoRight}
        material={streamMatRight}
        frustumCulled={false}
        visible={false}
      />

      <mesh
        ref={liquidBodyRef}
        geometry={liquidBodyGeo}
        material={liquidBodyMat}
        visible={false}
      />

      <mesh
        ref={cremaRef}
        geometry={cremaGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        material={cremaMat}
        visible={false}
      />
    </group>
  );
}

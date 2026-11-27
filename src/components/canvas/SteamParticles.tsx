import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ScrollState } from '../../hooks/useScrollRig';

interface SteamParticlesProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const WISP_COUNT = 18;
const _dummy = new THREE.Object3D();

function createSteamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  grad.addColorStop(0, 'rgba(255, 252, 246, 0.45)');
  grad.addColorStop(0.45, 'rgba(248, 243, 234, 0.18)');
  grad.addColorStop(1, 'rgba(248, 243, 234, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function SteamParticles({ scrollStateRef }: SteamParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const steamTex = useMemo(() => createSteamTexture(), []);
  const planeGeo = useMemo(() => new THREE.PlaneGeometry(0.32, 0.42), []);

  const particles = useMemo(
    () =>
      Array.from({ length: WISP_COUNT }, (_, i) => ({
        offset: i / WISP_COUNT,
        speed: 0.24 + (i % 4) * 0.055,
        radius: 0.05 + (i % 5) * 0.025,
        phase: (i * 1.7) % (Math.PI * 2),
      })),
    [],
  );

  useEffect(() => {
    return () => {
      steamTex.dispose();
      planeGeo.dispose();
    };
  }, [steamTex, planeGeo]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;
    const steamStrength = THREE.MathUtils.smoothstep(p, 0.87, 0.96);

    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = steamStrength * 0.34;
    meshRef.current.visible = steamStrength > 0.01;

    if (!meshRef.current.visible) return;

    for (let i = 0; i < WISP_COUNT; i++) {
      const pt = particles[i];
      const life = (t * pt.speed + pt.offset) % 1;
      const curlX = Math.sin(t * 1.3 + pt.phase + life * 3.5) * pt.radius * (0.6 + life);
      const curlZ = Math.cos(t * 1.0 + pt.phase + life * 3.0) * pt.radius * (0.6 + life);

      _dummy.position.set(curlX, 1.18 + life * 0.85, 0.82 + curlZ);
      _dummy.quaternion.copy(state.camera.quaternion);
      const s = (0.45 + life * 1.4) * Math.sin(life * Math.PI);
      _dummy.scale.set(s, s * 1.25, s);
      _dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, _dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[planeGeo, undefined, WISP_COUNT]}
      frustumCulled={false}
      renderOrder={10}
    >
      <meshBasicMaterial
        map={steamTex}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

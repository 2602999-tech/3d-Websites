import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ScrollState } from '../../hooks/useScrollRig';

interface CupSteamWispsProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const WISP_COUNT = 20;
const _dummy = new THREE.Object3D();
const _rollQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function createSteamWispMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uHighlightColor: { value: new THREE.Color('#fffcf7') },
      uShadowTint: { value: new THREE.Color('#c7bcb0') },
    },
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aSeed;

      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;

      void main() {
        vUv = uv;
        vLife = aLife;
        vSeed = aSeed;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      uniform vec3 uHighlightColor;
      uniform vec3 uShadowTint;

      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;

      void main() {
        vec2 p = vUv * 2.0 - 1.0;

        // Domain-warped organic ribbon curl inside each billboard
        float warp1 = sin(p.y * 3.4 - uTime * 1.9 + vSeed * 6.2831) * 0.24;
        float warp2 = cos(p.y * 5.8 - uTime * 2.6 + vSeed * 12.56) * 0.12;
        float xDist = abs(p.x + warp1 + warp2);

        // Soft wispy core + secondary trailing curl
        float ribbon = exp(-(xDist * xDist) / 0.16);
        float secondary = exp(-((xDist - 0.28) * (xDist - 0.28)) / 0.08) * 0.45;
        float radialMask = smoothstep(1.0, 0.18, length(vec2(p.x * 1.15, p.y * 0.92)));
        float lifeFade = sin(clamp(vLife, 0.0, 1.0) * 3.14159265);

        float alpha = (ribbon + secondary) * radialMask * lifeFade * uStrength * 0.36;
        if (alpha < 0.004) discard;

        // Subtle warm-ivory core with cool-pearl edge depth so steam reads cleanly on alabaster
        vec3 col = mix(uShadowTint, uHighlightColor, smoothstep(0.05, 0.72, ribbon * radialMask));
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

export function CupSteamWisps({ scrollStateRef }: CupSteamWispsProps) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);

  const resources = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(0.24, 0.36);
    const material = createSteamWispMaterial();
    const lifeArray = new Float32Array(WISP_COUNT);
    const seedArray = new Float32Array(WISP_COUNT);

    for (let i = 0; i < WISP_COUNT; i++) {
      seedArray[i] = rand(i + 1);
    }

    const lifeAttr = new THREE.InstancedBufferAttribute(lifeArray, 1);
    lifeAttr.setUsage(THREE.DynamicDrawUsage);
    const seedAttr = new THREE.InstancedBufferAttribute(seedArray, 1);

    geometry.setAttribute('aLife', lifeAttr);
    geometry.setAttribute('aSeed', seedAttr);

    return { geometry, material, lifeArray, lifeAttr };
  }, []);

  const particleBuffers = useMemo(() => {
    const offset = new Float32Array(WISP_COUNT);
    const speed = new Float32Array(WISP_COUNT);
    const radius = new Float32Array(WISP_COUNT);
    const phase = new Float32Array(WISP_COUNT);
    const tilt = new Float32Array(WISP_COUNT);

    for (let i = 0; i < WISP_COUNT; i++) {
      offset[i] = i / WISP_COUNT;
      speed[i] = 0.23 + rand(i * 3 + 1) * 0.12;
      radius[i] = 0.035 + rand(i * 3 + 2) * 0.075;
      phase[i] = rand(i * 3 + 3) * Math.PI * 2;
      tilt[i] = (rand(i * 5 + 4) - 0.5) * 0.55;
    }

    return { offset, speed, radius, phase, tilt };
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.visible = false;
    }
    return () => {
      mesh?.dispose();
      resources.geometry.deleteAttribute('aLife');
      resources.geometry.deleteAttribute('aSeed');
      resources.geometry.dispose();
      resources.material.dispose();
    };
  }, [resources]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;
    const steamStrength = THREE.MathUtils.smoothstep(p, 0.85, 0.94);

    resources.material.uniforms.uTime.value = t;
    resources.material.uniforms.uStrength.value = steamStrength;
    mesh.visible = steamStrength > 0.01;

    if (!mesh.visible) return;

    const { offset, speed, radius, phase, tilt } = particleBuffers;
    const { lifeArray, lifeAttr } = resources;

    for (let i = 0; i < WISP_COUNT; i++) {
      const life = (t * speed[i] + offset[i]) % 1;
      lifeArray[i] = life;

      const spread = 0.45 + life * 1.15;
      const curlX = Math.sin(t * 1.35 + phase[i] + life * 4.2) * radius[i] * spread;
      const curlZ = Math.cos(t * 1.1 + phase[i] + life * 3.6) * radius[i] * spread;

      _dummy.position.set(curlX, 1.10 + life * 0.66, 0.82 + curlZ);

      // Billboard facing camera with gentle rising roll
      _dummy.quaternion.copy(state.camera.quaternion);
      _rollQuat.setFromAxisAngle(_zAxis, tilt[i] + Math.sin(t * 0.9 + phase[i]) * 0.18);
      _dummy.quaternion.multiply(_rollQuat);

      const widthScale = 0.55 + life * 1.15;
      const heightScale = 0.65 + life * 1.45;
      _dummy.scale.set(widthScale, heightScale, 1);

      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    lifeAttr.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[resources.geometry, resources.material, WISP_COUNT]}
      frustumCulled={false}
      renderOrder={10}
    />
  );
}

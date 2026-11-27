import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ScrollState } from '../../hooks/useScrollRig';

interface BackdropGlowParticlesProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const PARTICLE_COUNT = 64;

function createBackdropGlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDarkFactor: { value: 0 },
      uCoreBright: { value: new THREE.Color('#fff5dd') },
      uWarmAmber: { value: new THREE.Color('#f7a23b') },
      uDeepCopper: { value: new THREE.Color('#c85e1a') },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aBasePos;
      attribute float aSpeed;
      attribute float aPhase;
      attribute float aTone;
      attribute float aSize;

      uniform float uTime;
      uniform float uDarkFactor;

      varying vec2 vUv;
      varying float vTone;
      varying float vViewDepth;
      varying float vTwinkle;

      void main() {
        vUv = uv;
        vTone = aTone;

        // GPU-driven floating motion using uTime (zero CPU per-frame array loops)
        vec3 pos = aBasePos;
        float t = uTime * aSpeed;
        pos.x += sin(t * 0.55 + aPhase) * 0.08;
        pos.y += cos(t * 0.42 + aPhase * 1.3) * 0.10;
        pos.z += sin(t * 0.35 + aPhase * 0.7) * 0.05;

        vTwinkle = 0.68 + 0.32 * sin(t * 1.2 + aPhase * 2.1);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vViewDepth = -mvPosition.z;

        // Billboard scale
        float finalSize = aSize * (0.88 + 0.24 * vTwinkle);
        vec4 basePosition = modelViewMatrix * vec4(aBasePos, 1.0);
        vec3 transformed = basePosition.xyz + position * finalSize;
        gl_Position = projectionMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDarkFactor;
      uniform vec3 uCoreBright;
      uniform vec3 uWarmAmber;
      uniform vec3 uDeepCopper;

      varying vec2 vUv;
      varying float vTone;
      varying float vViewDepth;
      varying float vTwinkle;

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;

        float edgeMask = smoothstep(1.0, 0.08, sqrt(r2));
        float hotCore = exp(-r2 * 18.0);
        float innerHalo = exp(-r2 * 5.2) * 0.62;
        float softAura = exp(-r2 * 2.1) * 0.28 * edgeMask;

        vec3 toneColor = mix(uWarmAmber, uDeepCopper, vTone * 0.65);
        vec3 col = mix(toneColor, uCoreBright, clamp(hotCore * 1.15, 0.0, 1.0));

        float lumBoost = mix(1.05, 1.85, uDarkFactor);
        col *= lumBoost;

        float distFade = smoothstep(8.2, 2.1, vViewDepth);
        float intensity = (hotCore + innerHalo + softAura) * vTwinkle * distFade;
        float alpha = clamp(intensity * mix(0.68, 0.92, uDarkFactor), 0.0, 1.0);
        if (alpha < 0.004) discard;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function BackdropGlowParticles({ scrollStateRef }: BackdropGlowParticlesProps) {
  const meshRef = useRef<THREE.Mesh | null>(null);

  const resources = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = createBackdropGlowMaterial();
    const instGeo = new THREE.InstancedBufferGeometry();
    instGeo.index = geometry.index;
    instGeo.attributes.position = geometry.attributes.position;
    instGeo.attributes.uv = geometry.attributes.uv;
    instGeo.attributes.normal = geometry.attributes.normal;

    const basePos = new Float32Array(PARTICLE_COUNT * 3);
    const speed = new Float32Array(PARTICLE_COUNT);
    const phase = new Float32Array(PARTICLE_COUNT);
    const tone = new Float32Array(PARTICLE_COUNT);
    const size = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r1 = rand(i * 11 + 3);
      const r2 = rand(i * 11 + 5);
      const r3 = rand(i * 11 + 7);
      const r4 = rand(i * 11 + 9);
      const isFocalBand = i < Math.floor(PARTICLE_COUNT * 0.65);

      basePos[i * 3] = isFocalBand ? -4.8 + r1 * 6.2 : -6.2 + r1 * 8.6;
      basePos[i * 3 + 1] = isFocalBand ? 0.25 + r2 * 2.55 : 0.35 + r2 * 3.45;
      basePos[i * 3 + 2] = isFocalBand ? -4.3 + r3 * 3.0 : -5.8 + r3 * 3.6;

      speed[i] = 0.35 + rand(i * 13 + 2) * 0.55;
      phase[i] = rand(i * 13 + 6) * Math.PI * 2;
      tone[i] = rand(i * 7 + 2);
      size[i] = isFocalBand ? 0.055 + r4 * 0.085 : 0.08 + r4 * 0.11;
    }

    instGeo.setAttribute('aBasePos', new THREE.InstancedBufferAttribute(basePos, 3));
    instGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1));
    instGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    instGeo.setAttribute('aTone', new THREE.InstancedBufferAttribute(tone, 1));
    instGeo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));

    return { geometry: instGeo, material };
  }, []);

  useEffect(() => {
    return () => {
      resources.geometry.dispose();
      resources.material.dispose();
    };
  }, [resources]);

  useFrame((state) => {
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;

    const darkIn = THREE.MathUtils.smoothstep(p, 0.16, 0.26);
    const darkOut = 1 - THREE.MathUtils.smoothstep(p, 0.70, 0.80);
    const darkFactor = darkIn * darkOut;

    resources.material.uniforms.uTime.value = t;
    resources.material.uniforms.uDarkFactor.value = darkFactor;

    if (meshRef.current) {
      meshRef.current.quaternion.copy(state.camera.quaternion);
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={resources.geometry}
      material={resources.material}
      frustumCulled={false}
      renderOrder={1}
    />
  );
}

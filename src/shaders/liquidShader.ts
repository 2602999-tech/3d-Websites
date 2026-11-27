import * as THREE from 'three';

export function createEspressoStreamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uDeepColor: { value: new THREE.Color(0x281006) },
      uAmberColor: { value: new THREE.Color(0x9f4f1c) },
      uCremaHighlight: { value: new THREE.Color(0xe7ac68) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      uniform float uTime;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float ripple = sin(uv.y * 26.0 - uTime * 14.0) * 0.0022;
        pos.x += normal.x * ripple;
        pos.z += normal.z * ripple;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vViewPos = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uDeepColor;
      uniform vec3 uAmberColor;
      uniform vec3 uCremaHighlight;

      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;

      void main() {
        vec3 viewDir = normalize(vViewPos);
        vec3 norm = normalize(vNormalView);
        float fresnel = pow(1.0 - abs(dot(norm, viewDir)), 2.0);

        float flowBand = sin(vUv.y * 22.0 - uTime * 11.0) * 0.5 + 0.5;
        float cremaStripe = smoothstep(0.45, 0.95, flowBand);

        // Warm amber subsurface scatter along thin stream edges + dark espresso core
        vec3 col = mix(uDeepColor, uAmberColor, fresnel * 0.78 + cremaStripe * 0.25);
        col = mix(col, uCremaHighlight, pow(fresnel, 2.5) * 0.65 + cremaStripe * 0.18);

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
    transparent: true,
  });
}

export function createCremaSurfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPourImpact: { value: 0 },
      uDarkRoast: { value: new THREE.Color(0x4b220c) },
      uCaramelCrema: { value: new THREE.Color(0xc57d3b) },
      uGoldenFoam: { value: new THREE.Color(0xe6b576) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uPourImpact;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float dist = length(uv - 0.5);
        float wave = sin(dist * 34.0 - uTime * 10.0) * 0.006 * uPourImpact * (1.0 - dist * 1.4);
        pos.z += wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uPourImpact;
      uniform vec3 uDarkRoast;
      uniform vec3 uCaramelCrema;
      uniform vec3 uGoldenFoam;

      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vec2 centered = vUv - 0.5;
        float r = length(centered) * 2.0;
        float angle = atan(centered.y, centered.x) + r * 3.2 - uTime * 0.45;
        vec2 swirlUv = vec2(cos(angle) * r, sin(angle) * r) * 4.5;

        float n1 = noise(swirlUv + uTime * 0.15);
        float n2 = noise(swirlUv * 2.4 - uTime * 0.22);
        float tiger = smoothstep(0.32, 0.78, n1 * 0.65 + n2 * 0.35);

        // Twin spout impact bright foam rings
        float dL = length(centered - vec2(-0.14, 0.0));
        float dR = length(centered - vec2(0.14, 0.0));
        float impactFoam = (smoothstep(0.18, 0.02, dL) + smoothstep(0.18, 0.02, dR)) * uPourImpact;

        vec3 col = mix(uDarkRoast, uCaramelCrema, tiger);
        col = mix(col, uGoldenFoam, clamp(impactFoam * 0.85 + smoothstep(0.65, 1.0, tiger) * 0.45, 0.0, 1.0));
        // Subtle darker rim meniscus where crema meets porcelain
        col = mix(col, uDarkRoast * 0.72, smoothstep(0.84, 1.0, r));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function createWaterSaturationMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uHotColor: { value: new THREE.Color(0xffb563) },
      uCoreColor: { value: new THREE.Color(0xd96b27) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;

      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uHotColor;
      uniform vec3 uCoreColor;

      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;

      void main() {
        float pulse = sin(vUv.x * 28.0 - uTime * 9.0) * 0.5 + 0.5;
        vec3 col = mix(uCoreColor, uHotColor, pulse * 0.8 + 0.2);
        float alpha = clamp(uIntensity * (0.35 + pulse * 0.55), 0.0, 0.92);
        gl_FragColor = vec4(col * (1.0 + uIntensity * 0.6), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

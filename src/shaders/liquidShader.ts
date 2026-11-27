import * as THREE from 'three';

export function createEspressoStreamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uLength: { value: 0.9 },
      uThickness: { value: 1.0 },
      uPhaseOffset: { value: 0.0 },
      uDeepColor: { value: new THREE.Color(0x200902) },
      uAmberColor: { value: new THREE.Color(0x9a4917) },
      uCremaHighlight: { value: new THREE.Color(0xf0b872) },
      uSpecularColor: { value: new THREE.Color(0xfff4e2) },
    },
    vertexShader: /* glsl */ `
      varying float vPathT;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying float vFlowPulse;

      uniform float uTime;
      uniform float uLength;
      uniform float uThickness;
      uniform float uPhaseOffset;

      void main() {
        // Extrude path runs vertically downward from y = 0 (spout outlet) to y = -1 (cup surface)
        float t = clamp(-position.y, 0.0, 1.0);
        vPathT = t;

        // Viscous fluid profile: clinging meniscus at spout, gravity-accelerated waist, subtle splash flare
        float spoutMeniscus = exp(-t * 14.0) * 0.24;
        float gravityNeck = mix(1.04, 0.68, smoothstep(0.0, 0.68, t));
        float impactBead = exp(-(1.0 - t) * 18.0) * 0.18;

        // Rayleigh-Plateau surface tension pulsing traveling down the trail
        float travelingWave = sin(t * 15.0 - uTime * 9.5 + uPhaseOffset);
        float envelope = sin(t * 3.14159265);
        float radiusFactor = uThickness * (gravityNeck + spoutMeniscus + impactBead + travelingWave * 0.14 * envelope);

        vec3 pos = position;
        pos.xz *= radiusFactor;
        pos.y = -t * uLength;

        // Subtle viscous serpentine ribbon sway — strictly zero at t = 0 so it stays pinned to the spout outlet
        float swayAmp = 0.0055 * envelope * uThickness;
        pos.x += sin(t * 9.5 - uTime * 7.2 + uPhaseOffset) * swayAmp;
        pos.z += cos(t * 8.0 - uTime * 6.4 + uPhaseOffset * 1.3) * swayAmp * 0.85;

        vFlowPulse = travelingWave * 0.5 + 0.5;

        // Perturb low-poly facet normal gently along traveling viscous ripple for liquid specular shimmer
        vec3 n = normal;
        n.y += cos(t * 15.0 - uTime * 9.5 + uPhaseOffset) * 0.16 * envelope;
        n = normalize(n);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vViewPos = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * n);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uPhaseOffset;
      uniform vec3 uDeepColor;
      uniform vec3 uAmberColor;
      uniform vec3 uCremaHighlight;
      uniform vec3 uSpecularColor;

      varying float vPathT;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying float vFlowPulse;

      void main() {
        vec3 V = normalize(vViewPos);
        vec3 N = normalize(vNormalView);
        if (!gl_FrontFacing) N = -N;

        // Studio key, overhead softbox, and warm back-rim light directions in view space
        vec3 L1 = normalize((viewMatrix * vec4(4.5, 8.0, 5.2, 0.0)).xyz);
        vec3 L2 = normalize((viewMatrix * vec4(-3.8, 4.5, -2.8, 0.0)).xyz);
        vec3 L3 = normalize((viewMatrix * vec4(0.0, 5.5, 3.0, 0.0)).xyz);

        vec3 H1 = normalize(L1 + V);
        vec3 H2 = normalize(L2 + V);
        vec3 H3 = normalize(L3 + V);

        float ndv = max(dot(N, V), 0.0);
        float fresnel = pow(1.0 - ndv, 3.0);

        // Rich viscous espresso base with subsurface amber & flowing crema micro-streaks
        float flowBand = sin(vPathT * 24.0 - uTime * 11.5 + uPhaseOffset) * 0.5 + 0.5;
        float cremaRibbon = smoothstep(0.42, 0.96, flowBand * 0.65 + vFlowPulse * 0.35);

        vec3 baseCol = mix(uDeepColor, uAmberColor, fresnel * 0.72 + cremaRibbon * 0.28);
        baseCol = mix(baseCol, uCremaHighlight, pow(fresnel, 2.2) * 0.48 + cremaRibbon * 0.16);

        // Dual-lobe high-gloss specular reflections (wet liquid clearcoat + tight pinpoint glint)
        float specTight1 = pow(max(dot(N, H1), 0.0), 180.0) * 2.4;
        float specBroad1 = pow(max(dot(N, H1), 0.0), 34.0) * 0.52;
        float specRim2 = pow(max(dot(N, H2), 0.0), 96.0) * 1.15;
        float specSoft3 = pow(max(dot(N, H3), 0.0), 64.0) * 0.75;

        float totalSpec = specTight1 + specBroad1 + specRim2 + specSoft3;
        vec3 glossEnv = mix(uAmberColor, uSpecularColor, 0.75) * fresnel * 0.65;

        vec3 finalCol = baseCol + glossEnv + uSpecularColor * totalSpec;
        float alpha = clamp(uOpacity * (0.94 + fresnel * 0.06), 0.0, 1.0);
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: true,
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

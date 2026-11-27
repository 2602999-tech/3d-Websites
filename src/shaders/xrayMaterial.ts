import * as THREE from 'three';

export function createXrayShellMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uXrayAmount: { value: 0 },
      uBaseColor: { value: new THREE.Color(0x2a2724) },
      uWireColor: { value: new THREE.Color(0xd99b66) },
      uRimColor: { value: new THREE.Color(0xf4d2aa) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPos = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uXrayAmount;
      uniform vec3 uBaseColor;
      uniform vec3 uWireColor;
      uniform vec3 uRimColor;

      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;

      void main() {
        vec3 viewDir = normalize(vViewPos);
        vec3 norm = normalize(vNormalView);
        float ndotv = abs(dot(norm, viewDir));
        float fresnel = pow(1.0 - ndotv, 2.4);

        // Subtle architectural contour grid lines in world space
        float gridY = smoothstep(0.93, 0.99, abs(sin(vWorldPos.y * 28.0)));
        float gridX = smoothstep(0.94, 0.99, abs(sin(vWorldPos.x * 24.0)));
        float scanWave = smoothstep(0.85, 1.0, sin(vWorldPos.y * 5.0 - uTime * 2.2));
        float blueprintLine = max(gridY, gridX) * 0.45 + scanWave * 0.25;

        vec3 xrayCol = mix(uBaseColor * 0.35, uWireColor, fresnel * 0.85 + blueprintLine * 0.55);
        xrayCol += uRimColor * pow(fresnel, 3.5) * 0.55;

        float alpha = mix(1.0, clamp(0.06 + fresnel * 0.44 + blueprintLine * 0.14, 0.05, 0.65), uXrayAmount);
        gl_FragColor = vec4(xrayCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

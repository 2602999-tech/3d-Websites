import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ScrollState } from '../../hooks/useScrollRig';
import { createWaterSaturationMaterial } from '../../shaders/liquidShader';
import { createXrayShellMaterial } from '../../shaders/xrayMaterial';
import { applySmoothVertexNormalsWithThreshold } from '../../utils/smoothNormals';

interface CoffeeMachineProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const _dummy = new THREE.Object3D();

function createRoundedPanel(
  width: number,
  height: number,
  depth: number,
  radius = 0.045,
  segments = 6,
): THREE.BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

function createSmoothLathe(
  points: THREE.Vector2[],
  radialSegments = 128,
  angleThresholdRad = Math.PI / 2.6,
): THREE.BufferGeometry {
  const raw = new THREE.LatheGeometry(points, radialSegments);
  return applySmoothVertexNormalsWithThreshold(raw, angleThresholdRad);
}

function createSmoothTube(
  points: THREE.Vector3[],
  tubularSegments = 96,
  radius = 0.02,
  radialSegments = 32,
  closed = false,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.35);
  const raw = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
  return applySmoothVertexNormalsWithThreshold(raw, Math.PI * 0.45);
}

function createWalnutCanvasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4e2c18';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    const y = (i / 120) * 256;
    const wave = Math.sin(i * 0.16) * 8;
    ctx.strokeStyle =
      i % 3 === 0 ? 'rgba(24, 12, 5, 0.42)' : 'rgba(116, 70, 42, 0.30)';
    ctx.lineWidth = 1 + ((i * 37) % 10) * 0.15;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + wave, 170, y - wave, 256, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createGaugeTexture(
  maxVal: number,
  label: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;
  const grad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 246);
  grad.addColorStop(0, '#221e1a');
  grad.addColorStop(0.85, '#141210');
  grad.addColorStop(1, '#0c0b09');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 246, 0, Math.PI * 2);
  ctx.fill();

  const startAngle = Math.PI * 0.75;
  const totalSweep = Math.PI * 1.5;
  ctx.strokeStyle = '#d98a4e';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    186,
    startAngle + (maxVal === 15 ? 8 / 15 : 1.1 / 3) * totalSweep,
    startAngle + (maxVal === 15 ? 10.5 / 15 : 1.6 / 3) * totalSweep,
  );
  ctx.stroke();

  for (let i = 0; i <= 24; i++) {
    const frac = i / 24;
    const angle = startAngle + frac * totalSweep;
    const major = i % 4 === 0;
    ctx.strokeStyle = major ? '#f5f1eb' : '#857c71';
    ctx.lineWidth = major ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(angle) * (major ? 182 : 196),
      cy + Math.sin(angle) * (major ? 182 : 196),
    );
    ctx.lineTo(cx + Math.cos(angle) * 212, cy + Math.sin(angle) * 212);
    ctx.stroke();
  }

  ctx.fillStyle = '#c87a4b';
  ctx.font = '600 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BAR', cx, cy + 84);
  ctx.fillStyle = '#a89e92';
  ctx.font = '600 18px sans-serif';
  ctx.fillText(label, cx, cy - 60);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSmoothMugGeometry(): THREE.BufferGeometry {
  const path = new THREE.Path();
  path.moveTo(0.0, 0.0);
  path.lineTo(0.22, 0.0);
  path.quadraticCurveTo(0.275, 0.004, 0.305, 0.065);
  path.quadraticCurveTo(0.352, 0.24, 0.384, 0.56);
  path.lineTo(0.394, 0.752);
  path.absarc(0.368, 0.752, 0.026, 0, Math.PI, false);
  path.quadraticCurveTo(0.312, 0.34, 0.256, 0.105);
  path.quadraticCurveTo(0.236, 0.074, 0.18, 0.072);
  path.lineTo(0.0, 0.072);

  const pts = path.getPoints(36);
  return createSmoothLathe(pts, 128, Math.PI * 0.48);
}

function createSmoothCollarGeometry(): THREE.BufferGeometry {
  const path = new THREE.Path();
  path.moveTo(0.54, 0.0);
  path.lineTo(0.688, 0.0);
  path.quadraticCurveTo(0.70, 0.0, 0.698, 0.036);
  path.quadraticCurveTo(0.692, 0.088, 0.642, 0.098);
  path.quadraticCurveTo(0.598, 0.104, 0.558, 0.092);
  path.quadraticCurveTo(0.542, 0.076, 0.54, 0.036);
  path.lineTo(0.54, 0.0);
  return createSmoothLathe(path.getPoints(32), 128, Math.PI / 2.5);
}

function createSmoothLidBezelGeometry(): THREE.BufferGeometry {
  const path = new THREE.Path();
  path.moveTo(0.54, -0.02);
  path.lineTo(0.668, -0.02);
  path.quadraticCurveTo(0.678, -0.015, 0.676, 0.022);
  path.quadraticCurveTo(0.665, 0.064, 0.618, 0.068);
  path.quadraticCurveTo(0.562, 0.068, 0.545, 0.044);
  path.quadraticCurveTo(0.54, 0.024, 0.54, -0.02);
  return createSmoothLathe(path.getPoints(32), 128, Math.PI / 2.5);
}

function createSmoothE61BellGeometry(): THREE.BufferGeometry {
  const path = new THREE.Path();
  path.moveTo(0.0, 0.0);
  path.lineTo(0.352, 0.0);
  path.quadraticCurveTo(0.386, 0.008, 0.384, 0.052);
  path.quadraticCurveTo(0.380, 0.082, 0.350, 0.095);
  path.lineTo(0.350, 0.232);
  path.quadraticCurveTo(0.415, 0.275, 0.415, 0.328);
  path.quadraticCurveTo(0.415, 0.376, 0.345, 0.415);
  path.quadraticCurveTo(0.305, 0.465, 0.292, 0.555);
  path.quadraticCurveTo(0.285, 0.585, 0.24, 0.585);
  path.lineTo(0.0, 0.585);
  return createSmoothLathe(path.getPoints(32), 128, Math.PI / 3.0);
}

function createSmoothBasketGeometry(): THREE.BufferGeometry {
  const path = new THREE.Path();
  path.moveTo(0.0, -0.12);
  path.quadraticCurveTo(0.18, -0.116, 0.265, -0.045);
  path.quadraticCurveTo(0.315, 0.025, 0.346, 0.112);
  path.absarc(0.326, 0.112, 0.02, 0, Math.PI, false);
  path.quadraticCurveTo(0.295, 0.082, 0.26, 0.08);
  path.lineTo(0.0, 0.08);
  return createSmoothLathe(path.getPoints(32), 128, Math.PI / 3.0);
}

export function CoffeeMachine({ scrollStateRef }: CoffeeMachineProps) {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(
    () => Math.min(gl.capabilities.getMaxAnisotropy(), 8),
    [gl],
  );

  const lidPivotRef = useRef<THREE.Group | null>(null);
  const solidShellRef = useRef<THREE.Group | null>(null);
  const xrayShellRef = useRef<THREE.Group | null>(null);
  const burrRotorRef = useRef<THREE.Group | null>(null);
  const pistonRef = useRef<THREE.Group | null>(null);
  const puckRef = useRef<THREE.Mesh | null>(null);
  const needleRef = useRef<THREE.Group | null>(null);
  const boilerCoilMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const puckSaturationMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const teethMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const grateMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const fBoltsRef = useRef<THREE.InstancedMesh | null>(null);
  const wasTransparentRef = useRef(false);

  const textures = useMemo(() => {
    const walnutTex = createWalnutCanvasTexture(maxAnisotropy);
    const brewGaugeTex = createGaugeTexture(15, 'BREW', maxAnisotropy);
    const steamGaugeTex = createGaugeTexture(3, 'STEAM', maxAnisotropy);
    return { walnutTex, brewGaugeTex, steamGaugeTex };
  }, [maxAnisotropy]);

  const mats = useMemo(() => {
    const xrayMat = createXrayShellMaterial();
    const waterFlowMat = createWaterSaturationMaterial();

    // Start opaque (`transparent: false`) for clean depth sorting & zero overdraw
    const matteBlackMat = new THREE.MeshStandardMaterial({
      color: 0x201e1c,
      roughness: 0.4,
      metalness: 0.5,
      transparent: false,
      opacity: 1,
      flatShading: false,
    });
    const staticBlackMat = new THREE.MeshStandardMaterial({
      color: 0x201e1c,
      roughness: 0.4,
      metalness: 0.5,
      flatShading: false,
    });
    const grateMat = new THREE.MeshStandardMaterial({
      color: 0x181614,
      roughness: 0.55,
      metalness: 0.4,
      flatShading: false,
    });

    const brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e5e9,
      roughness: 0.16,
      metalness: 0.92,
      transparent: false,
      opacity: 1,
      flatShading: false,
    });
    const staticSteelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e5e9,
      roughness: 0.16,
      metalness: 0.92,
      flatShading: false,
    });
    const mirrorSteelMat = new THREE.MeshStandardMaterial({
      color: 0xe6e9ee,
      roughness: 0.14,
      metalness: 0.95,
      flatShading: false,
    });

    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xc87a4b,
      roughness: 0.22,
      metalness: 0.88,
      flatShading: false,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd49d52,
      roughness: 0.24,
      metalness: 0.88,
      flatShading: false,
    });
    const burrSteelMat = new THREE.MeshStandardMaterial({
      color: 0xb2b9c2,
      roughness: 0.18,
      metalness: 0.95,
      flatShading: false,
    });

    const walnutMat = new THREE.MeshStandardMaterial({
      map: textures.walnutTex,
      roughness: 0.44,
      metalness: 0.04,
      flatShading: false,
    });
    const brewGaugeMat = new THREE.MeshStandardMaterial({
      map: textures.brewGaugeTex,
      roughness: 0.28,
      metalness: 0.08,
      flatShading: false,
    });
    const steamGaugeMat = new THREE.MeshStandardMaterial({
      map: textures.steamGaugeTex,
      roughness: 0.28,
      metalness: 0.08,
      flatShading: false,
    });
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0xd98a4e,
      roughness: 0.25,
      metalness: 0.4,
      flatShading: false,
    });

    const glassAmberMat = new THREE.MeshStandardMaterial({
      color: 0x5b3d24,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      flatShading: false,
    });
    const glassClearMat = new THREE.MeshStandardMaterial({
      color: 0xe5ded3,
      roughness: 0.12,
      metalness: 0.08,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      flatShading: false,
    });
    const waterGlassPipeMat = new THREE.MeshStandardMaterial({
      color: 0xd8a272,
      roughness: 0.14,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      flatShading: false,
    });
    const porcelainMat = new THREE.MeshStandardMaterial({
      color: 0xfaf7f2,
      roughness: 0.15,
      metalness: 0.02,
      emissive: 0x1e1b18,
      emissiveIntensity: 0.07,
      flatShading: false,
    });

    return {
      xrayMat,
      waterFlowMat,
      matteBlackMat,
      staticBlackMat,
      grateMat,
      brushedSteelMat,
      staticSteelMat,
      mirrorSteelMat,
      copperMat,
      brassMat,
      burrSteelMat,
      walnutMat,
      brewGaugeMat,
      steamGaugeMat,
      needleMat,
      glassAmberMat,
      glassClearMat,
      waterGlassPipeMat,
      porcelainMat,
    };
  }, [textures]);

  const geos = useMemo(() => {
    const basePlinth = createRoundedPanel(2.26, 0.28, 2.04, 0.06, 6);
    const trayDeck = createRoundedPanel(1.94, 0.036, 0.90, 0.015, 6);

    const rearSpine = createRoundedPanel(2.22, 3.68, 0.36, 0.055, 6);
    const sideWall = createRoundedPanel(0.16, 3.68, 1.22, 0.045, 6);
    const frontLower = createRoundedPanel(1.94, 2.02, 0.12, 0.04, 6);
    const splashMirror = createRoundedPanel(1.66, 1.52, 0.025, 0.01, 6);
    const frontUpper = createRoundedPanel(1.98, 1.32, 0.74, 0.055, 6);
    const topDeck = createRoundedPanel(2.26, 0.14, 1.68, 0.048, 6);
    const warmerPlate = createRoundedPanel(1.94, 0.025, 1.38, 0.01, 6);

    const lidHandle = createRoundedPanel(0.32, 0.046, 0.11, 0.02, 6);
    const lidTabCollar = createRoundedPanel(0.14, 0.028, 0.065, 0.012, 6);
    const groupBridge = createRoundedPanel(0.76, 0.34, 0.78, 0.048, 6);

    const galleryRail = createSmoothTube(
      [
        new THREE.Vector3(-0.96, 4.085, 0.56),
        new THREE.Vector3(-0.96, 4.21, 0.54),
        new THREE.Vector3(-0.96, 4.24, 0.38),
        new THREE.Vector3(-0.96, 4.24, -0.58),
        new THREE.Vector3(-0.94, 4.24, -0.74),
        new THREE.Vector3(-0.78, 4.24, -0.76),
        new THREE.Vector3(0.78, 4.24, -0.76),
        new THREE.Vector3(0.94, 4.24, -0.74),
        new THREE.Vector3(0.96, 4.24, -0.58),
        new THREE.Vector3(0.96, 4.24, 0.38),
        new THREE.Vector3(0.96, 4.21, 0.54),
        new THREE.Vector3(0.96, 4.085, 0.56),
      ],
      128,
      0.021,
      32,
      false,
    );
    const railPost = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.017, 0.019, 0.16, 96),
      Math.PI / 3.2,
    );
    const railFlange = createSmoothLathe(
      new THREE.Path()
        .moveTo(0.018, 0)
        .lineTo(0.036, 0)
        .quadraticCurveTo(0.036, 0.022, 0.018, 0.026)
        .getPoints(16),
      96,
      Math.PI / 2.8,
    );

    const collar = createSmoothCollarGeometry();
    const lidBezel = createSmoothLidBezelGeometry();

    const hopperGlass = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.59, 0.52, 0.68, 128, 1, true),
      Math.PI / 2.5,
    );
    const lidGlass = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.575, 0.575, 0.05, 128),
      Math.PI / 3.2,
    );

    const funnel = createSmoothLathe(
      new THREE.Path()
        .moveTo(0.14, 0.0)
        .quadraticCurveTo(0.32, 0.15, 0.45, 0.34)
        .quadraticCurveTo(0.52, 0.48, 0.56, 0.62)
        .getPoints(32),
      128,
      Math.PI * 0.45,
    );

    const burrCone = createSmoothLathe(
      [
        new THREE.Vector2(0.0, 0.24),
        new THREE.Vector2(0.06, 0.20),
        new THREE.Vector2(0.16, 0.04),
        new THREE.Vector2(0.26, -0.14),
        new THREE.Vector2(0.26, -0.18),
        new THREE.Vector2(0.0, -0.18),
      ],
      96,
      Math.PI / 4.2,
    );

    const chute = createSmoothTube(
      [
        new THREE.Vector3(0, 2.92, 0.06),
        new THREE.Vector3(0, 2.65, 0.40),
        new THREE.Vector3(0, 2.38, 0.75),
        new THREE.Vector3(0, 2.12, 0.82),
      ],
      96,
      0.115,
      32,
      false,
    );

    const helixPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const t = i / 128;
      const a = t * Math.PI * 2 * 7;
      helixPts.push(new THREE.Vector3(Math.cos(a) * 0.328, -0.42 + t * 0.84, Math.sin(a) * 0.328));
    }
    const heatingCoil = applySmoothVertexNormalsWithThreshold(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), 160, 0.024, 32, false),
      Math.PI * 0.45,
    );

    const waterPipePts = [
      new THREE.Vector3(-0.48, 2.74, -0.18),
      new THREE.Vector3(-0.38, 2.88, 0.20),
      new THREE.Vector3(-0.15, 2.76, 0.62),
      new THREE.Vector3(0, 2.48, 0.82),
    ];
    const waterPipe = createSmoothTube(waterPipePts, 96, 0.038, 32, false);
    const waterPulsePipe = createSmoothTube(waterPipePts, 96, 0.026, 32, false);

    const e61Bell = createSmoothE61BellGeometry();
    const basketCup = createSmoothBasketGeometry();

    const walnutHandle = createSmoothLathe(
      new THREE.Path()
        .moveTo(0.0, 0.0)
        .quadraticCurveTo(0.046, 0.02, 0.052, 0.14)
        .quadraticCurveTo(0.046, 0.30, 0.066, 0.54)
        .quadraticCurveTo(0.074, 0.68, 0.052, 0.715)
        .quadraticCurveTo(0.025, 0.728, 0.0, 0.728)
        .getPoints(32),
      96,
      Math.PI * 0.45,
    );
    walnutHandle.rotateX(Math.PI / 2);

    const spoutL = createSmoothTube(
      [
        new THREE.Vector3(0, -0.10, 0),
        new THREE.Vector3(-0.08, -0.16, 0),
        new THREE.Vector3(-0.105, -0.225, 0),
      ],
      96,
      0.026,
      32,
      false,
    );
    const spoutR = createSmoothTube(
      [
        new THREE.Vector3(0, -0.10, 0),
        new THREE.Vector3(0.08, -0.16, 0),
        new THREE.Vector3(0.105, -0.225, 0),
      ],
      96,
      0.026,
      32,
      false,
    );
    const spoutTipCap = createSmoothLathe(
      new THREE.Path()
        .moveTo(0.015, -0.015)
        .quadraticCurveTo(0.029, -0.012, 0.029, 0.004)
        .lineTo(0.027, 0.016)
        .getPoints(16),
      96,
      Math.PI / 2.8,
    );

    const steamWand = createSmoothTube(
      [
        new THREE.Vector3(-0.68, 2.66, 0.56),
        new THREE.Vector3(-0.78, 2.38, 0.64),
        new THREE.Vector3(-0.74, 1.88, 0.70),
        new THREE.Vector3(-0.66, 1.44, 0.78),
      ],
      96,
      0.024,
      32,
      false,
    );
    const steamTip = createSmoothLathe(
      new THREE.Path()
        .moveTo(0.0, -0.045)
        .quadraticCurveTo(0.024, -0.04, 0.028, -0.012)
        .quadraticCurveTo(0.028, 0.018, 0.022, 0.025)
        .getPoints(16),
      96,
      Math.PI / 2.8,
    );

    const mug = createSmoothMugGeometry();
    const mugHandle = createSmoothTube(
      [
        new THREE.Vector3(0.32, 0.62, 0),
        new THREE.Vector3(0.54, 0.64, 0),
        new THREE.Vector3(0.60, 0.42, 0),
        new THREE.Vector3(0.53, 0.22, 0),
        new THREE.Vector3(0.29, 0.18, 0),
      ],
      96,
      0.044,
      32,
      false,
    );

    const gaugeBezel = applySmoothVertexNormalsWithThreshold(
      new THREE.TorusGeometry(0.195, 0.024, 32, 96),
      Math.PI * 0.48,
    );
    const gaugeHousing = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.21, 0.21, 0.04, 128),
      Math.PI / 3.2,
    );
    gaugeHousing.rotateX(Math.PI / 2);
    const gaugeDial = new THREE.CircleGeometry(0.18, 96);
    const needleGeo = createRoundedPanel(0.012, 0.135, 0.006, 0.002, 4);

    const grinderRing = applySmoothVertexNormalsWithThreshold(
      new THREE.TorusGeometry(0.395, 0.028, 32, 96),
      Math.PI * 0.48,
    );
    const grinderSleeve = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.39, 0.35, 0.36, 128, 1, true),
      Math.PI / 2.5,
    );
    const burrShaft = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.055, 0.055, 0.78, 96),
      Math.PI / 3.2,
    );
    const boilerBody = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.28, 0.28, 1.06, 128),
      Math.PI / 3.2,
    );
    const boilerCap = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.32, 0.32, 0.05, 128),
      Math.PI / 3.2,
    );
    const brewSleeve = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.32, 0.30, 0.72, 128, 1, true),
      Math.PI / 2.5,
    );
    const pistonRod = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.062, 0.062, 0.55, 96),
      Math.PI / 3.2,
    );
    const tamperHead = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.265, 0.275, 0.10, 128),
      Math.PI / 3.2,
    );
    const puckGeo = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.275, 0.265, 0.14, 128),
      Math.PI / 3.2,
    );
    const pfNeck = applySmoothVertexNormalsWithThreshold(
      new THREE.CylinderGeometry(0.044, 0.052, 0.24, 96),
      Math.PI / 3.2,
    );
    const pfPommel = applySmoothVertexNormalsWithThreshold(
      new THREE.SphereGeometry(0.054, 64, 48),
      Math.PI * 0.48,
    );

    const grateBar = createRoundedPanel(1.76, 0.012, 0.014, 0.004, 4);
    const burrTooth = createRoundedPanel(0.02, 0.32, 0.042, 0.004, 4);
    const flangeBolt = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6);

    return {
      basePlinth,
      trayDeck,
      rearSpine,
      sideWall,
      frontLower,
      splashMirror,
      frontUpper,
      topDeck,
      warmerPlate,
      lidHandle,
      lidTabCollar,
      groupBridge,
      galleryRail,
      railPost,
      railFlange,
      collar,
      lidBezel,
      hopperGlass,
      lidGlass,
      funnel,
      burrCone,
      chute,
      heatingCoil,
      waterPipe,
      waterPulsePipe,
      e61Bell,
      basketCup,
      walnutHandle,
      spoutL,
      spoutR,
      spoutTipCap,
      steamWand,
      steamTip,
      mug,
      mugHandle,
      gaugeBezel,
      gaugeHousing,
      gaugeDial,
      needleGeo,
      grinderRing,
      grinderSleeve,
      burrShaft,
      boilerBody,
      boilerCap,
      brewSleeve,
      pistonRod,
      tamperHead,
      puckGeo,
      pfNeck,
      pfPommel,
      grateBar,
      burrTooth,
      flangeBolt,
    };
  }, []);

  useEffect(() => {
    if (teethMeshRef.current) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        _dummy.position.set(Math.cos(a) * 0.17, 0.01, Math.sin(a) * 0.17);
        _dummy.rotation.set(0.36, -a, 0.22);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        teethMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      teethMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (grateMeshRef.current) {
      for (let i = 0; i < 22; i++) {
        _dummy.position.set(0, 0.388, 0.34 + (i / 21) * 0.75);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        grateMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      grateMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (fBoltsRef.current) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        _dummy.position.set(Math.cos(a) * 0.29, 0.55, Math.sin(a) * 0.29);
        _dummy.rotation.set(0, a, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        fBoltsRef.current.setMatrixAt(i, _dummy.matrix);
      }
      fBoltsRef.current.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useEffect(() => {
    const teethMesh = teethMeshRef.current;
    const grateMesh = grateMeshRef.current;
    const boltsMesh = fBoltsRef.current;
    return () => {
      teethMesh?.dispose();
      grateMesh?.dispose();
      boltsMesh?.dispose();
      Object.values(geos).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(textures).forEach((t) => t.dispose());
    };
  }, [geos, mats, textures]);

  useFrame((state, delta) => {
    const p = scrollStateRef.current.progress;
    const t = state.clock.elapsedTime;

    const lidOpen =
      THREE.MathUtils.smoothstep(p, 0.04, 0.18) *
      (1 - THREE.MathUtils.smoothstep(p, 0.68, 0.78));
    if (lidPivotRef.current) {
      lidPivotRef.current.rotation.x = -lidOpen * (Math.PI * 0.44);
    }

    const xrayIn = THREE.MathUtils.smoothstep(p, 0.18, 0.28);
    const xrayOut = 1 - THREE.MathUtils.smoothstep(p, 0.70, 0.80);
    const xrayAmount = xrayIn * xrayOut;

    mats.xrayMat.uniforms.uTime.value = t;
    mats.xrayMat.uniforms.uXrayAmount.value = xrayAmount;

    const isFading = xrayAmount > 0.01 && xrayAmount < 0.99;
    if (isFading !== wasTransparentRef.current) {
      wasTransparentRef.current = isFading;
      mats.matteBlackMat.transparent = isFading;
      mats.brushedSteelMat.transparent = isFading;
      mats.matteBlackMat.needsUpdate = true;
      mats.brushedSteelMat.needsUpdate = true;
    }
    mats.matteBlackMat.opacity = 1 - xrayAmount;
    mats.brushedSteelMat.opacity = 1 - xrayAmount;

    if (solidShellRef.current) {
      solidShellRef.current.visible = xrayAmount < 0.96;
    }
    if (xrayShellRef.current) {
      xrayShellRef.current.visible = xrayAmount > 0.03;
    }

    const grindSpeed =
      THREE.MathUtils.smoothstep(p, 0.20, 0.28) *
      (1 - THREE.MathUtils.smoothstep(p, 0.42, 0.48));
    if (burrRotorRef.current && grindSpeed > 0.01) {
      burrRotorRef.current.rotation.y += delta * (4.0 + grindSpeed * 12.0);
    }

    const tampProgress = THREE.MathUtils.smoothstep(p, 0.45, 0.56);
    if (pistonRef.current) {
      pistonRef.current.position.y = THREE.MathUtils.lerp(0.24, -0.10, tampProgress);
    }
    if (puckRef.current) {
      puckRef.current.scale.y = THREE.MathUtils.lerp(1.26, 0.72, tampProgress);
    }

    const thermalIntensity =
      THREE.MathUtils.smoothstep(p, 0.52, 0.62) *
      (1 - THREE.MathUtils.smoothstep(p, 0.74, 0.84));
    mats.waterFlowMat.uniforms.uTime.value = t;
    mats.waterFlowMat.uniforms.uIntensity.value = thermalIntensity;

    if (boilerCoilMatRef.current) {
      boilerCoilMatRef.current.emissiveIntensity = 0.16 + thermalIntensity * 1.45;
    }
    if (puckSaturationMatRef.current) {
      puckSaturationMatRef.current.emissiveIntensity = thermalIntensity * 0.45;
    }

    if (needleRef.current) {
      const pressureBar =
        THREE.MathUtils.smoothstep(p, 0.52, 0.68) *
        (1 - THREE.MathUtils.smoothstep(p, 0.96, 1.0) * 0.4) *
        9.0;
      needleRef.current.rotation.z =
        Math.PI * 0.75 + (pressureBar / 15) * (-Math.PI * 1.5) - Math.PI / 2;
    }
  });

  return (
    <group>
      {/* Base Plinth & Drip Tray */}
      <mesh
        geometry={geos.basePlinth}
        material={mats.staticBlackMat}
        position={[0, 0.22, 0.18]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={geos.trayDeck}
        material={mats.staticSteelMat}
        position={[0, 0.368, 0.72]}
        receiveShadow
      />
      <instancedMesh
        ref={grateMeshRef}
        args={[geos.grateBar, mats.grateMat, 22]}
      />

      {/* Top Deck & Anchored Gallery Rail */}
      <mesh
        geometry={geos.topDeck}
        material={mats.staticBlackMat}
        position={[0, 4.02, -0.04]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={geos.warmerPlate}
        material={mats.staticSteelMat}
        position={[0, 4.085, -0.04]}
      />
      <mesh geometry={geos.galleryRail} material={mats.mirrorSteelMat} />
      <mesh geometry={geos.railFlange} material={mats.mirrorSteelMat} position={[-0.96, 4.095, 0.56]} />
      <mesh geometry={geos.railFlange} material={mats.mirrorSteelMat} position={[0.96, 4.095, 0.56]} />
      <mesh geometry={geos.railPost} material={mats.mirrorSteelMat} position={[-0.94, 4.165, -0.74]} />
      <mesh geometry={geos.railFlange} material={mats.mirrorSteelMat} position={[-0.94, 4.095, -0.74]} />
      <mesh geometry={geos.railPost} material={mats.mirrorSteelMat} position={[0.94, 4.165, -0.74]} />
      <mesh geometry={geos.railFlange} material={mats.mirrorSteelMat} position={[0.94, 4.095, -0.74]} />

      {/* Smoked Amber Glass Hopper & Funnel */}
      <mesh
        geometry={geos.collar}
        material={mats.copperMat}
        position={[0, 4.07, 0.05]}
      />
      <mesh
        geometry={geos.hopperGlass}
        material={mats.glassAmberMat}
        position={[0, 3.74, 0.05]}
        renderOrder={4}
      />
      <mesh
        geometry={geos.funnel}
        material={mats.staticSteelMat}
        position={[0, 3.36, 0.05]}
      />

      {/* Hinged Walnut & Brushed Steel Top Lid */}
      <group ref={lidPivotRef} position={[0, 4.165, -0.59]}>
        <mesh
          geometry={geos.lidBezel}
          material={mats.staticSteelMat}
          position={[0, 0, 0.64]}
        />
        <mesh
          geometry={geos.lidGlass}
          material={mats.glassAmberMat}
          position={[0, 0.02, 0.64]}
          renderOrder={5}
        />
        <mesh
          geometry={geos.lidTabCollar}
          material={mats.copperMat}
          position={[0, 0.028, 1.24]}
        />
        <mesh
          geometry={geos.lidHandle}
          material={mats.walnutMat}
          position={[0, 0.036, 1.29]}
        />
      </group>

      {/* SOLID OUTER SHELL */}
      <group ref={solidShellRef}>
        <mesh
          geometry={geos.rearSpine}
          position={[0, 2.21, -0.72]}
          material={mats.matteBlackMat}
          castShadow
        />
        <mesh
          geometry={geos.sideWall}
          position={[-1.03, 2.21, -0.25]}
          material={mats.matteBlackMat}
          castShadow
        />
        <mesh
          geometry={geos.sideWall}
          position={[1.03, 2.21, -0.25]}
          material={mats.matteBlackMat}
          castShadow
        />
        <mesh
          geometry={geos.frontLower}
          position={[0, 1.38, 0.25]}
          material={mats.matteBlackMat}
          castShadow
        />
        <mesh
          geometry={geos.splashMirror}
          position={[0, 1.24, 0.31]}
          material={mats.brushedSteelMat}
        />
        <mesh
          geometry={geos.frontUpper}
          position={[0, 3.36, 0.28]}
          material={mats.matteBlackMat}
          castShadow
        />
        <mesh
          geometry={geos.groupBridge}
          position={[0, 2.58, 0.54]}
          material={mats.brushedSteelMat}
        />
        <mesh
          geometry={geos.e61Bell}
          position={[0, 2.04, 0.82]}
          material={mats.brushedSteelMat}
          castShadow
        />
        <mesh geometry={geos.steamWand} material={mats.brushedSteelMat} />
        <mesh
          geometry={geos.steamTip}
          material={mats.brushedSteelMat}
          position={[-0.66, 1.44, 0.78]}
          rotation={[0.22, 0, -0.18]}
        />

        {/* Dual Analog Pressure Gauges */}
        <group position={[-0.44, 3.44, 0.66]}>
          <mesh geometry={geos.gaugeHousing} material={mats.staticSteelMat} position={[0, 0, -0.012]} />
          <mesh geometry={geos.gaugeBezel} material={mats.copperMat} />
          <mesh geometry={geos.gaugeDial} material={mats.brewGaugeMat} position={[0, 0, 0.009]} />
          <group ref={needleRef} position={[0, 0, 0.018]}>
            <mesh geometry={geos.needleGeo} material={mats.needleMat} position={[0, 0.05, 0]} />
          </group>
        </group>

        <group position={[0.44, 3.44, 0.66]}>
          <mesh geometry={geos.gaugeHousing} material={mats.staticSteelMat} position={[0, 0, -0.012]} />
          <mesh geometry={geos.gaugeBezel} material={mats.copperMat} />
          <mesh geometry={geos.gaugeDial} material={mats.steamGaugeMat} position={[0, 0, 0.009]} />
        </group>
      </group>

      {/* X-RAY GLSL CUTAWAY SHELL */}
      <group ref={xrayShellRef} visible={false}>
        <mesh geometry={geos.rearSpine} position={[0, 2.21, -0.72]} material={mats.xrayMat} />
        <mesh geometry={geos.sideWall} position={[-1.03, 2.21, -0.25]} material={mats.xrayMat} />
        <mesh geometry={geos.sideWall} position={[1.03, 2.21, -0.25]} material={mats.xrayMat} />
        <mesh geometry={geos.frontLower} position={[0, 1.38, 0.25]} material={mats.xrayMat} />
        <mesh geometry={geos.frontUpper} position={[0, 3.36, 0.28]} material={mats.xrayMat} />
        <mesh geometry={geos.e61Bell} position={[0, 2.04, 0.82]} material={mats.xrayMat} />
      </group>

      {/* INTERNAL MECHANICAL HEART */}
      <group position={[0, 3.10, 0.05]}>
        <mesh geometry={geos.grinderSleeve} material={mats.glassClearMat} renderOrder={3} />
        <mesh
          geometry={geos.grinderRing}
          material={mats.brassMat}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.16, 0]}
        />
        <group ref={burrRotorRef}>
          <mesh geometry={geos.burrCone} material={mats.burrSteelMat} />
          <instancedMesh ref={teethMeshRef} args={[geos.burrTooth, mats.mirrorSteelMat, 24]} />
          <mesh geometry={geos.burrShaft} material={mats.copperMat} position={[0, -0.22, 0]} />
        </group>
      </group>

      <mesh geometry={geos.chute} renderOrder={3} material={mats.glassClearMat} />

      <group position={[-0.48, 2.02, -0.18]}>
        <mesh geometry={geos.boilerBody} material={mats.brassMat} />
        <mesh geometry={geos.boilerCap} material={mats.copperMat} position={[0, 0.52, 0]} />
        <instancedMesh ref={fBoltsRef} args={[geos.flangeBolt, mats.mirrorSteelMat, 10]} />
        <mesh geometry={geos.heatingCoil}>
          <meshStandardMaterial
            ref={boilerCoilMatRef}
            color="#e27f3c"
            emissive="#ff6b1a"
            emissiveIntensity={0.2}
            metalness={0.75}
            roughness={0.22}
            flatShading={false}
          />
        </mesh>
      </group>

      <mesh geometry={geos.waterPipe} material={mats.waterGlassPipeMat} />
      <mesh geometry={geos.waterPulsePipe} material={mats.waterFlowMat} />

      <group position={[0, 1.98, 0.82]}>
        <mesh geometry={geos.brewSleeve} material={mats.glassClearMat} renderOrder={3} />
        <group ref={pistonRef} position={[0, 0.24, 0]}>
          <mesh geometry={geos.pistonRod} material={mats.mirrorSteelMat} position={[0, 0.28, 0]} />
          <mesh geometry={geos.tamperHead} material={mats.brassMat} />
        </group>
        <mesh ref={puckRef} geometry={geos.puckGeo} position={[0, -0.24, 0]}>
          <meshStandardMaterial
            ref={puckSaturationMatRef}
            color="#3d2010"
            emissive="#c95a18"
            emissiveIntensity={0}
            roughness={0.86}
            flatShading={false}
          />
        </mesh>
      </group>

      {/* PORTAFILTER & WALNUT HANDLE */}
      <group position={[0, 1.64, 0.82]}>
        <mesh geometry={geos.basketCup} material={mats.mirrorSteelMat} />
        <mesh
          geometry={geos.pfNeck}
          material={mats.mirrorSteelMat}
          position={[0, 0.04, 0.42]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          geometry={geos.walnutHandle}
          material={mats.walnutMat}
          position={[0, 0.04, 0.54]}
        />
        <mesh geometry={geos.pfPommel} material={mats.copperMat} position={[0, 0.04, 1.26]} />
        <mesh geometry={geos.spoutL} material={mats.mirrorSteelMat} />
        <mesh geometry={geos.spoutR} material={mats.mirrorSteelMat} />
        <mesh
          geometry={geos.spoutTipCap}
          material={mats.mirrorSteelMat}
          position={[-0.105, -0.225, 0]}
        />
        <mesh
          geometry={geos.spoutTipCap}
          material={mats.mirrorSteelMat}
          position={[0.105, -0.225, 0]}
        />
      </group>

      {/* WHITE PORCELAIN MUG */}
      <group position={[0, 0.394, 0.82]}>
        <mesh geometry={geos.mug} material={mats.porcelainMat} castShadow />
        <mesh geometry={geos.mugHandle} material={mats.porcelainMat} castShadow />
      </group>
    </group>
  );
}

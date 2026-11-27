import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, SoftShadows } from '@react-three/drei';
import { EffectComposer, SMAA, SSAO, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import type { ScrollState } from '../../hooks/useScrollRig';
import { BackdropGlowParticles } from './BackdropGlowParticles';
import { BeansInstanced } from './BeansInstanced';
import { CoffeeMachine } from './CoffeeMachine';
import { CupSteamWisps } from './CupSteamWisps';
import { LiquidStream } from './LiquidStream';

interface EspressoSceneProps {
  scrollStateRef: React.MutableRefObject<ScrollState>;
}

const ALABASTER = new THREE.Color('#F4F1EA');
const CHARCOAL = new THREE.Color('#141210');
const _bgColor = new THREE.Color();
const _camPos = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

const _p1 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _t3 = new THREE.Vector3();
const _p4 = new THREE.Vector3();
const _t4 = new THREE.Vector3();
const _p5 = new THREE.Vector3();
const _t5 = new THREE.Vector3();

const MACHINE_SCALE = 0.54;

const SHADOW_MAP_SIZE: [number, number] = [1024, 1024];
const CAMERA_CONFIG = {
  fov: 36,
  near: 0.05,
  far: 60,
  position: [1.85, 3.35, 2.55] as [number, number, number],
};

function evalFiveStageCamera(
  p: number,
  aspect: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const xShift = aspect >= 1.15 ? -0.18 : 0;

  // Stage 1: Smaller, compact machine silhouette with generous alabaster framing
  _p1.set(1.85, 3.35, 2.55);
  _t1.set(xShift * 0.8, 3.65 * MACHINE_SCALE, 0.05 * MACHINE_SCALE);

  // Stage 2: Inside the scaled X-ray cutaway beside the conical burrs
  _p2.set(0.36, 2.02, 0.78);
  _t2.set(0.0, 2.95 * MACHINE_SCALE, 0.12 * MACHINE_SCALE);

  // Stage 3: Side-profile macro of the 9-bar brew chamber
  _p3.set(0.84, 1.15, 0.84);
  _t3.set(-0.04 * MACHINE_SCALE, 1.95 * MACHINE_SCALE, 0.72 * MACHINE_SCALE);

  // Stage 4: Pullback framing the smaller machine silhouette & porcelain mug
  _p4.set(1.78, 1.32, 3.10);
  _t4.set(xShift * 0.6, 1.45 * MACHINE_SCALE, 0.65 * MACHINE_SCALE);

  // Stage 5: Elevated 3/4 close-up framing the mug, crema, and viscous pour clear of the bottom-left card
  const mugFramingShift = aspect >= 1.05 ? -0.28 : 0;
  _p5.set(0.96, 0.78, 1.98);
  _t5.set(mugFramingShift, 1.05 * MACHINE_SCALE, 0.96 * MACHINE_SCALE);

  if (p < 0.22) {
    const k = THREE.MathUtils.smoothstep(p, 0.04, 0.22);
    outPos.lerpVectors(_p1, _p2, k);
    outTarget.lerpVectors(_t1, _t2, k);
  } else if (p < 0.48) {
    const k = THREE.MathUtils.smoothstep(p, 0.24, 0.48);
    outPos.lerpVectors(_p2, _p3, k);
    outTarget.lerpVectors(_t2, _t3, k);
  } else if (p < 0.72) {
    const k = THREE.MathUtils.smoothstep(p, 0.56, 0.72);
    outPos.lerpVectors(_p3, _p4, k);
    outTarget.lerpVectors(_t3, _t4, k);
  } else {
    const k = THREE.MathUtils.smoothstep(p, 0.75, 0.90);
    outPos.lerpVectors(_p4, _p5, k);
    outTarget.lerpVectors(_t4, _t5, k);
  }
}

function SceneRig({
  scrollStateRef,
  isSoftwareGl,
}: {
  scrollStateRef: React.MutableRefObject<ScrollState>;
  isSoftwareGl: boolean;
}) {
  const { camera, scene, size, invalidate, gl } = useThree();
  const interiorLightRef = useRef<THREE.PointLight | null>(null);
  const plinthMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lastShadowPRef = useRef<number>(-1);
  const renderBusyRef = useRef(false);
  const renderDirtyRef = useRef(false);

  useEffect(() => {
    const bg = ALABASTER.clone();
    const fog = new THREE.FogExp2('#F4F1EA', 0.032);
    scene.background = bg;
    scene.fog = fog;
    if (!isSoftwareGl) {
      gl.shadowMap.autoUpdate = false;
      gl.shadowMap.needsUpdate = true;
      invalidate();
    }
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, gl, isSoftwareGl, invalidate]);

  // Coalesced demand-driven rendering: passive on idle stages, fenceSync-paced on software WebGL
  useEffect(() => {
    let alive = true;
    let timer = 0;

    const waitDrawDone = (cb: () => void) => {
      if (!alive) return;
      const webgl = gl.getContext() as WebGL2RenderingContext;
      const sync = webgl.fenceSync?.(webgl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      webgl.flush?.();
      const poll = () => {
        if (!alive) return;
        const status = sync && webgl.getSyncParameter(sync, webgl.SYNC_STATUS);
        if (status === webgl.UNSIGNALED) {
          timer = window.setTimeout(poll, 6);
        } else {
          if (sync) webgl.deleteSync(sync);
          timer = window.setTimeout(cb, 80);
        }
      };
      timer = window.setTimeout(poll, 6);
    };

    const requestRender = () => {
      if (!alive) return;
      if (!isSoftwareGl) {
        invalidate();
        return;
      }
      if (renderBusyRef.current) {
        renderDirtyRef.current = true;
        return;
      }
      renderBusyRef.current = true;
      renderDirtyRef.current = false;
      invalidate();
      waitDrawDone(() => {
        renderBusyRef.current = false;
        if (renderDirtyRef.current) {
          requestRender();
        }
      });
    };

    const onScroll = () => requestRender();
    const onResize = () => requestRender();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    requestRender();

    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [isSoftwareGl, gl, invalidate]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const targetP = scrollStateRef.current.targetProgress;

    // Smooth exponential scroll damping inside rAF render loop
    const scrollDamp = isSoftwareGl ? 24 : 14;
    const prevP = scrollStateRef.current.progress;
    const p =
      Math.abs(targetP - prevP) < 0.0002
        ? targetP
        : THREE.MathUtils.damp(prevP, targetP, scrollDamp, delta);
    scrollStateRef.current.progress = p;

    const darkIn = THREE.MathUtils.smoothstep(p, 0.16, 0.26);
    const darkOut = 1 - THREE.MathUtils.smoothstep(p, 0.70, 0.80);
    const darkFactor = darkIn * darkOut;

    _bgColor.copy(ALABASTER).lerp(CHARCOAL, darkFactor);
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_bgColor);
    }
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(_bgColor);
      scene.fog.density = THREE.MathUtils.lerp(0.025, 0.045, darkFactor);
    }

    if (plinthMatRef.current) {
      plinthMatRef.current.color.copy(_bgColor).multiplyScalar(0.92);
    }
    if (interiorLightRef.current) {
      interiorLightRef.current.intensity = 0.8 + darkFactor * 2.2;
    }

    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.5);
    evalFiveStageCamera(p, aspect, _camPos, _camTarget);

    const dampSpeed = isSoftwareGl ? 28 : 14;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, _camPos.x, dampSpeed, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, _camPos.y, dampSpeed, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, _camPos.z, dampSpeed, delta);
    camera.lookAt(_camTarget);

    // Update shadow map only when scroll moves significantly
    if (!isSoftwareGl && Math.abs(p - lastShadowPRef.current) > 0.0025) {
      lastShadowPRef.current = p;
      gl.shadowMap.needsUpdate = true;
    }

    // Keep animating on GPU while camera/scroll settles or during continuous mechanical/liquid stages
    const cameraSettling =
      camera.position.distanceToSquared(_camPos) > 1e-6 ||
      Math.abs(targetP - p) > 0.0002;
    const hasContinuousAnimation =
      (p >= 0.19 && p <= 0.76) || p >= 0.83;

    if (!isSoftwareGl && (cameraSettling || hasContinuousAnimation)) {
      invalidate();
    }
  });

  return (
    <>
      <Environment frames={1} resolution={128}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <Lightformer
            form="rect"
            intensity={2.6}
            color="#fff6ea"
            scale={[10, 4, 1]}
            position={[0, 5, 2]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            color="#d9e4f2"
            scale={[6, 8, 1]}
            position={[-6, 2, 2]}
            target={[0, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={2.1}
            color="#ffe5c8"
            scale={[6, 8, 1]}
            position={[6, 2, 2]}
            target={[0, 0, 0]}
          />
        </group>
      </Environment>

      {!isSoftwareGl && <SoftShadows size={24} samples={12} focus={0.42} />}

      <hemisphereLight args={['#eef3fa', '#5c4d40', 0.85]} />
      <directionalLight
        position={[4.5, 8.0, 5.2]}
        intensity={2.2}
        color="#fff5e6"
        castShadow={!isSoftwareGl}
        shadow-mapSize={SHADOW_MAP_SIZE}
        shadow-camera-near={1.5}
        shadow-camera-far={16}
        shadow-camera-left={-2.2}
        shadow-camera-right={2.2}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-1.8}
        shadow-bias={-0.0005}
        shadow-normalBias={0.025}
      />
      <directionalLight position={[-4.5, 4.2, -3.5]} intensity={1.3} color="#e5a976" />
      <directionalLight position={[1.5, 2.2, 5.5]} intensity={0.65} color="#f8efe4" />
      <pointLight
        ref={interiorLightRef}
        position={[0.28 * MACHINE_SCALE, 2.65 * MACHINE_SCALE, 0.72 * MACHINE_SCALE]}
        intensity={0.8}
        distance={3.4}
        decay={1.5}
        color="#ffc994"
      />

      <mesh position={[0, -0.05, 0.12]} receiveShadow>
        <cylinderGeometry args={[8.5, 8.5, 0.1, 128]} />
        <meshStandardMaterial
          ref={plinthMatRef}
          color="#E6E1D8"
          roughness={0.82}
          metalness={0.05}
          flatShading={false}
        />
      </mesh>

      {!isSoftwareGl && (
        <ContactShadows
          frames={1}
          resolution={256}
          position={[0, 0.002, 0.10]}
          opacity={0.42}
          scale={4.8}
          blur={2.1}
          far={2.4}
        />
      )}

      <BackdropGlowParticles scrollStateRef={scrollStateRef} />

      <group scale={MACHINE_SCALE}>
        <CoffeeMachine scrollStateRef={scrollStateRef} />
        <BeansInstanced scrollStateRef={scrollStateRef} />
        <LiquidStream scrollStateRef={scrollStateRef} />
        <CupSteamWisps scrollStateRef={scrollStateRef} />
      </group>

      {!isSoftwareGl && (
        <EffectComposer enableNormalPass multisampling={4}>
          <SSAO
            blendFunction={BlendFunction.MULTIPLY}
            samples={18}
            rings={5}
            radius={0.14}
            intensity={2.4}
            bias={0.022}
            fade={0.015}
            minRadiusScale={0.12}
            luminanceInfluence={0.65}
            worldDistanceThreshold={9}
            worldDistanceFalloff={3}
            worldProximityThreshold={0.1}
            worldProximityFalloff={0.28}
            depthAwareUpsampling
            resolutionScale={0.5}
            color="#14100d"
          />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}

export const EspressoScene = memo(function EspressoScene({ scrollStateRef }: EspressoSceneProps) {
  const [ready, setReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const isSoftwareGl = useMemo(() => {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }, []);

  const cappedDpr = useMemo(
    () =>
      isSoftwareGl
        ? 1
        : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5),
    [isSoftwareGl],
  );

  const glConfig = useMemo(
    () => ({
      antialias: true,
      powerPreference: 'high-performance' as const,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.08,
    }),
    [],
  );

  const handleCreated = useCallback(({ gl }: RootState) => {
    setReady(true);
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
  }, []);

  if (contextLost) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F4F1EA] text-center px-6">
        <div className="max-w-md border border-[#D8D1C5] bg-white p-8 rounded-lg">
          <p className="font-display text-2xl text-[#1A1816]">3D Viewport Paused</p>
          <p className="mt-2 text-sm text-[#6E665E]">
            Reload the page to restore the WebGL espresso showcase.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#F4F1EA]">
          <p className="font-display text-2xl tracking-tight text-[#1A1816]">
            Preparing Valenza Corsa 01...
          </p>
        </div>
      )}

      <Canvas
        dpr={cappedDpr}
        frameloop="demand"
        shadows={!isSoftwareGl}
        camera={CAMERA_CONFIG}
        gl={glConfig}
        onCreated={handleCreated}
      >
        <Suspense fallback={null}>
          <SceneRig scrollStateRef={scrollStateRef} isSoftwareGl={isSoftwareGl} />
        </Suspense>
      </Canvas>
    </div>
  );
});

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import type { ScrollState } from '../../hooks/useScrollRig';
import { BeansInstanced } from './BeansInstanced';
import { CoffeeMachine } from './CoffeeMachine';
import { LiquidStream } from './LiquidStream';
import { SteamParticles } from './SteamParticles';

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

function evalFiveStageCamera(
  p: number,
  aspect: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const xShift = aspect >= 1.15 ? -0.18 : 0;

  _p1.set(1.68, 4.92, 1.98);
  _t1.set(xShift, 4.02, 0.05);

  _p2.set(0.50, 3.62, 1.14);
  _t2.set(0.0, 2.95, 0.12);

  _p3.set(1.26, 2.06, 1.24);
  _t3.set(-0.04, 1.95, 0.72);

  _p4.set(1.52, 1.48, 2.86);
  _t4.set(xShift * 0.6, 1.04, 0.82);

  _p5.set(0.92, 0.66, 2.16);
  _t5.set(xShift * 0.5, 0.90, 0.82);

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

  useEffect(() => {
    scene.background = ALABASTER.clone();
    scene.fog = new THREE.FogExp2('#F4F1EA', 0.032);
  }, [scene]);

  // Pace software WebGL cleanly so CPU rendering never blocks scroll input
  useEffect(() => {
    if (!isSoftwareGl) return;
    let alive = true;
    let timer = 0;

    const scheduleNext = () => {
      if (!alive) return;
      const webgl = gl.getContext() as WebGL2RenderingContext;
      const sync = webgl.fenceSync?.(webgl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      webgl.flush?.();
      const poll = () => {
        if (!alive) return;
        const status = sync && webgl.getSyncParameter(sync, webgl.SYNC_STATUS);
        if (status === webgl.UNSIGNALED) {
          timer = window.setTimeout(poll, 8);
        } else {
          if (sync) webgl.deleteSync(sync);
          timer = window.setTimeout(() => {
            if (!alive) return;
            invalidate();
            scheduleNext();
          }, 90);
        }
      };
      timer = window.setTimeout(poll, 8);
    };

    const onScroll = () => invalidate();
    window.addEventListener('scroll', onScroll, { passive: true });
    invalidate();
    scheduleNext();

    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isSoftwareGl, gl, invalidate]);

  useFrame((_, delta) => {
    const p = scrollStateRef.current.progress;

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

    // Snappy camera response (12.0 damp factor instead of sluggish 6.5)
    const dampSpeed = isSoftwareGl ? 25 : 12;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, _camPos.x, dampSpeed, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, _camPos.y, dampSpeed, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, _camPos.z, dampSpeed, delta);
    camera.lookAt(_camTarget);
  });

  return (
    <>
      {/* Lightweight Studio Softbox HDRI (128px resolution for instant startup) */}
      <Environment resolution={128}>
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

      <hemisphereLight args={['#eef3fa', '#5c4d40', 0.85]} />
      <directionalLight
        position={[4.5, 8.0, 5.2]}
        intensity={2.2}
        color="#fff5e6"
        castShadow={!isSoftwareGl}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-3.5}
        shadow-bias={-0.0008}
        shadow-normalBias={0.032}
      />
      <directionalLight position={[-4.5, 4.2, -3.5]} intensity={1.3} color="#e5a976" />
      <directionalLight position={[1.5, 2.2, 5.5]} intensity={0.65} color="#f8efe4" />
      <pointLight
        ref={interiorLightRef}
        position={[0.28, 2.65, 0.72]}
        intensity={0.8}
        distance={5.2}
        decay={1.5}
        color="#ffc994"
      />

      <mesh position={[0, -0.05, 0.2]} receiveShadow>
        <cylinderGeometry args={[8.5, 8.5, 0.1, 40]} />
        <meshStandardMaterial ref={plinthMatRef} color="#E6E1D8" roughness={0.82} metalness={0.05} />
      </mesh>

      {/* Baked once on mount (frames={1}) instead of re-rendering twice every frame! */}
      {!isSoftwareGl && (
        <ContactShadows
          frames={1}
          resolution={256}
          position={[0, 0.002, 0.2]}
          opacity={0.42}
          scale={8}
          blur={2.1}
          far={3.5}
        />
      )}

      <CoffeeMachine scrollStateRef={scrollStateRef} />
      <BeansInstanced scrollStateRef={scrollStateRef} />
      <LiquidStream scrollStateRef={scrollStateRef} />
      <SteamParticles scrollStateRef={scrollStateRef} />
    </>
  );
}

export function EspressoScene({ scrollStateRef }: EspressoSceneProps) {
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
        dpr={isSoftwareGl ? 1 : [1, 1.5]}
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        shadows={!isSoftwareGl}
        camera={{ fov: 36, near: 0.05, far: 60, position: [1.68, 4.92, 1.98] }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
        onCreated={({ gl }) => {
          setReady(true);
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
          });
        }}
      >
        <Suspense fallback={null}>
          <SceneRig scrollStateRef={scrollStateRef} isSoftwareGl={isSoftwareGl} />
        </Suspense>
      </Canvas>
    </div>
  );
}

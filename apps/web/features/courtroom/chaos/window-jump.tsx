"use client";

// Visuals of the window jump seen by everybody: glass shards thrown out of the broken pane, the ceiling portal with its swirl, lightning and sparks,
// and the crack and dust ring of a superhero landing. The jumper's tunnel is in tunnel.tsx.
import type { Landing, Portal, WindowBreak } from "@/features/courtroom/use-room-socket";
import type { Group, Mesh, Object3D, Points } from "three";
import { ToonModel } from "../toon-model";
import { Bolts } from "./lightning";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { PORTAL_HEIGHT } from "@tribunal/bot/room/window-jump";
import { useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, DoubleSide, MathUtils, Vector3 } from "three";

const model = (name: string) => `/models/${name}.gltf`;
const SHARDS = model("glass_shards");
const PORTAL = model("portal");
const SHARD_COUNT = 10;
/** Shards fly for this long, then shrink away */
const SHARD_LIFE_S = 4;
const SHARD_FADE_S = 0.7;
const GRAVITY = 9.8;
const WINDOW_CENTER_Y = 2.3;
const SHARD_SCALE = 1.6;
const PORTAL_SCALE = 1.5;
/** Radius of the swirling disc inside the ring */
const DISC_RADIUS = 1.05;
const OPEN_S = 0.25;
const CLOSE_S = 0.3;
const SPARKS = 24;
const CRACK_LIFE_S = 6;
const CRACK_FADE_S = 1.5;
const SHOCKWAVE_S = 0.7;

const noInk = () => false;

/** A canvas drawn once and shared by every instance */
const drawn = (cache: { texture: CanvasTexture | null }, draw: (context: CanvasRenderingContext2D, size: number) => void) => {
  if (cache.texture !== null) return cache.texture;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (context !== null) draw(context, size);

  cache.texture = new CanvasTexture(canvas);
  return cache.texture;
};
const swirlCache: { texture: CanvasTexture | null } = { texture: null };
const crackCache: { texture: CanvasTexture | null } = { texture: null };

/** Purple glow with spiral arms */
const swirlTexture = () => drawn(swirlCache, (context, size) => {
  const half = size / 2;
  const glow = context.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.35, "rgba(170,110,255,0.7)");
  glow.addColorStop(1, "rgba(80,30,150,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = "rgba(235,215,255,0.85)";
  context.lineWidth = 9;
  context.lineCap = "round";

  for (let arm = 0; arm < 4; arm += 1) {
    context.beginPath();

    for (let step = 0; step <= 30; step += 1) {
      const radius = (step / 30) * half * 0.92;
      const angle = (arm * Math.PI) / 2 + step * 0.1;
      context.lineTo(half + Math.cos(angle) * radius, half + Math.sin(angle) * radius);
    }

    context.stroke();
  }
});

/** Dark jagged cracks spreading from the centre */
const crackTexture = () => drawn(crackCache, (context, size) => {
  const half = size / 2;
  context.strokeStyle = "#2b1b3d";
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let ray = 0; ray < 9; ray += 1) {
    const heading = (ray / 9) * Math.PI * 2 + Math.random() * 0.4;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(half, half);
    let x = half;
    let y = half;

    for (let step = 1; step <= 6; step += 1) {
      const wobble = heading + (Math.random() - 0.5) * 0.7;
      x += Math.cos(wobble) * (half / 6.5);
      y += Math.sin(wobble) * (half / 6.5);
      context.lineTo(x, y);
      context.lineWidth = Math.max(1.5, 5 - step * 0.6);
    }

    context.stroke();
  }
});

/** The pane breaks: the shards of the glass_shards model fly out of the window with gravity, spin and shrink away */
const Shards = ({ windowBreak }: { windowBreak: WindowBreak }) => {
  const rootRef = useRef<Group>(null);
  const bodiesRef = useRef<{ node: Object3D; base: Vector3; velocity: Vector3; spin: Vector3 }[]>([]);

  useFrame(() => {
    const root = rootRef.current;

    if (root === null) return;

    // The model loads asynchronously: the shards are found once it is there.
    if (bodiesRef.current.length === 0) {
      for (let index = 1; index <= SHARD_COUNT; index += 1) {
        const node = root.getObjectByName(`shard_${String(index)}`);

        if (node === undefined) return;

        bodiesRef.current.push({
          node,
          base: node.position.clone(),
          // Mostly outside, where the diver goes, some spill into the room:
          velocity: new Vector3(windowBreak.side * (Math.random() * 4 - 0.5), 1 + Math.random() * 2.5, (Math.random() - 0.5) * 4),
          spin: new Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6),
        });
      }
    }

    const age = (Date.now() - windowBreak.at) / 1_000;
    const shrink = MathUtils.clamp((SHARD_LIFE_S - age) / SHARD_FADE_S, 0, 1);

    for (const { node, base, velocity, spin } of bodiesRef.current) {
      node.position.set(base.x + velocity.x * age, Math.max((0.04 - WINDOW_CENTER_Y) / SHARD_SCALE, base.y + velocity.y * age - 0.5 * GRAVITY * age * age), base.z + velocity.z * age);
      node.rotation.set(spin.x * age, spin.y * age, spin.z * age);
      node.scale.setScalar(shrink);
    }
  });

  return (
    <group position={[windowBreak.side * 10, WINDOW_CENTER_Y, windowBreak.z]} scale={SHARD_SCALE}>
      <group ref={rootRef}>
        <ToonModel url={SHARDS} outline={noInk} shadow={false} />
      </group>
    </group>
  );
};

/** Sparks spat by the portal: they fall and fade (re-thrown from the ring when they land) */
const Sparks = () => {
  const pointsRef = useRef<Points>(null);
  const state = useMemo(() => ({
    positions: new Float32Array(SPARKS * 3),
    velocities: new Float32Array(SPARKS * 3),
    ages: Array.from({ length: SPARKS }, (_, index) => index / SPARKS),
  }), []);

  useFrame((_state, delta) => {
    const points = pointsRef.current;

    if (points === null) return;

    const { positions, velocities, ages } = state;

    for (let index = 0; index < SPARKS; index += 1) {
      ages[index] = (ages[index] ?? 0) + delta;

      if ((ages[index] ?? 0) > 1) {
        const angle = Math.random() * Math.PI * 2;
        ages[index] = 0;
        positions.set([Math.cos(angle) * DISC_RADIUS, 0, Math.sin(angle) * DISC_RADIUS], index * 3);
        velocities.set([Math.cos(angle) * (0.3 + Math.random()), -1 - Math.random() * 2, Math.sin(angle) * (0.3 + Math.random())], index * 3);
      }

      for (let axis = 0; axis < 3; axis += 1) {
        const at = index * 3 + axis;
        positions[at] = (positions[at] ?? 0) + (velocities[at] ?? 0) * delta;
      }

      velocities[index * 3 + 1] = (velocities[index * 3 + 1] ?? 0) - 6 * delta;
    }

    const position = points.geometry.attributes.position;
    if (position !== undefined) position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[state.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f1e4ff" size={0.09} transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  );
};

/** The portal in the ceiling over the landing spot, its opening facing down: swirling disc, lightning and sparks; it pops open and shuts */
const PortalFx = ({ portal }: { portal: Portal }) => {
  const groupRef = useRef<Group>(null);
  const discsRef = useRef<(Mesh | null)[]>([]);
  const swirl = useMemo(() => swirlTexture(), []);

  useFrame((state) => {
    const group = groupRef.current;

    if (group === null) return;

    const now = Date.now();
    const opening = MathUtils.clamp((now - portal.at) / 1_000 / OPEN_S, 0, 1);
    const closing = portal.closedAt === null ? 0 : MathUtils.clamp((now - portal.closedAt) / 1_000 / CLOSE_S, 0, 1);
    const scale = opening * (1 - closing);
    group.visible = scale > 0.01;
    group.scale.setScalar(Math.max(scale, 0.001));
    // The discs turn in opposite directions (their rotation, in the frame of the opening, is around z):
    discsRef.current[0]?.rotation.set(0, 0, state.clock.elapsedTime * 3);
    discsRef.current[1]?.rotation.set(0, 0, -state.clock.elapsedTime * 4.5);
  });

  return (
    <group position={[portal.x, PORTAL_HEIGHT, portal.z]}>
      <group ref={groupRef}>
        <group scale={PORTAL_SCALE}>
          <ToonModel url={PORTAL} outline={noInk} shadow={false} split={/_core/u} unlit={/_core/u} />
        </group>
        {/* Circles face +z: turned by +90 degrees around x they look down */}
        <group rotation-x={Math.PI / 2}>
          <mesh ref={(mesh) => {
            discsRef.current[0] = mesh;
          }}
          >
            <circleGeometry args={[DISC_RADIUS, 32]} />
            <meshBasicMaterial map={swirl} transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
          </mesh>
          <mesh
            ref={(mesh) => {
              discsRef.current[1] = mesh;
            }}
            scale={0.7}
            position-z={0.01}
          >
            <circleGeometry args={[DISC_RADIUS, 32]} />
            <meshBasicMaterial map={swirl} color="#ffb8ff" transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
          </mesh>
        </group>
        <Bolts
          count={5}
          jitter={0.25}
          width={3}
          ends={() => {
            const angle = Math.random() * Math.PI * 2;
            return [
              [Math.cos(angle) * DISC_RADIUS, 0, Math.sin(angle) * DISC_RADIUS],
              [(Math.random() - 0.5) * 3, -(1 + Math.random() * 2.5), (Math.random() - 0.5) * 3],
            ];
          }}
        />
        <Sparks />
      </group>
    </group>
  );
};

/** Superhero landing: a crack in the floor that stays a while and a dust ring spreading from the impact */
const HeroImpact = ({ landing }: { landing: Landing }) => {
  const crackRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const crack = useMemo(() => crackTexture(), []);

  useFrame(() => {
    const age = (Date.now() - landing.at) / 1_000;
    const crackMesh = crackRef.current;
    const ring = ringRef.current;

    if (crackMesh !== null) {
      const material = crackMesh.material as { opacity: number };
      material.opacity = MathUtils.clamp((CRACK_LIFE_S - age) / CRACK_FADE_S, 0, 1);
    }

    if (ring === null) return;

    const progress = MathUtils.clamp(age / SHOCKWAVE_S, 0, 1);
    ring.visible = progress < 1;
    ring.scale.setScalar(0.3 + progress * 3);
    (ring.material as { opacity: number }).opacity = (1 - progress) * 0.7;
  });

  return (
    <group position={[landing.x, 0, landing.z]}>
      <mesh ref={crackRef} rotation-x={-Math.PI / 2} position-y={0.02}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial map={crack} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} position-y={0.06}>
        <ringGeometry args={[0.85, 1, 32]} />
        <meshBasicMaterial color="#e9dcc2" transparent depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
};

/** Glass shards, portals and hero landing marks of the window jumps in progress */
export const WindowJumpEffects = ({ windowBreaks, portals, landings }: {
  windowBreaks: WindowBreak[];
  portals: Portal[];
  landings: Landing[];
}) => (
  <>
    {windowBreaks.map((windowBreak) => (
      <Shards key={`${String(windowBreak.side)}-${String(windowBreak.z)}-${String(windowBreak.at)}`} windowBreak={windowBreak} />
    ))}
    {portals.map((portal) => (
      <PortalFx key={`${portal.id}-${String(portal.at)}`} portal={portal} />
    ))}
    {landings.filter((landing) => landing.kind === "hero").map((landing) => (
      <HeroImpact key={`${landing.id}-${String(landing.at)}`} landing={landing} />
    ))}
  </>
);

for (const url of [SHARDS, PORTAL]) useGLTF.preload(url);

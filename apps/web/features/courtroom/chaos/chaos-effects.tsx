"use client";

// Chaos visuals made of the Blockbench models of public/models: tomatoes and splats, brawl clouds, objection signs, zzz and whispers.
import type { Callout, TomatoFlight } from "@/features/courtroom/use-room-socket";
import type { Officer } from "@tribunal/bot/room/chaos";
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { PlayerState } from "@tribunal/bot/room/world";
import type { Group, Material } from "three";
import { Character } from "../character/character";
import { ToonModel } from "../toon-model";
import { CALLOUT_LIFE_MS, SPLAT_LIFE_MS } from "@/features/courtroom/use-room-socket";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { tomatoPoint } from "@tribunal/bot/room/tomato";
import { useMemo, useRef } from "react";
import { Mesh, Quaternion, Vector3 } from "three";

const model = (name: string) => `/models/${name}.gltf`;
const TOMATO = model("tomato");
const SPLAT = model("tomato_splat");
const DUST = model("dust_cloud");
const OBJECTION = model("objection_sign");
const ZZZ = model("zzz");
const WHISPER = model("whisper");
const SPLAT_FADE_MS = 1_500;
const UP = new Vector3(0, 1, 0);

/** Flat decals and floating symbols get no ink outline */
const noInk = () => false;

const fade = (group: Group, opacity: number) => group.traverse((object) => {
  if (!(object instanceof Mesh)) return;

  const material = object.material as Material;
  material.transparent = opacity < 1;
  material.opacity = opacity;
});

/** A tomato flying along the arc the server computed, then (on a wall, a bench or the floor) a splat that fades; on a player the face splat comes from the snapshot */
const Tomato = ({ flight }: { flight: TomatoFlight }) => {
  const flyingRef = useRef<Group>(null);
  const splatRef = useRef<Group>(null);
  const { impact } = flight;
  const orientation = useMemo(() => {
    if (impact?.kind !== "surface") return undefined;

    return new Quaternion().setFromUnitVectors(UP, new Vector3(impact.normal.x, impact.normal.y, impact.normal.z));
  }, [impact]);

  useFrame(() => {
    const flying = flyingRef.current;
    const splat = splatRef.current;
    const age = Date.now() - flight.at;
    const t = age / 1_000;
    const landed = t >= flight.duration;

    if (flying !== null) {
      flying.visible = !landed;

      if (!landed) {
        const point = tomatoPoint(flight.origin, flight.velocity, t);
        flying.position.set(point.x, point.y, point.z);
        flying.rotation.set(t * 14, t * 9, 0);
      }
    }

    if (splat === null) return;

    splat.visible = landed;

    if (!landed) return;

    const left = flight.duration * 1_000 + SPLAT_LIFE_MS - age;
    if (left < SPLAT_FADE_MS) fade(splat, Math.max(0, left / SPLAT_FADE_MS));
  });

  return (
    <>
      <group ref={flyingRef} scale={1.6}>
        <ToonModel url={TOMATO} />
      </group>
      {impact?.kind === "surface" && orientation !== undefined && (
        <group
          ref={splatRef}
          visible={false}
          position={[impact.point.x + impact.normal.x * 0.01, impact.point.y + impact.normal.y * 0.01, impact.point.z + impact.normal.z * 0.01]}
          quaternion={orientation}
        >
          <group rotation-y={flight.at % 6.28} scale={1.6}>
            <ToonModel url={SPLAT} outline={noInk} shadow={false} />
          </group>
        </group>
      )}
    </>
  );
};

/** A symbol that always faces the camera (around the vertical axis) and bobs. With a `life` it pops in with a bounce, then fades out; without, it stays. */
const Floating = ({ url, anchor, at, life, scale = 1 }: {
  url: string;
  anchor: () => [number, number, number] | undefined;
  at?: number;
  life?: number;
  scale?: number;
}) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    const group = groupRef.current;

    if (group === null) return;

    const point = anchor();
    group.visible = point !== undefined;

    if (point === undefined) return;

    const age = at === undefined ? 1_000_000 : Date.now() - at;
    const time = state.clock.elapsedTime;
    // Overshooting ease-out over the first 300 ms:
    const pop = Math.min(1, age / 300);
    const bounce = 1 + 2.7 * (pop - 1) ** 3 + 1.7 * (pop - 1) ** 2;
    group.position.set(point[0], point[1] + Math.sin(time * 3 + (at ?? 0)) * 0.05, point[2]);
    // Models read from -Z: their back must point to the camera... so turn their front (-Z) towards it.
    group.rotation.y = Math.atan2(state.camera.position.x - point[0], state.camera.position.z - point[2]) + Math.PI;
    group.scale.setScalar(scale * (at === undefined ? 1 : Math.max(0.001, bounce)));

    if (life !== undefined && age > life - 500) fade(group, Math.max(0, (life - age) / 500));
  });

  return (
    <group ref={groupRef}>
      <ToonModel url={url} outline={noInk} shadow={false} />
    </group>
  );
};

/** The brawl cloud over two fighters: spins, squashes and stretches */
const Brawl = ({ a, b }: {
  a: Vec2;
  b: Vec2;
}) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    const group = groupRef.current;

    if (group === null) return;

    const time = state.clock.elapsedTime;
    group.position.set((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
    group.rotation.y = time * 3;
    group.scale.set(1.5 + Math.sin(time * 9) * 0.15, 1.5 + Math.sin(time * 11 + 1) * 0.25, 1.5 + Math.cos(time * 9) * 0.15);
  });

  return (
    <group ref={groupRef}>
      <ToonModel url={DUST} outline={noInk} shadow={false} />
    </group>
  );
};

const EAR_HEIGHT = 1.6;
const EAR_REACH = 0.35;

type ChaosEffectsProps = {
  tomatoes: TomatoFlight[];
  callouts: Callout[];
  officers: Officer[];
  /** Ids of the fighters, two by two */
  fighting: string[];
  sleepers: PlayerState[];
  positionOf: (id: string) => Vec2 | undefined;
};

/** Flying tomatoes and splats, brawl clouds, objection signs, sleepers' zzz, whispers, and the police officers who come to break up fights */
export const ChaosEffects = ({ tomatoes, callouts, officers, fighting, sleepers, positionOf }: ChaosEffectsProps) => (
  <>
    {tomatoes.map((flight) => (
      <Tomato key={`${flight.fromId}-${String(flight.at)}`} flight={flight} />
    ))}
    {Array.from({ length: Math.floor(fighting.length / 2) }, (_, index) => {
      const a = positionOf(fighting[index * 2] ?? "");
      const b = positionOf(fighting[index * 2 + 1] ?? "");
      return a === undefined || b === undefined ? null : <Brawl key={fighting[index * 2]} a={a} b={b} />;
    })}
    {callouts.map((callout) => (
      <Floating
        key={`${callout.fromId}-${String(callout.at)}`}
        url={callout.kind === "objection" ? OBJECTION : WHISPER}
        scale={1.7}
        at={callout.at}
        life={CALLOUT_LIFE_MS}
        anchor={() => {
          if (callout.kind === "objection") {
            const shouter = positionOf(callout.fromId);
            return shouter === undefined ? undefined : [shouter.x, 2.6, shouter.z];
          }

          // At the ear of the target, on the side of the whisperer:
          const target = positionOf(callout.toId ?? "");
          const whisperer = positionOf(callout.fromId);

          if (target === undefined || whisperer === undefined) return undefined;

          const gap = Math.hypot(whisperer.x - target.x, whisperer.z - target.z) || 1;
          return [target.x + ((whisperer.x - target.x) / gap) * EAR_REACH, EAR_HEIGHT, target.z + ((whisperer.z - target.z) / gap) * EAR_REACH];
        }}
      />
    ))}
    {sleepers.map((player) => (
      <Floating key={player.id} url={ZZZ} scale={2.5} anchor={() => [player.position.x, player.seatId === null ? 2.6 : 2, player.position.z]} />
    ))}
    {officers.map((officer) => (
      <Character
        key={officer.id}
        id={officer.id}
        name="Police"
        avatarUrl={null}
        position={officer.position}
        rotation={officer.rotation}
        seated={false}
        speech={null}
        variant="police"
        interpolate
      />
    ))}
  </>
);

for (const url of [TOMATO, SPLAT, DUST, OBJECTION, ZZZ, WHISPER]) useGLTF.preload(url);

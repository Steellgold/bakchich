"use client";

// Furniture of the courtroom: the Blockbench models placed on the boxes and seats of the shared layout (models face -Z, people face -z when rotation is PI).
import type { Box, Vec2 } from "@tribunal/bot/room/layout";
import type { Group } from "three";
import { CLERK_SEAT, seatElevation } from "./seats";
import { ToonModel } from "./toon-model";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { GATE, OBSTACLES, RESTRICTED_ZONE, SEATS } from "@tribunal/bot/room/layout";
import { useRef } from "react";

const MODELS = ["bench", "chair", "desk", "clerk_desk", "judge_stand", "witness_stand", "rail", "rail_post", "gate", "cabinet"] as const;

const url = (name: (typeof MODELS)[number]) => `/models/${name}.gltf`;

const center = (box: Box): [number, number, number] => [(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2];

const contains = (box: Box, point: Vec2) => point.x >= box.min.x && point.x <= box.max.x && point.z >= box.min.z && point.z <= box.max.z;

/** Width of a rail post, at each end of a balustrade */
const POST = 0.36;

/** Balustrade along the longest side of its box: a post at each end and 1 m segments stretched to fill the space between */
const Rail = ({ box }: { box: Box }) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const length = Math.max(width, depth);
  const inner = length - POST * 2;
  const count = Math.max(1, Math.round(inner));
  const step = inner / count;

  return (
    <group position={center(box)} rotation-y={width >= depth ? 0 : Math.PI / 2}>
      {[-1, 1].map((side) => (
        <ToonModel key={side} url={url("rail_post")} position-x={(side * (length - POST)) / 2} />
      ))}
      {Array.from({ length: count }, (_, index) => (
        <ToonModel key={index} url={url("rail")} position-x={-inner / 2 + step * (index + 0.5)} scale-x={step} />
      ))}
    </group>
  );
};

/** The leaf turns around its hinge, 1 m to the left of the model's centre, and swings towards the restricted zone (-Z) */
const GATE_HINGE = 1;
const GATE_OPEN_ANGLE = 1.75;

/** A member within this distance (m) of the gate swings it open; it closes this long (s) after the last one left */
const GATE_TRIGGER = 1.2;
const GATE_CLOSE_DELAY = 1.5;

/** The rail gate in its gap: never blocks anyone, swings open when a member walks up to it and closes shortly after */
export const Gate = ({ players }: { players: { position: Vec2 }[] }) => {
  const leafRef = useRef<Group>(null);
  const playersRef = useRef(players);
  const openUntilRef = useRef(0);
  playersRef.current = players;

  useFrame((state, delta) => {
    const leaf = leafRef.current;

    if (leaf === null) return;

    if (playersRef.current.some(({ position }) => Math.hypot(position.x - GATE.x, position.z - (RESTRICTED_ZONE.max.z + 0.15)) <= GATE_TRIGGER)) openUntilRef.current = state.clock.elapsedTime + GATE_CLOSE_DELAY;

    leaf.rotation.y += ((state.clock.elapsedTime < openUntilRef.current ? GATE_OPEN_ANGLE : 0) - leaf.rotation.y) * Math.min(1, delta * 6);
  });

  return (
    <group ref={leafRef} position={[GATE.x - GATE_HINGE, 0, RESTRICTED_ZONE.max.z + 0.15]}>
      <ToonModel url={url("gate")} position-x={GATE_HINGE} />
    </group>
  );
};

/** Every piece of furniture: benches, desks, stands, rails, the archive cabinet and a chair at each seat (the gate is `Gate`) */
export const Furniture = () => (
  <group>
    {OBSTACLES.map((box) => {
      const key = `${String(box.min.x)}:${String(box.min.z)}:${box.kind}`;

      if (box.kind === "bench") return <ToonModel key={key} url={url("bench")} position={center(box)} />;
      if (box.kind === "rail") return <Rail key={key} box={box} />;
      if (box.kind === "cabinet") return <ToonModel key={key} url={url("cabinet")} position={center(box)} />;
      // The fronts of the stands and of the clerk's desk face the room (+z); counsel desks have their carved front towards the judge.
      if (box.kind === "stand") return <ToonModel key={key} url={url(contains(box, SEATS.judge.position) ? "judge_stand" : "witness_stand")} position={center(box)} rotation-y={Math.PI} />;
      if (box.kind === "desk") {
        const counsel = [SEATS.prosecutor, SEATS.defense].some(({ position }) => position.x >= box.min.x && position.x <= box.max.x);
        return counsel ? <ToonModel key={key} url={url("desk")} position={center(box)} /> : <ToonModel key={key} url={url("clerk_desk")} position={center(box)} rotation-y={Math.PI} />;
      }

      return null;
    })}

    {[...SEATS.accused, SEATS.prosecutor, SEATS.defense, SEATS.witness, ...SEATS.jury, CLERK_SEAT].map((seat) => (
      <ToonModel key={seat.id} url={url("chair")} position={[seat.position.x, seatElevation(seat.id), seat.position.z]} rotation-y={seat.rotation + Math.PI} />
    ))}
  </group>
);

for (const name of MODELS) useGLTF.preload(url(name));

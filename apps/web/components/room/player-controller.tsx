"use client";

import type { Vec2 } from "@tribunal/bot/room/layout";
import type { ClientMessage, TrialView } from "@tribunal/bot/room/protocol";
import type { PlayerState } from "@tribunal/bot/room/world";
import { Character } from "./character";
import { isBenchSeat } from "./seats";
import { useFrame, useThree } from "@react-three/fiber";
import { GATE, GATE_RADIUS, MAX_SPEED, ROOM, TICK_MS } from "@tribunal/bot/room/layout";
import { accessFor, canStand, nearbyBenchSeat, SEAT_REACH, seatForRole } from "@tribunal/bot/room/world";
import { useEffect, useRef } from "react";

/** Distance above which the local prediction snaps back to the server position */
const SNAP_DISTANCE = 3;
const CAMERA_DISTANCE = 6;
const CAMERA_HEIGHT = 3.5;
const CAMERA_MARGIN = 0.4;
const CAMERA_LIMIT_X = ROOM.width / 2 - CAMERA_MARGIN;

// ZQSD (AZERTY) and WASD (QWERTY) both move:
const KEYS = {
  forward: ["KeyW"],
  backward: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
};

export type NearbyInteraction = "become-juror" | "sit-on-bench" | "sit-down" | null;

type PlayerControllerProps = {
  self: PlayerState;
  trial: TrialView | null;
  speech: string | null;
  speaking: boolean;
  send: (message: ClientMessage) => void;
  occupiedSeats: ReadonlySet<string | null>;
  onInteraction: (interaction: NearbyInteraction) => void;
};

/** The local player: keyboard movement with prediction, third-person camera and the E interaction */
export const PlayerController = ({ self, trial, speech, speaking, send, occupiedSeats, onInteraction }: PlayerControllerProps) => {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const pressedRef = useRef(new Set<string>());
  const predictedRef = useRef<Vec2>({ ...self.position });
  const facingRef = useRef(self.rotation);
  // 0 puts the camera behind a player facing the judge:
  const yawRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const interactionRef = useRef<NearbyInteraction>(null);
  const previousSeatRef = useRef(self.seatId);

  // An authoritative seat change can move the player even when the correction is small.
  const seatChanged = previousSeatRef.current !== self.seatId;
  const gap = Math.hypot(self.position.x - predictedRef.current.x, self.position.z - predictedRef.current.z);
  if (seatChanged || self.seatId !== null || gap > SNAP_DISTANCE) predictedRef.current = { ...self.position };
  if (seatChanged) {
    previousSeatRef.current = self.seatId;
    facingRef.current = self.rotation;
  }

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      pressedRef.current.add(event.code);
      // A held key repeats: E must act once per press.
      if (event.code !== "KeyE" || event.repeat) return;
      if (self.seatId !== null) send({ type: "stand-up" });
      else if (interactionRef.current !== null) send({ type: interactionRef.current });
    };
    const up = (event: KeyboardEvent) => {
      pressedRef.current.delete(event.code);
    };
    // The mouse looks around once the cursor is captured by a click on the scene (Escape releases it); dragging still works without it.
    const look = (event: PointerEvent) => {
      if (document.pointerLockElement === canvas || event.buttons === 1) yawRef.current -= event.movementX * 0.005;
    };
    const capture = () => {
      void canvas.requestPointerLock();
    };
    // Keys released while the window is in the background never fire keyup:
    const release = () => {
      pressedRef.current.clear();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointermove", look);
    window.addEventListener("blur", release);
    canvas.addEventListener("click", capture);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointermove", look);
      window.removeEventListener("blur", release);
      canvas.removeEventListener("click", capture);
    };
  }, [self.seatId, send, canvas]);

  useFrame((_state, delta) => {
    const isDown = (codes: string[]) => codes.some((code) => pressedRef.current.has(code));
    const forward = Number(isDown(KEYS.forward)) - Number(isDown(KEYS.backward));
    const strafe = Number(isDown(KEYS.right)) - Number(isDown(KEYS.left));

    if (self.seatId === null && (forward !== 0 || strafe !== 0)) {
      const length = Math.hypot(forward, strafe);
      const step = (MAX_SPEED * delta) / length;
      // The camera looks towards -yaw: forward moves away from it.
      const dx = (-Math.sin(yawRef.current) * forward + Math.cos(yawRef.current) * strafe) * step;
      const dz = (-Math.cos(yawRef.current) * forward - Math.sin(yawRef.current) * strafe) * step;
      const next = { x: predictedRef.current.x + dx, z: predictedRef.current.z + dz };
      if (canStand(next, accessFor(self.role, trial))) predictedRef.current = next;
      facingRef.current = Math.atan2(dx, dz);
    }

    const now = performance.now();
    if (self.seatId === null && now - lastSentAtRef.current >= TICK_MS) {
      lastSentAtRef.current = now;
      send({ type: "move", x: predictedRef.current.x, z: predictedRef.current.z, rotation: facingRef.current });
    }

    let interaction: NearbyInteraction = null;
    if (self.seatId === null) {
      const position = predictedRef.current;
      const nearGate = Math.hypot(position.x - GATE.x, position.z - GATE.z) <= GATE_RADIUS;
      const ownSeat = self.role === null ? undefined : seatForRole(self.role, trial, self.id);
      const nearOwnSeat = ownSeat !== undefined && Math.hypot(position.x - ownSeat.position.x, position.z - ownSeat.position.z) <= SEAT_REACH;
      if (nearGate && self.role === null) interaction = "become-juror";
      else if (nearOwnSeat) interaction = "sit-down";
      else if (nearbyBenchSeat(self.position, occupiedSeats) !== undefined) interaction = "sit-on-bench";
    }
    if (interaction !== interactionRef.current) {
      interactionRef.current = interaction;
      onInteraction(interaction);
    }

    // Clamped inside the walls, otherwise the camera ends up behind one and only sees its outer face:
    camera.position.set(
      Math.max(-CAMERA_LIMIT_X, Math.min(CAMERA_LIMIT_X, predictedRef.current.x + Math.sin(yawRef.current) * CAMERA_DISTANCE)),
      CAMERA_HEIGHT,
      Math.max(CAMERA_MARGIN, Math.min(ROOM.depth - CAMERA_MARGIN, predictedRef.current.z + Math.cos(yawRef.current) * CAMERA_DISTANCE)),
    );
    camera.lookAt(predictedRef.current.x, 1.2, predictedRef.current.z);
  });

  return (
    <Character
      id={self.id}
      name={self.name}
      avatarUrl={self.avatarUrl}
      position={predictedRef.current}
      follow={predictedRef}
      rotation={self.seatId === null ? facingRef.current : self.rotation}
      seated={self.seatId !== null}
      onBench={isBenchSeat(self.seatId)}
      speech={speech}
      speaking={speaking}
    />
  );
};

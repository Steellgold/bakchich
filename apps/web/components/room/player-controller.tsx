"use client";

import type { Vec2 } from "@tribunal/bot/room/layout";
import type { ClientMessage } from "@tribunal/bot/room/protocol";
import type { PlayerState } from "@tribunal/bot/room/world";
import { Character } from "./character";
import { useFrame, useThree } from "@react-three/fiber";
import { GATE, GATE_RADIUS, MAX_SPEED, TICK_MS } from "@tribunal/bot/room/layout";
import { canStand } from "@tribunal/bot/room/world";
import { useEffect, useRef } from "react";

/** Distance above which the local prediction snaps back to the server position */
const SNAP_DISTANCE = 1;
const CAMERA_DISTANCE = 6;
const CAMERA_HEIGHT = 3.5;

// ZQSD (AZERTY) and WASD (QWERTY) both move:
const KEYS = {
  forward: ["KeyW"],
  backward: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
};

type PlayerControllerProps = {
  self: PlayerState;
  speech: string | null;
  send: (message: ClientMessage) => void;
  onNearGate: (near: boolean) => void;
};

/** The local player: keyboard movement with prediction, third-person camera and the E interaction */
export const PlayerController = ({ self, speech, send, onNearGate }: PlayerControllerProps) => {
  const camera = useThree((state) => state.camera);
  const pressedRef = useRef(new Set<string>());
  const predictedRef = useRef<Vec2>({ ...self.position });
  const facingRef = useRef(self.rotation);
  // 0 puts the camera behind a player facing the judge:
  const yawRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const nearGateRef = useRef(false);

  // Server corrections: snap when the prediction drifted, and always follow seats:
  const gap = Math.hypot(self.position.x - predictedRef.current.x, self.position.z - predictedRef.current.z);
  if (self.seatId !== null || gap > SNAP_DISTANCE) predictedRef.current = { ...self.position };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      pressedRef.current.add(event.code);
      if (event.code !== "KeyE") return;
      if (self.seatId !== null) send({ type: "stand-up" });
      else if (nearGateRef.current && self.role === null) send({ type: "become-juror" });
    };
    const up = (event: KeyboardEvent) => {
      pressedRef.current.delete(event.code);
    };
    const drag = (event: PointerEvent) => {
      if (event.buttons === 1) yawRef.current -= event.movementX * 0.005;
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointermove", drag);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointermove", drag);
    };
  }, [self.seatId, self.role, send]);

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
      if (canStand(next, self.role !== null)) predictedRef.current = next;
      facingRef.current = Math.atan2(dx, dz);
    }

    const now = performance.now();
    if (self.seatId === null && now - lastSentAtRef.current >= TICK_MS) {
      lastSentAtRef.current = now;
      send({ type: "move", x: predictedRef.current.x, z: predictedRef.current.z, rotation: facingRef.current });
    }

    const isNearGate = Math.hypot(predictedRef.current.x - GATE.x, predictedRef.current.z - GATE.z) <= GATE_RADIUS;
    if (isNearGate !== nearGateRef.current) {
      nearGateRef.current = isNearGate;
      onNearGate(isNearGate);
    }

    camera.position.set(
      predictedRef.current.x + Math.sin(yawRef.current) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      predictedRef.current.z + Math.cos(yawRef.current) * CAMERA_DISTANCE,
    );
    camera.lookAt(predictedRef.current.x, 1.2, predictedRef.current.z);
  });

  return (
    <Character
      name={self.name}
      avatarUrl={self.avatarUrl}
      position={predictedRef.current}
      follow={predictedRef}
      rotation={self.seatId === null ? facingRef.current : self.rotation}
      seated={self.seatId !== null}
      speech={speech}
      color="#2c3e50"
    />
  );
};

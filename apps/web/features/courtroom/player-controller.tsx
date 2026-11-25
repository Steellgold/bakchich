"use client";

import type { AimState } from "./chaos/aim-preview";
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { ClientMessage, TrialView } from "@tribunal/bot/room/protocol";
import type { PlayerState } from "@tribunal/bot/room/world";
import type { RefObject } from "react";
import { TUNNEL } from "./chaos/tunnel";
import { Character } from "./character/character";
import { isBenchSeat, seatElevation } from "./seats";
import { useFrame, useThree } from "@react-three/fiber";
import { CHAOS_REACH } from "@tribunal/bot/room/chaos";
import { ARCHIVES, ARCHIVES_RADIUS, GATE, GATE_RADIUS, MAX_SPEED, ROOM, RUN_SPEED, TICK_MS } from "@tribunal/bot/room/layout";
import { tomatoSpeed, TOMATO_CHARGE_S } from "@tribunal/bot/room/tomato";
import { accessFor, nearbyBenchSeat, SEAT_REACH, seatForRole, slide } from "@tribunal/bot/room/world";
import { useCallback, useEffect, useRef } from "react";
import { PerspectiveCamera } from "three";

/** Distance above which the local prediction snaps back to the server position */
const SNAP_DISTANCE = 3;
const CAMERA_DISTANCE = 6;
const CAMERA_HEIGHT = 3.5;
const CAMERA_MARGIN = 0.4;
const CAMERA_LIMIT_X = ROOM.width / 2 - CAMERA_MARGIN;
// The camera stays inside the walls, otherwise it ends up behind one and only sees its outer face:
const clampX = (x: number) => Math.max(-CAMERA_LIMIT_X, Math.min(CAMERA_LIMIT_X, x));
const clampZ = (z: number) => Math.max(CAMERA_MARGIN, Math.min(ROOM.depth - CAMERA_MARGIN, z));

// ZQSD (AZERTY) and WASD (QWERTY) both move:
const KEYS = {
  forward: ["KeyW"],
  backward: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  run: ["ShiftLeft", "ShiftRight"],
};

export type NearbyInteraction = "become-juror" | "sit-on-bench" | "sit-down" | "open-archives" | null;

// Over-the-shoulder camera while aiming a tomato: distance behind, to the right and height of the camera (the tomato leaves from the shoulder, on the crosshair ray).
const AIM_BACK = 2.6;
const AIM_SIDE = 0.9;
const AIM_HEIGHT = 2.3;
const AIM_FOV = 42;
const NORMAL_FOV = 60;
const AIM_PITCH_MIN = -0.7;
const AIM_PITCH_MAX = 0.6;
/** Screen shake of the portal opening: the camera jitters by up to SHAKE_AMPLITUDE meters, fading out over SHAKE_SECONDS */
const SHAKE_SECONDS = 0.6;
const SHAKE_AMPLITUDE = 0.14;

/** Tomato in hand: nothing in hand, tomato in hand, or aiming with the right mouse button */
export type Aim = "none" | "holding" | "aiming";

/** Chaos keys of the audience on the member you look at (the tomato, key 1, is free-aimed: see the aim code below) */
const TARGET_KEYS: Record<string, (targetId: string) => ClientMessage> = {
  Digit2: (targetId) => ({
    type: "whisper",
    targetId,
  }),
  Digit3: (targetId) => ({
    type: "challenge",
    targetId,
    game: "rps",
  }),
  Digit4: (targetId) => ({
    type: "challenge",
    targetId,
    game: "connect4",
  }),
  Digit5: (targetId) => ({
    type: "fight",
    targetId,
  }),
};
const SELF_KEYS: Record<string, ClientMessage> = {
  KeyO: { type: "shout-objection" },
  KeyB: { type: "toggle-sleep" },
};
/** The chaos bar only shows up next to someone (the server still lets a tomato fly a bit further, for latency) */
export const TARGET_RANGE = CHAOS_REACH;

type PlayerControllerProps = {
  self: PlayerState;
  trial: TrialView | null;
  speech: string | null;
  speaking: boolean;
  send: (message: ClientMessage) => void;
  occupiedSeats: ReadonlySet<string | null>;
  onInteraction: (interaction: NearbyInteraction) => void;
  /** Other members in the room: the closest one is the target of the chaos keys */
  others: PlayerState[];
  onTarget: (target: PlayerState | null) => void;
  level: number;
  jumpAt: number;
  sleeping: boolean;
  leanSide: -1 | 0 | 1;
  splat: boolean;
  fighting: boolean;
  inGame: boolean;
  /** When the camera last shook for everyone (client clock) */
  shakeAt: number;
  onAim: (aim: Aim) => void;
  /** Written every frame for the tomato in hand and the dotted arc */
  aimRef: RefObject<AimState>;
  /** The power gauge element of the HUD, scaled while the throw charges */
  gaugeRef: RefObject<HTMLElement | null>;
};

/** The local player: keyboard movement with prediction, third-person camera and the E interaction */
export const PlayerController
  = ({ self, trial, speech, speaking, send, occupiedSeats, onInteraction, others, onTarget, level, jumpAt, sleeping, leanSide, splat, fighting, inGame, shakeAt, onAim, aimRef, gaugeRef }: PlayerControllerProps) => {
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
    const targetRef = useRef<PlayerState | null>(null);
    const aimModeRef = useRef<Aim>("none");
    const pitchRef = useRef(0.1);
    const chargeStartRef = useRef(0);
    const aimBlendRef = useRef(0);
    // Where the next throw leaves from and where it goes, updated every frame while aiming:
    const shotRef = useRef({
      origin: {
        x: 0,
        y: 0,
        z: 0,
      },
      direction: {
        x: 0,
        y: 0,
        z: 0,
      },
    });
    // The tomato in hand, mutated in place for the aim preview:
    const handRef = useRef({
      x: 0,
      y: 0,
      z: 0,
    });
    const othersRef = useRef(others);
    othersRef.current = others;
    // Window jump phase and whether Space is held for it, read by the key handlers and the frame loop:
    const airRef = useRef(self.air);
    airRef.current = self.air;
    const heldRef = useRef(false);
    // The audience makes chaos; parties and jurors in their box do not:
    const canMakeChaos = !inGame && self.role === null && self.seatId?.startsWith("jury-") !== true && self.air === null;

    // An authoritative seat change or a window jump can move the player even when the correction is small.
    const seatChanged = previousSeatRef.current !== self.seatId;
    const gap = Math.hypot(self.position.x - predictedRef.current.x, self.position.z - predictedRef.current.z);
    if (inGame || seatChanged || self.seatId !== null || self.air !== null || gap > SNAP_DISTANCE) predictedRef.current = { ...self.position };

    if (seatChanged) {
      previousSeatRef.current = self.seatId;
      facingRef.current = self.rotation;
    }

    const setAim = useCallback((next: Aim) => {
      if (aimModeRef.current === next) return;

      aimModeRef.current = next;
      onAim(next);
    }, [onAim]);

    useEffect(() => {
      const down = (event: KeyboardEvent) => {
        if (inGame) return;
        pressedRef.current.add(event.code);

        if (event.repeat) return;

        // Space jumps (it would scroll the page otherwise):
        if (event.code === "Space") {
          event.preventDefault();
          // During a window jump, Space is held for the superhero landing instead (see the frame loop).
          if (airRef.current === null) send({ type: "jump" });
          return;
        }

        // 1 takes a tomato in hand or puts it away, Escape puts it away:
        if (event.code === "Digit1" && canMakeChaos) setAim(aimModeRef.current === "none" ? "holding" : "none");
        if (event.code === "Escape") setAim("none");

        const selfAction = SELF_KEYS[event.code];
        const targetAction = TARGET_KEYS[event.code];
        if (canMakeChaos && selfAction !== undefined) send(selfAction);
        if (canMakeChaos && targetAction !== undefined && targetRef.current !== null) send(targetAction(targetRef.current.id));
        // A held key repeats: E must act once per press.
        if (event.code !== "KeyE") return;

        if (self.seatId !== null) send({ type: "stand-up" });
        else if (interactionRef.current !== null) send({ type: interactionRef.current });
      };
      const up = (event: KeyboardEvent) => {
        pressedRef.current.delete(event.code);
      };
      // The mouse looks around once the cursor is captured by a click on the scene (Escape releases it); dragging still works without it.
      const look = (event: PointerEvent) => {
        if (inGame) return;
        const aiming = aimModeRef.current === "aiming";

        if (document.pointerLockElement === canvas || event.buttons === 1 || aiming) yawRef.current -= event.movementX * 0.005;
        if (aiming) pitchRef.current = Math.min(AIM_PITCH_MAX, Math.max(AIM_PITCH_MIN, pitchRef.current - event.movementY * 0.004));
      };
      // With a tomato in hand: right button held aims (and charges), left click throws.
      const press = (event: MouseEvent) => {
        if (inGame || aimModeRef.current === "none") return;

        if (event.button === 2) {
          pitchRef.current = 0.1;
          chargeStartRef.current = performance.now();
          setAim("aiming");
          if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
        }
        else if (event.button === 0 && aimModeRef.current === "aiming") {
          const { origin, direction } = shotRef.current;
          send({
            type: "throw-tomato",
            origin,
            direction,
            power: Math.min(1, (performance.now() - chargeStartRef.current) / 1_000 / TOMATO_CHARGE_S),
          });
          setAim("none");
        }
      };
      const release = (event: MouseEvent) => {
        if (event.button === 2 && aimModeRef.current === "aiming") setAim("holding");
      };
      const noMenu = (event: Event) => {
        if (aimModeRef.current !== "none") event.preventDefault();
      };
      const capture = () => {
        if (inGame) return;
        void canvas.requestPointerLock();
      };
      // Keys released while the window is in the background never fire keyup:
      const blur = () => {
        pressedRef.current.clear();
        if (aimModeRef.current === "aiming") setAim("holding");
      };

      window.addEventListener("keydown", down);
      window.addEventListener("keyup", up);
      window.addEventListener("pointermove", look);
      window.addEventListener("blur", blur);
      canvas.addEventListener("click", capture);
      canvas.addEventListener("mousedown", press);
      window.addEventListener("mouseup", release);
      canvas.addEventListener("contextmenu", noMenu);
      return () => {
        window.removeEventListener("keydown", down);
        window.removeEventListener("keyup", up);
        window.removeEventListener("pointermove", look);
        window.removeEventListener("blur", blur);
        canvas.removeEventListener("click", capture);
        canvas.removeEventListener("mousedown", press);
        window.removeEventListener("mouseup", release);
        canvas.removeEventListener("contextmenu", noMenu);
      };
    }, [self.seatId, send, canvas, canMakeChaos, setAim, inGame]);

    useEffect(() => {
      pressedRef.current.clear();
      setAim("none");
      aimRef.current.hand = null;
      aimRef.current.origin = null;
      if (inGame && document.pointerLockElement === canvas) document.exitPointerLock();
    }, [inGame, canvas, setAim, aimRef]);

    useFrame((_state, delta) => {
      if (inGame) return;
      const isDown = (codes: string[]) => codes.some((code) => pressedRef.current.has(code));
      const forward = Number(isDown(KEYS.forward)) - Number(isDown(KEYS.backward));
      const strafe = Number(isDown(KEYS.right)) - Number(isDown(KEYS.left));
      const running = isDown(KEYS.run);
      const holding = self.air !== null && pressedRef.current.has("Space");

      if (holding !== heldRef.current) {
        heldRef.current = holding;
        send({
          type: "hold-landing",
          held: holding,
        });
      }

      if (self.seatId === null && self.air === null && (forward !== 0 || strafe !== 0)) {
        const length = Math.hypot(forward, strafe);
        const step = ((running ? RUN_SPEED : MAX_SPEED) * delta) / length;
        // The camera looks towards -yaw: forward moves away from it.
        const dx = (-Math.sin(yawRef.current) * forward + Math.cos(yawRef.current) * strafe) * step;
        const dz = (-Math.cos(yawRef.current) * forward - Math.sin(yawRef.current) * strafe) * step;
        const next = {
          x: predictedRef.current.x + dx,
          z: predictedRef.current.z + dz,
        };
        // Same sliding rule as the server, so the prediction and the authoritative position stay together along walls:
        predictedRef.current = slide(predictedRef.current, next, accessFor(self.role, trial));
        facingRef.current = Math.atan2(dx, dz);
      }

      const now = performance.now();

      if (self.seatId === null && self.air === null && now - lastSentAtRef.current >= TICK_MS) {
        lastSentAtRef.current = now;
        send({
          type: "move",
          x: predictedRef.current.x,
          z: predictedRef.current.z,
          rotation: facingRef.current,
          running,
        });
      }

      let interaction: NearbyInteraction = null;

      if (self.seatId === null) {
        const position = predictedRef.current;
        const nearGate = Math.hypot(position.x - GATE.x, position.z - GATE.z) <= GATE_RADIUS;
        const ownSeat = self.role === null ? undefined : seatForRole(self.role, trial, self.id);
        const nearOwnSeat = ownSeat !== undefined && Math.hypot(position.x - ownSeat.position.x, position.z - ownSeat.position.z) <= SEAT_REACH;
        if (Math.hypot(position.x - ARCHIVES.x, position.z - ARCHIVES.z) <= ARCHIVES_RADIUS) interaction = "open-archives";
        else if (nearGate && self.role === null) interaction = "become-juror";
        else if (nearOwnSeat) interaction = "sit-down";
        else if (nearbyBenchSeat(self.position, occupiedSeats) !== undefined) interaction = "sit-on-bench";
      }
      // The closest member in range is the target of the chaos keys:
      let target: PlayerState | null = null;
      let closest = TARGET_RANGE;

      if (canMakeChaos) {
        for (const other of othersRef.current) {
          const gap = Math.hypot(other.position.x - predictedRef.current.x, other.position.z - predictedRef.current.z);

          if (gap > closest) continue;

          closest = gap;
          target = other;
        }
      }

      if (target?.id !== targetRef.current?.id) {
        targetRef.current = target;
        onTarget(target);
      }

      if (interaction !== interactionRef.current) {
        interactionRef.current = interaction;
        onInteraction(interaction);
      }

      // The parties and jurors cannot make chaos: a tomato in hand goes away.
      if (!canMakeChaos) setAim("none");

      const yaw = yawRef.current;
      const mode = aimModeRef.current;
      const position = predictedRef.current;
      // Zoom over the shoulder while aiming, back to the third-person view otherwise:
      aimBlendRef.current += ((mode === "aiming" ? 1 : 0) - aimBlendRef.current) * Math.min(1, delta * 10);
      const blend = aimBlendRef.current;
      const orbitX = clampX(position.x + Math.sin(yaw) * CAMERA_DISTANCE);
      const orbitZ = clampZ(position.z + Math.cos(yaw) * CAMERA_DISTANCE);

      if (mode === "none" && blend < 0.001) {
        // No tomato and no aim: plain third-person camera.
        aimRef.current.hand = null;
        aimRef.current.origin = null;
        camera.position.set(orbitX, CAMERA_HEIGHT, orbitZ);
        camera.lookAt(position.x, 1.2, position.z);
      }
      else {
        const power = mode === "aiming" ? Math.min(1, (performance.now() - chargeStartRef.current) / 1_000 / TOMATO_CHARGE_S) : 0;

        // Aimed direction (the camera looks towards -yaw), shoulder camera and the throw that starts from the camera ray, AIM_BACK in front of it.
        // The eye is clamped inside the walls (otherwise the camera ends up behind one), and the throw starts from that same eye:
        const cosPitch = Math.cos(pitchRef.current);
        const { origin, direction } = shotRef.current;
        direction.x = -Math.sin(yaw) * cosPitch;
        direction.y = Math.sin(pitchRef.current);
        direction.z = -Math.cos(yaw) * cosPitch;
        const eyeX = clampX(position.x + Math.sin(yaw) * AIM_BACK + Math.cos(yaw) * AIM_SIDE);
        const eyeZ = clampZ(position.z + Math.cos(yaw) * AIM_BACK - Math.sin(yaw) * AIM_SIDE);
        origin.x = eyeX + direction.x * AIM_BACK;
        origin.y = AIM_HEIGHT + direction.y * AIM_BACK;
        origin.z = eyeZ + direction.z * AIM_BACK;

        if (mode === "aiming") facingRef.current = Math.atan2(direction.x, direction.z);

        const speed = tomatoSpeed(power);
        const facing = facingRef.current;
        const { velocity } = aimRef.current;
        aimRef.current.hand = mode === "none" ? null : handRef.current;
        aimRef.current.origin = mode === "aiming" ? origin : null;
        handRef.current.x = position.x - Math.cos(facing) * 0.3 + Math.sin(facing) * 0.35;
        handRef.current.y = 1.3;
        handRef.current.z = position.z + Math.sin(facing) * 0.3 + Math.cos(facing) * 0.35;
        velocity.x = direction.x * speed;
        velocity.y = direction.y * speed;
        velocity.z = direction.z * speed;

        if (gaugeRef.current !== null) gaugeRef.current.style.transform = `scaleX(${String(power)})`;

        camera.position.set(orbitX + (eyeX - orbitX) * blend, CAMERA_HEIGHT + (AIM_HEIGHT - CAMERA_HEIGHT) * blend, orbitZ + (eyeZ - orbitZ) * blend);
        camera.lookAt(position.x + (eyeX + direction.x * 10 - position.x) * blend, 1.2 + (AIM_HEIGHT + direction.y * 10 - 1.2) * blend, position.z + (eyeZ + direction.z * 10 - position.z) * blend);
      }

      // The jumper sees the tunnel (far above the room) while away, and everybody's camera shakes when the portal opens:
      if (self.air === "away") {
        camera.position.set(TUNNEL.x, TUNNEL.y + 1.6, TUNNEL.z + 3.2);
        camera.lookAt(TUNNEL.x, TUNNEL.y + 0.9, TUNNEL.z);
      }

      const shakeAge = (Date.now() - shakeAt) / 1_000;

      if (shakeAge < SHAKE_SECONDS) {
        const amplitude = SHAKE_AMPLITUDE * (1 - shakeAge / SHAKE_SECONDS) ** 2;
        camera.position.x += (Math.random() - 0.5) * 2 * amplitude;
        camera.position.y += (Math.random() - 0.5) * 2 * amplitude;
        camera.position.z += (Math.random() - 0.5) * 2 * amplitude;
      }

      if (camera instanceof PerspectiveCamera) {
        const fov = NORMAL_FOV + (AIM_FOV - NORMAL_FOV) * blend;

        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
    });

    return inGame ? null : (
      <Character
        id={self.id}
        name={self.name}
        avatarUrl={self.avatarUrl}
        position={predictedRef.current}
        follow={predictedRef}
        rotation={self.seatId === null ? facingRef.current : self.rotation}
        seated={self.seatId !== null}
        onBench={isBenchSeat(self.seatId)}
        elevation={seatElevation(self.seatId)}
        speech={speech}
        speaking={speaking}
        level={level}
        jumpAt={jumpAt}
        sleeping={sleeping}
        leanSide={leanSide}
        splat={splat}
        fighting={fighting}
        air={self.air}
      />
    );
  };

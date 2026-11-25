"use client";

import type { ModelKind } from "./model";
import type { Rig } from "./motion";
import type { RoomGame } from "@tribunal/bot/room/chaos";
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { Air } from "@tribunal/bot/room/world";
import type { Group } from "three";
import { EmojiText } from "../emoji-text";
import { animateGame } from "./game-motion";
import { diveDistance, EXTRAPOLATE_SECONDS, fallHeight, FOLLOW_RATE, jumpHeight, STALE_SECONDS, STRIDE_PER_METER, TURN_RATE } from "./gestures";
import { memberLook } from "./looks";
import { CharacterModel, modelBaseY } from "./model";
import { animateTalk, animateTyping, driveClips } from "./motion";
import { useAvatarTexture } from "./parts";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MAX_SPEED } from "@tribunal/bot/room/layout";
import { FALL_HEIGHT } from "@tribunal/bot/room/window-jump";
import { Suspense, useMemo, useRef } from "react";

type CharacterProps = {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: Vec2;
  rotation: number;
  seated: boolean;
  /** Bent legs resting over the front edge of a public bench. */
  onBench?: boolean;
  speech: string | null;
  /** Height of a raised chair above an ordinary one, such as the judge's. */
  elevation?: number;
  /** The member is talking: the arms gesture */
  speaking?: boolean;
  /** Loudness of the voice, from 0 to 1: louder means wider, faster gestures */
  level?: number;
  /** A court officer (judge, police, clerk) instead of a member with their own look */
  variant?: ModelKind;
  sleeping?: boolean;
  /** Asleep with someone right beside: +1 the head rests on the neighbour at the character's right, -1 at the left, 0 nobody */
  leanSide?: -1 | 0 | 1;
  /** A tomato on the face */
  splat?: boolean;
  /** Throwing punches until the police comes */
  fighting?: boolean;
  game?: RoomGame | null;
  /** When the member last jumped (Date.now()), the hop lasts JUMP_MS */
  jumpAt?: number;
  /** Window jump phase: hidden while away, otherwise the dive, fall and landing clips drive the body */
  air?: Air | null;
  /** Height the fall starts from (the tunnel of the jumper falls without losing height) */
  fallFrom?: number;
  /** The clerk typing on his keyboard */
  typing?: boolean;
  /** Smoothly follow the given position (remote players) instead of jumping to it */
  interpolate?: boolean;
  /** Position read every frame (local player prediction), overriding `position` */
  follow?: {
    current: Vec2;
  };
};

/** A member with a stable look from their ID, or a court officer (judge, police, clerk), each one a Blockbench model. */
export const Character
  = ({ id, name, avatarUrl, position, rotation, seated, onBench = false, speech, elevation = 0, speaking = false, level = 0, variant = "member", sleeping = false, leanSide = 0, splat = false, fighting = false, game = null, jumpAt = 0, air = null, fallFrom = FALL_HEIGHT, typing = false, interpolate = false, follow }: CharacterProps) => {
    const groupRef = useRef<Group>(null);
    const modelRef = useRef<Rig>(null);
    const motionRef = useRef({
      lastTarget: {
        x: position.x,
        z: position.z,
      },
      velocity: {
        x: 0,
        z: 0,
      },
      changedAt: 0,
      phase: 0,
      walk: 0,
      run: 0,
      talk: 0,
      loud: 0,
    });
    const airRef = useRef<{ air: Air | null; since: number }>({
      air,
      since: -1,
    });
    const texture = useAvatarTexture(avatarUrl);
    const look = useMemo(() => (variant === "member" ? memberLook(id) : undefined), [id, variant]);
    const baseY = modelBaseY(seated, onBench, elevation);

    useFrame((state, delta) => {
      const current = groupRef.current;

      if (current === null) return;

      const motion = motionRef.current;
      const time = state.clock.elapsedTime;
      const target = follow?.current ?? position;
      let desired = target;

      // Seconds since the window jump phase began (counted here, from the first frame that sees it):
      if (airRef.current.air !== air || airRef.current.since < 0) airRef.current = {
        air,
        since: time,
      };

      const airAge = time - airRef.current.since;
      // Hidden while away: the jumper is outside the window.
      current.visible = air !== "away";

      if (interpolate) {
        if (target.x !== motion.lastTarget.x || target.z !== motion.lastTarget.z) {
          const elapsed = Math.min(Math.max(time - motion.changedAt, 0.05), 0.3);
          motion.velocity = {
            x: (target.x - motion.lastTarget.x) / elapsed,
            z: (target.z - motion.lastTarget.z) / elapsed,
          };
          motion.lastTarget = {
            x: target.x,
            z: target.z,
          };
          motion.changedAt = time;
        }

        if (time - motion.changedAt > STALE_SECONDS) motion.velocity = {
          x: 0,
          z: 0,
        };

        const ahead = Math.min(time - motion.changedAt, EXTRAPOLATE_SECONDS);
        desired = {
          x: target.x + motion.velocity.x * ahead,
          z: target.z + motion.velocity.z * ahead,
        };
      }

      // The diver goes out through the window:
      if (air === "dive") desired = {
        x: target.x + Math.sign(target.x) * diveDistance(airAge),
        z: target.z,
      };

      const beforeX = current.position.x;
      const beforeZ = current.position.z;
      const blend = interpolate && game === null && air === null ? 1 - Math.exp(-delta * FOLLOW_RATE) : 1;
      current.position.x += (desired.x - beforeX) * blend;
      current.position.z += (desired.z - beforeZ) * blend;

      // Turn by the shortest way instead of snapping:
      const turn = Math.atan2(Math.sin(rotation - current.rotation.y), Math.cos(rotation - current.rotation.y));
      current.rotation.y += turn * (1 - Math.exp(-delta * TURN_RATE));

      // Walking cycle from the distance actually covered: legs swing, arms swing the other way, the body bobs.
      // Faster than a walk, it becomes a run: longer strides, higher bounce, the body leaning forward.
      const moved = Math.hypot(current.position.x - beforeX, current.position.z - beforeZ);
      const speed = moved / Math.max(delta, 0.001);
      const walking = !seated && speed > 0.4 && air === null;
      motion.phase += moved * STRIDE_PER_METER;
      motion.walk += ((walking ? 1 : 0) - motion.walk) * (1 - Math.exp(-delta * 10));
      motion.run += ((walking && speed > MAX_SPEED + 0.5 ? 1 : 0) - motion.run) * (1 - Math.exp(-delta * 8));
      current.position.y
        = baseY
          + Math.abs(Math.sin(motion.phase)) * (0.045 + motion.run * 0.07) * motion.walk
          + (fighting ? Math.abs(Math.sin(time * 9)) * 0.06 : 0)
          + jumpHeight(jumpAt)
          + (air === "fall" ? fallHeight(airAge, fallFrom) : 0);
      // The dive, flop and landing clips own the pitch of the body: no running lean then.
      current.rotation.x = air === null ? motion.run * 0.18 : 0;

      const rig = modelRef.current;

      if (rig === null) return;

      // Each frame starts from the rest pose, then the clips of the model, then the procedural layers on top:
      for (const node of [...rig.arms, ...rig.elbows, ...rig.wrists, ...rig.legs, ...rig.knees, rig.head]) node?.rotation.set(0, 0, 0);
      for (const arm of rig.arms) if (arm !== null) arm.scale.y = 1;
      for (const elbow of rig.elbows) if (elbow !== null) elbow.visible = true;

      if (rig.clips !== undefined) {
        driveClips(rig.clips, {
          walk: motion.walk,
          run: motion.run,
          seated,
          fighting,
          jumpAt,
          air,
          airAge,
        }, delta);
      }

      if (typing) animateTyping(rig, time);

      // Talking: a syllable-like rhythm nods the head; the loudness of the voice (when known) widens and speeds it up.
      motion.talk += ((speaking ? 1 : 0) - motion.talk) * (1 - Math.exp(-delta * 8));
      motion.loud += ((speaking ? level : 0) - motion.loud) * (1 - Math.exp(-delta * 10));
      const talk = motion.talk;
      const intensity = 0.75 + motion.loud * 0.7;
      const syllable = Math.abs(Math.sin(time * (13 + motion.loud * 5) + id.length) * Math.sin(time * 5.7 + 1.3));

      // The model is turned by PI inside the character: its rotations around X and Z are mirrored.
      if (rig.head !== null) {
        if (sleeping && leanSide !== 0) {
          // Asleep next to someone: the head rests on their shoulder, a little forward, swaying with the breath:
          rig.head.rotation.x -= 0.2 + Math.sin(time * 1.2) * 0.03;
          rig.head.rotation.z += leanSide * (0.5 + Math.sin(time * 1.2) * 0.04);
        }
        else if (sleeping) {
          // Asleep alone: the head floats back and forward in a lazy 4 s cycle, with a little side sway:
          rig.head.rotation.x -= Math.sin(time * (Math.PI / 2)) * 0.35;
          rig.head.rotation.z += Math.sin(time * 0.8 + id.length) * 0.08;
        }
        else rig.head.rotation.x -= (Math.sin(time * 4.2) * 0.05 - syllable * 0.03) * talk * intensity;
        rig.head.rotation.y += Math.sin(time * 1.3 + id.length) * 0.1 * talk;
        rig.head.rotation.z -= Math.sin(time * 2.1) * 0.04 * talk;
      }

      if (rig.face !== undefined) {
        animateTalk(rig, rig.face, {
          time,
          delta,
          speaking,
          level,
          sleeping,
          sleepy: look?.sleepy ?? false,
        });
      }
      if (game !== null) animateGame(rig, game, id, time, delta);
    });

    return (
      <group ref={groupRef} position={[position.x, baseY, position.z]}>
        <Suspense fallback={null}>
          <CharacterModel kind={variant} look={look} texture={texture} splat={splat} rigRef={modelRef} />
        </Suspense>

        <Html position={[0, 2.4, 0]} center distanceFactor={10}>
          <div className="tag">
            {speech !== null && <div className="bubble"><EmojiText>{speech}</EmojiText></div>}
            <div className="name">{name}</div>
          </div>
        </Html>
      </group>
    );
  };

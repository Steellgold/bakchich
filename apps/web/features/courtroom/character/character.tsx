"use client";

import type { Vec2 } from "@tribunal/bot/room/layout";
import type { Group, Mesh } from "three";
import { INK } from "../courtroom";
import { EIGHTH, EXTRAPOLATE_SECONDS, FOLLOW_RATE, FRONT, GESTURE_SECONDS, gesturePacks, IDLE, STALE_SECONDS, STRIDE_PER_METER, TURN_RATE } from "./gestures";
import { CLERK_LOOK, JUDGE_LOOK, memberLook, POLICE_LOOK } from "./looks";
import { facetGeometry, Flat, Head, Toon, useAvatarTexture } from "./parts";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";

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
  /** Vertical offset for raised positions such as the judge's chair. */
  elevation?: number;
  /** The judge: powdered wig, white moustache and beard, gold collar and a gavel */
  wig?: boolean;
  /** The member is talking: the arms gesture */
  speaking?: boolean;
  /** Loudness of the voice, from 0 to 1: louder means wider, faster gestures */
  level?: number;
  /** Look of a court officer instead of the member's own */
  variant?: "member" | "police" | "clerk";
  sleeping?: boolean;
  /** A tomato on the face */
  splat?: boolean;
  /** Throwing punches until the police comes */
  fighting?: boolean;
  /** The clerk typing on his keyboard */
  typing?: boolean;
  /** Smoothly follow the given position (remote players) instead of jumping to it */
  interpolate?: boolean;
  /** Position read every frame (local player prediction), overriding `position` */
  follow?: {
    current: Vec2;
  };
};

/** Low-poly member with a stable look: build, outfit, face and hair all come from their ID. */
export const Character
  = ({ id, name, avatarUrl, position, rotation, seated, onBench = false, speech, elevation = 0, wig = false, speaking = false, level = 0, variant = "member", sleeping = false, splat = false, fighting = false, typing = false, interpolate = false, follow }: CharacterProps) => {
    const groupRef = useRef<Group>(null);
    const leftArmRef = useRef<Group>(null);
    const rightArmRef = useRef<Group>(null);
    const leftLegRef = useRef<Group>(null);
    const rightLegRef = useRef<Group>(null);
    const leftWristRef = useRef<Group>(null);
    const rightWristRef = useRef<Group>(null);
    const headRef = useRef<Group>(null);
    const mouthRef = useRef<Mesh>(null);
    const browsRef = useRef<Group>(null);
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
      talk: 0,
      wasSpeaking: false,
      loud: 0,
      gesture: id.length,
      gestureAt: 0,
    });
    const texture = useAvatarTexture(avatarUrl);
    const look = useMemo(() => {
      if (wig) return JUDGE_LOOK;
      if (variant === "police") return POLICE_LOOK;
      if (variant === "clerk") return CLERK_LOOK;

      return memberLook(id);
    }, [id, wig, variant]);
    const height = seated ? 0.45 : 0.9;
    const headY = height + (seated ? 0.55 : 0.8);
    // The seated robe bottoms out at 0.19 m; the public bench seat is at 0.5 m.
    const baseY = onBench ? 0.31 : elevation;

    const pack = gesturePacks[look.pack % gesturePacks.length] ?? [];
    // Seated members rest their hands forward, standing ones let their arms hang:
    const restX = seated ? -0.9 : 0;

    useFrame((state, delta) => {
      const current = groupRef.current;

      if (current === null) return;

      const motion = motionRef.current;
      const time = state.clock.elapsedTime;
      const target = follow?.current ?? position;
      let desired = target;

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

      const beforeX = current.position.x;
      const beforeZ = current.position.z;
      const blend = interpolate ? 1 - Math.exp(-delta * FOLLOW_RATE) : 1;
      current.position.x += (desired.x - beforeX) * blend;
      current.position.z += (desired.z - beforeZ) * blend;

      // Turn by the shortest way instead of snapping:
      const turn = Math.atan2(Math.sin(rotation - current.rotation.y), Math.cos(rotation - current.rotation.y));
      current.rotation.y += turn * (1 - Math.exp(-delta * TURN_RATE));

      // Walking cycle from the distance actually covered: legs swing, arms swing the other way, the body bobs.
      const moved = Math.hypot(current.position.x - beforeX, current.position.z - beforeZ);
      const walking = !seated && moved / Math.max(delta, 0.001) > 0.4;
      motion.phase += moved * STRIDE_PER_METER;
      motion.walk += ((walking ? 1 : 0) - motion.walk) * (1 - Math.exp(-delta * 10));
      current.position.y = baseY + Math.abs(Math.sin(motion.phase)) * 0.045 * motion.walk + (fighting ? Math.abs(Math.sin(time * 9)) * 0.06 : 0);

      for (const [index, leg] of [leftLegRef.current, rightLegRef.current].entries()) {
        if (leg !== null) leg.rotation.x = Math.sin(motion.phase + index * Math.PI) * 0.75 * motion.walk;
      }

      // Talking: a syllable-like rhythm drives the mouth, head, brows and hands; the loudness of the voice (when known) widens and speeds them up.
      motion.talk += ((speaking ? 1 : 0) - motion.talk) * (1 - Math.exp(-delta * 8));
      motion.loud += ((speaking ? level : 0) - motion.loud) * (1 - Math.exp(-delta * 10));
      const talk = motion.talk;
      const intensity = 0.75 + motion.loud * 0.7;
      const syllable = Math.abs(Math.sin(time * (13 + motion.loud * 5) + id.length) * Math.sin(time * 5.7 + 1.3));
      // A new gesture for each phrase (each time the member starts talking again), on a loud burst, and every few seconds of a long one:
      const burst = motion.loud > 0.7 && time - motion.gestureAt > 0.8;

      if (speaking && (!motion.wasSpeaking || burst || time - motion.gestureAt > GESTURE_SECONDS)) {
        motion.gesture += 1 + Math.floor(Math.random() * Math.max(pack.length - 1, 1));
        motion.gestureAt = time;
      }

      motion.wasSpeaking = speaking;

      const mouth = mouthRef.current;

      if (mouth !== null) {
        const open = talk * (0.25 + 0.75 * syllable);
        mouth.visible = open > 0.03;
        mouth.scale.y = 0.001 + open * 0.042;
      }

      if (headRef.current !== null) {
        // Asleep, the head drops forward and nods slowly:
        headRef.current.rotation.x = sleeping ? 0.45 + Math.sin(time * 1.2) * 0.05 : (Math.sin(time * 4.2) * 0.05 - syllable * 0.03) * talk * intensity;
        headRef.current.rotation.y = Math.sin(time * 1.3 + id.length) * 0.1 * talk;
        headRef.current.rotation.z = Math.sin(time * 2.1) * 0.04 * talk;
      }

      if (browsRef.current !== null) browsRef.current.position.y = Math.max(0, Math.sin(time * 2.6)) * 0.014 * talk;

      const gesture = speaking ? pack[motion.gesture % pack.length] : undefined;

      for (const [index, arm] of [leftArmRef.current, rightArmRef.current].entries()) {
        if (arm === null) continue;

        const side = index === 0 ? -1 : 1;
        // Fists up and alternating punches in a fight, forearms on the desk for the clerk, otherwise the talking gesture:
        if (fighting) {
          arm.rotation.x = -1.35 - Math.max(0, Math.sin(time * 14 + index * Math.PI)) * 0.6;
          arm.rotation.z = side * 0.25;
          continue;
        }

        const idle = typing ? { ...IDLE, x: -1.15 } : { ...IDLE, x: restX };
        const pose = gesture === undefined ? idle : index === 0 ? gesture.left : gesture.right;
        const wobble = (pose.wobble ?? 0) * intensity;
        const swing = gesture === undefined ? Math.sin(motion.phase + (index === 0 ? Math.PI : 0)) * 0.6 * motion.walk : 0;
        // Raised arms beat with the syllables, harder when the voice is loud:
        const beat = pose.x < -0.3 ? syllable * 0.18 * talk * intensity : 0;
        const raise = gesture === undefined ? pose.x : pose.x * intensity;
        const spread = gesture === undefined ? pose.outward : pose.outward * intensity;
        arm.rotation.x += (raise + swing - beat + Math.sin(time * 5 + index) * wobble - arm.rotation.x) * 0.15;
        arm.rotation.z += (side * (spread + Math.cos(time * 4 + index) * wobble * 0.5) - arm.rotation.z) * 0.15;
      }

      for (const [index, wrist] of [leftWristRef.current, rightWristRef.current].entries()) {
        if (wrist === null) continue;
        // The clerk's hands tap the keys:
        wrist.rotation.x
          = typing && !speaking ? Math.max(0, Math.sin(time * 18 + index * 2.1)) * 0.5 : Math.sin(time * (6 + motion.loud * 4) + index * 1.7) * 0.45 * talk * intensity;
        wrist.rotation.z = Math.cos(time * 4.5 + index) * 0.3 * talk;
      }
    });

    const robed = look.outfit === "robe" || look.outfit === "judge";
    const build = look.build;
    // Body proportions: a chest wider at the shoulders than at the waist gives the build.
    const torsoTop = headY - 0.32;
    const chestH = seated ? 0.36 : 0.56;
    const waistY = torsoTop - chestH;
    const bottomY = seated ? 0.19 : 0.44;
    const shoulderR = 0.4 * build;
    const waistR = 0.28 * build * (look.belly ? 1.12 : 1);
    const k = chestH / 0.56;
    const tilt = -Math.atan(((shoulderR - waistR) * FRONT) / chestH);
    const radiusAt = (y: number) => waistR + (shoulderR - waistR) * ((y - waistY) / chestH);
    const frontZ = (y: number) => radiusAt(y) * FRONT + 0.012;
    const sleeve = look.outfit === "vest" ? look.shirt : look.main;
    const cuff = look.outfit === "suit" || look.outfit === "vest" ? look.shirt : look.trim;
    const armLength = seated ? 0.36 : 0.56;
    const armWidth = Math.sqrt(build);
    const legColor = robed ? look.main : look.pants;
    const badgeY = torsoTop - 0.2 * k;

    return (
      <group ref={groupRef} position={[position.x, baseY, position.z]}>
        {!seated
          && [-1, 1].map((side) => (
            <group key={side} ref={side === -1 ? leftLegRef : rightLegRef} position={[side * 0.14 * build, 0.46, 0]}>
              <Toon color={look.pants} outlined position={[0, -0.2, 0]}>
                <boxGeometry args={[0.19, 0.4, 0.23]} />
              </Toon>
              <Toon color={look.shoes} outlined position={[0, -0.41, 0.04]}>
                <boxGeometry args={[0.21, 0.1, 0.32]} />
              </Toon>
            </group>
          ))}
        {seated
          && onBench
          && [-1, 1].map((side) => (
            <group key={side}>
              <Toon color={legColor} outlined position={[side * 0.14 * build, 0.26, 0.17]}>
                <boxGeometry args={[0.16, 0.14, 0.42]} />
              </Toon>
              <Toon color={look.pants} outlined position={[side * 0.14 * build, -0.02, 0.39]}>
                <boxGeometry args={[0.13, 0.46, 0.14]} />
              </Toon>
              <Toon color={look.shoes} outlined position={[side * 0.14 * build, -0.25, 0.44]}>
                <boxGeometry args={[0.18, 0.12, 0.24]} />
              </Toon>
            </group>
          ))}

        {/* Torso: chest, then a flared robe or the hips under a jacket */}
        <Toon color={look.main} outlined position={[0, waistY + chestH / 2, 0]} rotation-y={EIGHTH} scale-z={0.62}>
          <cylinderGeometry onUpdate={facetGeometry} args={[shoulderR, waistR, chestH, 8]} />
        </Toon>
        <Toon color={robed ? look.main : look.pants} outlined position={[0, (waistY + bottomY) / 2, 0]} rotation-y={EIGHTH} scale-z={0.62}>
          <cylinderGeometry onUpdate={facetGeometry} args={[waistR, waistR * (robed ? (seated ? 1.15 : 1.3) : 0.96), waistY - bottomY, 8]} />
        </Toon>
        {look.outfit === "suit" && (
          <Toon color={look.main} outlined position={[0, waistY - 0.07 * k, 0]} rotation-y={EIGHTH} scale-z={0.62}>
            <cylinderGeometry onUpdate={facetGeometry} args={[waistR * 1.03, waistR * 1.12, 0.16 * k, 8]} />
          </Toon>
        )}
        {look.outfit === "vest" && (
          <Toon color={look.main} position={[0, waistY - 0.03 * k, 0]} rotation-y={EIGHTH} scale-z={0.62}>
            <cylinderGeometry onUpdate={facetGeometry} args={[waistR * 1.02, waistR * 1.05, 0.07 * k, 8]} />
          </Toon>
        )}
        {look.outfit === "sweater" && (
          <>
            <Toon color={look.trim} position={[0, waistY - 0.035 * k, 0]} rotation-y={EIGHTH} scale-z={0.62}>
              <cylinderGeometry onUpdate={facetGeometry} args={[waistR * 1.04, waistR * 1.04, 0.08 * k, 8]} />
            </Toon>
            <Toon color={look.accent} position={[0, waistY + chestH * 0.55, 0]} rotation-y={EIGHTH} scale-z={0.62}>
              <cylinderGeometry
                onUpdate={facetGeometry}
                args={[radiusAt(waistY + chestH * 0.55 + 0.04 * k) + 0.01, radiusAt(waistY + chestH * 0.55 - 0.04 * k) + 0.01, 0.08 * k, 8]}
              />
            </Toon>
          </>
        )}
        {look.belly && (
          <Toon color={look.main} outlined position={[0, waistY + 0.1 * k, frontZ(waistY + 0.1 * k) - 0.1]} scale={[waistR * 0.85, 0.17 * k, 0.15]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
          </Toon>
        )}

        {/* Shoulders */}
        <Toon color={robed ? look.trim : sleeve} outlined position={[0, torsoTop - 0.02, 0]} scale={[shoulderR + 0.05, 0.12, 0.26]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
        </Toon>

        {/* Front of the outfit, laid on the flat front face of the chest */}
        <group rotation-x={tilt}>
          {robed && (
            <Toon
              color={look.trim}
              position={[
                0,
                waistY + chestH / 2,
                frontZ(waistY + chestH / 2),
              ]}
            >
              <boxGeometry args={[0.07, chestH * 0.95, 0.02]} />
            </Toon>
          )}
          {look.outfit === "robe"
            && [-1, 1].map((side) => (
              <Toon
                key={side}
                color="#fff9ee"
                outlined
                position={[side * 0.055, torsoTop - 0.15 * k, frontZ(torsoTop - 0.15 * k) + 0.01]}
                rotation-z={side * 0.06}
              >
                <boxGeometry args={[0.085, 0.22 * k, 0.035]} />
              </Toon>
            ))}
          {look.outfit === "judge" && (
            <>
              {[-1, 1].map((side) => (
                <group key={side}>
                  <Toon color="#fff9ee" outlined position={[side * 0.06, torsoTop - 0.19 * k, frontZ(torsoTop - 0.19 * k) + 0.02]} rotation-z={side * 0.09}>
                    <boxGeometry args={[0.1, 0.3 * k, 0.04]} />
                  </Toon>
                  <Toon color={look.accent} outlined position={[side * 0.15, torsoTop - 0.2 * k, frontZ(torsoTop - 0.2 * k) + 0.005]} rotation-z={side * 0.12}>
                    <boxGeometry args={[0.06, 0.36 * k, 0.03]} />
                  </Toon>
                </group>
              ))}
              <Toon color="#fff9ee" outlined position={[0, torsoTop - 0.04, frontZ(torsoTop - 0.04) + 0.025]}>
                <boxGeometry args={[0.15, 0.07, 0.05]} />
              </Toon>
            </>
          )}
          {(look.outfit === "suit" || look.outfit === "vest") && (
            <Toon
              color={look.shirt}
              position={[
                0,
                torsoTop - 0.14 * k,
                frontZ(torsoTop - 0.14 * k),
              ]}
            >
              <boxGeometry args={[look.outfit === "suit" ? 0.17 : 0.12, 0.28 * k, 0.02]} />
            </Toon>
          )}
          {look.outfit === "suit" && (
            <>
              <Toon color={look.accent} position={[0, torsoTop - 0.04 * k, frontZ(torsoTop - 0.04 * k) + 0.015]}>
                <boxGeometry args={[0.06, 0.05, 0.03]} />
              </Toon>
              <Toon color={look.accent} position={[0, torsoTop - 0.2 * k, frontZ(torsoTop - 0.2 * k) + 0.012]}>
                <boxGeometry args={[0.055, 0.26 * k, 0.025]} />
              </Toon>
              {[-1, 1].map((side) => (
                <Toon
                  key={side}
                  color={look.trim}
                  outlined
                  position={[side * 0.1, torsoTop - 0.14 * k, frontZ(torsoTop - 0.14 * k) + 0.012]}
                  rotation-z={-side * 0.3}
                >
                  <boxGeometry args={[0.07, 0.3 * k, 0.03]} />
                </Toon>
              ))}
              {[0.08, 0.16].map((offset) => (
                <Flat key={offset} color={INK} position={[0, waistY + offset * k, frontZ(waistY + offset * k) + 0.005]}>
                  <sphereGeometry args={[0.016, 6, 4]} />
                </Flat>
              ))}
            </>
          )}
          {look.outfit === "vest" && (
            <>
              {[-1, 1].map((side) => (
                <Toon
                  key={side}
                  color={look.accent}
                  outlined
                  position={[side * 0.045, torsoTop - 0.04 * k, frontZ(torsoTop - 0.04 * k) + 0.02]}
                  rotation-z={side * 0.4}
                >
                  <boxGeometry args={[0.07, 0.05, 0.03]} />
                </Toon>
              ))}
              {[0.28, 0.36, 0.44].map((offset) => (
                <Flat key={offset} color="#f2bd3c" position={[0, torsoTop - offset * k, frontZ(torsoTop - offset * k) + 0.005]}>
                  <sphereGeometry args={[0.017, 6, 4]} />
                </Flat>
              ))}
            </>
          )}
          <Toon color={look.accent} position={[-shoulderR * 0.48, badgeY, frontZ(badgeY) + 0.01]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.078, 0.078, 0.02, 12]} />
          </Toon>
          {texture !== null && (
            <mesh position={[-shoulderR * 0.48, badgeY, frontZ(badgeY) + 0.022]}>
              <circleGeometry args={[0.064, 16]} />
              <meshBasicMaterial map={texture} />
            </mesh>
          )}
        </group>

        {/* Arms: shoulder, sleeve, forearm, cuff and hand; the judge holds his gavel */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            ref={side === -1 ? leftArmRef : rightArmRef}
            position={[side * (shoulderR - 0.02), torsoTop - 0.08, 0]}
            rotation={[restX, 0, side * 0.07]}
          >
            <Toon color={robed ? look.trim : sleeve} outlined scale={[1, 0.9, 1]}>
              <icosahedronGeometry onUpdate={facetGeometry} args={[0.14 * armWidth, 1]} />
            </Toon>
            <Toon color={sleeve} outlined position={[0, -armLength * 0.275, 0]}>
              <cylinderGeometry onUpdate={facetGeometry} args={[0.125 * armWidth, 0.105 * armWidth, armLength * 0.55, 6]} />
            </Toon>
            <Toon color={sleeve} outlined position={[0, -armLength * 0.775, 0]}>
              <cylinderGeometry onUpdate={facetGeometry} args={[0.105 * armWidth, (robed ? 0.14 : 0.092) * armWidth, armLength * 0.45, 6]} />
            </Toon>
            <Toon color={cuff} position={[0, -armLength + 0.01, 0]}>
              <cylinderGeometry onUpdate={facetGeometry} args={[(robed ? 0.13 : 0.098) * armWidth, (robed ? 0.13 : 0.098) * armWidth, 0.05, 6]} />
            </Toon>
            {/* Hand on a wrist that turns while talking: flat palm and a thumb towards the front */}
            <group ref={side === -1 ? leftWristRef : rightWristRef} position={[0, -armLength - 0.02, 0]}>
              <Toon color={look.skin} outlined position={[0, -0.05, 0]} scale={[0.85, 1.15, 0.62]}>
                <icosahedronGeometry onUpdate={facetGeometry} args={[0.085, 1]} />
              </Toon>
              <Toon color={look.skin} outlined position={[-side * 0.035, -0.035, 0.05]} rotation-x={-0.5} scale={[0.8, 1.3, 0.8]}>
                <icosahedronGeometry onUpdate={facetGeometry} args={[0.032, 0]} />
              </Toon>
              {look.outfit === "judge" && side === 1 && (
                <group position={[0, -0.04, 0]}>
                  <Toon color="#8a4b2e" outlined position={[0, 0, 0.15]} rotation-x={Math.PI / 2}>
                    <cylinderGeometry onUpdate={facetGeometry} args={[0.025, 0.03, 0.34, 6]} />
                  </Toon>
                  <Toon color="#b8632f" outlined position={[0, 0, 0.33]} rotation-z={Math.PI / 2}>
                    <cylinderGeometry onUpdate={facetGeometry} args={[0.075, 0.075, 0.24, 8]} />
                  </Toon>
                  {[-1, 1].map((end) => (
                    <Toon key={end} color={look.accent} position={[end * 0.085, 0, 0.33]} rotation-z={Math.PI / 2}>
                      <cylinderGeometry onUpdate={facetGeometry} args={[0.08, 0.08, 0.04, 8]} />
                    </Toon>
                  ))}
                </group>
              )}
            </group>
          </group>
        ))}

        {/* Neck and collar */}
        <Toon color={look.skin} position={[0, headY - 0.28, 0]}>
          <cylinderGeometry onUpdate={facetGeometry} args={[0.1 * armWidth, 0.115 * armWidth, 0.18, 8]} />
        </Toon>
        {robed && (
          <Toon color={look.accent} outlined position={[0, headY - 0.34, 0]} scale-z={0.65}>
            <cylinderGeometry onUpdate={facetGeometry} args={[0.17 * build, 0.26 * build, 0.16, 6]} />
          </Toon>
        )}
        {!robed && (
          <Toon color={look.shirt} position={[0, headY - 0.35, 0.01]} rotation-x={Math.PI / 2} scale-y={0.75}>
            <torusGeometry args={[0.13 * armWidth, 0.04, 4, 8]} />
          </Toon>
        )}

        <group ref={headRef} position={[0, headY, 0]}>
          <Head look={look} mouthRef={mouthRef} browsRef={browsRef} />
          {splat && (
            <Toon color="#d8262c" outlined position={[0.04, 0.02, 0.27]} scale={[1.3, 1, 0.45]}>
              <icosahedronGeometry onUpdate={facetGeometry} args={[0.11, 1]} />
            </Toon>
          )}
        </group>

        <Html position={[0, height + 1.5, 0]} center distanceFactor={10}>
          <div className="tag">
            {speech !== null && <div className="bubble">{speech}</div>}
            {speech === null && sleeping && <div className="bubble">Zzz…</div>}
            <div className="name">{name}</div>
          </div>
        </Html>
      </group>
    );
  };

"use client";

import type { Vec2 } from "@tribunal/bot/room/layout";
import type { Group, Texture } from "three";
import { INK } from "./courtroom";
import { Html, Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { SRGBColorSpace, TextureLoader } from "three";

type CharacterProps = {
  name: string;
  avatarUrl: string | null;
  position: Vec2;
  rotation: number;
  seated: boolean;
  speech: string | null;
  color?: string;
  /** Judge's powdered wig */
  wig?: boolean;
  /** Smoothly follow the given position (remote players) instead of jumping to it */
  interpolate?: boolean;
  /** Position read every frame (local player prediction), overriding `position` */
  follow?: { current: Vec2 };
};

// Discord avatar as a cube head texture, null while loading or when the CDN refuses it (the head stays plain):
const useAvatarTexture = (url: string | null) => {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (url === null) return;
    const loader = new TextureLoader();
    loader.setCrossOrigin("anonymous");
    let cancelled = false;
    let loadedTexture: Texture | null = null;
    loader.load(url, (loaded) => {
      if (cancelled) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = SRGBColorSpace;
      loadedTexture = loaded;
      setTexture(loaded);
    });
    return () => {
      cancelled = true;
      loadedTexture?.dispose();
    };
  }, [url]);

  return texture;
};

const BODY_COLORS = ["#ff4f5e", "#3ea6ff", "#3ddc84", "#ff9f1c", "#b388ff", "#ff6fb5", "#2ec4b6"];

// Same name, same color on every client:
const colorOf = (name: string) => {
  let sum = 0;
  for (let index = 0; index < name.length; index += 1) sum += name.charCodeAt(index);
  return BODY_COLORS[sum % BODY_COLORS.length] ?? "#ff4f5e";
};

/** Low-poly member: capsule body with a badge, cube head with the Discord avatar, name tag and speech bubble */
export const Character = ({ name, avatarUrl, position, rotation, seated, speech, color, wig = false, interpolate = false, follow }: CharacterProps) => {
  const groupRef = useRef<Group>(null);
  const texture = useAvatarTexture(avatarUrl);
  const height = seated ? 0.45 : 0.9;
  const headY = height + (seated ? 0.55 : 0.8);

  useFrame(() => {
    const current = groupRef.current;
    if (current === null) return;
    const target = follow?.current ?? position;
    const factor = interpolate ? 0.25 : 1;
    current.position.x += (target.x - current.position.x) * factor;
    current.position.z += (target.z - current.position.z) * factor;
    current.rotation.y = rotation;
  });

  return (
    <group ref={groupRef} position={[position.x, 0, position.z]}>
      <mesh position={[0, height, 0]} castShadow>
        <capsuleGeometry args={[0.28, seated ? 0.3 : 0.7, 2, 6]} />
        <meshToonMaterial color={color ?? colorOf(name)} />
        <Outlines thickness={0.03} color={INK} />
      </mesh>
      <mesh position={[0, height + 0.1, 0.3]}>
        <boxGeometry args={[0.18, 0.18, 0.06]} />
        <meshToonMaterial color="#ffd23f" />
        <Outlines thickness={0.02} color={INK} />
      </mesh>
      <mesh position={[0, headY, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshToonMaterial color={texture === null ? "#ffd1a1" : "#ffffff"} map={texture} />
        <Outlines thickness={0.03} color={INK} />
      </mesh>
      {wig && (
        <mesh position={[0, headY + 0.4, 0]} castShadow>
          <icosahedronGeometry args={[0.38, 0]} />
          <meshToonMaterial color="#ffffff" />
          <Outlines thickness={0.03} color={INK} />
        </mesh>
      )}
      <Html position={[0, height + 1.4, 0]} center distanceFactor={10}>
        <div className="tag">
          {speech !== null && <div className="bubble">{speech}</div>}
          <div className="name">{name}</div>
        </div>
      </Html>
    </group>
  );
};

"use client";

import type { Vec2 } from "@tribunal/bot/room/layout";
import type { Group, Texture } from "three";
import { Html } from "@react-three/drei";
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
    loader.load(url, (loaded) => {
      loaded.colorSpace = SRGBColorSpace;
      setTexture(loaded);
    });
  }, [url]);

  return texture;
};

/** Low-poly member: capsule body, cube head with the Discord avatar, name tag and speech bubble */
export const Character = ({ name, avatarUrl, position, rotation, seated, speech, color = "#7f8c8d", interpolate = false, follow }: CharacterProps) => {
  const groupRef = useRef<Group>(null);
  const texture = useAvatarTexture(avatarUrl);
  const height = seated ? 0.45 : 0.9;

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
        <capsuleGeometry args={[0.28, seated ? 0.3 : 0.7, 2, 8]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, height + (seated ? 0.55 : 0.8), 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={texture === null ? "#f1c27d" : "#ffffff"} map={texture} />
      </mesh>
      <Html position={[0, height + 1.4, 0]} center distanceFactor={10}>
        <div className="tag">
          {speech !== null && <div className="bubble">{speech}</div>}
          <div className="name">{name}</div>
        </div>
      </Html>
    </group>
  );
};

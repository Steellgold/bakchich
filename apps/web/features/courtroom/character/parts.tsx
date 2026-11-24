"use client";

// Building blocks of a character: cel-shaded parts and the avatar badge texture.
import type { ThreeElements } from "@react-three/fiber";
import type { BufferGeometry, Texture } from "three";
import { INK } from "../toon-model";
import { Outlines } from "@react-three/drei";
import { useEffect, useState } from "react";
import { SRGBColorSpace, TextureLoader } from "three";

// Discord avatar for the lapel badge; the sculpted face stays visible for every member.
export const useAvatarTexture = (url: string | null) => {
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

export const facetGeometry = (geometry: BufferGeometry) => {
  if (geometry.index !== null) {
    const faces = geometry.toNonIndexed();
    geometry.copy(faces);
    faces.dispose();
  }

  geometry.computeVertexNormals();
};

type ToonProps = ThreeElements["mesh"] & {
  color: string;
  outlined?: boolean;
};

/** Cel-shaded part; outlined parts carry the silhouette and cast shadows, small details stay light */
export const Toon = ({ color, outlined = false, children, ...mesh }: ToonProps) => (
  <mesh castShadow={outlined} {...mesh}>
    {children}
    <meshToonMaterial color={color} />
    {outlined && <Outlines thickness={0.018} color={INK} />}
  </mesh>
);

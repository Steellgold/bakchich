"use client";

import type { PlaneGeometry, Texture } from "three";
import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { RepeatWrapping, SRGBColorSpace } from "three";

const repeatTexture = (source: Texture, size: number) => {
  const texture = source.clone();
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / size, 1 / size);
  texture.needsUpdate = true;
  return texture;
};

/** Keep cached images shared while owning the texture settings and their disposal. */
export const useCourtroomTextures = () => {
  const { tiles, parquet } = useTexture({
    tiles: "/assets/textures/floor-tiles.jpg",
    parquet: "/assets/textures/parquet.jpg",
  });
  const textures = useMemo(() => ({
    tiles: repeatTexture(tiles, 4),
    parquet: repeatTexture(parquet, 2.25),
  }), [tiles, parquet]);

  useEffect(() => () => {
    for (const texture of Object.values(textures)) texture.dispose();
  }, [textures]);

  return textures;
};

/** Rebuild plane UVs in meters; the texture repeat specifies the tile size. */
export const tilePlaneTexture = (geometry: PlaneGeometry) => {
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const { width, height } = geometry.parameters;

  for (let index = 0; index < positions.count; index += 1) {
    uv.setXY(index, positions.getX(index) + width / 2, positions.getY(index) + height / 2);
  }

  uv.needsUpdate = true;
};

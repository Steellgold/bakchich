"use client";

import type { BoxGeometry, PlaneGeometry, Texture } from "three";
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
  const { wood, tiles, parquet, plaster } = useTexture({
    wood: "/assets/textures/wood.jpg",
    tiles: "/assets/textures/floor-tiles.jpg",
    parquet: "/assets/textures/parquet.jpg",
    plaster: "/assets/textures/plaster.jpg",
  });
  const textures = useMemo(() => ({
    wood: repeatTexture(wood, 1.2),
    tiles: repeatTexture(tiles, 4),
    parquet: repeatTexture(parquet, 2.25),
    plaster: repeatTexture(plaster, 1),
  }), [wood, tiles, parquet, plaster]);

  useEffect(() => () => {
    for (const texture of Object.values(textures)) texture.dispose();
  }, [textures]);

  return textures;
};

/** Rebuild UVs in meters so all six faces retain the same texture scale. */
export const tileBoxTexture = (geometry: BoxGeometry) => {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const { width, height, depth } = geometry.parameters;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    let u: number;
    let v: number;

    if (normals.getX(index) !== 0) {
      u = depth / 2 - z * normals.getX(index);
      v = y + height / 2;
    }
    else if (normals.getY(index) !== 0) {
      u = x + width / 2;
      v = depth / 2 - z * normals.getY(index);
    }
    else {
      u = width / 2 + x * normals.getZ(index);
      v = y + height / 2;
    }

    uv.setXY(index, u, v);
  }

  uv.needsUpdate = true;
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

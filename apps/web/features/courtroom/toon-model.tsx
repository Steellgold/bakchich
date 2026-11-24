"use client";

// Blockbench glTF models drawn in the toon style of the room: toon materials and ink outlines, shared by the characters and the furniture.
import type { ThreeElements } from "@react-three/fiber";
import type { Material, Object3D } from "three";
import { Outlines, useGLTF } from "@react-three/drei";
import { createPortal } from "@react-three/fiber";
import { Fragment, useEffect, useMemo } from "react";
import { Box3, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const INK = "#2b1b3d";

const merged = new WeakSet<Object3D>();

/**
 * Blockbench exports every cube as its own mesh: inside each group, merge the cubes that share a material and an outline setting into one mesh
 * (in the group's own space, so the groups still move the cubes). Done once per loaded model, before it is cloned.
 * Meshes matching `keep` stay apart, as the code addresses them by name. Meshes matching `split` are merged only among themselves
 * (the merged mesh keeps the first name, so a later lookup by name still works). Every mesh gets `userData.outline`.
 */
export const mergeCubes = (root: Object3D, outline: (mesh: Mesh) => boolean, keep?: RegExp, split?: RegExp) => {
  if (merged.has(root)) return;

  merged.add(root);
  const parents: Object3D[] = [];
  root.traverse((object) => {
    parents.push(object);
  });

  for (const parent of parents) {
    const groups = new Map<string, { inked: boolean; meshes: Mesh[] }>();

    for (const mesh of parent.children.filter((child): child is Mesh => child instanceof Mesh && child.children.length === 0)) {
      const inked = outline(mesh);
      mesh.userData.outline = inked;

      if (keep?.test(mesh.name) === true) continue;

      const key = `${(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.uuid ?? ""}:${String(inked)}:${String(split?.test(mesh.name) === true)}`;
      const group = groups.get(key) ?? {
        inked,
        meshes: [],
      };
      group.meshes.push(mesh);
      groups.set(key, group);
    }

    for (const { inked, meshes } of groups.values()) {
      const [first] = meshes;

      if (first === undefined || meshes.length < 2) continue;

      const geometry = mergeGeometries(meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      }));

      const mesh = new Mesh(geometry, first.material);
      mesh.name = first.name;
      mesh.userData.outline = inked;
      parent.remove(...meshes);
      parent.add(mesh);
    }
  }
};

/**
 * Swap the materials of a cloned model for toon ones (one per texture, tinted by texture name) and list the meshes to outline.
 * Outlined meshes also cast shadows. Meshes whose name matches `unlit` get a flat, bright material instead (glowing parts, sky).
 */
export const toonify = (root: Object3D, outline: (mesh: Mesh) => boolean, tints: Record<string, string> = {}, unlit?: RegExp) => {
  const materials = new Map<string, Material>();
  const outlined: Mesh[] = [];

  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;

    const source = object.material;
    const mesh = object as Mesh;
    const flat = unlit?.test(mesh.name) === true;
    const name = `${flat ? "unlit:" : ""}${source.map?.name ?? ""}`;
    const options = {
      map: source.map,
      alphaTest: source.alphaTest,
      transparent: source.transparent,
      side: source.side,
    };
    const material
      = materials.get(name)
        ?? (flat ? new MeshBasicMaterial(options) : new MeshToonMaterial({ ...options, color: tints[name] ?? "#ffffff" }));
    materials.set(name, material);
    mesh.material = material;

    if (!outline(mesh)) return;

    mesh.castShadow = true;
    outlined.push(mesh);
  });

  return {
    materials,
    outlined,
  };
};

/** Ink outlines mounted inside each listed mesh */
export const InkOutlines = ({ meshes, thickness }: {
  meshes: Mesh[];
  thickness: number;
}) => meshes.map((mesh) => <Fragment key={mesh.uuid}>{createPortal(<Outlines thickness={thickness} color={INK} />, mesh)}</Fragment>);

const size = new Vector3();

/** Thin bars and small details (handles, studs, balusters) stay without an ink outline: their middle dimension is under 7 cm */
export const isNotTiny = (mesh: Mesh) => {
  mesh.geometry.computeBoundingBox();
  (mesh.geometry.boundingBox ?? new Box3()).getSize(size);
  const [, middle] = [size.x, size.y, size.z].sort((a, b) => a - b);
  return (middle ?? 0) >= 0.07;
};

/**
 * A static prop of the room, such as a bench or a desk: origin at the centre of its footprint on the floor, front towards -Z.
 * `outline` picks the meshes to ink (default: all but tiny ones), `split` the meshes merged apart from the others (glass, glow),
 * `unlit` the bright flat ones, `shadow` whether the inked meshes cast shadows. The first three are per model: give the same at every use of a URL.
 */
export const ToonModel = ({ url, outline = isNotTiny, split, unlit, shadow = true, ...props }: ThreeElements["group"] & {
  url: string;
  outline?: (mesh: Mesh) => boolean;
  split?: RegExp;
  unlit?: RegExp;
  shadow?: boolean;
}) => {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    mergeCubes(scene, outline, undefined, split);
    const root = scene.clone(true);
    root.traverse((object) => {
      object.receiveShadow = true;
    });
    const toon = toonify(root, (mesh) => mesh.userData.outline === true, {}, unlit);

    if (!shadow) for (const mesh of toon.outlined) mesh.castShadow = false;

    return {
      root,
      ...toon,
    };
  }, [scene, outline, split, unlit, shadow]);

  // The materials belong to this instance only:
  useEffect(
    () => () => {
      for (const material of model.materials.values()) material.dispose();
    },
    [model],
  );

  return (
    <group {...props}>
      <primitive object={model.root} />
      <InkOutlines meshes={model.outlined} thickness={0.02} />
    </group>
  );
};

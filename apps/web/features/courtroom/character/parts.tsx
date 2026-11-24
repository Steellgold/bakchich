"use client";

// Building blocks of a character: cel-shaded parts, the avatar badge texture, the judge's wig and the head.
import type { Look } from "./looks";
import type { ThreeElements } from "@react-three/fiber";
import type { RefObject } from "react";
import type { BufferGeometry, Group, Mesh, Texture } from "three";
import { INK } from "../courtroom";
import { hairStyles, JUDGE_BROWS, WIG_SHADE } from "./looks";
import { Outlines } from "@react-three/drei";
import { useEffect, useState } from "react";
import { DoubleSide, FrontSide, SRGBColorSpace, TextureLoader } from "three";

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
  double?: boolean;
};

/** Cel-shaded part; outlined parts carry the silhouette and cast shadows, small details stay light */
export const Toon = ({ color, outlined = false, double = false, children, ...mesh }: ToonProps) => (
  <mesh castShadow={outlined} {...mesh}>
    {children}
    <meshToonMaterial color={color} side={double ? DoubleSide : FrontSide} />
    {outlined && <Outlines thickness={0.018} color={INK} />}
  </mesh>
);

/** Unlit part for eyes, brows and other ink details */
export const Flat = ({ color, children, ...mesh }: ThreeElements["mesh"] & {
  color: string;
}) => (
  <mesh {...mesh}>
    {children}
    <meshBasicMaterial color={color} />
  </mesh>
);

/** Powdered judge's wig: puffy crown, three stacked rolls per side and a mass at the back */
const Wig = ({ color }: { color: string }) => (
  <>
    <Toon color={color} outlined position={[0, 0.05, -0.02]} scale={[1.02, 1.04, 0.98]}>
      <sphereGeometry onUpdate={facetGeometry} args={[0.33, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
    </Toon>
    {(
      [
        [0, 0.33, 0.04, 0.2],
        [-0.16, 0.29, 0.02, 0.15],
        [0.16, 0.29, 0.02, 0.15],
        [0, 0.27, -0.17, 0.18],
        [-0.1, 0.24, 0.17, 0.12],
        [0.1, 0.24, 0.17, 0.12],
      ] as const
    ).map(([x, y, z, size]) => (
      <Toon key={`${String(x)}:${String(z)}`} color={color} outlined position={[x, y, z]} scale={[size, size * 0.72, size]}>
        <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
      </Toon>
    ))}
    <Toon color={color} outlined position={[0, -0.13, -0.2]} scale={[0.3, 0.34, 0.17]}>
      <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
    </Toon>
    {[-1, 1].flatMap((side) => (
      [
        [0.06, 0.3],
        [-0.12, 0.33],
        [-0.3, 0.32],
      ] as const
    ).map(([y, x]) => (
      <group key={`${String(side)}:${String(y)}`} position={[side * x, y, -0.02]}>
        <Toon color={color} outlined rotation-x={Math.PI / 2}>
          <cylinderGeometry onUpdate={facetGeometry} args={[0.1, 0.1, 0.27, 8]} />
        </Toon>
        <Flat color={WIG_SHADE} position={[0, 0, 0.136]}>
          <circleGeometry args={[0.045, 8]} />
        </Flat>
        <Toon color={WIG_SHADE} position={[0, 0, 0.13]}>
          <torusGeometry args={[0.055, 0.014, 3, 8]} />
        </Toon>
      </group>
    )),
    )}
  </>
);

/** The face, hair and facial hair, in head space (origin at the centre of the head) */
export const Head = ({ look, mouthRef, browsRef }: {
  look: Look;
  mouthRef: RefObject<Mesh | null>;
  browsRef: RefObject<Group | null>;
}) => {
  const judge = look.outfit === "judge";
  const style = hairStyles[look.hairStyle];
  const hw = look.headWidth;

  return (
    <>
      <Toon color={look.skin} outlined scale={[0.91 * hw, 1.06, 0.88]}>
        <sphereGeometry onUpdate={facetGeometry} args={[0.31, 12, 8]} />
      </Toon>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Toon color={look.skin} position={[side * 0.27 * hw, -0.015, 0]} scale={[0.75, 1, 0.65]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[0.075, 1]} />
          </Toon>
          <Flat color="#fff" position={[side * 0.105, 0.025, 0.24]} scale={[1, 1.2, 0.45]}>
            <sphereGeometry args={[0.045, 10, 8]} />
          </Flat>
          <Flat color={INK} position={[side * 0.105 + (judge ? 0.018 : 0), 0.02, 0.257]} scale={[1, 1.2, 0.5]}>
            <sphereGeometry args={[0.026, 8, 6]} />
          </Flat>
          <Flat color="#fff" position={[side * 0.105 + (judge ? 0.026 : 0.008), 0.036, 0.27]}>
            <sphereGeometry args={[0.008, 6, 4]} />
          </Flat>
          {look.sleepy && (
            <Toon color={look.skin} position={[side * 0.105, 0.058, 0.252]} rotation-z={side * 0.12}>
              <boxGeometry args={[0.105, 0.04, 0.04]} />
            </Toon>
          )}
          {look.glasses && (
            <Flat color={INK} position={[side * 0.105, 0.025, 0.272]}>
              <torusGeometry args={[0.056, 0.01, 4, 14]} />
            </Flat>
          )}
        </group>
      ))}
      {/* Both brows lift together while talking */}
      <group ref={browsRef}>
        {[-1, 1].map((side) => (
          <Flat
            key={side}
            color={judge ? JUDGE_BROWS : look.hair}
            position={[side * 0.11, judge ? 0.12 + (side === 1 ? 0.025 : 0) : 0.105, 0.238]}
            // The judge raises one brow and frowns with the other:
            rotation-z={judge ? (side === 1 ? -0.18 : 0.3) : side * look.browTilt}
          >
            <boxGeometry args={[judge ? 0.12 : 0.08, 0.019 * look.brow, 0.026]} />
          </Flat>
        ))}
      </group>
      {/* Open mouth, scaled every frame from the speaking rhythm (flat when silent) */}
      <mesh ref={mouthRef} position={[0, -0.122, 0.252]} scale={[0.045, 0.001, 0.02]} visible={false}>
        <sphereGeometry args={[1, 10, 6]} />
        <meshBasicMaterial color="#5a1f2e" />
      </mesh>
      {look.glasses && (
        <Flat color={INK} position={[0, 0.035, 0.28]}>
          <boxGeometry args={[0.06, 0.012, 0.012]} />
        </Flat>
      )}

      {look.nose === 0 && (
        <Toon color={look.shade} position={[0, -0.045, 0.267]} scale={[0.035, 0.045, 0.045]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        </Toon>
      )}
      {look.nose === 1 && (
        <Toon color={look.shade} position={[0, -0.04, 0.268]} scale={[0.032, 0.07, 0.06]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        </Toon>
      )}
      {look.nose === 2 && (
        <Toon color={look.shade} position={[0, -0.05, 0.27]} scale={[1, 0.9, 1.1]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[0.052, 1]} />
        </Toon>
      )}

      {look.mouth === 0 && (
        <Flat color={INK} position={[0, -0.115, 0.252]} rotation-z={Math.PI} scale-y={0.6}>
          <torusGeometry args={[0.06, 0.009, 3, 10, Math.PI]} />
        </Flat>
      )}
      {look.mouth === 1 && (
        <Flat color={INK} position={[0.02, -0.118, 0.25]} rotation-z={Math.PI + 0.35} scale-y={0.5}>
          <torusGeometry args={[0.055, 0.009, 3, 10, Math.PI * 0.8]} />
        </Flat>
      )}
      {look.mouth === 2 && (
        <Flat color={INK} position={[0, -0.118, 0.255]}>
          <boxGeometry args={[0.07, 0.012, 0.01]} />
        </Flat>
      )}

      {(look.facial === "mustache" || look.facial === "beard")
        && [-1, 1].map((side) => (
          <Toon key={side} color={look.hair} position={[side * 0.042, -0.083, 0.262]} rotation-z={-side * 0.22} scale={[0.055, 0.022, 0.03]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
          </Toon>
        ))}
      {(look.facial === "beard" || look.facial === "handlebar") && (
        <Toon color={look.hair} outlined double scale={[0.93 * hw, 1.08, 0.94]}>
          <sphereGeometry onUpdate={facetGeometry} args={[0.322, 12, 5, -0.1, Math.PI + 0.2, Math.PI * 0.64, Math.PI * 0.36]} />
        </Toon>
      )}
      {look.facial === "goatee" && (
        <Toon color={look.hair} outlined position={[0, -0.23, 0.2]} scale={[0.07, 0.08, 0.05]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        </Toon>
      )}
      {look.facial === "handlebar"
        && [-1, 1].map((side) => (
          <group key={side}>
            <Toon color={look.hair} outlined position={[side * 0.065, -0.085, 0.268]} rotation-z={-side * 0.28} scale={[0.09, 0.034, 0.045]}>
              <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
            </Toon>
            <Toon color={look.hair} outlined position={[side * 0.15, -0.07, 0.235]} rotation-z={side * 0.5} scale={[0.035, 0.042, 0.035]}>
              <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
            </Toon>
          </group>
        ))}

      {judge ? (
        <Wig color={look.hair} />
      ) : (
        <>
          {style?.cap === true && (
            <Toon color={look.hair} outlined position={[0, 0.04, -0.025]} scale={[0.96 * hw, 1, 0.94]}>
              <sphereGeometry onUpdate={facetGeometry} args={[0.33, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.43]} />
            </Toon>
          )}
          {style?.parts.map((part) => (
            <Toon
              key={part.position.join(":")}
              color={look.hair}
              outlined
              position={[part.position[0] * hw, part.position[1], part.position[2]]}
              rotation-z={part.tilt ?? 0}
              scale={[part.scale[0] * hw, part.scale[1], part.scale[2]]}
            >
              {part.cone === true ? <coneGeometry onUpdate={facetGeometry} args={[1, 1, 5]} /> : <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />}
            </Toon>
          ))}
        </>
      )}
    </>
  );
};

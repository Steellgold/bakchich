// Symbiote wave: the new suit texture spreads over the old one from the feet to the head, with a noisy front so it reads as liquid.
import type { MeshToonMaterial, Texture } from "three";

/** Seconds the wave takes to cover the body */
export const WAVE_SECONDS = 1.5;

/** Shared by every patched material of a character: `uWave` goes from 0 (old suit) to 1 (new suit), `uBase` is the world height of the feet */
export const createWave = () => ({
  uPrev: { value: null as Texture | null },
  uWave: { value: 1 },
  uBase: { value: 0 },
});

export type Wave = ReturnType<typeof createWave>;

const NOISE = /* glsl */ `
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
`;

/** Patches a toon material (keeps its map as the new suit) so that fragments below the wave front show the new map and the others `uPrev` */
export const patchWave = (material: MeshToonMaterial, wave: Wave) => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPrev = wave.uPrev;
    shader.uniforms.uWave = wave.uWave;
    shader.uniforms.uBase = wave.uBase;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2D uPrev;\nuniform float uWave;\nuniform float uBase;\nvarying vec3 vWPos;\n${NOISE}`)
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
#ifdef USE_MAP
  vec4 newSuit = texture2D(map, vMapUv);
  if (uWave < 1.0) {
    float edge = vnoise(vWPos * 14.0) * 0.7 + vnoise(vWPos * 45.0) * 0.3;
    float front = uWave * 1.85 - 0.25;
    float covered = step((vWPos.y - uBase) / 2.1 + (edge - 0.5) * 0.35, front);
    newSuit = mix(texture2D(uPrev, vMapUv), newSuit, covered);
  }
  diffuseColor *= newSuit;
#endif`,
      );
  };
  material.customProgramCacheKey = () => "suit-wave";
};

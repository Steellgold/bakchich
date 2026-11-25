"use client";

// Painted Spider-Man suits (same UV layout as the member model), loaded once and shared by every character.
import type { Suit } from "@tribunal/bot/room/world";
import type { Texture } from "three";
import { useEffect, useState } from "react";
import { NearestFilter, SRGBColorSpace, TextureLoader } from "three";

const SUITS: Record<Suit, string> = {
  red: "/textures/suits/spiderman-red.png",
  black: "/textures/suits/spiderman-black.png",
  venom: "/textures/suits/venom.png",
};

let cache: Promise<Record<Suit, Texture>> | null = null;

const loadSuitTextures = async () => {
  cache ??= (async () => {
    const loader = new TextureLoader();
    const [red, black, venom] = await Promise.all(Object.values(SUITS).map(async (url) => loader.loadAsync(url)));

    if (red === undefined || black === undefined || venom === undefined) throw new Error("Suit textures missing");

    for (const texture of [red, black, venom]) {
      texture.colorSpace = SRGBColorSpace;
      // Like the glTF textures of the models:
      texture.flipY = false;
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
    }

    return {
      red,
      black,
      venom,
    };
  })();
  return cache;
};

/** The three suit textures once loaded, `null` until then (the tinted look stays meanwhile) */
export const useSuitTextures = () => {
  const [textures, setTextures] = useState<Record<Suit, Texture> | null>(null);

  useEffect(() => {
    const state = { cancelled: false };
    void (async () => {
      const loaded = await loadSuitTextures();
      if (!state.cancelled) setTextures(loaded);
    })();
    return () => {
      state.cancelled = true;
    };
  }, []);

  return textures;
};

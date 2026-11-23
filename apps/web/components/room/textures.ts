import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

const SIZE = 256;

// Fixed seed, so every client draws the same grain:
const random = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

const makeTexture = (draw: (context: CanvasRenderingContext2D) => void, repeatX = 1, repeatY = 1) => {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (context !== null) draw(context);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.repeat.set(repeatX, repeatY);
  return texture;
};

/** Wood planks with grain lines */
export const woodTexture = () => makeTexture((context) => {
  const next = random(7);
  context.fillStyle = "#c98a4b";
  context.fillRect(0, 0, SIZE, SIZE);
  for (let plank = 0; plank < 4; plank += 1) {
    context.fillStyle = plank % 2 === 0 ? "rgb(255 220 160 / 0.18)" : "rgb(90 40 10 / 0.12)";
    context.fillRect(0, plank * 64, SIZE, 64);
    context.fillStyle = "rgb(70 30 5 / 0.55)";
    context.fillRect(0, plank * 64, SIZE, 3);
  }
  context.strokeStyle = "rgb(90 45 10 / 0.35)";
  context.lineWidth = 2;
  for (let line = 0; line < 70; line += 1) {
    const y = next() * SIZE;
    const wave = next() * 6;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(SIZE * 0.3, y + wave, SIZE * 0.6, y - wave, SIZE, y);
    context.stroke();
  }
});

/** Pastel wallpaper: vertical stripes with small dots */
export const wallpaperTexture = () => makeTexture((context) => {
  for (let stripe = 0; stripe < 4; stripe += 1) {
    context.fillStyle = stripe % 2 === 0 ? "#9fdcf5" : "#c4ecfb";
    context.fillRect(stripe * 64, 0, 64, SIZE);
  }
  context.fillStyle = "rgb(255 255 255 / 0.8)";
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      context.beginPath();
      context.arc(32 + column * 128 + (row % 2) * 64, 32 + row * 64, 6, 0, Math.PI * 2);
      context.fill();
    }
  }
}, 8, 1);

/** Marble-like tiles, 4 x 4 per texture, with grout lines */
export const tilesTexture = (light: string, dark: string, repeatX: number, repeatY: number) => makeTexture((context) => {
  const next = random(11);
  const tile = SIZE / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? light : dark;
      context.fillRect(column * tile, row * tile, tile, tile);
    }
  }
  context.strokeStyle = "rgb(255 255 255 / 0.35)";
  context.lineWidth = 1.5;
  for (let vein = 0; vein < 24; vein += 1) {
    const x = next() * SIZE;
    const y = next() * SIZE;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (next() - 0.5) * 60, y + (next() - 0.5) * 60);
    context.stroke();
  }
  context.strokeStyle = "rgb(60 30 20 / 0.4)";
  context.lineWidth = 2;
  for (let line = 0; line <= 4; line += 1) {
    context.beginPath();
    context.moveTo(line * tile, 0);
    context.lineTo(line * tile, SIZE);
    context.moveTo(0, line * tile);
    context.lineTo(SIZE, line * tile);
    context.stroke();
  }
}, repeatX, repeatY);

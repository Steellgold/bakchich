// Pick a nearby, unobstructed place for a table and its two players.
import type { RoomGame } from "./games";
import type { Vec2 } from "./layout";
import type { PlayerState } from "./world";
import { ROOM } from "./layout";
import { canStand } from "./world";

export type GamePlacement = { position: Vec2; rotation: number };

/** Player zero faces +Z in the table's frame, player one faces -Z. */
export const gamePlayerPositions = ({ position, rotation }: GamePlacement): [Vec2, Vec2] => [-1, 1].map((side) => ({
  x: position.x + Math.sin(rotation) * 0.55 * side,
  z: position.z + Math.cos(rotation) * 0.55 * side,
})) as [Vec2, Vec2];

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Check the whole footprint, including the space around the standing players. */
const isFree = (placement: GamePlacement, others: PlayerState[], games: RoomGame[]) => {
  const { position, rotation } = placement;
  for (const x of [-0.5, 0, 0.5]) {
    for (const z of [-0.9, -0.45, 0, 0.45, 0.9]) {
      if (!canStand({
        x: position.x + Math.cos(rotation) * x + Math.sin(rotation) * z,
        z: position.z - Math.sin(rotation) * x + Math.cos(rotation) * z,
      })) return false;
    }
  }
  const spots = gamePlayerPositions(placement);
  return others.every((player) => distance(player.position, position) >= 0.8 && spots.every((spot) => distance(player.position, spot) >= 0.65))
    && games.every((game) => distance(game.position, position) >= 2);
};

export const findGamePlacement = (players: [PlayerState, PlayerState], others: PlayerState[], games: RoomGame[]): GamePlacement | null => {
  const middle = { x: (players[0].position.x + players[1].position.x) / 2, z: (players[0].position.z + players[1].position.z) / 2 };
  const spectators = others.filter((player) => !players.some(({ id }) => id === player.id));
  const candidates: Vec2[] = [middle];
  for (let x = -ROOM.width / 2 + 1; x < ROOM.width / 2; x += 0.5) {
    for (let z = 14.5; z <= ROOM.depth - 1; z += 0.5) {
      const position = { x, z };
      if (distance(position, middle) <= 6) candidates.push(position);
    }
  }
  candidates.sort((a, b) => distance(a, middle) - distance(b, middle));
  for (const position of candidates) {
    for (const rotation of [0, Math.PI / 2]) {
      const placement = { position, rotation };
      if (isFree(placement, spectators, games)) return placement;
    }
  }
  return null;
};

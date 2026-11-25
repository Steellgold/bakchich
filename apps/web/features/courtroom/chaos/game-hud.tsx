"use client";

import type { GameView, RoomGame, RpsPick } from "@tribunal/bot/room/chaos";
import type { ClientMessage } from "@tribunal/bot/room/protocol";
import { GameButton } from "@/components/game-ui";
import { RPS_SHAKE_MS } from "@tribunal/bot/room/games";
import { useEffect, useState } from "react";

const PICKS: { pick: RpsPick; label: string }[] = [
  { pick: "rock", label: "Pierre" },
  { pick: "paper", label: "Feuille" },
  { pick: "scissors", label: "Ciseaux" },
];
const RESULTS = { won: "Gagné !", lost: "Perdu…", draw: "Égalité." } as const;

/** Only controls and the outcome: the board and the hands remain in the world. */
export const GameHud = ({ game, scene, send }: {
  game: GameView;
  scene: RoomGame | null;
  send: (message: ClientMessage) => void;
}) => {
  const [now, setNow] = useState(() => Date.now());
  const revealing = game.kind === "rps" && game.result !== null && scene?.kind === "rps" && scene.revealedAt !== null && now < scene.revealedAt + RPS_SHAKE_MS;
  // Tick only while the shakes last, so the HUD does not re-render for the rest of the game.
  useEffect(() => {
    if (!revealing) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [revealing]);
  const shaking = game.kind === "rps" && game.result !== null && (scene?.kind !== "rps" || scene.revealedAt === null || now < scene.revealedAt + RPS_SHAKE_MS);
  let status: string;
  if (game.kind === "connect4") {
    status = game.draw ? "Match nul." : game.winner !== null ? (game.winner === game.selfId ? "Gagné !" : "Perdu…") : game.turn === game.selfId ? "À toi : déplace la souris, puis clique pour lâcher le jeton." : `${game.opponentName} joue…`;
  }
  else status = shaking ? "Pierre… feuille… ciseaux !" : game.result !== null ? RESULTS[game.result] : game.mine === null ? "Choisis avec 1, 2 ou 3, ou clique ci-dessous." : "Choix enregistré. Ton adversaire réfléchit…";

  return (
    <section className="plate game-hud" aria-label={game.kind === "connect4" ? "Puissance 4" : "Pierre-feuille-ciseaux"}>
      <p className="game-hud-title">{`${game.kind === "connect4" ? "Puissance 4" : "Pierre-feuille-ciseaux"} · ${game.opponentName}`}</p>
      <p role="status">{status}</p>
      <div className="game-hud-actions">
        {game.kind === "rps" && game.mine === null && PICKS.map(({ pick, label }, index) => (
          <GameButton key={pick} variant="secondary" onClick={() => send({ type: "rps-pick", pick })}>{`${String(index + 1)} · ${label}`}</GameButton>
        ))}
        <GameButton variant="neutral" onClick={() => send({ type: "quit-game" })}>Échap · Quitter</GameButton>
      </div>
    </section>
  );
};

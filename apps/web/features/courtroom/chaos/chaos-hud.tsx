"use client";

import type { Aim } from "../player-controller";
import type { Toast } from "@/features/courtroom/use-room-socket";
import type { Challenge, GameView, RoomGame } from "@tribunal/bot/room/chaos";
import type { ClientMessage } from "@tribunal/bot/room/protocol";
import type { PlayerState } from "@tribunal/bot/room/world";
import type { RefObject } from "react";
import { EmojiText } from "../emoji-text";
import { GameHud } from "./game-hud";
import { GameButton, GameDialog } from "@/components/game-ui";

const GAME_NAMES: Record<Challenge["game"], string> = {
  rps: "Pierre-feuille-ciseaux",
  connect4: "Puissance 4",
};
/** Keys of the chaos actions on the member you look at */
const TARGET_HINTS = [
  ["2", "Rumeur"],
  ["3", "Pierre-feuille-ciseaux"],
  ["4", "Puissance 4"],
  ["5", "Baston"],
] as const;

type ChaosHudProps = {
  target: PlayerState | null;
  canMakeChaos: boolean;
  aim: Aim;
  gaugeRef: RefObject<HTMLElement | null>;
  toasts: Toast[];
  challenge: Challenge | null;
  onChallengeAnswered: () => void;
  game: GameView | null;
  roomGame: RoomGame | null;
  send: (message: ClientMessage) => void;
};

/** Chaos in the audience: the actions on the member you look at, rumors and refusals, challenges and the games themselves */
export const ChaosHud = ({ target, canMakeChaos, aim, gaugeRef, toasts, challenge, onChallengeAnswered, game, roomGame, send }: ChaosHudProps) => {
  const answer = (accept: boolean) => {
    send({
      type: "answer-challenge",
      accept,
    });
    onChallengeAnswered();
  };

  return (
    <>
      {toasts.length > 0 && (
        <ul className="chaos-toasts" aria-live="polite">
          {toasts.map((toast) => (
            <li key={toast.at} className="plate notice">
              <EmojiText>{toast.text}</EmojiText>
            </li>
          ))}
        </ul>
      )}

      {challenge !== null && game === null && (
        <GameDialog
          size="compact"
          title={GAME_NAMES[challenge.game]}
          actions={(
            <>
              <GameButton variant="success" onClick={() => answer(true)}>
                Accepter
              </GameButton>
              <GameButton variant="neutral" onClick={() => answer(false)}>
                Refuser
              </GameButton>
            </>
          )}
        >
          <p>{`${challenge.fromName} te défie !`}</p>
        </GameDialog>
      )}

      {game !== null && <GameHud game={game} scene={roomGame} send={send} />}

      {aim !== "none" && (
        <>
          <ul className="hints aim-hints">
            <li className="hint">
              <kbd>Clic droit</kbd>
              Viser
            </li>
            <li className="hint">
              <kbd>Clic gauche</kbd>
              Lancer
            </li>
          </ul>
          {aim === "aiming" && (
            <div className="aim-crosshair" aria-hidden="true">
              <span className="aim-gauge">
                <i ref={gaugeRef} />
              </span>
            </div>
          )}
        </>
      )}

      {canMakeChaos && target !== null && game === null && (
        <section className="plate panel chaos-actions" aria-label={`Actions sur ${target.name}`}>
          <span className="plate badge">{target.name}</span>
          <ul className="hints">
            {TARGET_HINTS.map(([key, label]) => (
              <li key={key} className="hint">
                <kbd>{key}</kbd>
                {label}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

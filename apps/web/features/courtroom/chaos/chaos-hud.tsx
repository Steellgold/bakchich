"use client";

import type { Toast } from "@/features/courtroom/use-room-socket";
import type { Challenge, GameView, RpsPick } from "@tribunal/bot/room/chaos";
import type { ClientMessage } from "@tribunal/bot/room/protocol";
import type { PlayerState } from "@tribunal/bot/room/world";
import { EmojiText } from "../emoji-text";
import { GameButton, GameDialog } from "@/components/game-ui";
import { CONNECT4_COLUMNS, CONNECT4_ROWS } from "@tribunal/bot/room/chaos";

const GAME_NAMES: Record<Challenge["game"], string> = {
  rps: "Pierre-feuille-ciseaux",
  connect4: "Puissance 4",
};
const PICKS: {
  pick: RpsPick;
  label: string;
}[] = [
  {
    pick: "rock",
    label: "Pierre",
  },
  {
    pick: "paper",
    label: "Feuille",
  },
  {
    pick: "scissors",
    label: "Ciseaux",
  },
];
const PICK_LABELS: Record<RpsPick, string> = {
  rock: "Pierre",
  paper: "Feuille",
  scissors: "Ciseaux",
};
const RPS_RESULTS = {
  won: "Gagné !",
  lost: "Perdu…",
  draw: "Égalité.",
} as const;

/** Keys of the chaos actions on the member you look at */
const TARGET_HINTS = [
  ["1", "Tomate"],
  ["2", "Rumeur"],
  ["3", "Pierre-feuille-ciseaux"],
  ["4", "Puissance 4"],
  ["5", "Baston"],
] as const;

const RpsPanel = ({ game, send }: {
  game: Extract<
    GameView,
    {
      kind: "rps";
    }
  >;
  send: (message: ClientMessage) => void;
}) => {
  if (game.result !== null && game.mine !== null && game.theirs !== null) {
    return (
      <p>{`${PICK_LABELS[game.mine]} contre ${PICK_LABELS[game.theirs]} : ${RPS_RESULTS[game.result]}`}</p>
    );
  }
  if (game.mine !== null) return (
    <p>{`Tu as joué ${PICK_LABELS[game.mine]}. ${game.opponentName} réfléchit…`}</p>
  );

  return (
    <div className="chaos-picks">
      {PICKS.map(({ pick, label }) => (
        <GameButton
          key={pick}
          variant="secondary"
          onClick={() => send({
            type: "rps-pick",
            pick,
          })}
        >
          {label}
        </GameButton>
      ))}
    </div>
  );
};

const Connect4Panel = ({ game, send }: {
  game: Extract<
    GameView,
    {
      kind: "connect4";
    }
  >;
  send: (message: ClientMessage) => void;
}) => {
  const over = game.winner !== null || game.draw;
  let status = game.turn === game.selfId ? "À toi de jouer." : `${game.opponentName} joue…`;
  if (game.draw) status = "Match nul.";
  else if (game.winner !== null) status = game.winner === game.selfId ? "Gagné !" : "Perdu…";

  return (
    <>
      <div className="connect4" role="grid" aria-label="Grille de Puissance 4">
        {Array.from({ length: CONNECT4_COLUMNS }, (_column, column) => (
          <button
            // A column is a stable slot of the grid:
            key={`column-${String(column)}`}
            type="button"
            className="connect4-column"
            disabled={over || game.turn !== game.selfId}
            aria-label={`Colonne ${String(column + 1)}`}
            onClick={() => send({
              type: "connect4-drop",
              column,
            })}
          >
            {Array.from({ length: CONNECT4_ROWS }, (_row, row) => {
              const cell = game.board[column]?.[CONNECT4_ROWS - 1 - row] ?? null;
              const owner = cell === null ? "" : cell === game.selfId ? " is-mine" : " is-theirs";
              return <span key={`cell-${String(row)}`} className={`connect4-cell${owner}`} />;
            })}
          </button>
        ))}
      </div>
      <p>{status}</p>
    </>
  );
};

type ChaosHudProps = {
  target: PlayerState | null;
  canMakeChaos: boolean;
  toasts: Toast[];
  challenge: Challenge | null;
  onChallengeAnswered: () => void;
  game: GameView | null;
  send: (message: ClientMessage) => void;
};

/** Chaos in the audience: the actions on the member you look at, rumors and refusals, challenges and the games themselves */
export const ChaosHud = ({ target, canMakeChaos, toasts, challenge, onChallengeAnswered, game, send }: ChaosHudProps) => {
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

      {game !== null && (
        <GameDialog
          size="compact"
          title={`${game.kind === "rps" ? "Pierre-feuille-ciseaux" : "Puissance 4"} contre ${game.opponentName}`}
          actions={(
            <GameButton variant="neutral" onClick={() => send({ type: "quit-game" })}>
              Quitter
            </GameButton>
          )}
        >
          {game.kind === "rps" ? <RpsPanel game={game} send={send} /> : <Connect4Panel game={game} send={send} />}
        </GameDialog>
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

"use client";

import { GameButton, GameDialog } from "@/components/game-ui";
import { activityRoomUrl, isDiscordActivity, signInActivity } from "@/features/activity/discord-activity";
import { attempt } from "@/lib/attempt";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Where the page is served never changes while it is open */
const subscribeToNothing = () => () => undefined;

const RoomClient = dynamic(async () => (await import("@/features/courtroom/room-client")).RoomClient, { ssr: false });

/** The site only lives inside the Discord Activity: anywhere else it shows nothing */
export const HomeClient = ({ clientId }: {
  clientId: string;
}) => {
  // The hostname is only known in the browser: the server render (and the first browser render) is empty everywhere.
  const inActivity = useSyncExternalStore(
    subscribeToNothing,
    () => isDiscordActivity(clientId),
    () => false,
  );
  const [activityToken, setActivityToken] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const connect = useCallback(async () => {
    setError(false);
    const result = await attempt(async () => signInActivity(clientId));
    if (result.ok) setActivityToken(result.value);
    else setError(true);
  }, [clientId]);

  useEffect(() => {
    if (inActivity) void connect();
  }, [inActivity, connect]);

  if (!inActivity) return null;
  if (activityToken !== null) return <RoomClient url={activityRoomUrl()} token={activityToken} />;

  return (
    <main className="screen">
      <Image className="screen-logo" src="/assets/ui/logo.webp" alt="" width={180} height={180} priority unoptimized />
      <GameDialog
        title="Tribunal du Royaume"
        emblem={null}
        subtitle={<span className="plate badge">Justice 100% corrompue</span>}
        actions={
          error && (
            <GameButton
              variant="primary"
              onClick={() => {
                void connect();
              }}
            >
              Réessayer
            </GameButton>
          )
        }
      >
        {error ? (
          <p className="plate notice notice-error" role="alert">
            Impossible de se connecter à Discord. Réessaie.
          </p>
        ) : (
          <p>Connexion à la salle d'audience…</p>
        )}
      </GameDialog>
    </main>
  );
};

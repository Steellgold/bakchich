"use client";

import { GameButton, GameDialog } from "@/components/game-ui";
import { attempt } from "@/lib/attempt";
import { authClient } from "@/lib/auth-client";
import { activityRoomUrl, isDiscordActivity, signInActivity } from "@/lib/discord-activity";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

const RoomClient = dynamic(async () => (await import("./room/room-client")).RoomClient, { ssr: false });

export const HomeClient = ({ clientId, signedIn }: { clientId: string; signedIn: boolean }) => {
  const router = useRouter();
  const [activityToken, setActivityToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setPending(true);
    setError(null);

    const result = await attempt(async () => {
      if (isDiscordActivity(clientId)) {
        setActivityToken(await signInActivity(clientId));
        return;
      }
      if (signedIn) {
        router.push("/room");
        return;
      }
      const response = await authClient.signIn.social({ provider: "discord", callbackURL: "/room" });
      if (response.error !== null) throw new Error("La connexion à Discord a échoué.");
    });
    if (!result.ok) {
      setPending(false);
      setError("Impossible de se connecter à Discord. Réessaie.");
    }
  };

  if (activityToken !== null) return <RoomClient url={activityRoomUrl()} token={activityToken} />;

  return (
    <main className="screen">
      <Image className="screen-logo" src="/assets/ui/logo.webp" alt="" width={180} height={180} priority unoptimized />
      <GameDialog
        title="Tribunal du Royaume"
        emblem={null}
        subtitle={<span className="plate badge">Justice 100% corrompue</span>}
        actions={(
          <GameButton
            variant="primary"
            loading={pending}
            onClick={() => {
              void connect();
            }}
          >
            {pending ? "Connexion en cours…" : signedIn ? "Entrer dans la salle d'audience" : "Se connecter avec Discord"}
          </GameButton>
        )}
      >
        <p>La cour est corrompue, le juge aussi. Entrez, asseyez-vous, votez.</p>
        {error !== null && <p className="plate notice notice-error" role="alert">{error}</p>}
      </GameDialog>
    </main>
  );
};

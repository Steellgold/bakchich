"use client";

import { attempt } from "@/lib/attempt";
import { authClient } from "@/lib/auth-client";
import { activityRoomUrl, isDiscordActivity, signInActivity } from "@/lib/discord-activity";
import dynamic from "next/dynamic";
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
    <main className="home">
      <div className="card">
        <div className="gavel">🔨</div>
        <h1>Tribunal du Royaume</h1>
        <span className="sticker">Justice 100% corrompue</span>
        <p>La cour est corrompue, le juge aussi. Entrez, asseyez-vous, votez.</p>
        <button
          type="button"
          className="button"
          disabled={pending}
          onClick={() => {
            void connect();
          }}
        >
          {pending ? "Connexion en cours…" : signedIn ? "Entrer dans la salle d'audience" : "Se connecter avec Discord"}
        </button>
        {error !== null && <p role="alert">{error}</p>}
      </div>
    </main>
  );
};

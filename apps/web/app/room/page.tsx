import { RoomClient } from "@/components/room/room-client";
import { auth } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const RoomPage = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) redirect("/");

  // Read at runtime so one Docker image works for any domain:
  return <RoomClient url={requireEnv("ROOM_WS_URL")} />;
};

export default RoomPage;

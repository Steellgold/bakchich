import { ImageResponse } from "next/og";

// Thumbnail of the bot's trial panels when several members are accused: up to four avatars in a grid, or three and « +N ».
const SIZE = 256;
const GAP = 8;
const CELL = (SIZE - GAP) / 2;
const MAX_AVATARS = 4;
const AVATAR_HOST = "https://cdn.discordapp.com/";

const cellStyle = {
  width: CELL,
  height: CELL,
  borderRadius: 18,
} as const;

export const GET = (request: Request) => {
  const params = new URL(request.url).searchParams;
  // Only Discord avatars: the route must never fetch arbitrary URLs.
  const avatars = params
    .getAll("u")
    .filter((url) => url.startsWith(AVATAR_HOST))
    .slice(0, MAX_AVATARS);
  const more = Math.max(0, Math.min(99, Number.parseInt(params.get("more") ?? "0", 10) || 0));

  if (avatars.length === 0) return new Response("No avatar", { status: 400 });

  const shown = more > 0 ? avatars.slice(0, MAX_AVATARS - 1) : avatars;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignContent: "center",
        gap: GAP,
        width: SIZE,
        height: SIZE,
      }}
    >
      {shown.map((url) => (
        // ImageResponse (Satori) only draws plain <img> elements:
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" style={cellStyle} />
      ))}
      {more > 0 && (
        <div
          style={{
            ...cellStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Readable on both Discord themes:
            background: "#3b2252",
            color: "#ffffff",
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {`+${String(more)}`}
        </div>
      )}
    </div>,
    {
      width: SIZE,
      height: SIZE,
    },
  );
};

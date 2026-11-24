import { EMOJI } from "@tribunal/bot/emojis";

/** Serve CDN emoji images through the Activity's mapped origin. */
export const GET = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!Object.values(EMOJI).some((emoji) => emoji.endsWith(`:${id}>`))) return new Response(null, { status: 404 });

  const image = await fetch(`https://cdn.discordapp.com/emojis/${id}.webp?size=32&quality=lossless`, {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(5_000),
  });
  if (!image.ok) return new Response(null, { status: 502 });

  return new Response(image.body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=86400",
    },
  });
};

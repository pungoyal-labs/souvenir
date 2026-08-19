import { getSession } from "@/lib/auth";
import { getAvatar } from "@/lib/data";

// Serves uploaded profile pictures. The game is private, so avatars are too:
// no session, no bytes. URLs carry a ?v= stamp (components render them via
// avatarSrc), so the response can be cached hard.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  const avatar = await getAvatar(id);
  if (!avatar) return new Response("No avatar.", { status: 404 });
  return new Response(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { getSession } from "@/lib/auth";
import { pair } from "@/lib/env";
import { logger } from "@/lib/logger";
import { SpeechError, say, speakEnabled } from "@/lib/speech";
import { MAX_UTTERANCE, type Side, speakerOf } from "@/lib/talk";

/**
 * Words in, a spoken clip back, for the phones with no local voice installed.
 *
 * Streamed straight to the tab that asked and never stored — the response is
 * played through an <audio> element and dropped. Nothing here offers a
 * download: a voice note in this app is something you hold out to someone, not
 * a file you keep.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  if (!speakEnabled) return new Response("No voice service is configured.", { status: 503 });

  const body: unknown = await request.json().catch(() => null);
  const asked = body as { text?: unknown; side?: unknown } | null;
  const text = typeof asked?.text === "string" ? asked.text.trim() : "";
  if (!text) return new Response("Nothing to say.", { status: 400 });
  // Which language the words are in, so a cross-lingual voice reads them right.
  // The browser says only which side is speaking; which language that is stays
  // deployment configuration, the same trade interpretAction makes.
  const side: Side = asked?.side === "them" ? "them" : "us";

  try {
    const spoken = await say(text.slice(0, MAX_UTTERANCE), speakerOf(pair, side).language);
    return new Response(spoken.bytes, {
      headers: {
        "Content-Type": spoken.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof SpeechError) return new Response(err.message, { status: 502 });
    logger.error({ err }, "speech route failed");
    return new Response("Couldn't say that out loud.", { status: 500 });
  }
}

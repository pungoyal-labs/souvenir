// A voice, for the phones that have none.
//
// The talk page speaks with the device's own voice first: free, instant, no
// network. Some phones have no voice for the local language at all, and this
// is the rung below — any OpenAI-compatible `/audio/speech`, or MiniMax's
// `/v1/t2a_v2`, whichever the deploy already has a key for. Plain fetch rather
// than a vendor SDK, the same trade lib/llm.ts makes in the other direction.
//
// Listening has no equivalent here: the browser's recogniser is the only one
// there is, and where it is missing the page says so and offers typing.
//
// Nothing is written down. The clip is streamed back to the tab that asked for
// it and dropped.

import { env } from "./env.ts";
import { logger } from "./logger.ts";
import type { Side } from "./talk.ts";

/** Configured or not. The page asks before it offers anything that needs this. */
export const speakEnabled = Boolean(env.SPEECH_BASE_URL && env.SPEECH_API_KEY);

export class SpeechError extends Error {}

function base(): string {
  return (env.SPEECH_BASE_URL ?? "").replace(/\/+$/, "");
}

/**
 * Words in, a spoken clip out, for the phones with no voice of their own.
 * Returned as bytes for the caller to stream straight through — it is played
 * once and forgotten, never saved and never offered as a file.
 *
 * Two shapes, because the obvious endpoint to point this at is the one whose
 * key the deploy already has. `language` is the pair's own name for it —
 * "Thai", "English" — passed on where the vendor can use it: a cross-lingual
 * voice needs telling which language the text is in, and told wrongly it reads
 * Thai with an English mouth. Naming it rather than coding it keeps this file
 * out of the business of knowing where the group is.
 *
 * `side` is which of the two is talking, and only that: which voice each side
 * gets is configuration, so a deploy that moves somewhere else changes an
 * env var rather than this file. The `openai` flavor has one voice for both,
 * having no way to tell them apart.
 */
export async function say(
  text: string,
  language: string,
  side: Side,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!speakEnabled) throw new SpeechError("No voice service is configured.");
  return env.SPEECH_FLAVOR === "minimax" ? sayMiniMax(text, language, side) : sayOpenAi(text);
}

async function sayOpenAi(text: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const response = await fetch(`${base()}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SPEECH_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.SPEECH_TTS_MODEL,
      voice: env.SPEECH_TTS_VOICE,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    logger.error({ status: response.status, body: await safeBody(response) }, "speech failed");
    throw new SpeechError("Couldn't say that out loud.");
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

/** Voice and delivery for one side. Pitch is in semitones, speed a multiplier. */
function voiceFor(side: Side): { voice_id: string; speed: number; vol: number; pitch: number } {
  return side === "them"
    ? {
        voice_id: env.SPEECH_VOICE_THEM,
        speed: env.SPEECH_VOICE_THEM_SPEED,
        vol: 1,
        pitch: env.SPEECH_VOICE_THEM_PITCH,
      }
    : { voice_id: env.SPEECH_VOICE_US, speed: 0.95, vol: 1, pitch: 0 };
}

/**
 * MiniMax T2A: the non-streaming HTTP one, not the websocket. The websocket
 * exists to start playing a long passage before it is finished, and nothing
 * here is longer than a sentence — one request is simpler and no slower for
 * that. The audio comes back hex-encoded inside JSON rather than as a body,
 * which is the whole reason this is a separate function.
 */
async function sayMiniMax(
  text: string,
  language: string,
  side: Side,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  // Some accounts still key the request by group on the query string.
  const url = new URL(`${base()}/v1/t2a_v2`);
  if (env.SPEECH_GROUP_ID) url.searchParams.set("GroupId", env.SPEECH_GROUP_ID);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SPEECH_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.SPEECH_TTS_MODEL,
      text,
      stream: false,
      // Cross-lingual voices need to be told; Thai read as English is noise.
      language_boost: language,
      voice_setting: voiceFor(side),
      audio_setting: { format: "mp3", sample_rate: 32000, bitrate: 128000, channel: 1 },
    }),
  });
  if (!response.ok) {
    logger.error({ status: response.status, body: await safeBody(response) }, "speech failed");
    throw new SpeechError("Couldn't say that out loud.");
  }

  const parsed: unknown = await response.json();
  const audio = (parsed as { data?: { audio?: unknown } }).data?.audio;
  if (typeof audio !== "string" || audio.length === 0) {
    // A refusal here arrives as HTTP 200 with an error in the envelope.
    logger.error({ body: JSON.stringify(parsed).slice(0, 500) }, "speech returned no audio");
    throw new SpeechError("Couldn't say that out loud.");
  }
  const bytes = Buffer.from(audio, "hex");
  return {
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    contentType: "audio/mpeg",
  };
}

/** Error bodies are for the log, and must never take the request down with them. */
async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "(unreadable)";
  }
}

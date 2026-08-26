// A voice, for the phones that have none.
//
// The talk page speaks with the device's own voice first: free, instant, no
// network. Some phones have no voice for the local language at all, and this
// is the rung below — MiniMax's `/v1/t2a_v2`, the same key that drives
// lib/llm.ts, so the group pays one vendor. Plain fetch rather than a vendor
// SDK, the same trade lib/llm.ts makes in the other direction.
//
// Listening has no equivalent here: the browser's recogniser is the only one
// there is, and where it is missing the page says so and offers typing.
//
// Nothing is written down. The clip is streamed back to the tab that asked for
// it and dropped.

import { env } from "./env.ts";
import { logger } from "./logger.ts";
import { type Side, type Speaker, serverVoices } from "./talk.ts";

/** Configured or not. The page asks before it offers anything that needs this. */
export const speakEnabled = Boolean(env.SPEECH_BASE_URL && env.SPEECH_API_KEY);

export class SpeechError extends Error {}

/** The language a voice is wanted for, and only that: code and name. */
export type Spoken = Pick<Speaker, "code" | "language">;

const VOICES = serverVoices(env.SPEECH_VOICES);

/**
 * The configured voice for a language, or null when the deploy has none: the
 * language's own entry first, then the side's fallback. The local side has no
 * default on purpose — one deploy serves trips to many places, and no voice is
 * the local one everywhere.
 */
function voiceIdFor(spoken: Spoken, side: Side): string | null {
  return (
    VOICES[spoken.code.toLowerCase()] ??
    (side === "them" ? env.SPEECH_VOICE_THEM : env.SPEECH_VOICE_US) ??
    null
  );
}

/**
 * The languages MiniMax lets a request name. Told one it doesn't know, the
 * service refuses the whole request; told `auto`, it guesses from the text,
 * which for a sentence in its own script is right. This is the vendor's list,
 * not ours: a destination whose language is missing here still speaks, and
 * `pnpm speech:check` is how to hear whether it speaks well.
 */
const BOOSTS = new Set([
  "Chinese",
  "Chinese,Yue",
  "English",
  "Arabic",
  "Russian",
  "Spanish",
  "French",
  "Portuguese",
  "German",
  "Turkish",
  "Dutch",
  "Ukrainian",
  "Vietnamese",
  "Indonesian",
  "Japanese",
  "Italian",
  "Korean",
  "Thai",
  "Polish",
  "Romanian",
  "Greek",
  "Czech",
  "Finnish",
  "Hindi",
  "Bulgarian",
  "Danish",
  "Hebrew",
  "Malay",
  "Persian",
  "Slovak",
  "Swedish",
  "Croatian",
  "Filipino",
  "Hungarian",
  "Norwegian",
  "Slovenian",
  "Catalan",
  "Nynorsk",
  "Tamil",
  "Afrikaans",
]);

/** Whether the server can say this language for this side. */
export function canSay(spoken: Spoken, side: Side): boolean {
  return speakEnabled && voiceIdFor(spoken, side) !== null;
}

/** Voice and delivery for one side. Pitch is in semitones, speed a multiplier. */
function voiceFor(
  spoken: Spoken,
  side: Side,
): { voice_id: string; speed: number; vol: number; pitch: number } {
  const voice_id = voiceIdFor(spoken, side);
  if (!voice_id) throw new SpeechError(`No ${spoken.language} voice is configured.`);
  return side === "them"
    ? { voice_id, speed: env.SPEECH_VOICE_THEM_SPEED, vol: 1, pitch: env.SPEECH_VOICE_THEM_PITCH }
    : { voice_id, speed: 0.95, vol: 1, pitch: 0 };
}

/**
 * Words in, a spoken clip out, for the phones with no voice of their own.
 * Returned as bytes for the caller to stream straight through — it is played
 * once and forgotten, never saved and never offered as a file.
 *
 * `spoken` is the pair's own name and code for the language — a cross-lingual
 * voice needs telling which language the text is in, and told wrongly it reads
 * one language with another's mouth. Taking it from the caller keeps this
 * file out of the business of knowing where the group is. `side` is which of
 * the two is talking, and only that: which voice says which language is
 * configuration (`SPEECH_VOICES`), so a new destination changes an env var.
 *
 * The non-streaming HTTP call, not the websocket: that exists to start playing
 * a long passage before it is finished, and nothing here is longer than a
 * sentence. The audio comes back hex-encoded inside JSON rather than as a body.
 */
export async function say(
  text: string,
  spoken: Spoken,
  side: Side,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!speakEnabled) throw new SpeechError("No voice service is configured.");
  const voice_setting = voiceFor(spoken, side);
  // Some accounts still key the request by group on the query string.
  const url = new URL(`${(env.SPEECH_BASE_URL ?? "").replace(/\/+$/, "")}/v1/t2a_v2`);
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
      // Cross-lingual voices need to be told; one language read as another is noise.
      language_boost: BOOSTS.has(spoken.language) ? spoken.language : "auto",
      voice_setting,
      audio_setting: { format: "mp3", sample_rate: 32000, bitrate: 128000, channel: 1 },
    }),
    signal: AbortSignal.timeout(20_000),
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

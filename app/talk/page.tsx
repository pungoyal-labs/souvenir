import { Talk } from "@/components/talk";
import { listPhrases } from "@/lib/data";
import { pair } from "@/lib/env";
import { lingoOf } from "@/lib/lingo";
import { llmEnabled } from "@/lib/llm";
import { requireMember } from "@/lib/session";
import { speakEnabled } from "@/lib/speech";

/**
 * The one page in this app pointed at somebody who is not in the group.
 *
 * Nothing it does is recorded on its own: no turn, no clip, no transcript. The
 * conversation lives in the tab and ends with it, which is the only sensible
 * lifetime for a stranger's words.
 *
 * The exception is deliberate and is the member's, not the app's — a phrase
 * they pointed at and named is kept, and comes back with the page so it can be
 * said again without being asked for again.
 */
export default async function TalkPage() {
  const me = await requireMember();
  const t = lingoOf(me.lingo);
  const phrases = await listPhrases(me.id);
  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">{pair.them.language}</p>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">
        {t.talkTitle(pair.them.language)}
      </h1>
      <p className="mb-6 mt-1 text-sm text-soft">{t.talkSub(pair.them.language)}</p>
      <Talk
        pair={pair}
        canInterpret={llmEnabled}
        serverSpeaks={speakEnabled}
        phrases={phrases}
        phrasebookHeading={t.phrasebookHeading}
      />
    </div>
  );
}

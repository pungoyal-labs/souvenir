import { Talk } from "@/components/talk";
import { pair } from "@/lib/env";
import { lingoOf } from "@/lib/lingo";
import { llmEnabled } from "@/lib/llm";
import { requireMember } from "@/lib/session";
import { speakEnabled } from "@/lib/speech";

/**
 * The one page in this app pointed at somebody who is not in the group.
 *
 * Nothing it does is recorded: no turn, no clip, no transcript. The
 * conversation lives in the tab and ends with it, which is the only sensible
 * lifetime for a stranger's words and the reason there is no table behind it.
 */
export default async function TalkPage() {
  const me = await requireMember();
  const t = lingoOf(me.lingo);
  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">{pair.them.language}</p>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">
        {t.talkTitle(pair.them.language)}
      </h1>
      <p className="mb-6 mt-1 text-sm text-soft">{t.talkSub(pair.them.language)}</p>
      <Talk pair={pair} canInterpret={llmEnabled} serverSpeaks={speakEnabled} />
    </div>
  );
}

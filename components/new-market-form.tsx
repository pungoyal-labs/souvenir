"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createMarketAction, polishAction } from "@/app/actions";
import type { PolishedDraft } from "@/lib/llm";

export function NewMarketForm({
  polishAvailable,
  llmModel,
}: {
  polishAvailable: boolean;
  llmModel: string;
}) {
  const router = useRouter();
  const [publishing, startPublish] = useTransition();
  const [polishing, startPolish] = useTransition();

  const [question, setQuestion] = useState("");
  const [criteria, setCriteria] = useState("");
  const [suggestion, setSuggestion] = useState<PolishedDraft | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  const polish = () =>
    startPolish(async () => {
      setError(null);
      const res = await polishAction(question, criteria, feedback);
      if (!res.ok || !res.draft) {
        setError(res.error ?? "Polish failed.");
      } else {
        setSuggestion(res.draft);
        setFeedback("");
      }
    });

  const publish = () =>
    startPublish(async () => {
      setError(null);
      const res = await createMarketAction(question, criteria);
      if (!res.ok || !res.marketId) {
        setError(res.error ?? "Couldn't publish.");
      } else {
        router.push(`/market/${res.marketId}`);
      }
    });

  const busy = publishing || polishing;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-soft">
          The prediction
        </span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={200}
          placeholder="Will there be more than 5 leaves in the swimming pool at 8 PM?"
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-lg"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-soft">
          How you'll resolve it
        </span>
        <textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="I'll count the leaves floating on the surface at 8:00 PM tonight, photo as evidence. 6 or more resolves YES; 5 or fewer resolves NO. If the pool gets cleaned before then, I'll void it."
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm"
        />
      </label>

      {polishAvailable && (
        <div className="rounded-lg border border-dashed border-felt/40 bg-felt-tint/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold">Tighten it up?</span>{" "}
              <span className="text-soft">
                {llmModel} can sharpen the wording and criteria before your friends see it.
              </span>
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={polish}
              className="shrink-0 rounded-md border border-felt px-3 py-1.5 text-sm font-semibold text-felt hover:bg-felt hover:text-white disabled:opacity-40"
            >
              {polishing ? "Polishing…" : suggestion ? "Polish again" : "Polish draft"}
            </button>
          </div>

          {suggestion && (
            <div className="mt-3 rounded-md border border-line bg-surface p-3">
              <p className="display text-lg font-bold leading-snug">{suggestion.question}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{suggestion.criteria}</p>
              <p className="mt-2 text-xs italic text-soft">{suggestion.rationale}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setQuestion(suggestion.question);
                    setCriteria(suggestion.criteria);
                    setSuggestion(null);
                  }}
                  className="rounded-md bg-felt px-3 py-1.5 text-sm font-semibold text-white hover:bg-felt-deep"
                >
                  Use this version
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSuggestion(null)}
                  className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                >
                  Keep mine
                </button>
                <input
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell it what to change, then polish again"
                  className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={publish}
        className="display w-full rounded-md bg-felt py-3 text-xl font-bold uppercase text-white hover:bg-felt-deep disabled:opacity-40"
      >
        {publishing ? "Publishing…" : "Publish to the group"}
      </button>

      {error && <p className="text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}

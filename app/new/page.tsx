import { NewMarketForm } from "@/components/new-market-form";
import { env } from "@/lib/env";
import { llmEnabled } from "@/lib/llm";
import { requireMember } from "@/lib/session";

export default async function NewMarketPage() {
  await requireMember();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">
        Stick your neck out
      </h1>
      <p className="mt-1 text-sm text-soft">
        One binary question. Say exactly how you'll decide YES or NO — you're the one who resolves
        it, and the criteria go on the permanent record. Everyone can bet up to{" "}
        {env.MAX_STAKE_UNITS} units on either side.
      </p>
      <div className="mt-5">
        <NewMarketForm polishAvailable={llmEnabled} />
      </div>
    </div>
  );
}

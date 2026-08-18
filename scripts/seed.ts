// Demo data for local development: a few members, open markets with positions,
// and settled history so every screen has something to show.
// Run with: npm run seed   (uses .env; run migrations first)

import { createMarket, ensureMember, placeBet, resolveMarket, switchSides } from "../lib/data.ts";

async function main() {
  const mk = async (email: string, name: string) => {
    const m = await ensureMember(email, name, null, { bypassAllowlist: true });
    if (!m) throw new Error(`could not create ${email}`);
    return m;
  };

  const priya = await mk("priya@example.com", "Priya");
  const arjun = await mk("arjun@example.com", "Arjun");
  const mei = await mk("mei@example.com", "Mei");
  const tom = await mk("tom@example.com", "Tom");

  // Settled market 1: leaves in the pool.
  const leaves = await createMarket(
    priya.id,
    "Will there be more than 5 leaves in the swimming pool at 8 PM?",
    "I count the leaves floating on the surface at 8:00 PM tonight, photo as evidence. 6 or more resolves YES; 5 or fewer resolves NO.",
  );
  await placeBet(priya.id, leaves, "yes", 4);
  await placeBet(arjun.id, leaves, "no", 6);
  await placeBet(mei.id, leaves, "yes", 6);
  await placeBet(tom.id, leaves, "no", 4);
  await resolveMarket(
    leaves,
    priya.id,
    "yes",
    "Counted 9 leaves at 8:01 PM. Photo in the group chat.",
  );

  // Settled market 2: with a side switch and a loss for the switcher.
  const rain = await createMarket(
    arjun.id,
    "Will it rain in Pai before Sunday midnight?",
    "Any rain visible from the guesthouse balcony before Sunday 23:59 counts, however brief. I'm the observer.",
  );
  await placeBet(mei.id, rain, "yes", 8);
  await placeBet(tom.id, rain, "yes", 2);
  await placeBet(priya.id, rain, "no", 5);
  await switchSides(tom.id, rain);
  await resolveMarket(
    rain,
    arjun.id,
    "yes",
    "Downpour on Saturday afternoon. Tom switched at the worst moment.",
  );

  // Settled market 3: voided.
  const karaoke = await createMarket(
    mei.id,
    "Will Arjun sing more than three songs at karaoke on Friday?",
    "Full songs only, judged by me at closing time.",
  );
  await placeBet(priya.id, karaoke, "yes", 3);
  await placeBet(arjun.id, karaoke, "no", 3);
  await resolveMarket(
    karaoke,
    mei.id,
    "refunded",
    "Karaoke bar was closed for a private event. Void.",
  );

  // Open markets.
  const curry = await createMarket(
    tom.id,
    "Will the khao soi place have a queue longer than 10 people at 12:30 PM tomorrow?",
    "I'll count people physically standing in line at 12:30 PM sharp. 11+ resolves YES.",
  );
  await placeBet(tom.id, curry, "yes", 5);
  await placeBet(priya.id, curry, "no", 7);
  await placeBet(arjun.id, curry, "no", 3);

  const scooter = await createMarket(
    priya.id,
    "Will Mei's scooter start on the first kick on Monday morning?",
    "First attempt only, witnessed by at least one other member. Engine catching and staying on for 5 seconds counts.",
  );
  await placeBet(arjun.id, scooter, "yes", 2);

  await createMarket(
    mei.id,
    "Will anyone in the group swim in the river before the end of the trip?",
    "Full-body immersion in the Pai river, witnessed. Wading doesn't count.",
  );

  console.log("seeded demo group: priya@ / arjun@ / mei@ / tom@ (example.com)");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});

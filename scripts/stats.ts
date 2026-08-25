// The go-to-market numbers, derived straight from the database. Run with: pnpm stats

import { platformStats } from "../lib/data.ts";

async function main() {
  const s = await platformStats();
  const rate = s.invited ? ((100 * s.invitedThenFounded) / s.invited).toFixed(1) : "—";
  console.log(`members            ${s.members}`);
  console.log(`trips              ${s.trips}  (${s.tripsWithCompany} with ≥2 members)`);
  console.log(`mean roster        ${s.meanRoster.toFixed(1)}`);
  console.log(`invited → founded  ${s.invitedThenFounded} / ${s.invited}  (${rate}%)`);
  console.log(`sealed events      ${s.eventsSealed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

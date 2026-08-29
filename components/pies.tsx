import { fmtPies, stampsWord } from "@/lib/pies";

/** The perforated edge of the Souvenir mark, drawn as a path: a square whose
 *  sides are bitten by three half-circle punches each, with the middle cut out
 *  so the glyph reads as a frame at text weight. Notches go inward, so the
 *  shape stays inside its box next to a number. */
const STAMP =
  "M0.6 0.6h1.2a1 1 0 0 0 2 0h1.2a1 1 0 0 0 2 0h1.2a1 1 0 0 0 2 0h1.2" +
  "v1.2a1 1 0 0 0 0 2v1.2a1 1 0 0 0 0 2v1.2a1 1 0 0 0 0 2v1.2" +
  "h-1.2a1 1 0 0 0 -2 0h-1.2a1 1 0 0 0 -2 0h-1.2a1 1 0 0 0 -2 0h-1.2" +
  "v-1.2a1 1 0 0 0 0 -2v-1.2a1 1 0 0 0 0 -2v-1.2a1 1 0 0 0 0 -2v-1.2Z" +
  "M3.8 3.8V8.2H8.2V3.8Z";

/**
 * An amount with the stamp glyph — a tiny perforated stamp in the text color,
 * sized to the surrounding font. Screen readers get the word instead.
 */
export function Pies({ c, sign }: { c: number; sign?: boolean }) {
  return (
    <>
      {fmtPies(c, { sign })}
      <svg
        viewBox="0 0 12 12"
        width="0.72em"
        height="0.72em"
        aria-hidden="true"
        className="ml-[0.14em] inline-block align-[-0.04em]"
      >
        <path fill="currentColor" fillRule="evenodd" d={STAMP} />
      </svg>
      <span className="sr-only"> {stampsWord(c)}</span>
    </>
  );
}

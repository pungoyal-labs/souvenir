const PALETTE = ["#1f4a38", "#2b57a5", "#bd521c", "#7c4a8f", "#a97e22", "#3d6a73"];

function hue(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}

export function Avatar({
  name,
  image,
  size = 32,
}: {
  name: string;
  image: string | null;
  size?: number;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatars, no optimization needed
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        className="rounded-full"
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="display inline-flex items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, backgroundColor: hue(name), fontSize: size * 0.45 }}
      title={name}
    >
      {initials}
    </span>
  );
}

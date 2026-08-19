import { avatarSrc } from "@/lib/avatar";

const PALETTE = ["#1f4a38", "#2b57a5", "#bd521c", "#7c4a8f", "#a97e22", "#3d6a73"];

function hue(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}

export interface AvatarMember {
  id: string;
  name: string;
  image: string | null;
  avatarUpdatedAt: Date | null;
}

export function Avatar({ member, size = 32 }: { member: AvatarMember; size?: number }) {
  const src = avatarSrc(member);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatars, no optimization needed
      <img
        src={src}
        alt={member.name}
        width={size}
        height={size}
        className="rounded-full"
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = member.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="display inline-flex items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: hue(member.name),
        fontSize: size * 0.45,
      }}
      title={member.name}
    >
      {initials}
    </span>
  );
}

const FRAME_PALETTE = [
  ["Lilac Bloom", "A floral lavender portrait frame"],
  ["Moon Vine", "A pale vine and petal portrait frame"],
  ["Tidal Crest", "A curling blue-water portrait frame"],
  ["Orbit", "A jewel-toned planetary portrait frame"],
  ["Silver Tech", "A bright futuristic portrait frame"],
  ["Sunset Leaf", "A warm leaf-and-flame portrait frame"],
  ["Halo", "A polished metallic portrait frame"],
  ["Crimson Crest", "A red champion portrait frame"],
  ["Neon Circuit", "A cyan arcade portrait frame"],
  ["Amethyst", "A faceted violet portrait frame"],
  ["Golden Hour", "A gold ornamental portrait frame"],
  ["Rose Garden", "A rose-colored floral portrait frame"],
  ["Forest Rune", "A green rune portrait frame"],
  ["Frostline", "An icy blue portrait frame"],
  ["Solar Flare", "A bright orange solar portrait frame"],
  ["Night Sky", "A midnight constellation portrait frame"],
  ["Aqua Pearl", "A pearl and wave portrait frame"],
  ["Royal Guard", "A jewel-red regal portrait frame"],
  ["Prism", "A multicolor crystal portrait frame"],
  ["Shadow Gear", "A charcoal mechanical portrait frame"],
] as const;

export const PROFILE_FRAMES = [
  { id: "none", label: "Clean", description: "No frame", asset: null },
  ...Array.from({ length: 80 }, (_, index) => {
    const number = index + 1;
    const palette = FRAME_PALETTE[index % FRAME_PALETTE.length]!;
    return {
      id: `frame-${String(number).padStart(2, "0")}`,
      label: `${palette[0]} ${number}`,
      description: palette[1],
      asset: `frame-${String((index % FRAME_PALETTE.length) + 1).padStart(2, "0")}`,
    };
  }),
] as const;

export type ProfileFrameId = (typeof PROFILE_FRAMES)[number]["id"];

export const DEFAULT_PROFILE_FRAME: ProfileFrameId = "none";

export function normalizeProfileFrame(value: unknown): ProfileFrameId {
  const candidate = String(value ?? "").trim();
  return PROFILE_FRAMES.some((frame) => frame.id === candidate)
    ? (candidate as ProfileFrameId)
    : DEFAULT_PROFILE_FRAME;
}

export function profileFrameAsset(value: unknown): string | null {
  const frame = PROFILE_FRAMES.find((candidate) => candidate.id === normalizeProfileFrame(value));
  return frame?.asset ?? null;
}
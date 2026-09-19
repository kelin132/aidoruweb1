export const PROFILE_FRAMES = [
  { id: "none", label: "Clean", description: "No frame", asset: null },
  { id: "frame-01", label: "Butterfly Ink", description: "A monochrome butterfly and blossom frame", asset: "/profile-frames/frame-01.png" },
  { id: "frame-02", label: "Scarlet Anime", description: "A red anime portrait frame", asset: "/profile-frames/frame-02.png" },
  { id: "frame-03", label: "Moonlit Bloom", description: "A dark floral character frame", asset: "/profile-frames/frame-03.png" },
  { id: "frame-04", label: "Rose Halo", description: "A soft pink petal frame", asset: "/profile-frames/frame-04.png" },
  { id: "frame-05", label: "Solar Ember", description: "A glowing orange ember frame", asset: "/profile-frames/frame-05.png" },
  { id: "frame-06", label: "Dark Arcana", description: "A shadowed gothic portrait frame", asset: "/profile-frames/frame-06.png" },
  { id: "frame-07", label: "Azure Relic", description: "A blue ornamental character frame", asset: "/profile-frames/frame-07.png" },
  { id: "frame-08", label: "Starburst", description: "A high-contrast star and sparkle frame", asset: "/profile-frames/frame-08.png" },
  { id: "frame-09", label: "Lavender Rune", description: "A lilac character and rune frame", asset: "/profile-frames/frame-09.png" },
  { id: "frame-10", label: "Silver Filigree", description: "A silver ornamental frame", asset: "/profile-frames/frame-10.png" },
  { id: "frame-11", label: "Ivory Knight", description: "A pale character and star frame", asset: "/profile-frames/frame-11.png" },
  { id: "frame-12", label: "Bubble Noir", description: "A monochrome bubble frame", asset: "/profile-frames/frame-12.png" },
  { id: "frame-13", label: "Spider Crest", description: "A black crest and spider frame", asset: "/profile-frames/frame-13.png" },
  { id: "frame-14", label: "Kitty Rose", description: "A pink cat-ear frame", asset: "/profile-frames/frame-14.png" },
  { id: "frame-15", label: "Sapphire Sprite", description: "A blue character and ribbon frame", asset: "/profile-frames/frame-15.png" },
  { id: "frame-16", label: "Winter Lace", description: "An icy white lace frame", asset: "/profile-frames/frame-16.png" },
  { id: "frame-17", label: "Chrome Signal", description: "A black and white tech frame", asset: "/profile-frames/frame-17.png" },
  { id: "frame-18", label: "Berry Orbit", description: "A pink berry and vine frame", asset: "/profile-frames/frame-18.png" },
  { id: "frame-19", label: "Crystal Bow", description: "A crystalline silver bow frame", asset: "/profile-frames/frame-19.png" },
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
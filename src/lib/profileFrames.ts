export const PROFILE_FRAME_CATALOG = [
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
  { id: "frame-20", label: "Midnight Bloom", description: "A dark floral halo frame", asset: "/profile-frames/frame-20.png" },
  { id: "frame-21", label: "Ocean Crest", description: "A deep blue ornamental frame", asset: "/profile-frames/frame-21.png" },
  { id: "frame-22", label: "Black Rune", description: "A monochrome gothic rune frame", asset: "/profile-frames/frame-22.png" },
  { id: "frame-23", label: "Rose Garden", description: "A soft floral rose frame", asset: "/profile-frames/frame-23.png" },
  { id: "frame-24", label: "Starlit Audio", description: "A silver star and headset frame", asset: "/profile-frames/frame-24.png" },
  { id: "frame-25", label: "Crimson Lantern", description: "A lantern-lit crimson frame", asset: "/profile-frames/frame-25.png" },
  { id: "frame-26", label: "Ivory Lace", description: "A pale lace and flower frame", asset: "/profile-frames/frame-26.png" },
  { id: "frame-27", label: "Noir Halo", description: "A black-and-white portrait frame", asset: "/profile-frames/frame-27.png" },
  { id: "frame-28", label: "Cosmic Ring", description: "A blue cosmic orbit frame", asset: "/profile-frames/frame-28.png" },
  { id: "frame-29", label: "Pearl Garden", description: "A floral pearl frame", asset: "/profile-frames/frame-29.png" },
  { id: "frame-30", label: "Night Parade", description: "A black starry parade frame", asset: "/profile-frames/frame-30.png" },
  { id: "frame-31", label: "Moonlit Petals", description: "A white moonlit petal frame", asset: "/profile-frames/frame-31.png" },
  { id: "frame-32", label: "Scarlet Fan", description: "A red fan and blossom frame", asset: "/profile-frames/frame-32.png" },
  { id: "frame-33", label: "Sakura Mask", description: "A blossom and fox mask frame", asset: "/profile-frames/frame-33.png" },
  { id: "frame-34", label: "Anime Spark", description: "A monochrome anime sparkle frame", asset: "/profile-frames/frame-34.png" },
  { id: "frame-35", label: "Rose Portrait", description: "A romantic rose portrait frame", asset: "/profile-frames/frame-35.png" },
  { id: "frame-36", label: "Neon Charm", description: "A bright neon character frame", asset: "/profile-frames/frame-36.png" },
] as const;

// Keep the white-background and full-picture designs available for existing
// profiles, but stop offering them as new choices. The picker should favor
// open, transparent-looking frames that leave the avatar visible.
const RETIRED_PROFILE_FRAME_IDS = new Set([
  "frame-22",
  "frame-23",
  "frame-24",
  "frame-25",
  "frame-26",
  "frame-27",
  "frame-28",
  "frame-29",
  "frame-31",
  "frame-32",
  "frame-33",
  "frame-34",
  "frame-35",
]);

export const PROFILE_FRAMES = PROFILE_FRAME_CATALOG.filter(
  (frame) => !RETIRED_PROFILE_FRAME_IDS.has(frame.id),
);

export type ProfileFrameId = (typeof PROFILE_FRAME_CATALOG)[number]["id"];

export const DEFAULT_PROFILE_FRAME: ProfileFrameId = "none";

export function normalizeProfileFrame(value: unknown): ProfileFrameId {
  const candidate = String(value ?? "").trim();
  return PROFILE_FRAME_CATALOG.some((frame) => frame.id === candidate)
    ? (candidate as ProfileFrameId)
    : DEFAULT_PROFILE_FRAME;
}

export function profileFrameAsset(value: unknown): string | null {
  const frame = PROFILE_FRAME_CATALOG.find((candidate) => candidate.id === normalizeProfileFrame(value));
  return frame?.asset ?? null;
}
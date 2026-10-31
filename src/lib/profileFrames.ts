export const PROFILE_FRAME_CATALOG = [
  { id: "none", label: "Clean", description: "No frame", asset: null },
  { id: "frame-01", label: "Frost Dragon", description: "An icy dragon and deep-blue halo", asset: "/profile-frames/frame-01.png" },
  { id: "frame-02", label: "Snow Petals", description: "A navy and silver floral ring", asset: "/profile-frames/frame-02.png" },
  { id: "frame-03", label: "Glacier Blossom", description: "Ice-blue branches with pink blossoms", asset: "/profile-frames/frame-03.png" },
  { id: "frame-04", label: "Winter Cat", description: "A snow-cat ring with a paw charm", asset: "/profile-frames/frame-04.png" },
  { id: "frame-05", label: "Sapphire Regent", description: "An ornate blue character frame", asset: "/profile-frames/frame-05.png" },
  { id: "frame-06", label: "Moon Witch", description: "A violet moonlit character ring", asset: "/profile-frames/frame-06.png" },
  { id: "frame-07", label: "Icebound Halo", description: "A frosted blue and white halo", asset: "/profile-frames/frame-07.png" },
  { id: "frame-08", label: "Crimson Blossom", description: "A red blossom and lantern frame", asset: "/profile-frames/frame-08.png" },
  { id: "frame-09", label: "Golden Laurel", description: "A gold and green floral ring", asset: "/profile-frames/frame-09.png" },
  { id: "frame-10", label: "Azure Companion", description: "A blue floral character frame", asset: "/profile-frames/frame-10.png" },
  { id: "frame-11", label: "Midnight Garden", description: "Dark leaves and pale blossoms", asset: "/profile-frames/frame-11.png" },
  { id: "frame-12", label: "Glacial Wave", description: "A pale-blue ice and wave ring", asset: "/profile-frames/frame-12.png" },
  { id: "frame-13", label: "Lavender Dream", description: "A soft lilac ring with a plush charm", asset: "/profile-frames/frame-13.png" },
  { id: "frame-14", label: "Fortune Festival", description: "A colorful festival and talisman frame", asset: "/profile-frames/frame-14.png" },
  { id: "frame-15", label: "Spring Orbit", description: "A pink-and-green crescent ring", asset: "/profile-frames/frame-15.png" },
  { id: "frame-16", label: "Ink Brush", description: "A minimal black brushstroke circle", asset: "/profile-frames/frame-16.png" },
  { id: "frame-17", label: "Starlight Circle", description: "A pink crystal and star ring", asset: "/profile-frames/frame-17.png" },
  { id: "frame-18", label: "Tidal Crown", description: "A deep-blue floral character frame", asset: "/profile-frames/frame-18.png" },
  { id: "frame-19", label: "Wisteria Demon", description: "Violet butterflies and wisteria", asset: "/profile-frames/frame-19.png" },
  { id: "frame-20", label: "Scarlet Wisteria", description: "Red blossoms and a dark floral halo", asset: "/profile-frames/frame-20.png" },
] as const;

export const PROFILE_FRAMES = PROFILE_FRAME_CATALOG;

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
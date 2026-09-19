export const PROFILE_FRAMES = [
  { id: "none", label: "Clean", description: "No frame" },
  { id: "aurora", label: "Aurora", description: "A cool moving light ring" },
  { id: "ember", label: "Ember", description: "A warm fire ring" },
  { id: "ocean", label: "Ocean", description: "A deep blue current" },
  { id: "neon", label: "Neon", description: "A bright arcade pulse" },
  { id: "galaxy", label: "Galaxy", description: "A cosmic orbit" },
  { id: "clover", label: "Clover", description: "A lucky green shimmer" },
  { id: "gold", label: "Gold", description: "A champion's glow" },
  { id: "starlight", label: "Starlight", description: "A soft constellation ring" },
  { id: "sakura", label: "Sakura", description: "A pink blossom trim" },
  { id: "royal", label: "Royal", description: "A deep violet crest" },
  { id: "mint", label: "Mint", description: "A fresh pastel glow" },
] as const;

export type ProfileFrameId = (typeof PROFILE_FRAMES)[number]["id"];

export const DEFAULT_PROFILE_FRAME: ProfileFrameId = "none";

export function normalizeProfileFrame(value: unknown): ProfileFrameId {
  const candidate = String(value ?? "").trim();
  return PROFILE_FRAMES.some((frame) => frame.id === candidate)
    ? (candidate as ProfileFrameId)
    : DEFAULT_PROFILE_FRAME;
}
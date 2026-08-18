export type GymDefinition = {
  id: string;
  name: string;
  type: string;
  leader: string;
  badge: string;
  description: string;
  theme: string;
  accent: string;
  background: string;
  music: string;
  rewardCoins: number;
  rewardXp: number;
  unlockAfter?: string;
  team: GymPokemonDefinition[];
};

export type GymPokemonDefinition = {
  name: string;
  pokedexId: number;
  level: number;
  types: string[];
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  moves: Array<{ name: string; type: string; power: number; accuracy: number; pp: number }>;
};

const animated = (id: number, side: "front" | "back" = "front") =>
  side === "back"
    ? `https://raw.githubusercontent.com/kelin132/animated-pokemon-gifs/master/back/${id}.gif`
    : `https://raw.githubusercontent.com/kelin132/animated-pokemon-gifs/master/${id}.gif`;

const move = (name: string, type: string, power: number) => ({ name, type, power, accuracy: 100, pp: 20 });

export const GYM_DEFINITIONS: GymDefinition[] = [
  {
    id: "tide",
    name: "Tide Gym",
    type: "Water",
    leader: "Mira",
    badge: "Tide Badge",
    description: "A rain-soaked arena where timing beats raw power.",
    theme: "tide",
    accent: "#50d7ff",
    background: "/battle-gym/tide.webp",
    music: "/battle-music/tide.mp3",
    rewardCoins: 25000,
    rewardXp: 1200,
    team: [
      { name: "Swampert", pokedexId: 260, level: 28, types: ["water", "ground"], maxHp: 180, attack: 92, defense: 88, speed: 65, moves: [move("Water Pulse", "water", 60), move("Mud Shot", "ground", 55)] },
      { name: "Gyarados", pokedexId: 130, level: 30, types: ["water", "flying"], maxHp: 195, attack: 105, defense: 82, speed: 81, moves: [move("Aqua Tail", "water", 90), move("Bite", "dark", 60)] },
      { name: "Lapras", pokedexId: 131, level: 31, types: ["water", "ice"], maxHp: 210, attack: 96, defense: 90, speed: 60, moves: [move("Ice Beam", "ice", 90), move("Water Pulse", "water", 60)] },
      { name: "Kingdra", pokedexId: 230, level: 32, types: ["water", "dragon"], maxHp: 205, attack: 110, defense: 98, speed: 85, moves: [move("Dragon Pulse", "dragon", 85), move("Brine", "water", 65)] },
      { name: "Milotic", pokedexId: 350, level: 33, types: ["water"], maxHp: 225, attack: 102, defense: 105, speed: 86, moves: [move("Surf", "water", 90), move("Ice Beam", "ice", 90)] },
      { name: "Greninja", pokedexId: 658, level: 35, types: ["water", "dark"], maxHp: 215, attack: 120, defense: 86, speed: 122, moves: [move("Water Shuriken", "water", 75), move("Night Slash", "dark", 70)] },
    ],
  },
  {
    id: "ember",
    name: "Ember Gym",
    type: "Fire",
    leader: "Kaida",
    badge: "Ember Badge",
    description: "A volcanic ring where every turn burns brighter.",
    theme: "ember",
    accent: "#ff886c",
    background: "/battle-gym/ember.webp",
    music: "/battle-music/ember.mp3",
    rewardCoins: 35000,
    rewardXp: 1800,
    unlockAfter: "tide",
    team: [
      { name: "Arcanine", pokedexId: 59, level: 34, types: ["fire"], maxHp: 205, attack: 112, defense: 85, speed: 95, moves: [move("Flame Wheel", "fire", 75), move("Bite", "dark", 60)] },
      { name: "Charizard", pokedexId: 6, level: 36, types: ["fire", "flying"], maxHp: 220, attack: 118, defense: 90, speed: 105, moves: [move("Flamethrower", "fire", 90), move("Dragon Claw", "dragon", 80)] },
      { name: "Ninetales", pokedexId: 38, level: 35, types: ["fire"], maxHp: 190, attack: 104, defense: 86, speed: 100, moves: [move("Fire Blast", "fire", 100), move("Confuse Ray", "ghost", 0)] },
      { name: "Volcarona", pokedexId: 637, level: 37, types: ["bug", "fire"], maxHp: 215, attack: 122, defense: 84, speed: 100, moves: [move("Bug Buzz", "bug", 90), move("Flamethrower", "fire", 90)] },
      { name: "Talonflame", pokedexId: 663, level: 38, types: ["fire", "flying"], maxHp: 200, attack: 126, defense: 78, speed: 126, moves: [move("Brave Bird", "flying", 100), move("Flame Charge", "fire", 50)] },
      { name: "Blaziken", pokedexId: 257, level: 40, types: ["fire", "fighting"], maxHp: 230, attack: 135, defense: 92, speed: 95, moves: [move("Blaze Kick", "fire", 85), move("Brick Break", "fighting", 75)] },
    ],
  },
  {
    id: "voltage",
    name: "Voltage Gym",
    type: "Electric",
    leader: "Volt",
    badge: "Voltage Badge",
    description: "Neon rails, charged platforms, and lightning-fast turns.",
    theme: "voltage",
    accent: "#ffe66d",
    background: "/battle-gym/voltage.webp",
    music: "/battle-music/voltage.mp3",
    rewardCoins: 50000,
    rewardXp: 2400,
    unlockAfter: "ember",
    team: [
      { name: "Luxray", pokedexId: 405, level: 40, types: ["electric"], maxHp: 230, attack: 125, defense: 95, speed: 88, moves: [move("Spark", "electric", 65), move("Crunch", "dark", 80)] },
      { name: "Zeraora", pokedexId: 807, level: 42, types: ["electric"], maxHp: 245, attack: 135, defense: 92, speed: 125, moves: [move("Thunder Punch", "electric", 75), move("Slash", "normal", 70)] },
      { name: "Ampharos", pokedexId: 181, level: 41, types: ["electric"], maxHp: 240, attack: 118, defense: 100, speed: 72, moves: [move("Thunderbolt", "electric", 90), move("Dragon Pulse", "dragon", 85)] },
      { name: "Magnezone", pokedexId: 462, level: 42, types: ["electric", "steel"], maxHp: 250, attack: 125, defense: 128, speed: 60, moves: [move("Flash Cannon", "steel", 80), move("Thunderbolt", "electric", 90)] },
      { name: "Rotom", pokedexId: 479, level: 43, types: ["electric", "ghost"], maxHp: 220, attack: 118, defense: 100, speed: 110, moves: [move("Shock Wave", "electric", 60), move("Shadow Ball", "ghost", 80)] },
      { name: "Electivire", pokedexId: 466, level: 44, types: ["electric"], maxHp: 255, attack: 140, defense: 94, speed: 100, moves: [move("Thunder Punch", "electric", 75), move("Brick Break", "fighting", 75)] },
    ],
  },
  {
    id: "shadow",
    name: "Shadow Gym",
    type: "Ghost",
    leader: "Noctis",
    badge: "Shadow Badge",
    description: "A moonlit ruin filled with illusions and spectral wind.",
    theme: "shadow",
    accent: "#c59bff",
    background: "/battle-gym/shadow.webp",
    music: "/battle-music/shadow.mp3",
    rewardCoins: 75000,
    rewardXp: 3200,
    unlockAfter: "voltage",
    team: [
      { name: "Gengar", pokedexId: 94, level: 46, types: ["ghost", "poison"], maxHp: 235, attack: 120, defense: 85, speed: 118, moves: [move("Shadow Ball", "ghost", 80), move("Sludge Bomb", "poison", 90)] },
      { name: "Dragapult", pokedexId: 887, level: 48, types: ["dragon", "ghost"], maxHp: 250, attack: 140, defense: 92, speed: 142, moves: [move("Dragon Darts", "dragon", 90), move("Phantom Force", "ghost", 100)] },
      { name: "Mimikyu", pokedexId: 778, level: 47, types: ["ghost", "fairy"], maxHp: 220, attack: 126, defense: 98, speed: 105, moves: [move("Shadow Claw", "ghost", 70), move("Play Rough", "fairy", 90)] },
      { name: "Chandelure", pokedexId: 609, level: 48, types: ["ghost", "fire"], maxHp: 235, attack: 135, defense: 92, speed: 100, moves: [move("Shadow Ball", "ghost", 80), move("Flamethrower", "fire", 90)] },
      { name: "Aegislash", pokedexId: 681, level: 49, types: ["steel", "ghost"], maxHp: 255, attack: 145, defense: 135, speed: 60, moves: [move("Iron Head", "steel", 80), move("Shadow Sneak", "ghost", 40)] },
      { name: "Giratina", pokedexId: 487, level: 52, types: ["ghost", "dragon"], maxHp: 290, attack: 152, defense: 140, speed: 90, moves: [move("Shadow Force", "ghost", 100), move("Dragon Claw", "dragon", 80)] },
    ],
  },
];

export function gymById(id: string) {
  return GYM_DEFINITIONS.find((gym) => gym.id === id) ?? null;
}

export function gymSpriteUrls(pokemon: GymPokemonDefinition) {
  const official = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.pokedexId}.png`;
  return { imageUrl: official, frontSpriteUrl: animated(pokemon.pokedexId, "front"), backSpriteUrl: animated(pokemon.pokedexId, "back") };
}

export function gymBadgeIds(badges: unknown) {
  return Array.isArray(badges) ? badges.map(String) : [];
}

export function isGymUnlocked(gym: GymDefinition, badges: unknown) {
  const unlocked = gymBadgeIds(badges);
  return !gym.unlockAfter || unlocked.includes(`${gym.unlockAfter}-badge`) || unlocked.includes(gym.unlockAfter);
}

export const gymBadgeId = (gymId: string) => `${gymId}-badge`;

export const gymThemeClass = (gymId: string) => `battle-gym-theme-${gymId}`;

export const gymMusicUrl = (gym: GymDefinition) => gym.music;

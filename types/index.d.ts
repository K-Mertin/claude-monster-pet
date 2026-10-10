// The monster mod's state contract: the pet, plain JSON, shared by every session on this machine.

export type Stage = 'egg' | 'baby' | 'child' | 'adult' | 'ultimate'

/** The evolution line, chosen by how you work when it grows into a child. */
export type Line = 'forge' | 'scribe' | 'summoner' | 'wanderer'

/** Chosen by how well it was cared for when it grows into an adult. */
export type Variant = 'bright' | 'shadow'

export type Personality = 'cheerful' | 'lazy' | 'curious' | 'grumpy'

/** Treats earned from your work. */
export type Item = 'cookie' | 'coffee' | 'gem' | 'bug'

export type Hat = 'party' | 'cap' | 'headphones' | 'wizard' | 'flower' | 'bow' | 'beanie' | 'halo'

export type Skill = 'power' | 'wisdom' | 'speed'

/** A hidden form for an extreme habit, replacing the line's usual adult or ultimate. */
export type Secret = 'archivist' | 'bugslayer' | 'goldheart'

export type Decor = 'plant' | 'lamp' | 'poster' | 'rug' | 'bed' | 'toybox' | 'desk' | 'fountain'

export type BossKind = 'hydra' | 'golem' | 'imp' | 'kraken'

/** This week's boss, built from the previous week's failures. */
export type Boss = { week: string; kind: BossKind; name: string; hp: number; atk: number; beaten: boolean; tries: number }

/** A monster that retired to the Hall of Fame. */
export type Legend = { name: string; form: string; level: number; days: number; generation: number; retiredAt: number }

export type Mood = {
  kind: 'cheer' | 'ouch' | 'eat' | 'full' | 'tired' | 'love' | 'evolve' | 'wave' | 'sweat' | 'win' | 'lose' | 'talk'
  until: number
}

export type Pet = {
  name: string
  born: number
  updatedAt: number
  /** The last time anything happened in any session. */
  lastActive: number
  personality: Personality
  stage: Stage
  line: Line | null
  variant: Variant | null
  xp: number
  /** 0–100: 100 is full. */
  hunger: number
  joy: number
  stress: number
  energy: number
  /** Tucked in: asleep until then. */
  asleepUntil?: number
  /** Droppings after meals, 0–3. */
  mess: number
  skills: Record<Skill, number>
  items: Record<Item, number>
  hat: Hat | null
  hats: Hat[]
  badges: string[]
  streak: { days: number; lastDay: string }
  /** Joy sampled while active, for the adult variant. */
  care: { sum: number; n: number }
  traits: { shell: number; code: number; agents: number; web: number }
  stats: {
    tokens: number; tests: number; commits: number; pushes: number; tasks: number; errors: number
    fed: number; meals: number; played: number; pats: number; talks: number
    games: number; wins: number; trained: number; cleaned: number; agents: number
    bossWins: number; bossTries: number
    lastTestFailed?: boolean
  }
  cooldowns: { feed?: number; play?: number; train?: number; game?: number }
  mood?: Mood
  said?: { text: string; at: number }
  settings: { sound: boolean; alerts: boolean }
  /** Failures this week, which shape next week's boss. */
  week: { id: string; errors: number; testFails: number }
  boss: Boss | null
  secret: Secret | null
  /** When it became an ultimate; it may retire 30 days later. */
  ultimateAt?: number
  generation: number
  hall: Legend[]
  decor: Decor[]
  /** Which alerts have already been shown, so each fires once until it clears. */
  alerted: { hungry?: boolean; sick?: boolean; messy?: boolean; tired?: boolean }
  log: { at: number; text: string }[]
}

/** Something that happened in a session, waiting to be applied to the shared pet. */
export type Event =
  | { kind: 'tokens'; n: number; at: number }
  | { kind: 'tool'; tool: string; command?: string; failed: boolean; ms?: number; at: number }
  | { kind: 'task'; n: number; at: number }
  | { kind: 'agent'; at: number }
  | { kind: 'feed'; at: number }
  | { kind: 'play'; at: number }
  | { kind: 'pet'; at: number }
  | { kind: 'talk'; text: string; at: number }
  | { kind: 'clean'; at: number }
  | { kind: 'tuck'; at: number }
  | { kind: 'use'; item: Item; at: number }
  | { kind: 'game'; won: boolean; prize?: Item; at: number }
  | { kind: 'train'; skill: Skill; at: number }
  | { kind: 'equip'; hat: Hat | null; at: number }
  | { kind: 'rename'; name: string; at: number }
  | { kind: 'setting'; key: 'sound' | 'alerts'; on: boolean; at: number }
  | { kind: 'boss'; won: boolean; at: number }
  | { kind: 'buy'; decor: Decor; at: number }
  | { kind: 'retire'; at: number }

declare module 'claude-code' {
  interface PluginState {
    monster: {
      pet: Pet | null
      isHidden: boolean
      tab: 'home' | 'items' | 'games' | 'shop' | 'style' | 'badges'
      battle: { hp: number; maxHp: number; petHp: number; petMax: number; turn: number; weak: Skill; log: string[]; over: 'won' | 'lost' | null } | null
      hunt: { round: number; score: number; treat: number; picked: number | null } | null
    }
  }
}

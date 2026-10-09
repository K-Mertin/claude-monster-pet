// The monster mod's state contract: the pet, plain JSON, shared by every session on this machine.

export type Stage = 'egg' | 'baby' | 'child' | 'adult' | 'ultimate'

/** The evolution line, chosen by how you work when it grows into a child. */
export type Line = 'forge' | 'scribe' | 'summoner' | 'wanderer'

export type Mood = {
  kind: 'cheer' | 'ouch' | 'eat' | 'full' | 'tired' | 'love' | 'evolve'
  until: number
}

export type Pet = {
  name: string
  born: number
  updatedAt: number
  /** The last time anything happened in any session. */
  lastActive: number
  stage: Stage
  line: Line | null
  xp: number
  /** 0–100: 100 is full. */
  hunger: number
  joy: number
  stress: number
  traits: { shell: number; code: number; agents: number; web: number }
  stats: { tokens: number; tests: number; commits: number; tasks: number; errors: number; fed: number; played: number }
  cooldowns: { feed?: number; play?: number }
  mood?: Mood
  log: { at: number; text: string }[]
}

/** Something that happened in a session, waiting to be applied to the shared pet. */
export type Event =
  | { kind: 'tokens'; n: number; at: number }
  | { kind: 'tool'; tool: string; command?: string; failed: boolean; at: number }
  | { kind: 'task'; n: number; at: number }
  | { kind: 'feed'; at: number }
  | { kind: 'play'; at: number }
  | { kind: 'pet'; at: number }
  | { kind: 'rename'; name: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    monster: {
      pet: Pet | null
      isHidden: boolean
    }
  }
}

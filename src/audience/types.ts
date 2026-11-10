export type AudienceChannel = 'npc' | 'boss'
export type AudienceMoveIndex = 0 | 1 | 2

export interface AudienceMoveOption {
  index: AudienceMoveIndex
  moveId: number
  name: string
  type: string
  description: string
}

export interface AudienceTrainer {
  name: string
  kind: 'NPC' | 'Capopalestra' | 'PVP' | 'Superquattro' | 'Campione'
}

export interface AudiencePokemon {
  instanceId: string
  speciesId: number
  name: string
  level: number
}

export interface AudienceRoundRequest {
  turnKey: string
  channel: AudienceChannel
  durationSeconds: number
  trainer: AudienceTrainer
  pokemon: AudiencePokemon
  options: AudienceMoveOption[]
  fallbackIndex: AudienceMoveIndex
}

export interface AudienceRound {
  id: string
  turnKey: string
  channel: AudienceChannel
  status: 'open' | 'closed' | 'cancelled'
  openedAt: number
  deadlineAt: number
  closedAt: number | null
  trainer: AudienceTrainer
  pokemon: AudiencePokemon
  options: AudienceMoveOption[]
  counts: [number, number, number]
  winnerIndex: AudienceMoveIndex | null
  resolution: 'majority' | 'tie' | 'no-votes' | 'guest' | null
}

export interface AudienceHostSnapshot {
  sessionId: string
  serverNow: number
  expiresAt: number
  joinUrls: { npc: string; boss: string }
  participants: { npc: number; boss: number }
  round: AudienceRound | null
  guest?: { protocol: 'private-guest-v1'; claimed: boolean; revoked: boolean; expiresAt: number; generation: number }
}

/** Host capability stays in this organizer's storage, never in an invitation. */
export interface AudienceHostSession {
  serviceUrl: string
  sessionId: string
  hostToken: string
  expiresAt: number
  joinUrls: { npc: string; boss: string }
  guestProtocol?: 'private-guest-v1'
}

export type AudienceCreateResponse = AudienceHostSnapshot & { hostToken: string }
export type AudienceTurnStatus = 'idle' | 'opening' | 'open' | 'closing' | 'closed' | 'error'

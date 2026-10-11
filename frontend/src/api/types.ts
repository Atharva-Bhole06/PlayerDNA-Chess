export interface HealthResponse {
  status: string
  database_available: boolean
  stockfish_available: boolean
}

export interface AuthenticatedProfile {
  username: string
  rating: number
  games_played: number
  wins: number
  losses: number
  draws: number
  player_dna_status: string
}

export interface LeaderboardEntry {
  rank: number
  username: string
  rating: number
  games_played: number
  wins: number
  losses: number
  draws: number
  win_rate: number | null
  style_cluster?: number | null
  style_model_version?: string | null
}

export interface RecentGame {
  game_id: string
  opponent_username: string
  opponent_rating: number
  color: 'white' | 'black'
  result: 'win' | 'loss' | 'draw'
  termination: string
  rating_before: number
  rating_after: number
  rating_change: number
  finished_at: string
  analysis_status: 'queued' | 'processing' | 'completed' | 'failed' | 'not_queued'
  stars: number | null
}

export interface PerformanceReport {
  game_id: string
  analysis_status: 'queued' | 'processing' | 'completed' | 'failed'
  result: string
  opponent_username: string
  opponent_rating: number
  move_count: number
  duration_seconds: number
  moves_analyzed: number | null
  cp_evaluable_moves: number | null
  average_cpl: number | null
  blunders: number | null
  mistakes: number | null
  inaccuracies: number | null
  best_move_agreement_pct: number | null
  accuracy_pct: number | null
  stars: number | null
  star_reason: string | null
  performance_version: string | null
  mate_events: Record<string, number> | null
  critical_moves: Array<{ ply: number; played_move: string; best_move: string; cpl: number; classification: string }> | null
  recommendations: string[] | null
  message: string | null
}

export interface LiveDNASnapshot {
  game_id: string
  games_analyzed: number
  median_cpl: number
  cpl_std: number
  inaccuracies_per_100_cp_moves: number
  feature_version: string
  snapshot_at: string
}

export interface QueueStatus {
  status: 'waiting' | 'matched' | 'cancelled' | 'idle'
  game_id: string | null
  wait_seconds: number
  rating_window: number | null
}

export interface MultiplayerGameState {
  game_id: string
  status: 'active' | 'completed'
  color: 'white' | 'black'
  white_username: string
  black_username: string
  white_rating: number
  black_rating: number
  fen: string
  pgn: string
  result: string | null
  termination: string | null
  white_time_ms: number
  black_time_ms: number
  turn_started_at: string | null
  ply_count: number
  draw_offered_by: string | null
  analysis_status: 'not_queued' | 'queued' | 'processing' | 'completed' | 'failed'
}

export interface PlayerSummary {
  player_id: string
  games_analyzed: number | null
  mean_player_rating: number | null
  win_rate_pct: number | null
}

export interface PlayerDNA {
  median_cpl: number | null
  cpl_std: number | null
  inaccuracies_per_100_cp_moves: number | null
  version: string
}

export interface PlayerProfile extends PlayerSummary {
  record: { wins: number | null; draws: number | null; losses: number | null }
  performance: Record<string, number | null>
  player_dna: PlayerDNA | null
}

export interface MatchmakingFeatureGap {
  feature: string
  query_value: number
  candidate_value: number
  raw_gap: number
  normalized_gap: number
}

export interface MatchmakingRecommendation {
  recommended_player_id: string
  rank: number
  score: number
  score_type: string
  explanation: string
  feature_gaps: MatchmakingFeatureGap[]
}

export interface MatchmakingResponse {
  player_id: string
  mode: 'most_similar'
  recommendations: MatchmakingRecommendation[]
}

export interface ChessRecommendationRequest {
  fen: string
}

export interface ChessRecommendationResponse {
  fen: string
  best_move: string | null
  best_move_san: string | null
  evaluation: number | null
  evaluation_mate: number | null
  evaluation_type: 'cp' | 'mate' | 'terminal'
  principal_variation: string[]
  depth: number | null
  analysis_time_ms: number
  terminal_reason: string | null
}

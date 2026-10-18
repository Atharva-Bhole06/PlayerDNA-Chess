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
  is_admin: boolean
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

export interface MoveAnalysisItem {
  ply: number
  move_number: number
  color: 'white' | 'black'
  user_id: string
  is_user_move: boolean
  played_san: string
  played_uci: string
  best_move_san?: string | null
  best_move_uci?: string | null
  cpl?: number | null
  best_move_agreement?: boolean | null
  classification?: string | null
  fen_before: string
  fen_after: string
  played_score_cp?: number | null
  played_score_mate?: number | null
  best_score_cp?: number | null
  best_score_mate?: number | null
  engine_depth?: number | null
  explanation?: string | null
}

export interface OpponentReportSummary {
  username: string
  rating: number
  rating_after?: number | null
  rating_change?: number | null
  color: 'white' | 'black'
  accuracy_pct?: number | null
  average_cpl?: number | null
  stars?: number | null
  star_reason?: string | null
  blunders?: number | null
  mistakes?: number | null
  inaccuracies?: number | null
  best_move_agreement_pct?: number | null
}

export interface PreviousGameComparison {
  previous_game_id: string
  finished_at?: string | null
  opponent_username: string
  accuracy_current?: number | null
  accuracy_previous?: number | null
  accuracy_delta?: number | null
  average_cpl_current?: number | null
  average_cpl_previous?: number | null
  average_cpl_delta?: number | null
  blunders_current?: number | null
  blunders_previous?: number | null
  blunders_delta?: number | null
  mistakes_current?: number | null
  mistakes_previous?: number | null
  mistakes_delta?: number | null
  inaccuracies_current?: number | null
  inaccuracies_previous?: number | null
  inaccuracies_delta?: number | null
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
  color?: 'white' | 'black'
  user_won?: boolean | null
  result_outcome?: 'win' | 'loss' | 'draw'
  user_rating?: number
  user_rating_after?: number
  rating_change?: number | null
  is_rated?: boolean
  finished_at?: string | null
  termination?: string | null
  pgn?: string | null
  current_fen?: string | null
  moves?: MoveAnalysisItem[] | null
  opponent_report?: OpponentReportSummary | null
  previous_game_comparison?: PreviousGameComparison | null
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

export interface AIExperimentPreset {
  id?: string
  name: string
  description: string
  skill_level: number
  depth: number
  movetime_ms: number
  threads: number
  hash_mb: number
  approx_rating?: number
}

export interface AIExperiment {
  id: string
  name: string
  white_preset: string
  black_preset: string
  white_config: AIExperimentPreset
  black_config: AIExperimentPreset
  games_total: number
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  white_wins: number
  black_wins: number
  draws: number
  pgn: string
  final_fen: string | null
  termination: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface MLStatusResponse {
  status: 'ready' | 'insufficient_data'
  analyzed_users_count: number
  required_users_count: number
  message: string
  active_model: {
    version: string
    model_type: string
    purpose: string
    training_rows: number
    metrics: Record<string, any>
    trained_at: string | null
  } | null
}

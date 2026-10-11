"""Relational schema for the selected PlayerDNA research cohort."""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    DateTime,
    UniqueConstraint,
    func,
    JSON,
    Index,
)

from backend.db.base import Base


DNA_VERSION = "robust_iqr_v1"


class Player(Base):
    __tablename__ = "players"

    player_id = Column(String(100), primary_key=True)
    cohort_member = Column(Boolean, nullable=False, default=True)


class UserAccount(Base):
    """Registered platform identity, distinct from imported cohort players."""

    __tablename__ = "user_accounts"
    __table_args__ = (UniqueConstraint("username_key", name="uq_user_accounts_username_key"),)

    id = Column(String(36), primary_key=True)
    username = Column(String(32), nullable=False)
    username_key = Column(String(32), nullable=False)
    password_hash = Column(String(256), nullable=False)
    player_id = Column(String(100), ForeignKey("players.player_id", ondelete="RESTRICT"), nullable=False, unique=True)
    rating = Column(Integer, nullable=False, default=1200)
    games_played = Column(Integer, nullable=False, default=0)
    wins = Column(Integer, nullable=False, default=0)
    losses = Column(Integer, nullable=False, default=0)
    draws = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserSession(Base):
    __tablename__ = "user_sessions"

    token_hash = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MatchQueueEntry(Base):
    __tablename__ = "match_queue_entries"
    user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True)
    rating_at_join = Column(Integer, nullable=False)
    joined_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LiveGame(Base):
    __tablename__ = "live_games"
    __table_args__ = (
        CheckConstraint("white_user_id <> black_user_id", name="ck_live_games_distinct_players"),
        CheckConstraint("status IN ('active', 'completed')", name="ck_live_games_status"),
        CheckConstraint("result IS NULL OR result IN ('1-0', '0-1', '1/2-1/2')", name="ck_live_games_result"),
    )
    id = Column(String(36), primary_key=True)
    white_user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    black_user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    white_rating_at_start = Column(Integer, nullable=False, default=1200)
    black_rating_at_start = Column(Integer, nullable=False, default=1200)
    status = Column(String(12), nullable=False, default="active", index=True)
    current_fen = Column(Text, nullable=False)
    pgn = Column(Text, nullable=False, default="")
    result = Column(String(7), nullable=True)
    termination = Column(String(32), nullable=True)
    draw_offered_by = Column(String(36), ForeignKey("user_accounts.id", ondelete="SET NULL"), nullable=True)
    white_time_ms = Column(Integer, nullable=False, default=300_000)
    black_time_ms = Column(Integer, nullable=False, default=300_000)
    increment_ms = Column(Integer, nullable=False, default=0)
    turn_started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)


class LiveGameMove(Base):
    __tablename__ = "live_game_moves"
    __table_args__ = (CheckConstraint("ply_number > 0", name="ck_live_game_moves_ply_positive"),)
    game_id = Column(String(36), ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True)
    ply_number = Column(Integer, primary_key=True)
    user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False)
    uci = Column(String(10), nullable=False)
    san = Column(String(20), nullable=False)
    fen_before = Column(Text, nullable=False)
    fen_after = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CompetitiveRatingHistory(Base):
    __tablename__ = "competitive_rating_history"
    user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True)
    game_id = Column(String(36), ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True)
    rating_before = Column(Integer, nullable=False)
    rating_after = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GameAnalysisJob(Base):
    __tablename__ = "game_analysis_jobs"
    __table_args__ = (CheckConstraint("status IN ('queued', 'processing', 'completed', 'failed')", name="ck_game_analysis_jobs_status"),)
    game_id = Column(String(36), ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True)
    status = Column(String(12), nullable=False, default="queued", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    analysis_version = Column(String(40), nullable=False, default="stockfish_live_v1")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class PlayerGameReport(Base):
    __tablename__ = "player_game_reports"
    __table_args__ = (
        CheckConstraint("stars IS NULL OR stars BETWEEN 3 AND 5", name="ck_player_game_reports_stars"),
        CheckConstraint("moves_analyzed >= 0", name="ck_player_game_reports_moves_nonnegative"),
    )
    game_id = Column(String(36), ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True)
    moves_analyzed = Column(Integer, nullable=False, default=0)
    cp_evaluable_moves = Column(Integer, nullable=False, default=0)
    average_cpl = Column(Float, nullable=True)
    blunders = Column(Integer, nullable=False, default=0)
    mistakes = Column(Integer, nullable=False, default=0)
    inaccuracies = Column(Integer, nullable=False, default=0)
    best_move_agreement_pct = Column(Float, nullable=True)
    accuracy_pct = Column(Float, nullable=True)
    stars = Column(Integer, nullable=True)
    star_reason = Column(Text, nullable=True)
    performance_version = Column(String(40), nullable=False, default="performance_stars_v1")
    mate_events = Column(JSON, nullable=False, default=dict)
    critical_moves = Column(JSON, nullable=False, default=list)
    recommendations = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LiveMoveAnalysis(Base):
    __tablename__ = "live_move_analyses"
    __table_args__ = (
        ForeignKeyConstraint(["game_id", "ply_number"], ["live_game_moves.game_id", "live_game_moves.ply_number"], ondelete="CASCADE"),
    )
    game_id = Column(String(36), primary_key=True)
    ply_number = Column(Integer, primary_key=True)
    user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    best_move_uci = Column(String(10), nullable=False)
    best_move_san = Column(String(20), nullable=False)
    played_move_san = Column(String(20), nullable=False)
    best_score_cp = Column(Integer, nullable=True)
    best_score_mate = Column(Integer, nullable=True)
    played_score_cp = Column(Integer, nullable=True)
    played_score_mate = Column(Integer, nullable=True)
    cpl = Column(Integer, nullable=True)
    best_move_agreement = Column(Boolean, nullable=False)
    classification = Column(String(40), nullable=False)
    engine_depth = Column(Integer, nullable=False)
    engine_name = Column(String(100), nullable=False)
    analysis_time_ms = Column(Float, nullable=False)
    evaluated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LivePlayerDNAHistory(Base):
    __tablename__ = "live_player_dna_history"
    user_id = Column(String(36), ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True)
    game_id = Column(String(36), ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True)
    games_analyzed = Column(Integer, nullable=False)
    median_cpl = Column(Float, nullable=False)
    cpl_std = Column(Float, nullable=False)
    inaccuracies_per_100_cp_moves = Column(Float, nullable=False)
    feature_version = Column(String(40), nullable=False, default="live_dna_raw_v1")
    snapshot_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (Index("ix_live_player_dna_history_user_snapshot", "user_id", "snapshot_at"),)


class PlayerDNAStyleModel(Base):
    __tablename__ = "player_dna_style_models"
    version = Column(String(80), primary_key=True)
    model_type = Column(String(40), nullable=False)
    purpose = Column(Text, nullable=False)
    feature_version = Column(String(40), nullable=False)
    training_rows = Column(Integer, nullable=False)
    data_fingerprint = Column(String(64), nullable=False)
    metrics = Column(JSON, nullable=False)
    artifact_path = Column(Text, nullable=False)
    trained_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (
        CheckConstraint("player_color IN ('white', 'black')", name="ck_games_player_color"),
        CheckConstraint("winner IN ('white', 'black', 'draw')", name="ck_games_winner"),
        CheckConstraint("turns >= 0", name="ck_games_turns_nonnegative"),
    )

    game_id = Column(String(100), primary_key=True)
    player_id = Column(String(100), ForeignKey("players.player_id", ondelete="RESTRICT"), nullable=False, index=True)
    # Opponents are external to the selected 30-player cohort, so this is a source ID, not a FK.
    opponent_id = Column(String(100), nullable=False)
    player_color = Column(String(5), nullable=False)
    player_rating = Column(Integer, nullable=True)
    opponent_rating = Column(Integer, nullable=True)
    winner = Column(String(5), nullable=False)
    turns = Column(Integer, nullable=False)
    moves_san = Column(Text, nullable=False)
    opening_eco = Column(String(10), nullable=True)
    opening_name = Column(Text, nullable=True)
    opening_ply = Column(Integer, nullable=True)
    rated = Column(Boolean, nullable=True)
    increment_code = Column(String(30), nullable=True)
    total_plies_processed = Column(Integer, nullable=False)
    player_moves_processed = Column(Integer, nullable=False)
    opponent_moves_processed = Column(Integer, nullable=False)
    player_captures = Column(Integer, nullable=False)
    opponent_captures = Column(Integer, nullable=False)
    player_checks = Column(Integer, nullable=False)
    opponent_checks = Column(Integer, nullable=False)
    player_castles = Column(Integer, nullable=False)
    opponent_castles = Column(Integer, nullable=False)
    player_pawn_moves = Column(Integer, nullable=False)
    opponent_pawn_moves = Column(Integer, nullable=False)
    player_piece_moves = Column(Integer, nullable=False)
    opponent_piece_moves = Column(Integer, nullable=False)
    player_promotions = Column(Integer, nullable=False)
    opponent_promotions = Column(Integer, nullable=False)
    final_fen = Column(Text, nullable=False)


class PlayerGamePerformance(Base):
    __tablename__ = "player_game_performance"
    __table_args__ = (
        CheckConstraint("total_player_moves >= 0", name="ck_perf_moves_nonnegative"),
        CheckConstraint("cp_evaluable_moves >= 0", name="ck_perf_cp_moves_nonnegative"),
        CheckConstraint("mate_evaluation_moves >= 0", name="ck_perf_mate_moves_nonnegative"),
    )

    game_id = Column(String(100), ForeignKey("games.game_id", ondelete="CASCADE"), primary_key=True)
    total_player_moves = Column(Integer, nullable=False)
    cp_evaluable_moves = Column(Integer, nullable=False)
    mate_evaluation_moves = Column(Integer, nullable=False)
    average_cpl = Column(Float, nullable=True)
    blunders = Column(Integer, nullable=False)
    mistakes = Column(Integer, nullable=False)
    inaccuracies = Column(Integer, nullable=False)
    best_moves = Column(Integer, nullable=False)
    best_move_percentage = Column(Float, nullable=True)
    accuracy = Column(Float, nullable=True)
    missed_forced_mates = Column(Integer, nullable=False)
    allowed_forced_mates = Column(Integer, nullable=False)
    mate_score_changed = Column(Integer, nullable=False)
    mate_outcome_preserved = Column(Integer, nullable=False)
    engine_name = Column(String(100), nullable=False)
    engine_depth = Column(Integer, nullable=False)
    cpl_definition = Column(Text, nullable=False)
    accuracy_definition = Column(Text, nullable=False)


class MoveEvaluation(Base):
    __tablename__ = "move_evaluations"
    __table_args__ = (
        CheckConstraint("player_move_number > 0", name="ck_move_number_positive"),
        CheckConstraint("ply_number > 0", name="ck_ply_number_positive"),
    )

    game_id = Column(String(100), ForeignKey("games.game_id", ondelete="CASCADE"), primary_key=True)
    player_move_number = Column(Integer, primary_key=True)
    ply_number = Column(Integer, nullable=False)
    fen_before = Column(Text, nullable=False)
    played_move_san = Column(String(20), nullable=False)
    played_move_uci = Column(String(20), nullable=False)
    best_move_san = Column(String(20), nullable=False)
    best_move_uci = Column(String(20), nullable=False)
    best_score_cp = Column(Float, nullable=True)
    best_score_mate = Column(Integer, nullable=True)
    played_score_cp = Column(Float, nullable=True)
    played_score_mate = Column(Integer, nullable=True)
    cpl = Column(Float, nullable=True)
    move_classification = Column(String(40), nullable=True)
    mate_event = Column(String(40), nullable=True)
    engine_name = Column(String(100), nullable=False)
    engine_depth = Column(Integer, nullable=False)
    evaluation_method = Column(String(100), nullable=False)


PROFILE_INTEGER_FIELDS = {
    "games_analyzed", "wins", "draws", "losses", "games_as_white", "games_as_black",
    "white_wins", "white_draws", "white_losses", "black_wins", "black_draws",
    "black_losses", "cp_evaluable_moves_total", "mate_evaluation_moves_total",
    "missed_forced_mates_total", "allowed_forced_mates_total",
    "mate_score_changed_total", "mate_outcome_preserved_total",
}
PROFILE_GAME_REFERENCE_FIELDS = {
    "best_accuracy_game_id", "worst_accuracy_game_id", "best_cpl_game_id", "worst_cpl_game_id",
}
PROFILE_FLOAT_FIELDS = {
    "win_rate_pct", "draw_rate_pct", "loss_rate_pct", "mean_player_rating",
    "median_player_rating", "mean_opponent_rating", "median_opponent_rating",
    "mean_rating_difference", "white_win_rate_pct", "white_draw_rate_pct",
    "white_loss_rate_pct", "white_score_rate_pct", "black_win_rate_pct",
    "black_draw_rate_pct", "black_loss_rate_pct", "black_score_rate_pct",
    "white_mean_accuracy_pct", "black_mean_accuracy_pct", "white_mean_cpl",
    "black_mean_cpl", "mean_player_moves_per_game", "median_player_moves_per_game",
    "mean_accuracy_pct", "median_accuracy_pct", "accuracy_std_pct",
    "best_game_accuracy_pct", "worst_game_accuracy_pct", "mean_cpl",
    "median_cpl", "mean_cpl_weighted_by_cp_moves", "cpl_std", "best_game_cpl",
    "worst_game_cpl", "mean_best_move_percentage", "median_best_move_percentage",
    "mean_blunders_per_game", "mean_mistakes_per_game", "mean_inaccuracies_per_game",
    "blunders_per_100_cp_moves", "mistakes_per_100_cp_moves",
    "inaccuracies_per_100_cp_moves", "mate_evaluation_rate_pct",
}

profile_columns = [
    Column("player_id", String(100), ForeignKey("players.player_id", ondelete="CASCADE"), primary_key=True),
]
profile_columns.extend(
    Column(name, Integer, nullable=True)
    for name in sorted(PROFILE_INTEGER_FIELDS)
)
profile_columns.extend(
    Column(name, Float, nullable=True)
    for name in sorted(PROFILE_FLOAT_FIELDS)
)
profile_columns.extend(
    Column(name, String(100), ForeignKey("games.game_id", ondelete="SET NULL"), nullable=True)
    for name in sorted(PROFILE_GAME_REFERENCE_FIELDS)
)
PlayerProfile = type(
    "PlayerProfile",
    (Base,),
    {
        "__module__": __name__,
        "__table__": Table("player_profiles", Base.metadata, *profile_columns),
    },
)


class PlayerDNA(Base):
    __tablename__ = "player_dna"
    __table_args__ = (
        CheckConstraint("version <> ''", name="ck_dna_version_nonempty"),
    )

    player_id = Column(String(100), ForeignKey("players.player_id", ondelete="CASCADE"), primary_key=True)
    version = Column(String(40), primary_key=True, default=DNA_VERSION)
    dna_median_cpl = Column(Float, nullable=False)
    dna_cpl_std = Column(Float, nullable=False)
    dna_inaccuracies_per_100_cp_moves = Column(Float, nullable=False)


class DNAFeatureScaler(Base):
    __tablename__ = "dna_feature_scalers"

    version = Column(String(40), primary_key=True)
    feature_name = Column(String(100), primary_key=True)
    median = Column(Float, nullable=False)
    q1 = Column(Float, nullable=False)
    q3 = Column(Float, nullable=False)
    iqr_scale = Column(Float, nullable=False)
    transformation = Column(Text, nullable=False)

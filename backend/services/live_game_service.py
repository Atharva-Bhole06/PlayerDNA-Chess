"""Authoritative persisted chess transitions and once-only Elo finalization."""

from datetime import datetime, timezone

import chess
import chess.pgn
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db.models import CompetitiveRatingHistory, GameAnalysisJob, LiveGame, LiveGameMove, UserAccount


ELO_K = 32


class GameError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _board_from_moves(session: Session, game: LiveGame) -> chess.Board:
    board = chess.Board()
    moves = session.scalars(select(LiveGameMove).where(LiveGameMove.game_id == game.id)
                            .order_by(LiveGameMove.ply_number)).all()
    for index, move in enumerate(moves, start=1):
        if move.ply_number != index:
            raise GameError("Stored game history is inconsistent", 500)
        try:
            board.push_uci(move.uci)
        except ValueError as exc:
            raise GameError("Stored game history contains an illegal move", 500) from exc
    if board.fen() != game.current_fen:
        raise GameError("Stored game position does not match its move history", 500)
    return board


def _event_name(pgn: str | None) -> str:
    if pgn and "Casual Match" in pgn:
        return "Casual Match"
    return "Competitive Match"


def _pgn(board: chess.Board, result: str | None = None, event: str | None = None) -> str:
    game = chess.pgn.Game.from_board(board)
    if event:
        game.headers["Event"] = event
    if result is not None:
        game.headers["Result"] = result
    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    return game.accept(exporter)


def _timeout_result(board: chess.Board) -> str:
    possible_winner = not board.turn
    if board.has_insufficient_material(possible_winner):
        return "1/2-1/2"
    return "1-0" if possible_winner == chess.WHITE else "0-1"


class LiveGameService:
    def __init__(self, session: Session):
        self.session = session

    def _game(self, game_id: str, user_id: str, lock: bool = False) -> LiveGame:
        statement = select(LiveGame).where(LiveGame.id == game_id)
        if lock:
            statement = statement.with_for_update()
        game = self.session.scalar(statement)
        if game is None:
            raise GameError("Game not found", 404)
        if user_id not in (game.white_user_id, game.black_user_id):
            raise GameError("You are not a participant in this game", 403)
        return game

    def state(self, game_id: str, user_id: str, lock: bool = False) -> dict:
        game = self._game(game_id, user_id, lock=lock)
        board = _board_from_moves(self.session, game)
        now = datetime.now(timezone.utc)
        if game.status == "active":
            elapsed = max(0, int((now - _utc(game.turn_started_at)).total_seconds() * 1000))
            remaining = game.white_time_ms if board.turn == chess.WHITE else game.black_time_ms
            if elapsed >= remaining:
                if not lock:
                    game = self._game(game_id, user_id, lock=True)
                self._finish(game, _timeout_result(board), "timeout")
                self.session.commit()
        return self._serialize(game, user_id)

    def move(self, game_id: str, user_id: str, uci: str, expected_ply: int) -> dict:
        game = self._game(game_id, user_id, lock=True)
        if game.status != "active":
            raise GameError("Game is already complete", 409)
        board = _board_from_moves(self.session, game)
        count = self.session.scalar(select(func.count()).select_from(LiveGameMove).where(LiveGameMove.game_id == game_id)) or 0
        if expected_ply != count:
            raise GameError("Game state changed; reload the current position", 409)
        if user_id != (game.white_user_id if board.turn == chess.WHITE else game.black_user_id):
            raise GameError("It is not your turn", 409)
        now = datetime.now(timezone.utc)
        elapsed = max(0, int((now - _utc(game.turn_started_at)).total_seconds() * 1000))
        moving_clock = game.white_time_ms if board.turn == chess.WHITE else game.black_time_ms
        if elapsed >= moving_clock:
            self._finish(game, _timeout_result(board), "timeout")
            self.session.commit()
            return self._serialize(game, user_id)
        try:
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                raise ValueError("illegal")
            san = board.san(move)
        except ValueError as exc:
            raise GameError("Illegal or invalid move") from exc
        fen_before = board.fen()
        moving_user = user_id
        board.push(move)
        new_clock = moving_clock - elapsed + game.increment_ms
        if fen_before.split(" ")[1] == "w":
            game.white_time_ms = new_clock
        else:
            game.black_time_ms = new_clock
        game.turn_started_at = now
        game.current_fen = board.fen()
        game.pgn = _pgn(board, event=_event_name(game.pgn))
        game.draw_offered_by = None
        self.session.add(LiveGameMove(game_id=game_id, ply_number=count + 1, user_id=moving_user,
                                      uci=move.uci(), san=san, fen_before=fen_before, fen_after=board.fen()))
        if board.is_game_over(claim_draw=True):
            self._finish(game, board.result(claim_draw=True), board.outcome(claim_draw=True).termination.name.lower())
        self.session.commit()
        return self._serialize(game, user_id)

    def action(self, game_id: str, user_id: str, action: str) -> dict:
        game = self._game(game_id, user_id, lock=True)
        if game.status != "active":
            raise GameError("Game is already complete", 409)
        board = _board_from_moves(self.session, game)
        elapsed = max(0, int((datetime.now(timezone.utc) - _utc(game.turn_started_at)).total_seconds() * 1000))
        remaining = game.white_time_ms if board.turn == chess.WHITE else game.black_time_ms
        if elapsed >= remaining:
            self._finish(game, _timeout_result(board), "timeout")
            self.session.commit()
            return self._serialize(game, user_id)
        other = game.black_user_id if user_id == game.white_user_id else game.white_user_id
        if action == "resign":
            self._finish(game, "0-1" if user_id == game.white_user_id else "1-0", "resignation")
        elif action == "offer_draw":
            game.draw_offered_by = user_id
        elif action == "accept_draw":
            if game.draw_offered_by != other:
                raise GameError("There is no draw offer from your opponent", 409)
            self._finish(game, "1/2-1/2", "agreement")
        elif action == "decline_draw":
            if game.draw_offered_by != other:
                raise GameError("There is no draw offer from your opponent", 409)
            game.draw_offered_by = None
        elif action == "withdraw_draw":
            if game.draw_offered_by != user_id:
                raise GameError("You have no active draw offer", 409)
            game.draw_offered_by = None
        elif action == "claim_draw":
            if not (board.can_claim_threefold_repetition() or board.can_claim_fifty_moves()):
                raise GameError("No draw can be claimed in the current position", 409)
            self._finish(game, "1/2-1/2", "claim")
        else:
            raise GameError("Unknown game action")
        self.session.commit()
        return self._serialize(game, user_id)

    def _finish(self, game: LiveGame, result: str, termination: str) -> None:
        if game.status == "completed":
            return
        white = self.session.get(UserAccount, game.white_user_id)
        black = self.session.get(UserAccount, game.black_user_id)
        if white is None or black is None:
            raise GameError("Game participant is unavailable", 500)

        is_casual = _event_name(game.pgn) == "Casual Match"
        if not is_casual:
            white_before, black_before = white.rating, black.rating
            score_white = 1.0 if result == "1-0" else 0.0 if result == "0-1" else 0.5
            expected_white = 1 / (1 + 10 ** ((black_before - white_before) / 400))
            delta_white = round(ELO_K * (score_white - expected_white))
            white.rating += delta_white
            black.rating -= delta_white
            white.games_played += 1
            black.games_played += 1
            if result == "1-0":
                white.wins += 1; black.losses += 1
            elif result == "0-1":
                black.wins += 1; white.losses += 1
            else:
                white.draws += 1; black.draws += 1
            self.session.add_all([
                CompetitiveRatingHistory(user_id=white.id, game_id=game.id, rating_before=white_before, rating_after=white.rating),
                CompetitiveRatingHistory(user_id=black.id, game_id=game.id, rating_before=black_before, rating_after=black.rating),
            ])
        game.status = "completed"
        game.result = result
        game.termination = termination
        game.finished_at = datetime.now(timezone.utc)
        game.draw_offered_by = None
        game.pgn = _pgn(_board_from_moves(self.session, game), result, event=_event_name(game.pgn))
        self.session.add(GameAnalysisJob(game_id=game.id, status="queued", analysis_version="stockfish_live_v1"))

    def _serialize(self, game: LiveGame, user_id: str) -> dict:
        white = self.session.get(UserAccount, game.white_user_id)
        black = self.session.get(UserAccount, game.black_user_id)
        ply_count = self.session.scalar(select(func.count()).select_from(LiveGameMove).where(LiveGameMove.game_id == game.id)) or 0
        analysis_job = self.session.get(GameAnalysisJob, game.id)
        return {"game_id": game.id, "status": game.status,
                "color": "white" if user_id == game.white_user_id else "black",
                "white_username": white.username, "black_username": black.username,
                "white_rating": game.white_rating_at_start, "black_rating": game.black_rating_at_start,
                "fen": game.current_fen, "pgn": game.pgn, "result": game.result,
                "termination": game.termination, "white_time_ms": game.white_time_ms,
                "black_time_ms": game.black_time_ms, "turn_started_at": game.turn_started_at,
                "ply_count": ply_count, "analysis_status": analysis_job.status if analysis_job else "not_queued",
                "draw_offered_by": (
                    None if game.draw_offered_by is None else "me" if user_id == game.draw_offered_by else "opponent"
                )}

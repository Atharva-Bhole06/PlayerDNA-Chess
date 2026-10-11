import unittest
import uuid

import chess
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.db.models import CompetitiveRatingHistory, LiveGame, LivePlayerDNAHistory, MatchQueueEntry, Player, UserAccount
from backend.services.live_game_service import GameError, LiveGameService
from backend.services.match_queue_service import MatchQueueService, live_dna_distance


class LivePlatformServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.alice = self._user("Alice", 1200)
        self.bob = self._user("Bob", 1220)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def _user(self, username, rating):
        player_id = f"live-{uuid.uuid4()}"
        user = UserAccount(id=str(uuid.uuid4()), username=username, username_key=username.casefold(),
                           password_hash="test-hash", player_id=player_id, rating=rating)
        self.session.add(Player(player_id=player_id, cohort_member=False))
        self.session.add(user)
        self.session.flush()
        return user

    def test_queue_pairs_distinct_similar_users_and_cancel_cleans_entry(self):
        queue = MatchQueueService(self.session)
        first = queue.join(self.alice)
        self.assertEqual(first["status"], "waiting")
        self.assertEqual(queue.status(self.alice)["status"], "waiting")
        second = queue.join(self.bob)
        self.assertEqual(second["status"], "matched")
        game = self.session.get(LiveGame, second["game_id"])
        self.assertNotEqual(game.white_user_id, game.black_user_id)
        self.assertEqual(game.current_fen, chess.Board().fen())
        self.assertEqual(self.session.scalar(select(func.count()).select_from(MatchQueueEntry)), 0)

        queue.join(self.alice)
        cancelled = queue.cancel(self.alice.id)
        self.assertEqual(cancelled["status"], "matched")  # the existing active game remains discoverable

    def test_agreed_draw_finalizes_once_and_records_rating_history(self):
        game = LiveGame(id=str(uuid.uuid4()), white_user_id=self.alice.id, black_user_id=self.bob.id,
                        status="active", current_fen=chess.Board().fen(), pgn="", white_time_ms=300_000,
                        black_time_ms=300_000, increment_ms=0)
        self.session.add(game)
        self.session.commit()
        service = LiveGameService(self.session)
        offered = service.action(game.id, self.alice.id, "offer_draw")
        self.assertEqual(offered["draw_offered_by"], "me")
        declined = service.action(game.id, self.bob.id, "decline_draw")
        self.assertIsNone(declined["draw_offered_by"])
        service.action(game.id, self.bob.id, "offer_draw")
        state = service.action(game.id, self.alice.id, "accept_draw")
        self.assertEqual(state["result"], "1/2-1/2")
        self.assertEqual(state["status"], "completed")
        self.assertIn('Result "1/2-1/2"', state["pgn"])
        self.assertEqual(self.session.scalar(select(func.count()).select_from(CompetitiveRatingHistory).where(
            CompetitiveRatingHistory.game_id == game.id)), 2)

    def test_moves_are_authoritative_and_checkmate_updates_elo_once(self):
        game = LiveGame(id=str(uuid.uuid4()), white_user_id=self.alice.id, black_user_id=self.bob.id,
                        status="active", current_fen=chess.Board().fen(), pgn="", white_time_ms=300_000,
                        black_time_ms=300_000, increment_ms=0)
        self.session.add(game)
        self.session.commit()
        white_id, black_id = game.white_user_id, game.black_user_id
        moves = [(white_id, "f2f3"), (black_id, "e7e5"), (white_id, "g2g4"), (black_id, "d8h4")]
        service = LiveGameService(self.session)
        with self.assertRaises(GameError):
            service.move(game.id, black_id, "e7e5", 0)
        with self.assertRaises(GameError):
            service.move(game.id, white_id, "e2e5", 0)
        for ply, (user_id, uci) in enumerate(moves):
            state = service.move(game.id, user_id, uci, ply)
        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["result"], "0-1")
        self.assertEqual(state["termination"], "checkmate")
        self.assertEqual(state["ply_count"], 4)
        self.assertIn("Qh4#", state["pgn"])
        self.assertIn('Result "0-1"', state["pgn"])
        self.assertEqual(self.session.scalar(select(func.count()).select_from(CompetitiveRatingHistory).where(
            CompetitiveRatingHistory.game_id == game.id)), 2)
        ratings = (self.session.get(UserAccount, white_id).rating, self.session.get(UserAccount, black_id).rating)
        with self.assertRaises(GameError):
            service.move(game.id, white_id, "e2e4", 4)
        self.assertEqual(ratings, (self.session.get(UserAccount, white_id).rating, self.session.get(UserAccount, black_id).rating))

    def test_live_dna_distance_requires_enough_analyzed_registered_profiles(self):
        self.assertIsNone(live_dna_distance(self.session, self.alice.id, self.bob.id))
        users = [self.alice, self.bob]
        users.extend(self._user(f"Player{index}", 1200) for index in range(3))
        for index, user in enumerate(users):
            self.session.add(LivePlayerDNAHistory(user_id=user.id, game_id=f"snapshot-{index}",
                games_analyzed=3, median_cpl=index * 10.0, cpl_std=index * 2.0,
                inaccuracies_per_100_cp_moves=index, feature_version="live_dna_raw_v1"))
        self.session.commit()
        distance = live_dna_distance(self.session, users[0].id, users[1].id)
        self.assertIsNotNone(distance)
        self.assertGreater(distance, 0)


if __name__ == "__main__":
    unittest.main()

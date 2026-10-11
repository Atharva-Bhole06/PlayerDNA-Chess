import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.db.base import Base
from backend.db.models import Player, UserAccount, UserSession
from backend.services.auth_service import AuthService, InvalidCredentialsError, UsernameTakenError


class AuthServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite://")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.service = AuthService(self.session)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_register_hashes_password_and_creates_non_cohort_player(self):
        user, token = self.service.register("ChessFan", "long-secure-password")
        self.assertNotEqual(user.password_hash, "long-secure-password")
        self.assertTrue(user.password_hash.startswith("pbkdf2_sha256$"))
        self.assertTrue(token)
        player = self.session.get(Player, user.player_id)
        self.assertFalse(player.cohort_member)
        self.assertEqual(self.service.authenticate(token).id, user.id)
        self.assertEqual(self.service.profile(user)["rating"], 1200)

    def test_duplicate_username_is_case_insensitive_and_invalid_login_is_generic(self):
        self.service.register("ChessFan", "long-secure-password")
        with self.assertRaises(UsernameTakenError):
            self.service.register("chessfan", "another-secure-password")
        with self.assertRaises(InvalidCredentialsError):
            self.service.login("ChessFan", "incorrect-password")

    def test_logout_revokes_session(self):
        _, token = self.service.register("ChessFan", "long-secure-password")
        self.assertIsNotNone(self.service.authenticate(token))
        self.service.logout(token)
        self.assertIsNone(self.service.authenticate(token))
        self.assertEqual(self.session.scalar(select(UserSession)), None)


if __name__ == "__main__":
    unittest.main()

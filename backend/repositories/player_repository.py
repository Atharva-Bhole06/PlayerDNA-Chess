from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import DNA_VERSION, Player, PlayerDNA, PlayerProfile


class PlayerRepository:
    def __init__(self, session: Session):
        self.session = session

    def list_players(self):
        statement = (
            select(Player, PlayerProfile)
            .outerjoin(PlayerProfile, PlayerProfile.player_id == Player.player_id)
            .where(Player.cohort_member.is_(True))
            .order_by(Player.player_id)
        )
        return self.session.execute(statement).all()

    def get_player(self, player_id: str):
        player = self.session.get(Player, player_id)
        if player is None or not player.cohort_member:
            return None
        profile = self.session.get(PlayerProfile, player_id)
        dna = self.session.get(PlayerDNA, (player_id, DNA_VERSION))
        return player, profile, dna

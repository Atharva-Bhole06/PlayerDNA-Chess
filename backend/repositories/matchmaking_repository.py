import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import DNA_VERSION, PlayerDNA, PlayerProfile


class MatchmakingRepository:
    def __init__(self, session: Session):
        self.session = session

    def load_dna_frame(self) -> pd.DataFrame:
        statement = (
            select(PlayerDNA, PlayerProfile)
            .join(PlayerProfile, PlayerProfile.player_id == PlayerDNA.player_id)
            .where(PlayerDNA.version == DNA_VERSION)
            .order_by(PlayerDNA.player_id)
        )
        rows = self.session.execute(statement).all()
        return pd.DataFrame([
            {
                "player_id": dna.player_id,
                "dna_median_cpl": dna.dna_median_cpl,
                "dna_cpl_std": dna.dna_cpl_std,
                "dna_inaccuracies_per_100_cp_moves": dna.dna_inaccuracies_per_100_cp_moves,
                "median_cpl": profile.median_cpl,
                "cpl_std": profile.cpl_std,
                "inaccuracies_per_100_cp_moves": profile.inaccuracies_per_100_cp_moves,
            }
            for dna, profile in rows
        ])

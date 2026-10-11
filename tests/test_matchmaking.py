import unittest
import numpy as np
import pandas as pd

from Scripts.matchmaking import (
    DNA_FILE,
    METHODS,
    all_pairwise_rankings,
    get_recommendations,
    validate_dna,
)


class MatchmakingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frame = pd.read_csv(DNA_FILE)
        validate_dna(cls.frame)

    def test_all_methods_exclude_self_and_rank_in_order(self):
        for method in METHODS:
            result = get_recommendations(
                self.frame.iloc[0]["player_id"],
                top_n=29,
                method=method,
                frame=self.frame,
            )
            self.assertEqual(len(result), 29)
            self.assertTrue(all(
                row["recommended_player_id"] != row["player_id"]
                for row in result
            ))
            self.assertEqual([row["rank"] for row in result], list(range(1, 30)))
            scores = [row["score"] for row in result]
            if method == "cosine":
                self.assertTrue(all(a >= b for a, b in zip(scores, scores[1:])))
            else:
                self.assertTrue(all(a <= b for a, b in zip(scores, scores[1:])))

    def test_top_n_is_capped_to_other_players(self):
        player_id = self.frame.iloc[0]["player_id"]
        self.assertEqual(len(get_recommendations(
            player_id, top_n=1, frame=self.frame
        )), 1)
        self.assertEqual(len(get_recommendations(
            player_id, top_n=30, frame=self.frame
        )), 29)
        self.assertEqual(len(get_recommendations(
            player_id, top_n=100, frame=self.frame
        )), 29)

    def test_invalid_player_and_top_n_are_rejected(self):
        with self.assertRaises(ValueError):
            get_recommendations("not-a-player", frame=self.frame)
        for invalid in (0, -1, True, 1.5):
            with self.subTest(top_n=invalid):
                with self.assertRaises(ValueError):
                    get_recommendations(
                        self.frame.iloc[0]["player_id"],
                        top_n=invalid,
                        frame=self.frame,
                    )

    def test_only_explicitly_supported_mode_is_accepted(self):
        with self.assertRaises(ValueError):
            get_recommendations(
                self.frame.iloc[0]["player_id"],
                mode="balanced_opponent",
                frame=self.frame,
            )

    def test_identical_vectors_tie_deterministically_and_exclude_self(self):
        identical = self.frame.copy()
        identical.loc[:, ["dna_median_cpl", "dna_cpl_std",
                          "dna_inaccuracies_per_100_cp_moves"]] = 1.0
        player_id = identical.iloc[0]["player_id"]
        result = get_recommendations(player_id, top_n=5, frame=identical)
        expected = sorted(set(identical.player_id) - {player_id})[:5]
        self.assertEqual([r["recommended_player_id"] for r in result], expected)
        self.assertTrue(all(np.isfinite(r["score"]) for r in result))

    def test_extreme_but_finite_vectors_remain_ordered(self):
        extreme = self.frame.iloc[:3].copy().reset_index(drop=True)
        extreme.loc[:, ["dna_median_cpl", "dna_cpl_std",
                        "dna_inaccuracies_per_100_cp_moves"]] = [
            [1e100, 0, 0], [-1e100, 0, 0], [0, 1, 0]
        ]
        result = get_recommendations(
            extreme.iloc[0].player_id, top_n=2, frame=extreme
        )
        self.assertTrue(all(np.isfinite(r["score"]) for r in result))
        self.assertEqual(result[0]["recommended_player_id"], extreme.iloc[2].player_id)

    def test_duplicate_ids_and_missing_features_are_rejected(self):
        duplicate = pd.concat([self.frame, self.frame.iloc[[0]]], ignore_index=True)
        with self.assertRaises(ValueError):
            validate_dna(duplicate)
        missing = self.frame.copy()
        missing.loc[0, "dna_median_cpl"] = float("nan")
        with self.assertRaises(ValueError):
            validate_dna(missing)

    def test_knn_euclidean_is_same_neighbor_order_as_euclidean(self):
        player_id = self.frame.iloc[0]["player_id"]
        euclidean = get_recommendations(
            player_id, top_n=29, method="euclidean", frame=self.frame
        )
        knn = get_recommendations(
            player_id, top_n=29, method="knn_euclidean", frame=self.frame
        )
        self.assertEqual(
            [r["recommended_player_id"] for r in euclidean],
            [r["recommended_player_id"] for r in knn],
        )

    def test_all_ordered_pairwise_rows_are_complete(self):
        pairs = all_pairwise_rankings(self.frame)
        self.assertEqual(len(pairs), 30 * 29 * len(METHODS))
        self.assertFalse((pairs["player_id"] == pairs["candidate_id"]).any())
        self.assertTrue((pairs.groupby(["player_id", "method"]).size() == 29).all())


if __name__ == "__main__":
    unittest.main()

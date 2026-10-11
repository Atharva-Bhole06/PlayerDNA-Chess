import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from Scripts.player_dataset import (
    DEFAULT_INPUT,
    DEFAULT_MANIFEST,
    DEFAULT_OUTPUT,
    DatasetConflictError,
    build_player_game_records,
    canonicalize_source_games,
    generate_from_paths,
    load_manifest,
    read_games,
    validate_player_game_records,
)


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PLAYERS = [
    "dipset", "fandm-lancaster", "blazingdragon", "zapala", "robixy",
    "juncinmestrella", "kevchod", "derspiegel", "taranga", "totonut",
    "pavelsps", "mukrisp", "khelil", "ri_chess", "samoo1477",
    "thebadfish", "vladimir-kramnik-1", "ssf7", "tetley", "docboss",
    "bobc", "bleda", "jdbarger", "aaaaaaaddd", "islam01",
    "anastasia2009", "bear789", "jeffersondarcy1", "erikweisz", "gjdgjdfj",
]


def fixture_games(games_per_player=41):
    rows = []
    for player_index, player_id in enumerate(MANIFEST_PLAYERS):
        for game_number in range(games_per_player):
            rows.append({
                "id": f"fixture-{player_index:02}-{game_number:03}",
                "rated": True,
                "created_at": float(1_500_000_000_000 + game_number),
                "last_move_at": float(1_500_000_000_100 + game_number),
                "turns": 1,
                "victory_status": "resign",
                "winner": "white",
                "increment_code": "10+0",
                "white_id": player_id,
                "white_rating": 1500 + player_index,
                "black_id": f"opponent-{player_index:02}-{game_number:03}",
                "black_rating": 1400,
                "moves": "e4",
                "opening_eco": "A00",
                "opening_name": "Test opening",
                "opening_ply": 1,
            })
    return pd.DataFrame(rows)


def write_source(path, frame):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as output:
        output.write("# test source header\n# metadata\n\n")
        frame.to_csv(output, index=False)


class DatasetPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = load_manifest(DEFAULT_MANIFEST)
        cls.source = read_games(DEFAULT_INPUT)
        cls.existing_records = pd.read_csv(DEFAULT_OUTPUT)
        cls.existing_processed = pd.read_csv(ROOT / "data" / "processed_player_games.csv")

    def test_manifest_preserves_requested_player_order(self):
        self.assertEqual(self.manifest["players"], MANIFEST_PLAYERS)
        self.assertEqual(self.manifest["games_per_player"], 40)

    def test_real_source_recreates_existing_first_1200_records(self):
        generated, _audit = build_player_game_records(self.source, self.manifest)
        expected = self.existing_records.iloc[:1200].reset_index(drop=True)
        self.assertEqual(generated.shape, (1200, 14))
        self.assertEqual(generated.player_id.drop_duplicates().tolist(), MANIFEST_PLAYERS)
        self.assertTrue((generated.groupby("player_id").size() == 40).all())
        pd.testing.assert_frame_equal(generated, expected, check_dtype=False)

    def test_real_duplicate_audit_classifies_all_repeated_ids(self):
        generated, audit = build_player_game_records(self.source, self.manifest)
        self.assertEqual(len(generated), 1200)
        self.assertEqual(len(audit), 813)
        self.assertEqual(int(audit.exact_duplicate_rows.sum()), 429)
        self.assertEqual(int(audit.gameplay_conflict.sum()), 0)
        timestamp_only = audit.differing_fields.map(
            lambda fields: bool(fields)
            and set(fields.split(",")) <= {"created_at", "last_move_at"}
        )
        self.assertEqual(int(timestamp_only.sum()), 516)
        self.assertTrue(
            audit.loc[timestamp_only, "created_at_variants"]
            .str.contains("|", regex=False)
            .all()
        )

    def test_first_40_source_games_and_exact_cohort_order(self):
        source = fixture_games()
        generated, _audit = build_player_game_records(source, self.manifest)
        self.assertEqual(len(generated), 1200)
        self.assertEqual(generated.player_id.drop_duplicates().tolist(), MANIFEST_PLAYERS)
        for player_index, player_id in enumerate(MANIFEST_PLAYERS):
            actual = generated.loc[generated.player_id == player_id, "game_id"].tolist()
            expected = [f"fixture-{player_index:02}-{i:03}" for i in range(40)]
            self.assertEqual(actual, expected)

    def test_exact_duplicate_and_timestamp_only_conflict_keep_first_occurrence(self):
        source = fixture_games().iloc[:].copy()
        first = source.iloc[[0]].copy()
        exact_duplicate = pd.concat([source, first], ignore_index=True)
        exact_records, exact_audit = build_player_game_records(exact_duplicate, self.manifest)
        self.assertEqual(len(exact_records), 1200)
        self.assertEqual(int(exact_audit.exact_duplicate_rows.sum()), 1)

        timestamp_variant = first.copy()
        timestamp_variant.loc[:, "created_at"] = 1_600_000_000_000.0
        timestamp_variant.loc[:, "last_move_at"] = 1_600_000_000_100.0
        conflicted = pd.concat([source, timestamp_variant], ignore_index=True)
        canonical, _canonical_audit = canonicalize_source_games(conflicted)
        self.assertEqual(
            canonical.loc[canonical.id == first.iloc[0].id, "created_at"].iloc[0],
            first.iloc[0].created_at,
        )
        records, audit = build_player_game_records(conflicted, self.manifest)
        self.assertEqual(len(records), 1200)
        self.assertEqual(records.iloc[0].game_id, first.iloc[0].id)
        row = audit.loc[audit.game_id == first.iloc[0].id].iloc[0]
        self.assertEqual(row.differing_fields, "created_at,last_move_at")
        self.assertFalse(row.gameplay_conflict)
        self.assertEqual(len(row.created_at_variants.split(" | ")), 2)

    def test_gameplay_conflict_writes_compact_audit_and_fails_without_output(self):
        source = fixture_games()
        conflict = source.iloc[[0]].copy()
        conflict.loc[:, "moves"] = "d4"
        source = pd.concat([source, conflict], ignore_index=True)
        with tempfile.TemporaryDirectory(prefix="playerdna_conflict_test_") as directory:
            folder = Path(directory)
            source_path = folder / "games.csv"
            manifest_path = folder / "manifest.json"
            output_path = folder / "player_game_records.csv"
            audit_path = folder / "game_id_duplicate_audit.csv"
            write_source(source_path, source)
            shutil.copyfile(DEFAULT_MANIFEST, manifest_path)
            with self.assertRaisesRegex(DatasetConflictError, "gameplay fields"):
                generate_from_paths(source_path, manifest_path, output_path, audit_path)
            self.assertTrue(audit_path.is_file())
            self.assertFalse(output_path.exists())
            audit = pd.read_csv(audit_path)
            self.assertIn("moves", audit.loc[0, "differing_fields"])
            self.assertTrue(bool(audit.loc[0, "gameplay_conflict"]))

    def test_consecutive_runs_are_byte_repeatable(self):
        source = fixture_games()
        with tempfile.TemporaryDirectory(prefix="playerdna_repeatability_test_") as directory:
            folder = Path(directory)
            source_path = folder / "games.csv"
            manifest_path = folder / "manifest.json"
            shutil.copyfile(DEFAULT_MANIFEST, manifest_path)
            write_source(source_path, source)
            paths = [
                (folder / "records_a.csv", folder / "audit_a.csv"),
                (folder / "records_b.csv", folder / "audit_b.csv"),
            ]
            for output, audit in paths:
                generate_from_paths(source_path, manifest_path, output, audit)
            self.assertEqual(paths[0][0].read_bytes(), paths[1][0].read_bytes())
            self.assertEqual(paths[0][1].read_bytes(), paths[1][1].read_bytes())

    def test_processing_stage_requires_manifest_cohort_not_3000_rows(self):
        valid = self.existing_records.iloc[:1200].copy()
        validate_player_game_records(valid, self.manifest)
        oversized = pd.concat(
            [valid, valid, valid.iloc[:600]],
            ignore_index=True,
        )
        self.assertEqual(len(oversized), 3000)
        with self.assertRaisesRegex(ValueError, "Expected the selected cohort's 1200 records"):
            validate_player_game_records(oversized, self.manifest)

    def test_temporary_full_pipeline_matches_existing_processed_keys_and_values(self):
        with tempfile.TemporaryDirectory(prefix="playerdna_pipeline_test_") as directory:
            project = Path(directory)
            data_dir = project / "data"
            scripts_dir = project / "Scripts"
            data_dir.mkdir()
            scripts_dir.mkdir()
            manifest_path = data_dir / "player_cohort_manifest.json"
            shutil.copyfile(DEFAULT_MANIFEST, manifest_path)
            generated, _audit = build_player_game_records(self.source, self.manifest)
            generated.to_csv(data_dir / "player_game_records.csv", index=False)
            shutil.copyfile(ROOT / "Scripts" / "process_chess_games.py", scripts_dir / "process_chess_games.py")
            shutil.copyfile(ROOT / "Scripts" / "player_dataset.py", scripts_dir / "player_dataset.py")
            run = subprocess.run(
                [sys.executable, str(scripts_dir / "process_chess_games.py")],
                cwd=project,
                capture_output=True,
                text=True,
                timeout=120,
            )
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            generated_processed = pd.read_csv(data_dir / "processed_player_games.csv")
            self.assertEqual(len(generated_processed), 1200)
            self.assertEqual(
                list(zip(generated_processed.player_id, generated_processed.game_id)),
                list(zip(self.existing_processed.player_id, self.existing_processed.game_id)),
            )
            pd.testing.assert_frame_equal(
                generated_processed,
                self.existing_processed,
                check_dtype=False,
            )


if __name__ == "__main__":
    unittest.main()

"""Catalog and manifest logic of generate.py (no torch needed)."""

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generate  # noqa: E402
from generate import CatalogError, load_catalog, parse_catalog, select_scenes  # noqa: E402

LIBRARY_TS = generate.REPO / "packages" / "dream-core" / "src" / "film" / "library.ts"

# Stills generated through the Space (branch 35-library-v0); their prompts are
# added to the catalog separately, so the catalog must not reuse these ids.
SPACE_IDS = {
    "hospital-corridor-ventilator",
    "stairs-down",
    "stairwell-door-ajar",
    "stairwell-mailboxes",
    "yard-day-pigeons",
    "yard-dusk-empty-swing",
    "yard-night-vacuum-woman",
    "yard-night-window-silhouette",
}


def ts_tuple(name: str) -> tuple[str, ...]:
    text = LIBRARY_TS.read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = \[(.*?)\] as const;", text, re.S)
    assert match, name
    return tuple(re.findall(r"'([a-z_]+)'", match.group(1)))


def scene(id_: str, priority: int = 1, **tags: object) -> dict:
    base = {"location": "yard", "motifs": [], "people": "none", "mood": "calm", "time": "day"}
    base.update(tags)
    return {"id": id_, "priority": priority, "tags": base, "scene": f"scene {id_}"}


def catalog_of(*scenes: dict) -> generate.Catalog:
    return parse_catalog(
        {"version": 1, "model": "m", "license": "Apache-2.0", "style": "style.", "scenes": list(scenes)}
    )


class VocabularyTest(unittest.TestCase):
    def test_tags_match_library_ts(self) -> None:
        self.assertEqual(generate.LOCATION_TAGS, ts_tuple("LOCATION_TAGS"))
        self.assertEqual(generate.MOTIF_TAGS, ts_tuple("MOTIF_TAGS"))
        self.assertEqual(generate.PEOPLE_TAGS, ts_tuple("PEOPLE_TAGS"))
        self.assertEqual(generate.MOOD_TAGS, ts_tuple("MOOD_TAGS"))
        self.assertEqual(generate.TIME_TAGS, ts_tuple("TIME_TAGS"))


class CatalogFileTest(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = load_catalog(generate.DEFAULT_CATALOG)

    def test_size_and_coverage(self) -> None:
        scenes = self.catalog.scenes
        self.assertTrue(30 <= len(scenes) <= 40, len(scenes))
        scares = [s for s in scenes if s.tags["mood"] == "scare"]
        self.assertTrue(4 <= len(scares) <= 6, len(scares))
        self.assertEqual({s.tags["location"] for s in scenes}, set(generate.LOCATION_TAGS))
        self.assertEqual({s.tags["time"] for s in scenes}, set(generate.TIME_TAGS))
        motifs = {m for s in scenes for m in s.tags["motifs"]}
        self.assertEqual(motifs, set(generate.MOTIF_TAGS))

    def test_model_and_license(self) -> None:
        self.assertEqual(self.catalog.model, "Tongyi-MAI/Z-Image-Turbo")
        self.assertEqual(self.catalog.license, "Apache-2.0")

    def test_no_collision_with_space_stills(self) -> None:
        self.assertFalse({s.id for s in self.catalog.scenes} & SPACE_IDS)

    def test_seeds_are_stable_and_distinct(self) -> None:
        seeds = [s.generation_seed() for s in self.catalog.scenes]
        self.assertEqual(len(set(seeds)), len(seeds))
        self.assertTrue(all(0 <= s < 2**31 for s in seeds))
        first = self.catalog.scenes[0]
        self.assertEqual(first.generation_seed(), load_catalog(generate.DEFAULT_CATALOG).scenes[0].generation_seed())


class ValidationTest(unittest.TestCase):
    def test_rejects_unknown_tags(self) -> None:
        with self.assertRaises(CatalogError):
            catalog_of(scene("a", location="dacha"))
        with self.assertRaises(CatalogError):
            catalog_of(scene("a", motifs=["cat"]))
        with self.assertRaises(CatalogError):
            catalog_of(scene("a", mood="funny"))

    def test_rejects_duplicates_and_bad_ids(self) -> None:
        with self.assertRaises(CatalogError):
            catalog_of(scene("a"), scene("a"))
        with self.assertRaises(CatalogError):
            catalog_of(scene("Bad Id"))


class SelectTest(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = catalog_of(scene("c", 3), scene("a1", 1), scene("b", 2), scene("a2", 1))

    def test_priority_then_catalog_order(self) -> None:
        ids = [s.id for s in select_scenes(self.catalog, set())]
        self.assertEqual(ids, ["a1", "a2", "b", "c"])

    def test_skips_existing_and_limits(self) -> None:
        ids = [s.id for s in select_scenes(self.catalog, {"a1"}, limit=2)]
        self.assertEqual(ids, ["a2", "b"])

    def test_max_priority_and_ids(self) -> None:
        self.assertEqual([s.id for s in select_scenes(self.catalog, set(), max_priority=1)], ["a1", "a2"])
        self.assertEqual([s.id for s in select_scenes(self.catalog, {"b"}, ids=["c", "b"])], ["c"])
        with self.assertRaises(CatalogError):
            select_scenes(self.catalog, set(), ids=["zzz"])


class ManifestTest(unittest.TestCase):
    def test_asset_matches_library_asset_shape(self) -> None:
        catalog = catalog_of(scene("a", motifs=["swing"]))
        asset = generate.make_asset(catalog.scenes[0], catalog, width=1280, height=720, source="local-laptop")
        self.assertEqual(set(asset), {"id", "kind", "file", "width", "height", "tags", "generation"})
        self.assertEqual(asset["kind"], "still")
        self.assertEqual(asset["file"], "stills/a.webp")
        self.assertEqual(
            set(asset["generation"]), {"model", "license", "prompt", "seed", "source"}
        )
        self.assertEqual(asset["generation"]["prompt"], "scene a. style.")
        self.assertEqual(asset["generation"]["source"], "local-laptop")

    def test_upsert_and_atomic_write(self) -> None:
        catalog = catalog_of(scene("a"), scene("b"))
        a, b = (generate.make_asset(s, catalog, width=1280, height=720, source="x") for s in catalog.scenes)
        manifest = generate.upsert_asset(generate.upsert_asset(generate.empty_manifest(), a), b)
        manifest = generate.upsert_asset(manifest, {**a, "width": 640})
        self.assertEqual([x["id"] for x in manifest["assets"]], ["b", "a"])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "library.json"
            generate.write_json_atomic(path, manifest)
            self.assertEqual(generate.load_manifest(path), manifest)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["version"], 1)
            (Path(tmp) / "stills").mkdir()
            (Path(tmp) / "stills" / "c.webp").write_bytes(b"")
            self.assertEqual(generate.existing_ids(Path(tmp), manifest), {"a", "b", "c"})

    def test_missing_manifest_is_empty(self) -> None:
        self.assertEqual(generate.load_manifest(Path("does-not-exist.json")), generate.empty_manifest())


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any, Iterator


REPO_ROOT = Path(__file__).resolve().parents[3]
BUILD_SCRIPT = REPO_ROOT / "tools" / "geo" / "build-casur-geometry.py"
PUBLISHED_DIR = REPO_ROOT / "shared" / "geo" / "data"

spec = importlib.util.spec_from_file_location("casur_geo_build", BUILD_SCRIPT)
assert spec and spec.loader
geo_build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geo_build)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def coordinate_pairs(coordinates: Any) -> Iterator[tuple[float, float]]:
    if (
        isinstance(coordinates, list)
        and len(coordinates) >= 2
        and isinstance(coordinates[0], (int, float))
        and isinstance(coordinates[1], (int, float))
    ):
        yield float(coordinates[0]), float(coordinates[1])
        return
    for child in coordinates:
        yield from coordinate_pairs(child)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PublishedGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = load_json(PUBLISHED_DIR / "manifest.json")
        cls.zone_files = {
            zone: load_json(PUBLISHED_DIR / details["file"])
            for zone, details in cls.manifest["zones"].items()
        }

    def test_manifest_contract_and_index(self) -> None:
        manifest = self.manifest
        self.assertEqual(manifest["schema"], "casur-master-geometry")
        self.assertEqual(manifest["schemaVersion"], 2)
        self.assertEqual(manifest["dataVersion"], "2026-07-24-maestro-26-27-r2")
        self.assertEqual(manifest["crs"], "EPSG:4326")
        self.assertEqual(manifest["coordinateDecimals"], 6)
        self.assertEqual(len(manifest["lotIndex"]), manifest["lotCount"])
        self.assertEqual(list(manifest["lotIndex"]), sorted(manifest["lotIndex"]))
        self.assertEqual(
            set(manifest["zones"]),
            {"1-Sur", "2-Centro", "3-Norte", "5-Productores"},
        )

    def test_zone_files_are_minimal_sorted_multipolygons(self) -> None:
        rebuilt_index: dict[str, str] = {}
        agronomic_fields = {
            "variedad", "tch", "edad", "corte", "riego", "tenencia",
            "fechaSiembra", "fechaCosecha", "toneladas", "nc", "destino",
            "renov", "t_sue", "surco", "area_ha",
        }
        for zone, collection in self.zone_files.items():
            self.assertEqual(collection["type"], "FeatureCollection")
            self.assertEqual(collection["properties"]["zone"], zone)
            lot_ids = [feature["properties"]["lotId"] for feature in collection["features"]]
            self.assertEqual(lot_ids, sorted(lot_ids))
            self.assertEqual(len(lot_ids), self.manifest["zones"][zone]["lotCount"])
            for feature in collection["features"]:
                properties = feature["properties"]
                self.assertEqual(set(properties), {"lotId", "fragmentCount", "anchor"})
                self.assertTrue(agronomic_fields.isdisjoint({key.lower() for key in properties}))
                self.assertEqual(feature["geometry"]["type"], "MultiPolygon")
                self.assertEqual(properties["fragmentCount"], len(feature["geometry"]["coordinates"]))
                anchor = properties["anchor"]
                self.assertEqual(len(anchor), 2)
                self.assertEqual(anchor[0], round(anchor[0], 6))
                self.assertEqual(anchor[1], round(anchor[1], 6))
                rounded_geometry = geo_build.shape(feature["geometry"])
                largest = max(rounded_geometry.geoms, key=lambda polygon: polygon.area)
                self.assertTrue(largest.covers(geo_build.Point(anchor)))
                self.assertEqual(len(feature["bbox"]), 4)
                self.assertLessEqual(feature["bbox"][0], feature["bbox"][2])
                self.assertLessEqual(feature["bbox"][1], feature["bbox"][3])
                for longitude, latitude in coordinate_pairs(feature["geometry"]["coordinates"]):
                    self.assertGreaterEqual(longitude, -180)
                    self.assertLessEqual(longitude, 180)
                    self.assertGreaterEqual(latitude, -90)
                    self.assertLessEqual(latitude, 90)
                    self.assertEqual(longitude, round(longitude, 6))
                    self.assertEqual(latitude, round(latitude, 6))
                rebuilt_index[properties["lotId"]] = zone
        self.assertEqual(rebuilt_index, self.manifest["lotIndex"])

    def test_zone_hashes_and_counts(self) -> None:
        total_lots = 0
        for zone, details in self.manifest["zones"].items():
            path = PUBLISHED_DIR / details["file"]
            self.assertEqual(sha256(path), details["sha256"])
            self.assertEqual(path.stat().st_size, details["bytes"])
            total_lots += details["lotCount"]
        self.assertEqual(total_lots, self.manifest["lotCount"])

    def test_canonical_75907_preserves_fragments(self) -> None:
        zone = self.manifest["lotIndex"]["75907"]
        feature = next(
            item
            for item in self.zone_files[zone]["features"]
            if item["properties"]["lotId"] == "75907"
        )
        self.assertEqual(feature["geometry"]["type"], "MultiPolygon")
        self.assertEqual(feature["properties"]["fragmentCount"], 2)
        self.assertTrue(
            geo_build.shape(feature["geometry"]).covers(
                geo_build.Point(feature["properties"]["anchor"])
            )
        )


@unittest.skipUnless(os.environ.get("CASUR_GEO_SOURCE"), "CASUR_GEO_SOURCE no definido")
class RealSourceDeterminismTests(unittest.TestCase):
    def test_two_rebuilds_match_each_other_and_publication(self) -> None:
        source = Path(os.environ["CASUR_GEO_SOURCE"])
        manifest = load_json(PUBLISHED_DIR / "manifest.json")
        frame = geo_build.gpd.read_file(source, engine="pyogrio")
        normalized_ids = frame["CodSuerte"].map(geo_build.normalize_geo_lot_id)
        self.assertEqual(frame.crs.to_epsg(), 4326)
        self.assertEqual(len(frame), manifest["physicalFeatureCount"])
        self.assertEqual(
            {key: int(value) for key, value in frame.geometry.geom_type.value_counts().sort_index().items()},
            manifest["sourceGeometryTypes"],
        )
        self.assertEqual(int((~frame.geometry.is_valid).sum()), manifest["repairedGeometryCount"])
        self.assertEqual(int(normalized_ids.eq("").sum()), manifest["missingLotIdCount"])
        self.assertEqual(normalized_ids[normalized_ids.ne("")].nunique(), manifest["lotCount"])
        self.assertEqual(sha256(source), manifest["sourceSha256"])
        with tempfile.TemporaryDirectory(prefix="casur-geo-test-") as temp:
            first = Path(temp) / "first"
            second = Path(temp) / "second"
            geo_build.build_geometry_dataset(
                source,
                first,
                manifest["dataVersion"],
                manifest["sourceSha256"],
            )
            geo_build.build_geometry_dataset(
                source,
                second,
                manifest["dataVersion"],
                manifest["sourceSha256"],
            )
            expected_files = {"manifest.json"} | {
                details["file"] for details in manifest["zones"].values()
            }
            for filename in expected_files:
                first_bytes = (first / filename).read_bytes()
                self.assertEqual(first_bytes, (second / filename).read_bytes())
                self.assertEqual(first_bytes, (PUBLISHED_DIR / filename).read_bytes())


if __name__ == "__main__":
    unittest.main()

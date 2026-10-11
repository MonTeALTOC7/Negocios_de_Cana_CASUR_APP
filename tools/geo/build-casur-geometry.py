#!/usr/bin/env python3
"""Build the minimal, deterministic CASUR web geometry dataset.

The source Shape remains external to the repository.  Published GeoJSON keeps
only the canonical lot identity, a fragment count, bounding boxes and geometry.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

import geopandas as gpd
import pyogrio  # noqa: F401 - fail early when the requested build engine is absent
from shapely import make_valid, normalize, to_wkb
from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon, mapping, shape
from shapely.geometry.base import BaseGeometry


SCHEMA = "casur-master-geometry"
SCHEMA_VERSION = 2
COORDINATE_DECIMALS = 6
DEFAULT_DATA_VERSION = "2026-07-24-maestro-26-27-r2"

ZONE_FILES = {
    "1-Sur": "zona-1-sur.geojson",
    "2-Centro": "zona-2-centro.geojson",
    "3-Norte": "zona-3-norte.geojson",
    "5-Productores": "zona-5-productores.geojson",
}

ZONE_ALIASES = {key.upper(): key for key in ZONE_FILES}
REQUIRED_SHAPE_SUFFIXES = {".shp", ".shx", ".dbf", ".prj", ".cpg"}


class BuildError(RuntimeError):
    """Raised when the source cannot produce the expected geographic contract."""


def normalize_geo_lot_id(value: Any) -> str:
    """Return the canonical geographic identity used by the web runtime."""

    if value is None:
        return ""
    normalized = str(value).strip().upper()
    if normalized in {"NAN", "<NA>"}:
        return ""
    return normalized


def normalize_zone(value: Any) -> str:
    raw = normalize_geo_lot_id(value)
    try:
        return ZONE_ALIASES[raw]
    except KeyError as error:
        raise BuildError(f"Zona geográfica no soportada: {value!r}") from error


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _inspect_shape_zip(source: Path) -> None:
    if not source.is_file():
        raise BuildError(f"No existe la fuente: {source}")
    if source.suffix.lower() != ".zip":
        raise BuildError("La fuente oficial debe entregarse como ZIP de Shapefile")

    with zipfile.ZipFile(source) as archive:
        entries = [Path(name) for name in archive.namelist() if not name.endswith("/")]
        stems = {entry.with_suffix("").as_posix() for entry in entries if entry.suffix.lower() == ".shp"}
        if len(stems) != 1:
            raise BuildError(f"Se esperaba un solo .shp; encontrados: {len(stems)}")
        stem = next(iter(stems))
        suffixes = {
            entry.suffix.lower()
            for entry in entries
            if entry.with_suffix("").as_posix() == stem
        }
        missing = REQUIRED_SHAPE_SUFFIXES - suffixes
        if missing:
            raise BuildError(f"Componentes de Shape faltantes: {', '.join(sorted(missing))}")


def _extract_polygons(geometry: BaseGeometry | None) -> list[Polygon]:
    if geometry is None or geometry.is_empty:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, (MultiPolygon, GeometryCollection)):
        polygons: list[Polygon] = []
        for component in geometry.geoms:
            polygons.extend(_extract_polygons(component))
        return polygons
    return []


def _round_coordinates(value: Any) -> Any:
    """Round a GeoJSON coordinate tree without deleting or merging vertices."""

    if isinstance(value, (float, int)):
        return round(float(value), COORDINATE_DECIMALS)
    if isinstance(value, (list, tuple)):
        return [_round_coordinates(child) for child in value]
    raise BuildError(f"Valor de coordenada inesperado: {value!r}")


def _polygon_sort_key(polygon: Polygon) -> tuple[Any, ...]:
    bounds = tuple(round(value, COORDINATE_DECIMALS) for value in polygon.bounds)
    return (*bounds, to_wkb(polygon, hex=True))


def _round_bbox(bounds: Iterable[float]) -> list[float]:
    return [round(float(value), COORDINATE_DECIMALS) for value in bounds]


def _json_bytes(value: Any, *, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def _representative_anchor(geometry: MultiPolygon) -> list[float]:
    """Return a deterministic six-decimal point covered by the largest part.

    The anchor is calculated from the already-rounded publication geometry so
    the browser, tests and generated payload all evaluate the same polygon.
    Rounding the representative point can move it just outside a very narrow
    polygon, therefore nearby grid points are checked deterministically.
    """

    largest = max(geometry.geoms, key=lambda polygon: (polygon.area, _polygon_sort_key(polygon)))
    representative = largest.representative_point()
    x0 = round(float(representative.x), COORDINATE_DECIMALS)
    y0 = round(float(representative.y), COORDINATE_DECIMALS)
    candidate = Point(x0, y0)
    if largest.covers(candidate):
        return [x0, y0]

    step = 10 ** -COORDINATE_DECIMALS
    for radius in range(1, 101):
        offsets = (
            [(dx, -radius) for dx in range(-radius, radius + 1)]
            + [(radius, dy) for dy in range(-radius + 1, radius + 1)]
            + [(dx, radius) for dx in range(radius - 1, -radius - 1, -1)]
            + [(-radius, dy) for dy in range(radius - 1, -radius, -1)]
        )
        for dx, dy in offsets:
            point = Point(round(x0 + dx * step, COORDINATE_DECIMALS), round(y0 + dy * step, COORDINATE_DECIMALS))
            if largest.covers(point):
                return [float(point.x), float(point.y)]
    raise BuildError("No se pudo calcular un anchor interior a seis decimales")


def _feature(lot_id: str, polygons: list[Polygon]) -> dict[str, Any]:
    ordered = sorted((normalize(polygon) for polygon in polygons), key=_polygon_sort_key)
    geometry = MultiPolygon(ordered)
    geojson_geometry = mapping(geometry)
    geojson_geometry["coordinates"] = _round_coordinates(geojson_geometry["coordinates"])
    rounded_geometry = shape(geojson_geometry)
    anchor = _representative_anchor(rounded_geometry)
    return {
        "type": "Feature",
        "bbox": _round_bbox(rounded_geometry.bounds),
        "properties": {
            "lotId": lot_id,
            "fragmentCount": len(ordered),
            "anchor": anchor,
        },
        "geometry": geojson_geometry,
    }


def _bounds_for_features(features: list[dict[str, Any]]) -> list[float]:
    if not features:
        raise BuildError("No se puede publicar una zona sin geometrías")
    boxes = [feature["bbox"] for feature in features]
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def build_geometry_dataset(
    source: Path,
    output_dir: Path,
    data_version: str = DEFAULT_DATA_VERSION,
    expected_source_sha256: str | None = None,
) -> dict[str, Any]:
    """Build all zone files and the manifest, returning a deterministic report."""

    source = source.resolve()
    output_dir = output_dir.resolve()
    _inspect_shape_zip(source)
    source_sha256 = sha256_file(source)
    if expected_source_sha256 and source_sha256.lower() != expected_source_sha256.lower():
        raise BuildError(
            f"SHA-256 de fuente inesperado: {source_sha256}; esperado {expected_source_sha256.lower()}"
        )

    frame = gpd.read_file(source, engine="pyogrio")
    required_fields = {"CodSuerte", "ZONA", "geometry"}
    missing_fields = required_fields - set(frame.columns)
    if missing_fields:
        raise BuildError(f"Campos requeridos ausentes: {', '.join(sorted(missing_fields))}")
    if frame.crs is None or frame.crs.to_epsg() != 4326:
        raise BuildError(f"CRS inesperado: {frame.crs}; se requiere EPSG:4326")

    physical_feature_count = len(frame)
    source_geometry_types = {
        key: int(value) for key, value in frame.geometry.geom_type.value_counts().sort_index().items()
    }
    if frame.geometry.isna().any() or frame.geometry.is_empty.any():
        raise BuildError("La fuente contiene geometrías nulas o vacías")
    unsupported = sorted(set(frame.geometry.geom_type) - {"Polygon", "MultiPolygon"})
    if unsupported:
        raise BuildError(f"Tipos geométricos no soportados: {', '.join(unsupported)}")

    lot_polygons: dict[str, list[Polygon]] = defaultdict(list)
    lot_zones: dict[str, str] = {}
    zone_physical_counts: dict[str, int] = defaultdict(int)
    repaired_geometry_count = 0
    missing_lot_id_count = 0
    published_physical_feature_count = 0

    for row in frame.itertuples(index=False):
        lot_id = normalize_geo_lot_id(row.CodSuerte)
        if not lot_id:
            missing_lot_id_count += 1
            continue

        zone = normalize_zone(row.ZONA)
        previous_zone = lot_zones.setdefault(lot_id, zone)
        if previous_zone != zone:
            raise BuildError(f"CodSuerte {lot_id} aparece en {previous_zone} y {zone}")

        geometry = row.geometry
        if not geometry.is_valid:
            geometry = make_valid(geometry)
            repaired_geometry_count += 1
        polygons = _extract_polygons(geometry)
        if not polygons:
            raise BuildError(f"CodSuerte {lot_id} quedó sin componentes poligonales")
        if any(polygon.is_empty or not polygon.is_valid for polygon in polygons):
            raise BuildError(f"CodSuerte {lot_id} conserva componentes inválidos tras make_valid")

        lot_polygons[lot_id].extend(polygons)
        zone_physical_counts[zone] += 1
        published_physical_feature_count += 1

    if set(lot_zones.values()) != set(ZONE_FILES):
        raise BuildError(
            f"Conjunto de zonas inesperado: {sorted(set(lot_zones.values()))}; "
            f"esperado {list(ZONE_FILES)}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    zone_entries: dict[str, dict[str, Any]] = {}
    output_hashes: dict[str, str] = {}
    lot_index: dict[str, str] = {}
    all_bounds: list[list[float]] = []

    for zone, filename in ZONE_FILES.items():
        lot_ids = sorted(lot_id for lot_id, lot_zone in lot_zones.items() if lot_zone == zone)
        features = [_feature(lot_id, lot_polygons[lot_id]) for lot_id in lot_ids]
        zone_bounds = _bounds_for_features(features)
        collection = {
            "type": "FeatureCollection",
            "bbox": zone_bounds,
            "properties": {
                "schema": SCHEMA,
                "schemaVersion": SCHEMA_VERSION,
                "dataVersion": data_version,
                "zone": zone,
            },
            "features": features,
        }
        payload = _json_bytes(collection)
        (output_dir / filename).write_bytes(payload)
        digest = sha256_bytes(payload)
        gzip_size = len(gzip.compress(payload, compresslevel=9, mtime=0))
        fragment_count = sum(feature["properties"]["fragmentCount"] for feature in features)
        zone_entries[zone] = {
            "file": filename,
            "lotCount": len(features),
            "physicalFeatureCount": zone_physical_counts[zone],
            "fragmentCount": fragment_count,
            "bounds": zone_bounds,
            "bytes": len(payload),
            "gzipBytes": gzip_size,
            "sha256": digest,
        }
        output_hashes[filename] = digest
        all_bounds.append(zone_bounds)
        for lot_id in lot_ids:
            lot_index[lot_id] = zone

    global_bounds = [
        min(box[0] for box in all_bounds),
        min(box[1] for box in all_bounds),
        max(box[2] for box in all_bounds),
        max(box[3] for box in all_bounds),
    ]
    total_fragment_count = sum(entry["fragmentCount"] for entry in zone_entries.values())
    ordered_lot_index = {lot_id: lot_index[lot_id] for lot_id in sorted(lot_index)}
    manifest = {
        "schema": SCHEMA,
        "schemaVersion": SCHEMA_VERSION,
        "dataVersion": data_version,
        "crs": "EPSG:4326",
        "coordinateDecimals": COORDINATE_DECIMALS,
        "source": source.name,
        "sourceSha256": source_sha256,
        "lotCount": len(lot_polygons),
        "physicalFeatureCount": physical_feature_count,
        "publishedPhysicalFeatureCount": published_physical_feature_count,
        "fragmentCount": total_fragment_count,
        "missingLotIdCount": missing_lot_id_count,
        "repairedGeometryCount": repaired_geometry_count,
        "sourceGeometryTypes": source_geometry_types,
        "bounds": global_bounds,
        "zones": zone_entries,
        "lotIndex": ordered_lot_index,
    }
    manifest_payload = _json_bytes(manifest, pretty=True)
    (output_dir / "manifest.json").write_bytes(manifest_payload)
    output_hashes["manifest.json"] = sha256_bytes(manifest_payload)

    zone_bytes = sum(entry["bytes"] for entry in zone_entries.values())
    zone_gzip_bytes = sum(entry["gzipBytes"] for entry in zone_entries.values())
    manifest_gzip_bytes = len(gzip.compress(manifest_payload, compresslevel=9, mtime=0))
    return {
        "source": str(source),
        "sourceSha256": source_sha256,
        "outputDir": str(output_dir),
        "lotCount": len(lot_polygons),
        "physicalFeatureCount": physical_feature_count,
        "publishedPhysicalFeatureCount": published_physical_feature_count,
        "fragmentCount": total_fragment_count,
        "missingLotIdCount": missing_lot_id_count,
        "repairedGeometryCount": repaired_geometry_count,
        "zoneBytes": zone_bytes,
        "zoneGzipBytes": zone_gzip_bytes,
        "manifestBytes": len(manifest_payload),
        "manifestGzipBytes": manifest_gzip_bytes,
        "totalBytes": zone_bytes + len(manifest_payload),
        "totalGzipBytes": zone_gzip_bytes + manifest_gzip_bytes,
        "outputs": output_hashes,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="ZIP SHP oficial (externo al repo)")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("shared/geo/data"),
        help="Directorio de salida web (default: shared/geo/data)",
    )
    parser.add_argument("--data-version", default=DEFAULT_DATA_VERSION)
    parser.add_argument("--expected-source-sha256")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        report = build_geometry_dataset(
            args.source,
            args.output,
            data_version=args.data_version,
            expected_source_sha256=args.expected_source_sha256,
        )
    except (BuildError, OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

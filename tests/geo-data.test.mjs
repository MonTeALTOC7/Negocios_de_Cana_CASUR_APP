import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetGeoDataForTests,
  getGeoStatus,
  getLotGeometries,
  getLotGeometry,
  hasLotGeometry,
  loadGeoManifest,
  normalizeGeoLotId,
} from "../shared/geo/geo-data.js";

const MANIFEST_URL = "https://casur.test/shared/geo/data/manifest.json";

const feature = (lotId, min = -85.8) => ({
  type: "Feature",
  bbox: [min, 11.4, min + 0.01, 11.41],
  properties: { lotId, fragmentCount: 1, anchor: [min + 0.003, 11.403] },
  geometry: {
    type: "MultiPolygon",
    coordinates: [[[[min, 11.4], [min + 0.01, 11.4], [min + 0.01, 11.41], [min, 11.4]]]],
  },
});

function fixtureFetch() {
  const calls = [];
  const manifest = {
    schema: "casur-master-geometry",
    schemaVersion: 2,
    dataVersion: "fixture-v1",
    crs: "EPSG:4326",
    source: "fixture.zip",
    sourceSha256: "a".repeat(64),
    lotCount: 3,
    physicalFeatureCount: 4,
    repairedGeometryCount: 1,
    bounds: [-86, 11, -85, 12],
    zones: {
      "5-Productores": { file: "zona-5-productores.geojson" },
      "1-Sur": "zona-1-sur.geojson",
    },
    lotIndex: {
      "75907": "5-Productores",
      "75908": "5-Productores",
      "101": "1-Sur",
    },
  };
  const responses = {
    [MANIFEST_URL]: manifest,
    "https://casur.test/shared/geo/data/zona-5-productores.geojson": {
      type: "FeatureCollection",
      features: [feature("75907"), feature("75908", -85.7)],
    },
    "https://casur.test/shared/geo/data/zona-1-sur.geojson": {
      type: "FeatureCollection",
      features: [feature("101", -85.9)],
    },
  };
  return {
    calls,
    fetch: async (url) => {
      calls.push(String(url));
      const body = responses[String(url)];
      return body
        ? { ok: true, status: 200, json: async () => structuredClone(body) }
        : { ok: false, status: 404, json: async () => ({}) };
    },
  };
}

test("normalizeGeoLotId conserva la identidad canónica lotId/CodSuerte", () => {
  assert.equal(normalizeGeoLotId(" 75907 "), "75907");
  assert.equal(normalizeGeoLotId(" 25605a "), "25605A");
  assert.equal(normalizeGeoLotId(606), "606");
  assert.equal(normalizeGeoLotId(null), "");
});

test("manifest, resolución por zona y caché mantienen orden estable", async () => {
  const fixture = fixtureFetch();
  __resetGeoDataForTests({ manifestUrl: MANIFEST_URL, fetch: fixture.fetch });

  const manifest = await loadGeoManifest();
  assert.equal(manifest.schema, "casur-master-geometry");
  assert.equal(manifest.crs, "EPSG:4326");
  assert.equal(await hasLotGeometry("75907"), true);
  assert.equal(await hasLotGeometry("NO-EXISTE"), false);
  assert.equal(fixture.calls.length, 1, "hasLotGeometry usa lotIndex sin descargar la zona");

  const first = await getLotGeometry(" 75907 ");
  const again = await getLotGeometry("75908");
  assert.equal(first.properties.lotId, "75907");
  assert.equal(first.geometry.type, "MultiPolygon");
  assert.equal(again.properties.lotId, "75908");
  assert.equal(
    fixture.calls.filter((url) => url.endsWith("zona-5-productores.geojson")).length,
    1,
    "dos suertes de una zona comparten fetch y parse",
  );

  const selected = await getLotGeometries(["75908", "NO-EXISTE", "75907", "75908", "101"]);
  assert.deepEqual(selected.map((item) => item.properties.lotId), ["75908", "75907", "101"]);
  assert.equal(await getLotGeometry("NO-EXISTE"), null);
  assert.deepEqual(getGeoStatus().loadedZones, ["5-Productores", "1-Sur"]);
  assert.equal(getGeoStatus().status, "ready");
});

test("un manifest incompatible falla explícitamente y permite reintento", async () => {
  let calls = 0;
  __resetGeoDataForTests({
    manifestUrl: MANIFEST_URL,
    fetch: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ schema: "otro" }) };
    },
  });
  await assert.rejects(loadGeoManifest(), /Schema geográfico no compatible/);
  await assert.rejects(loadGeoManifest(), /Schema geográfico no compatible/);
  assert.equal(calls, 2);
  assert.equal(getGeoStatus().status, "error");
});

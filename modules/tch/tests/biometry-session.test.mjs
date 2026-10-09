import test from "node:test";
import assert from "node:assert/strict";
import {
  BIOMETRY_LOT_MISMATCH_MESSAGE,
  persistBiometryCheckpoint,
} from "../js/biometry-session.js";
import { sampleTch, sampleWeightTch, stats } from "../js/tch-engine.js";

function memoryRepository(initial = []) {
  const rows = new Map(initial.map((record) => [record.id, structuredClone(record)]));
  const puts = [];
  return {
    puts,
    rows,
    async get(storeName, id) {
      assert.equal(storeName, "biometries");
      return rows.get(id) || null;
    },
    async put(storeName, record) {
      assert.equal(storeName, "biometries");
      puts.push(structuredClone(record));
      rows.set(record.id, structuredClone(record));
      return record;
    },
  };
}

function sample(index, { heightM = 2, diameterMm = 25, weightKg = 6 } = {}) {
  return {
    id: `point-${index}`,
    pointCode: `P${String(index).padStart(2, "0")}`,
    directStalksPerMeter: 10 + index,
    heightM,
    diameterMm,
    rowSpacingM: 1.65,
    weighingEnabled: true,
    weighedStalkCount: 4,
    weighedTotalKg: weightKg,
  };
}

function calculatedRecordData(samples, lotId = "AIDOSA-08", date = "2026-10-08") {
  const tchValues = samples.map((point) => sampleTch(point, point.rowSpacingM));
  const weightValues = samples.map((point) => sampleWeightTch(point, point.rowSpacingM));
  const tch = stats(tchValues);
  const weight = stats(weightValues);
  return {
    method: "Biometría",
    date,
    lotId,
    samples: structuredClone(samples),
    pointCount: tch.count,
    biometricTch: tch.mean,
    projectedTch: tch.mean * 1.1,
    projectedTons: tch.mean * 10,
    weightTch: weight.mean,
    weightPointCount: weight.count,
    minTch: tch.min,
    maxTch: tch.max,
    sdTch: tch.sd,
    cvPct: tch.cv,
    quality: tch.count >= 3 ? "Media" : "Baja",
  };
}

function sessionHarness(initial = []) {
  const repository = memoryRepository(initial);
  let records = structuredClone(initial);
  let activeBiometryId = "";
  let sequence = 0;
  return {
    repository,
    get records() { return records; },
    get activeBiometryId() { return activeBiometryId; },
    set activeBiometryId(value) { activeBiometryId = value; },
    async save(samples, nowIso, { lotId = "AIDOSA-08", date = "2026-10-08" } = {}) {
      const result = await persistBiometryCheckpoint({
        repository,
        records,
        activeBiometryId,
        selectedLotId: lotId,
        makeId: () => `bio-${++sequence}`,
        nowIso,
        recordData: calculatedRecordData(samples, lotId, date),
      });
      records = result.records;
      activeBiometryId = result.activeBiometryId;
      return result;
    },
  };
}

test("P01-P03 crea un único registro con revisión 0 y fechas T1", async () => {
  const session = sessionHarness();
  const points = [sample(1), sample(2), sample(3)];
  const result = await session.save(points, "2026-10-08T14:00:00.000Z");

  assert.equal(result.isUpdate, false);
  assert.equal(session.records.length, 1);
  assert.equal(session.repository.rows.size, 1);
  assert.equal(result.record.id, "bio-1");
  assert.equal(result.record.pointCount, 3);
  assert.equal(result.record.revision, 0);
  assert.equal(result.record.createdAt, "2026-10-08T14:00:00.000Z");
  assert.equal(result.record.updatedAt, result.record.createdAt);
});

test("P04 actualiza el mismo ID, conserva createdAt y recalcula TCH y peso", async () => {
  const session = sessionHarness();
  const first = await session.save([sample(1), sample(2), sample(3)], "2026-10-08T14:00:00.000Z");
  const second = await session.save([
    sample(1), sample(2), sample(3), sample(4, { heightM: 3.4, diameterMm: 31, weightKg: 10 }),
  ], "2026-10-08T14:05:00.000Z");

  assert.equal(second.isUpdate, true);
  assert.equal(session.records.length, 1);
  assert.equal(session.repository.rows.size, 1);
  assert.equal(second.record.id, first.record.id);
  assert.equal(second.record.createdAt, first.record.createdAt);
  assert.notEqual(second.record.updatedAt, first.record.updatedAt);
  assert.equal(second.record.revision, 1);
  assert.equal(second.record.pointCount, 4);
  assert.notEqual(second.record.biometricTch, first.record.biometricTch);
  assert.notEqual(second.record.weightTch, first.record.weightTch);
});

test("P05 conserva un registro y el mismo ID con revisión 2", async () => {
  const session = sessionHarness();
  const p3 = [sample(1), sample(2), sample(3)];
  const first = await session.save(p3, "2026-10-08T14:00:00.000Z");
  await session.save([...p3, sample(4)], "2026-10-08T14:05:00.000Z");
  const third = await session.save([...p3, sample(4), sample(5)], "2026-10-08T14:10:00.000Z");

  assert.equal(session.records.length, 1);
  assert.equal(session.repository.rows.size, 1);
  assert.equal(third.record.id, first.record.id);
  assert.equal(third.record.createdAt, first.record.createdAt);
  assert.equal(third.record.updatedAt, "2026-10-08T14:10:00.000Z");
  assert.equal(third.record.revision, 2);
  assert.equal(third.record.pointCount, 5);
});

test("Guardar + Excel exporta el checkpoint devuelto sin otro put", async () => {
  const session = sessionHarness();
  const checkpoint = await session.save([sample(1), sample(2), sample(3)], "2026-10-08T14:00:00.000Z");
  const exported = [];
  exported.push(checkpoint.record);

  assert.equal(session.repository.puts.length, 1);
  assert.equal(session.records.length, 1);
  assert.equal(exported[0].id, session.records[0].id);
});

test("Editar desde Historial reemplaza el registro real sin duplicarlo", async () => {
  const original = {
    ...calculatedRecordData([sample(1), sample(2), sample(3)]),
    id: "bio-history",
    createdAt: "2026-10-08T13:00:00.000Z",
    updatedAt: "2026-10-08T13:00:00.000Z",
    revision: 0,
  };
  const session = sessionHarness([original]);
  session.activeBiometryId = original.id;
  const result = await session.save([...original.samples, sample(4)], "2026-10-08T15:00:00.000Z");

  assert.equal(result.record.id, original.id);
  assert.equal(result.record.revision, 1);
  assert.equal(session.records.length, 1);
  assert.equal(session.repository.rows.size, 1);
});

test("la sesión activa se recupera de IndexedDB si falta en la copia de memoria", async () => {
  const original = {
    ...calculatedRecordData([sample(1), sample(2), sample(3)]),
    id: "bio-indexeddb",
    createdAt: "2026-10-08T13:00:00.000Z",
    updatedAt: "2026-10-08T13:00:00.000Z",
    revision: 0,
  };
  const repository = memoryRepository([original]);
  const result = await persistBiometryCheckpoint({
    repository,
    records: [],
    activeBiometryId: original.id,
    selectedLotId: original.lotId,
    makeId: () => "no-debe-usarse",
    nowIso: "2026-10-08T16:00:00.000Z",
    recordData: calculatedRecordData([...original.samples, sample(4)]),
  });

  assert.equal(result.record.id, original.id);
  assert.equal(result.records.length, 1);
  assert.equal(repository.rows.size, 1);
});

test("Nueva biometría explícita crea otro ID aunque coincidan suerte y fecha", async () => {
  const session = sessionHarness();
  const first = await session.save([sample(1), sample(2), sample(3)], "2026-10-08T14:00:00.000Z");
  session.activeBiometryId = "";
  const second = await session.save([sample(1), sample(2), sample(3)], "2026-10-08T15:00:00.000Z");

  assert.notEqual(second.record.id, first.record.id);
  assert.equal(second.record.date, first.record.date);
  assert.equal(second.record.lotId, first.record.lotId);
  assert.equal(session.records.length, 2);
  assert.equal(session.repository.rows.size, 2);
});

test("cambiar de suerte bloquea la actualización antes de escribir", async () => {
  const session = sessionHarness();
  const first = await session.save([sample(1), sample(2), sample(3)], "2026-10-08T14:00:00.000Z");
  const putsBefore = session.repository.puts.length;

  await assert.rejects(
    session.save([sample(1), sample(2), sample(3), sample(4)], "2026-10-08T15:00:00.000Z", { lotId: "OTRA-09" }),
    { message: BIOMETRY_LOT_MISMATCH_MESSAGE },
  );
  assert.equal(session.repository.puts.length, putsBefore);
  assert.equal(session.repository.rows.get(first.record.id).lotId, "AIDOSA-08");
  assert.equal(session.records.length, 1);
});

test("crear una sesión nueva no altera registros IndexedDB existentes", async () => {
  const original = {
    ...calculatedRecordData([sample(1), sample(2), sample(3)], "AIDOSA-08", "2026-10-07"),
    id: "bio-existing",
    createdAt: "2026-10-07T13:00:00.000Z",
    updatedAt: "2026-10-07T13:00:00.000Z",
    revision: 4,
  };
  const snapshot = structuredClone(original);
  const session = sessionHarness([original]);
  await session.save([sample(1), sample(2), sample(3)], "2026-10-08T14:00:00.000Z");

  assert.deepEqual(session.repository.rows.get(original.id), snapshot);
  assert.equal(session.repository.rows.size, 2);
});

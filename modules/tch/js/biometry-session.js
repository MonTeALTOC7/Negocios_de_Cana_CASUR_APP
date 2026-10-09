export const BIOMETRY_LOT_MISMATCH_MESSAGE = "Esta biometría pertenece a otra suerte. Iniciá una nueva biometría.";
export const BIOMETRY_SESSION_MISSING_MESSAGE = "No se encontró la biometría activa. Iniciá una nueva biometría.";

function nextRevision(previousRecord) {
  if (!previousRecord) return 0;
  const revision = Number(previousRecord.revision);
  return (Number.isFinite(revision) ? revision : 0) + 1;
}

function replaceById(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index < 0) return [...records, record];
  const next = records.slice();
  next[index] = record;
  return next;
}

export async function persistBiometryCheckpoint({
  repository,
  records,
  activeBiometryId = "",
  selectedLotId,
  makeId,
  nowIso,
  recordData,
}) {
  let previousRecord = null;
  if (activeBiometryId) {
    previousRecord = records.find((item) => item.id === activeBiometryId)
      || await repository.get("biometries", activeBiometryId);
    if (!previousRecord) throw new Error(BIOMETRY_SESSION_MISSING_MESSAGE);
    if (previousRecord.lotId !== selectedLotId) throw new Error(BIOMETRY_LOT_MISMATCH_MESSAGE);
  }

  const record = {
    ...recordData,
    id: previousRecord?.id || makeId(),
    time: previousRecord ? previousRecord.time : recordData.time,
    createdAt: previousRecord?.createdAt || nowIso,
    updatedAt: nowIso,
    revision: nextRevision(previousRecord),
  };

  await repository.put("biometries", record);
  return {
    record,
    records: replaceById(records, record),
    activeBiometryId: record.id,
    isUpdate: Boolean(previousRecord),
  };
}

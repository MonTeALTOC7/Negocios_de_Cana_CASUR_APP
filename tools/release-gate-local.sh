#!/usr/bin/env bash
# Reproduce localmente los pasos del flujo «CASUR Release Gate» (.github/workflows/casur-release-gate.yml) sobre el
# árbol de trabajo. No desactiva ni relaja ningún control. Uso: bash tools/release-gate-local.sh BASE_SHA
# Reproduce localmente los pasos del workflow «CASUR Release Gate» (.github/workflows/casur-release-gate.yml).
# Uso: bash tools/release-gate-local.sh BASE_SHA
set -euo pipefail
BASE="${1:?Uso: bash tools/release-gate-local.sh BASE_SHA}"
step() { echo; echo "== $*"; }
step "Verify release metadata"; node tools/sync-versions.mjs; node tools/runtime-assets.mjs; node tools/production-integrity.mjs
step "Enforce scoped release versions"; node tools/check-release-policy.mjs "$BASE"
if [ -f core/updates/context-store.js ]; then step "Verify context hotfix and unchanged official data"; node tools/check-context-hotfix.mjs; fi
step "Verify shell and data guard"; node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"
step "Verify Produccion"; npm test --silent --prefix modules/produccion 2>&1 | tail -3
step "Verify TCH"; npm run --silent validate --prefix modules/tch 2>&1 | tail -3
step "Verify coordinated PWA version"
awk "/<<'NODE'/{f=1;next} /^ *NODE$/{f=0} f" .github/workflows/casur-release-gate.yml | sed 's/^          //' | node --input-type=module
echo; echo "Release Gate local: OK"

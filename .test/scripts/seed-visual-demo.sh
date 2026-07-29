#!/usr/bin/env bash
# Seed Visual Demo Corpus translations and schemes on a running FRVT server.
# Idempotent: reuses existing rows named visual-demo-en / visual-demo-es and
# visual-demo-* schemes when present. Does not insert SIR partial spans — run
# seed-visual-demo-partials.py afterward for C-partial coverage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ASSETS="${REPO_ROOT}/frvt/testops/fixtures/assets"
SCHEMES_DIR="${ASSETS}/schemes"

BASE_URL="${FRVT_BASE_URL:-http://localhost:8000}"
AUTH="${FRVT_BASIC_AUTH:-admin:Admin123!}"

SCHEME_FILES=(
  visual-demo-scheme-a
  visual-demo-scheme-b
  visual-demo-lxx
  visual-demo-synodal
  visual-demo-nt-omit
  visual-demo-psalm-a
  visual-demo-psalm-b
)

die() {
  echo "seed-visual-demo: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

api() {
  curl -sS -u "${AUTH}" "$@"
}

require_cmd curl
require_cmd jq

[[ -f "${ASSETS}/visual-demo-en.zip" ]] || die "missing ${ASSETS}/visual-demo-en.zip"
[[ -f "${ASSETS}/visual-demo-es.zip" ]] || die "missing ${ASSETS}/visual-demo-es.zip"
[[ -d "${SCHEMES_DIR}" ]] || die "missing ${SCHEMES_DIR} — regenerate scheme JSON first (see walkthrough)"

health_code="$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" "${BASE_URL}/api/health" || true)"
[[ "${health_code}" == "200" ]] || die "server not reachable at ${BASE_URL} (HTTP ${health_code})"

translation_id() {
  local name="$1"
  api "${BASE_URL}/api/translations?limit=500" \
    | jq -r --arg name "${name}" '.items[] | select(.name == $name) | .id' \
    | head -n 1
}

scheme_id() {
  local name="$1"
  api "${BASE_URL}/api/versifications?limit=500" \
    | jq -r --arg name "${name}" '.items[] | select(.name == $name) | .id' \
    | head -n 1
}

preferred_scheme_id() {
  local translation_id="$1"
  api "${BASE_URL}/api/translations/${translation_id}/versifications" \
    | jq -r '.[] | select(.preferred) | .scheme_id' \
    | head -n 1
}

ingest_project() {
  local zip_path="$1"
  local name="$2"
  local language="$3"
  api -X POST "${BASE_URL}/api/ingest/project" \
    -F "file=@${zip_path};type=application/zip" \
    -F "name=${name}" \
    -F "language=${language}"
}

upload_scheme() {
  local json_path="$1"
  local name="$2"
  api -X POST "${BASE_URL}/api/versifications/upload" \
    -F "file=@${json_path};type=application/json" \
    -F "name=${name}"
}

ensure_association() {
  local translation_id="$1"
  local scheme_id="$2"
  if association_exists "${translation_id}" "${scheme_id}"; then
    echo "  already associated translation=${translation_id} scheme=${scheme_id}" >&2
    return 0
  fi
  local status
  status="$(api -o /dev/null -w '%{http_code}' -X POST \
    "${BASE_URL}/api/translations/${translation_id}/versifications" \
    -H "Content-Type: application/json" \
    -d "{\"scheme_id\":\"${scheme_id}\"}")"
  if [[ "${status}" != "201" ]]; then
    die "associate translation=${translation_id} scheme=${scheme_id} failed HTTP ${status}"
  fi
  echo "  associated translation=${translation_id} scheme=${scheme_id}" >&2
}

association_exists() {
  local translation_id="$1"
  local scheme_id="$2"
  api "${BASE_URL}/api/translations/${translation_id}/versifications" \
    | jq -e --arg sid "${scheme_id}" '.[] | select(.scheme_id == $sid)' >/dev/null
}

ensure_translation() {
  local name="$1"
  local zip_path="$2"
  local language="$3"
  local existing
  existing="$(translation_id "${name}")"
  if [[ -n "${existing}" ]]; then
    echo "  reusing translation ${name} (${existing})" >&2
    echo "${existing}"
    return
  fi
  local body
  body="$(ingest_project "${zip_path}" "${name}" "${language}")"
  echo "${body}" | jq -e '.translation.id' >/dev/null \
    || die "ingest ${name} failed: ${body}"
  echo "${body}" | jq -r '.translation.id'
}

ensure_scheme() {
  local name="$1"
  local json_path="$2"
  local existing
  existing="$(scheme_id "${name}")"
  if [[ -n "${existing}" ]]; then
    echo "  reusing scheme ${name} (${existing})" >&2
    echo "${existing}"
    return
  fi
  local body
  body="$(upload_scheme "${json_path}" "${name}")"
  echo "${body}" | jq -e '.id' >/dev/null \
    || die "upload ${name} failed: ${body}"
  echo "${body}" | jq -r '.id'
}

echo "Seeding Visual Demo Corpus at ${BASE_URL}"
echo

echo "Translations"
EN_ID="$(ensure_translation "visual-demo-en" "${ASSETS}/visual-demo-en.zip" "en")"
ES_ID="$(ensure_translation "visual-demo-es" "${ASSETS}/visual-demo-es.zip" "es")"
IDENTITY_EN="$(preferred_scheme_id "${EN_ID}")"
IDENTITY_ES="$(preferred_scheme_id "${ES_ID}")"
echo "  EN  ${EN_ID}  (preferred scheme ${IDENTITY_EN})"
echo "  ES  ${ES_ID}  (preferred scheme ${IDENTITY_ES})"
echo

echo "Custom schemes"
declare -A SCHEME_IDS=()
for name in "${SCHEME_FILES[@]}"; do
  json_path="${SCHEMES_DIR}/${name}.json"
  [[ -f "${json_path}" ]] || die "missing ${json_path}"
  id="$(ensure_scheme "${name}" "${json_path}")"
  SCHEME_IDS["${name}"]="${id}"
  echo "  ${name}  ${id}"
done
echo

echo "Associations (both translations × all custom schemes)"
associated=0
for name in "${SCHEME_FILES[@]}"; do
  id="${SCHEME_IDS[${name}]}"
  ensure_association "${EN_ID}" "${id}"
  ensure_association "${ES_ID}" "${id}"
  associated=$((associated + 2))
done
echo "  ensured ${associated} association(s)"
echo

echo "Association check"
for entry in "EN:${EN_ID}" "ES:${ES_ID}"; do
  name="${entry%%:*}"
  tid="${entry#*:}"
  count="$(api "${BASE_URL}/api/translations/${tid}/versifications" | jq 'length')"
  echo "  ${name} translation has ${count} associated scheme(s) (expect 8)"
  if [[ "${count}" -lt 8 ]]; then
    die "${name} translation ${tid} has only ${count} associations; expected 8 (identity + 7 custom)"
  fi
done
echo

echo "Logical key map (for case tables in visual-demo-walkthrough.md):"
echo "  identity-en          preferred on visual-demo-en  (${IDENTITY_EN})"
echo "  identity-es          preferred on visual-demo-es  (${IDENTITY_ES})"
echo "  scheme-a             visual-demo-scheme-a         (${SCHEME_IDS[visual-demo-scheme-a]})"
echo "  scheme-b             visual-demo-scheme-b         (${SCHEME_IDS[visual-demo-scheme-b]})"
echo "  visual-demo-lxx      visual-demo-lxx              (${SCHEME_IDS[visual-demo-lxx]})"
echo "  visual-demo-synodal  visual-demo-synodal          (${SCHEME_IDS[visual-demo-synodal]})"
echo "  visual-demo-nt-omit  visual-demo-nt-omit          (${SCHEME_IDS[visual-demo-nt-omit]})"
echo "  psalm-a              visual-demo-psalm-a          (${SCHEME_IDS[visual-demo-psalm-a]})"
echo "  psalm-b              visual-demo-psalm-b          (${SCHEME_IDS[visual-demo-psalm-b]})"
echo
echo "Next: validate in Manage UI, then open the Viewer. For C-partial, run:"
echo "  frvt/.venv/bin/python .test/scripts/seed-visual-demo-partials.py"
echo
echo "If demo zips were updated, delete visual-demo-en/es translations and re-run this script."

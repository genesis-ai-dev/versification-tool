#!/usr/bin/env bash
# Companion for .spec/frvt-12-test-plan-1.md — HTTP cases via curl.
# Uses the published index API spec (cancel, not terminate). On FAIL, paste
# stdout+stderr. Does not replace pytest.
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZIP_A="${FRVT_INDEX_PLAN_ZIP_A:-${REPO_ROOT}/research/SampleTranslations/biblica-spanish-1.zip}"
ZIP_B="${FRVT_INDEX_PLAN_ZIP_B:-${REPO_ROOT}/research/SampleTranslations/american-standard-1.zip}"
BASE="${FRVT_BASE_URL:-http://localhost:8000}"
AUTH="${FRVT_BASIC_AUTH:-admin:Admin123!}"
WAIT_SECONDS="${FRVT_INDEX_WAIT_SECONDS:-3600}"
POLL_SECONDS="${FRVT_INDEX_POLL_SECONDS:-2}"

PASS=0
FAIL=0
SKIP=0
WE_STARTED_API=0
API_PID=""
CLEANUP_TRANSLATION_IDS=()
TMPDIR_RUN="$(mktemp -d "${TMPDIR:-/tmp}/frvt-index-plan.XXXXXX")"

T1_ID=""
T2_ID=""
T1_PREFERRED_ID=""
T2_PREFERRED_ID=""
ORG_SCHEME_ID=""
ORG_TRANSLATION_ID=""
IDX1_ID=""
IDX2_ID=""
M1_INBOUND=""
COLD_RANGE_JSON=""
RANDOM_UUID="00000000-0000-4000-8000-00000000dead"

usage() {
  cat <<EOF
Usage: $0
  FRVT_BASE_URL              default http://localhost:8000
  FRVT_BASIC_AUTH            default admin:Admin123!
  FRVT_INDEX_WAIT_SECONDS    ready-poll timeout (default 3600)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

die() {
  echo "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

api() {
  curl -sS -u "${AUTH}" "$@"
}

pass() {
  echo "[PASS] $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "[FAIL] $1 $2"
  echo "expected: $2" >&2
  FAIL=$((FAIL + 1))
}

fail_detail() {
  local id="$1" method="$2" url="$3" status="$4" expected="$5" actual="$6"
  echo "[FAIL] ${id} ${expected}"
  echo "METHOD=${method}" >&2
  echo "URL=${url}" >&2
  echo "persona=basic" >&2
  echo "HTTP ${status}" >&2
  echo "expected: ${expected}" >&2
  echo "actual: ${actual}" >&2
  FAIL=$((FAIL + 1))
}

skip() {
  echo "[SKIP] $1 $2"
  SKIP=$((SKIP + 1))
}

is_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
}

code_of() {
  jq -r '.code // empty' "$1" 2>/dev/null || true
}

http_save() {
  local out="$1"
  shift
  curl -sS -o "${out}" -w '%{http_code}' "$@"
}

zip_translation_name() {
  local zip="$1"
  python3 - "$zip" <<'PY'
import sys
import zipfile
import xml.etree.ElementTree as ET

path = sys.argv[1]


def local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


with zipfile.ZipFile(path) as archive:
    member = next(
        name
        for name in archive.namelist()
        if name.rsplit("/", 1)[-1] == "metadata.xml"
    )
    root = ET.fromstring(archive.read(member))

ident = None
for element in root.iter():
    if local_tag(element.tag) == "identification":
        ident = element
        break
name = None
if ident is not None:
    for child in ident:
        if local_tag(child.tag) == "name" and (child.text or "").strip():
            name = child.text.strip()
            break
if not name:
    raise SystemExit(f"no translation name in {path}")
print(name)
PY
}

translation_id_by_name() {
  api -G "${BASE}/api/translations" --data-urlencode "limit=500" \
    | jq -r --arg name "$1" '.items[]? | select(.name == $name) | .id' \
    | head -n 1
}

preferred_scheme_id() {
  api "${BASE}/api/translations/${1}/versifications" \
    | jq -r '[.[] | select(.preferred == true) | .scheme_id][0] // empty'
}

ingest_zip() {
  local zip="$1"
  local dest="$2"
  local tmp code translation_id
  tmp="${TMPDIR_RUN}/ingest-$(basename "${zip}").json"
  code="$(http_save "${tmp}" -u "${AUTH}" -X POST "${BASE}/api/ingest/project" \
    -F "file=@${zip};type=application/zip")"
  code="${code//$'\r'/}"
  if [[ "${code}" == "201" ]]; then
    translation_id="$(jq -er '.translation.id' "${tmp}")"
    CLEANUP_TRANSLATION_IDS+=("${translation_id}")
  elif [[ "${code}" == "409" ]]; then
    echo "  reuse: $(zip_translation_name "${zip}")" >&2
    translation_id="$(translation_id_by_name "$(zip_translation_name "${zip}")")"
  else
    die "ingest ${zip} HTTP ${code}: $(cat "${tmp}")"
  fi
  printf -v "${dest}" '%s' "${translation_id}"
}

create_index() {
  local translation_id="$1"
  local extra="${2:-}"
  local tmp="${TMPDIR_RUN}/create-index.json"
  local payload code
  if [[ -n "${extra}" ]]; then
    payload="$(jq -n --arg t "${translation_id}" --arg v "${extra}" \
      '{translation_id:$t, versification_id:$v}')"
  else
    payload="$(jq -n --arg t "${translation_id}" '{translation_id:$t}')"
  fi
  code="$(http_save "${tmp}" -u "${AUTH}" -H 'Content-Type: application/json' \
    -X POST "${BASE}/api/indexes" -d "${payload}")"
  code="${code//$'\r'/}"
  echo "${code}"
}

get_index_file() {
  local index_id="$1"
  local tmp="${2:-${TMPDIR_RUN}/get-index.json}"
  local code
  code="$(http_save "${tmp}" -u "${AUTH}" "${BASE}/api/indexes/${index_id}")"
  echo "${code//$'\r'/}"
}

wait_ready() {
  local index_id="$1"
  local label="${2:-index}"
  local elapsed=0
  local code status
  while [[ "${elapsed}" -lt "${WAIT_SECONDS}" ]]; do
    code="$(get_index_file "${index_id}" "${TMPDIR_RUN}/wait-${index_id}.json")"
    if [[ "${code}" != "200" ]]; then
      echo "  ${label} HTTP ${code}" >&2
      return 1
    fi
    status="$(jq -r '.status' "${TMPDIR_RUN}/wait-${index_id}.json")"
    if [[ "${status}" == "ready" ]]; then
      return 0
    fi
    if [[ "${status}" == "failed" || "${status}" == "cancelled" ]]; then
      echo "  ${label} terminal ${status}: $(cat "${TMPDIR_RUN}/wait-${index_id}.json")" >&2
      return 1
    fi
    if ((elapsed % 30 == 0)); then
      echo "  ${label} status=${status} waited=${elapsed}s" >&2
    fi
    sleep "${POLL_SECONDS}"
    elapsed=$((elapsed + POLL_SECONDS))
  done
  echo "  ${label} timed out after ${WAIT_SECONDS}s status=${status:-unknown}" >&2
  return 1
}

delete_all_indexes() {
  local ids index_id
  ids="$(api -G "${BASE}/api/indexes" --data-urlencode "limit=500" \
    | jq -r '.items[]?.id')"
  for index_id in ${ids}; do
    api -X DELETE "${BASE}/api/indexes/${index_id}" >/dev/null || true
  done
}

create_metadata_translation() {
  local name="$1"
  local tmp="${TMPDIR_RUN}/meta-translation.json"
  local code id
  code="$(http_save "${tmp}" -u "${AUTH}" -H 'Content-Type: application/json' \
    -X POST "${BASE}/api/translations" \
    -d "$(jq -n --arg n "${name}" '{name:$n, language:"en", source_format:"usx"}')")"
  code="${code//$'\r'/}"
  id="$(jq -r '.id // empty' "${tmp}")"
  if [[ "${code}" != "201" ]] || ! is_uuid "${id}"; then
    echo ""
    return 1
  fi
  CLEANUP_TRANSLATION_IDS+=("${id}")
  echo "${id}"
}

range_call() {
  local from_id="$1"
  local to_id="$2"
  local out="$3"
  http_save "${out}" -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${from_id}" \
    --data-urlencode "to_translation=${to_id}" \
    --data-urlencode "from_ref=JHN 3" \
    --data-urlencode "to_ref=JHN 3"
}

stop_api_if_started() {
  if [[ "${WE_STARTED_API}" -eq 1 && -n "${API_PID}" ]]; then
    kill "${API_PID}" 2>/dev/null || true
    wait "${API_PID}" 2>/dev/null || true
  fi
  rm -rf "${TMPDIR_RUN}"
}

trap stop_api_if_started EXIT

require_cmd curl
require_cmd jq
require_cmd python3
require_cmd docker

# --- TC-SETUP-01 ---
if ! docker compose -f "${REPO_ROOT}/frvt/docker-compose.yml" up -d >/tmp/frvt-index-compose.log 2>&1; then
  fail_detail "TC-SETUP-01" "docker" "compose up" "n/a" "compose up -d" "$(cat /tmp/frvt-index-compose.log)"
else
  for _ in $(seq 1 30); do
    if docker compose -f "${REPO_ROOT}/frvt/docker-compose.yml" exec -T db \
      pg_isready -U frvt -d frvt >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  (
    cd "${REPO_ROOT}/frvt"
    .venv/bin/python -m alembic -c alembic.ini upgrade head
  )
  health_code="$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" "${BASE}/api/health" || true)"
  health_code="${health_code//$'\r'/}"
  if [[ "${health_code}" != "200" ]]; then
    LOG_LEVEL=WARNING INDEX_WORKER_POLL_SECONDS=1 \
      PYTHONPATH="${REPO_ROOT}" \
      "${REPO_ROOT}/frvt/.venv/bin/uvicorn" frvt.api.main:app \
      --host 127.0.0.1 --port 8000 --app-dir "${REPO_ROOT}" \
      >/tmp/frvt-index-plan-uvicorn.log 2>&1 &
    API_PID=$!
    WE_STARTED_API=1
    for _ in $(seq 1 30); do
      health_code="$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" "${BASE}/api/health" || true)"
      health_code="${health_code//$'\r'/}"
      if [[ "${health_code}" == "200" ]]; then
        break
      fi
      sleep 1
    done
  fi
  if [[ "${health_code}" == "200" ]]; then
    pass "TC-SETUP-01"
  else
    fail_detail "TC-SETUP-01" "GET" "${BASE}/api/health" "${health_code}" \
      "API listening with 200 health" "$(cat /tmp/frvt-index-plan-uvicorn.log 2>/dev/null | tail -n 20)"
    die "stop-and-fix: health is not 200"
  fi
fi

# --- TC-AUTH-01 ---
auth_body="$(api "${BASE}/api/health")"
if echo "${auth_body}" | jq -e '.status == "ok"' >/dev/null; then
  pass "TC-AUTH-01"
else
  fail_detail "TC-AUTH-01" "GET" "${BASE}/api/health" "200" \
    '{"status":"ok"}' "${auth_body}"
fi
delete_all_indexes

# --- TC-SETUP-02 ---
[[ -f "${ZIP_A}" ]] || die "missing ${ZIP_A}"
[[ -f "${ZIP_B}" ]] || die "missing ${ZIP_B}"
echo "Ingesting sample projects"
ingest_zip "${ZIP_A}" T1_ID
ingest_zip "${ZIP_B}" T2_ID
schemes="$(api "${BASE}/api/versifications?canonical=true&limit=100")"
ORG_SCHEME_ID="$(echo "${schemes}" | jq -r '.items[] | select(.name | ascii_downcase == "org") | .id' | head -n 1)"
ORG_TRANSLATION_ID="$(echo "${schemes}" | jq -r '.items[] | select(.name | ascii_downcase == "eng") | .based_on_id' | head -n 1)"
T1_PREFERRED_ID="$(preferred_scheme_id "${T1_ID}")"
T2_PREFERRED_ID="$(preferred_scheme_id "${T2_ID}")"
if is_uuid "${T1_ID}" && is_uuid "${T2_ID}" && [[ "${T1_ID}" != "${T2_ID}" ]] \
  && is_uuid "${ORG_SCHEME_ID}" && is_uuid "${ORG_TRANSLATION_ID}" \
  && is_uuid "${T1_PREFERRED_ID}" && is_uuid "${T2_PREFERRED_ID}"; then
  pass "TC-SETUP-02"
else
  fail "TC-SETUP-02" "missing UUID aliases T1=${T1_ID} T2=${T2_ID} org=${ORG_SCHEME_ID} pref=${T1_PREFERRED_ID}/${T2_PREFERRED_ID}"
fi

# --- TC-CRUD-01 ---

crud1_code="$(create_index "${T1_ID}")"
IDX1_ID="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
if [[ "${crud1_code}" != "201" ]] || ! is_uuid "${IDX1_ID}"; then
  fail_detail "TC-CRUD-01" "POST" "${BASE}/api/indexes" "${crud1_code}" \
    "201 with id" "$(cat "${TMPDIR_RUN}/create-index.json")"
else
  list_json="$(api -G "${BASE}/api/indexes" --data-urlencode "limit=500")"
  get_code="$(get_index_file "${IDX1_ID}")"
  listed="$(echo "${list_json}" | jq --arg id "${IDX1_ID}" --arg t "${T1_ID}" \
    '[.items[] | select(.id == $id and .translation_id == $t)] | length == 1')"
  if [[ "${get_code}" == "200" && "${listed}" == "true" ]] \
    && jq -e --arg t "${T1_ID}" '.translation_id == $t and (.versification_id | test("^[0-9a-fA-F-]{36}$"))' \
      "${TMPDIR_RUN}/get-index.json" >/dev/null; then
    if wait_ready "${IDX1_ID}" "CRUD-01"; then
      del_code="$(http_save "${TMPDIR_RUN}/del.json" -u "${AUTH}" \
        -X DELETE "${BASE}/api/indexes/${IDX1_ID}")"
      gone_code="$(get_index_file "${IDX1_ID}" "${TMPDIR_RUN}/gone.json")"
      if [[ "${del_code//$'\r'/}" == "204" && "${gone_code}" == "404" ]] \
        && [[ "$(code_of "${TMPDIR_RUN}/gone.json")" == "not_found" ]]; then
        pass "TC-CRUD-01"
      else
        fail_detail "TC-CRUD-01" "DELETE" "${BASE}/api/indexes/${IDX1_ID}" \
          "${del_code}/${gone_code}" "204 then 404 not_found" "$(cat "${TMPDIR_RUN}/gone.json")"
      fi
    else
      fail "TC-CRUD-01" "index did not become ready"
    fi
  else
    fail_detail "TC-CRUD-01" "GET" "${BASE}/api/indexes/${IDX1_ID}" "${get_code}" \
      "list+get match translation_id" "$(cat "${TMPDIR_RUN}/get-index.json")"
  fi
fi
IDX1_ID=""

# --- TC-STATUS-01 ---

status_tid="$(create_metadata_translation "frvt-index-status-$(date +%s)")"
if ! is_uuid "${status_tid}"; then
  fail "TC-STATUS-01" "could not create metadata translation"
else
  st_code="$(create_index "${status_tid}")"
  st_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  early_code="$(get_index_file "${st_id}" "${TMPDIR_RUN}/status-early.json")"
  early_status="$(jq -r '.status // empty' "${TMPDIR_RUN}/status-early.json")"
  if [[ "${st_code}" == "201" && "${early_code}" == "200" && -n "${early_status}" ]]; then
    if wait_ready "${st_id}" "STATUS-01"; then
      later_code="$(get_index_file "${st_id}" "${TMPDIR_RUN}/status-later.json")"
      if [[ "${later_code}" == "200" ]] \
        && jq -e '.status == "ready"' "${TMPDIR_RUN}/status-later.json" >/dev/null; then
        pass "TC-STATUS-01"
      else
        fail "TC-STATUS-01" "ready status not stable on subsequent get"
      fi
    else
      fail "TC-STATUS-01" "did not become ready (early=${early_status})"
    fi
  else
    fail_detail "TC-STATUS-01" "GET" "${BASE}/api/indexes/${st_id}" "${early_code}" \
      "status field present" "$(cat "${TMPDIR_RUN}/status-early.json")"
  fi
  api -X DELETE "${BASE}/api/indexes/${st_id}" >/dev/null || true
fi

# --- TC-SCHEME-02 ---

scheme2_tid="$(create_metadata_translation "frvt-index-org-fallback-$(date +%s)")"
if ! is_uuid "${scheme2_tid}"; then
  fail "TC-SCHEME-02" "metadata translation create failed"
else
  s2_code="$(create_index "${scheme2_tid}")"
  s2_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  get_index_file "${s2_id}" "${TMPDIR_RUN}/scheme2.json" >/dev/null
  if [[ "${s2_code}" == "201" ]] \
    && jq -e --arg org "${ORG_SCHEME_ID}" '.versification_id == $org' \
      "${TMPDIR_RUN}/scheme2.json" >/dev/null; then
    pass "TC-SCHEME-02"
  else
    fail_detail "TC-SCHEME-02" "POST" "${BASE}/api/indexes" "${s2_code}" \
      "versification_id == org ${ORG_SCHEME_ID}" "$(cat "${TMPDIR_RUN}/scheme2.json")"
  fi
  api -X DELETE "${BASE}/api/indexes/${s2_id}" >/dev/null || true
fi

# --- TC-AUTO-01 ---

auto1_tid="$(create_metadata_translation "frvt-index-auto1-$(date +%s)")"
if ! is_uuid "${auto1_tid}"; then
  fail "TC-AUTO-01" "metadata translation create failed"
else
  a1_code="$(create_index "${auto1_tid}")"
  a1_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  del_code="$(http_save "${TMPDIR_RUN}/auto1-del.json" -u "${AUTH}" \
    -X DELETE "${BASE}/api/indexes/${a1_id}")"
  gone_code="$(get_index_file "${a1_id}" "${TMPDIR_RUN}/auto1-gone.json")"
  a1b_code="$(create_index "${auto1_tid}")"
  a1b_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  if [[ "${a1_code}" == "201" && "${del_code//$'\r'/}" == "204" && "${gone_code}" == "404" ]] \
    && [[ "${a1b_code}" == "201" ]] && wait_ready "${a1b_id}" "AUTO-01 recreate"; then
    pass "TC-AUTO-01"
  else
    fail "TC-AUTO-01" "delete/recreate cycle failed HTTP create=${a1_code} del=${del_code} gone=${gone_code} recreate=${a1b_code}"
  fi
  api -X DELETE "${BASE}/api/indexes/${a1b_id}" >/dev/null || true
fi

# --- TC-AUTO-02 ---

auto2_tid="$(create_metadata_translation "frvt-index-auto2-$(date +%s)")"
if ! is_uuid "${auto2_tid}"; then
  fail "TC-AUTO-02" "metadata translation create failed"
else
  a2_code="$(create_index "${auto2_tid}")"
  a2_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  tdel="$(http_save "${TMPDIR_RUN}/auto2-tdel.json" -u "${AUTH}" \
    -X DELETE "${BASE}/api/translations/${auto2_tid}")"
  gone_code="$(get_index_file "${a2_id}" "${TMPDIR_RUN}/auto2-gone.json")"
  health_after="$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" "${BASE}/api/health")"
  if [[ "${a2_code}" == "201" && "${tdel//$'\r'/}" == "204" && "${gone_code}" == "404" \
    && "${health_after//$'\r'/}" == "200" ]]; then
    pass "TC-AUTO-02"
  else
    fail "TC-AUTO-02" "translation delete did not remove index HTTP tdel=${tdel} gone=${gone_code} health=${health_after}"
  fi
  # Translation is already deleted; drop from cleanup list by leaving it — DELETE 404 is fine later.
fi

# --- TC-AUTO-04 ---

auto4_tid="$(create_metadata_translation "frvt-index-auto4-$(date +%s)")"
if ! is_uuid "${auto4_tid}"; then
  fail "TC-AUTO-04" "metadata translation create failed"
else
  a4_code="$(create_index "${auto4_tid}")"
  a4_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  if [[ "${a4_code}" == "201" ]] && wait_ready "${a4_id}" "AUTO-04 initial"; then
    get_index_file "${a4_id}" "${TMPDIR_RUN}/auto4-before.json" >/dev/null
    before_completed="$(jq -r '.completed_at // empty' "${TMPDIR_RUN}/auto4-before.json")"
    patch_code="$(http_save "${TMPDIR_RUN}/auto4-patch.json" -u "${AUTH}" \
      -H 'Content-Type: application/json' \
      -X PATCH "${BASE}/api/translations/${auto4_tid}" \
      -d "$(jq -n --arg n "frvt-index-auto4-renamed-$(date +%s)" '{name:$n}')")"
    after_patch="$(get_index_file "${a4_id}" "${TMPDIR_RUN}/auto4-after.json")"
    after_status="$(jq -r '.status // empty' "${TMPDIR_RUN}/auto4-after.json")"
    after_reason="$(jq -r '.pending_reason // empty' "${TMPDIR_RUN}/auto4-after.json")"
    if [[ "${patch_code//$'\r'/}" != "200" || "${after_patch}" != "200" ]]; then
      fail "TC-AUTO-04" "translation patch HTTP ${patch_code} get ${after_patch}"
    elif [[ "${after_status}" != "ready" || "${after_reason}" == "translation updated" ]]; then
      if wait_ready "${a4_id}" "AUTO-04 rebuild"; then
        pass "TC-AUTO-04"
      else
        fail "TC-AUTO-04" "did not return to ready after translation patch"
      fi
    elif wait_ready "${a4_id}" "AUTO-04 rebuild"; then
      get_index_file "${a4_id}" "${TMPDIR_RUN}/auto4-final.json" >/dev/null
      after_completed="$(jq -r '.completed_at // empty' "${TMPDIR_RUN}/auto4-final.json")"
      if [[ -n "${after_completed}" && "${after_completed}" != "${before_completed}" ]]; then
        pass "TC-AUTO-04"
      else
        fail "TC-AUTO-04" "ready both before and after patch with unchanged completed_at"
      fi
    else
      fail "TC-AUTO-04" "did not return to ready after translation patch"
    fi
  else
    fail "TC-AUTO-04" "initial index did not become ready"
  fi
  api -X DELETE "${BASE}/api/indexes/${a4_id}" >/dev/null || true
fi

# --- TC-MANUAL-01 ---

man1_tid="$(create_metadata_translation "frvt-index-manual1-$(date +%s)")"
if ! is_uuid "${man1_tid}"; then
  fail "TC-MANUAL-01" "metadata translation create failed"
else
  m1_code="$(create_index "${man1_tid}")"
  m1_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  if [[ "${m1_code}" == "201" ]] && wait_ready "${m1_id}" "MANUAL-01 initial"; then
    rb_code="$(http_save "${TMPDIR_RUN}/rebuild.json" -u "${AUTH}" \
      -X POST "${BASE}/api/indexes/${m1_id}/rebuild")"
    rb_status="$(jq -r '.status // empty' "${TMPDIR_RUN}/rebuild.json")"
    if [[ "${rb_code//$'\r'/}" == "202" && "${rb_status}" == "pending" ]]; then
      if wait_ready "${m1_id}" "MANUAL-01 rebuild"; then
        pass "TC-MANUAL-01"
      else
        fail "TC-MANUAL-01" "rebuild did not return to ready"
      fi
    else
      fail_detail "TC-MANUAL-01" "POST" "${BASE}/api/indexes/${m1_id}/rebuild" \
        "${rb_code}" "202 pending" "$(cat "${TMPDIR_RUN}/rebuild.json")"
    fi
  else
    fail "TC-MANUAL-01" "initial index did not become ready"
  fi
  api -X DELETE "${BASE}/api/indexes/${m1_id}" >/dev/null || true
fi

# --- TC-MANUAL-02 ---

man2_tid="$(create_metadata_translation "frvt-index-manual2-$(date +%s)")"
if ! is_uuid "${man2_tid}"; then
  fail "TC-MANUAL-02" "metadata translation create failed"
else
  m2_code="$(create_index "${man2_tid}")"
  m2_id="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  cancel_code="$(http_save "${TMPDIR_RUN}/cancel.json" -u "${AUTH}" \
    -X POST "${BASE}/api/indexes/${m2_id}/cancel")"
  cancel_status="$(jq -r '.status // empty' "${TMPDIR_RUN}/cancel.json")"
  health_mid="$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" "${BASE}/api/health")"
  rb2_code="$(http_save "${TMPDIR_RUN}/rebuild2.json" -u "${AUTH}" \
    -X POST "${BASE}/api/indexes/${m2_id}/rebuild")"
  recovered=0
  if [[ "${rb2_code//$'\r'/}" == "202" ]] && wait_ready "${m2_id}" "MANUAL-02 after cancel"; then
    recovered=1
  fi
  overlap_rb="$(http_save "${TMPDIR_RUN}/overlap-rb.json" -u "${AUTH}" \
    -X POST "${BASE}/api/indexes/${m2_id}/rebuild")"
  overlap_c="$(http_save "${TMPDIR_RUN}/overlap-c.json" -u "${AUTH}" \
    -X POST "${BASE}/api/indexes/${m2_id}/cancel")"
  health_end="$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" "${BASE}/api/health")"
  overlap_ok=0
  if [[ "${overlap_rb:0:1}" != "5" && "${overlap_c:0:1}" != "5" ]]; then
    overlap_ok=1
  fi
  if [[ "${recovered}" -eq 1 ]]; then
    api -X POST "${BASE}/api/indexes/${m2_id}/rebuild" >/dev/null || true
    wait_ready "${m2_id}" "MANUAL-02 after overlap" || recovered=0
  fi
  if [[ "${m2_code}" == "201" && "${cancel_code//$'\r'/}" == "202" \
    && ( "${cancel_status}" == "cancelled" || "${cancel_status}" == "building" ) \
    && "${health_mid//$'\r'/}" == "200" && "${health_end//$'\r'/}" == "200" \
    && "${overlap_ok}" -eq 1 && "${recovered}" -eq 1 ]]; then
    pass "TC-MANUAL-02"
  else
    fail "TC-MANUAL-02" "cancel/rebuild unsafe HTTP cancel=${cancel_code} status=${cancel_status} rebuild=${rb2_code} recovered=${recovered}"
  fi
  api -X DELETE "${BASE}/api/indexes/${m2_id}" >/dev/null || true
fi

# --- TC-NEG-01 ---

neg1_list="$(http_save "${TMPDIR_RUN}/neg1-list.json" "${BASE}/api/indexes")"
neg1_post="$(http_save "${TMPDIR_RUN}/neg1-post.json" -H 'Content-Type: application/json' \
  -X POST "${BASE}/api/indexes" -d '{"translation_id":"'"${RANDOM_UUID}"'"}')"
neg1_ctl="$(http_save "${TMPDIR_RUN}/neg1-ctl.json" -X POST "${BASE}/api/indexes/${RANDOM_UUID}/cancel")"
if [[ "${neg1_list//$'\r'/}" == "401" && "$(code_of "${TMPDIR_RUN}/neg1-list.json")" == "unauthorized" \
  && "${neg1_post//$'\r'/}" == "401" && "$(code_of "${TMPDIR_RUN}/neg1-post.json")" == "unauthorized" \
  && "${neg1_ctl//$'\r'/}" == "401" && "$(code_of "${TMPDIR_RUN}/neg1-ctl.json")" == "unauthorized" ]]; then
  pass "TC-NEG-01"
else
  fail "TC-NEG-01" "expected 401 unauthorized on list/create/cancel without auth (${neg1_list}/${neg1_post}/${neg1_ctl})"
fi

# --- TC-NEG-02 ---

neg2="$(http_save "${TMPDIR_RUN}/neg2.json" -u "${AUTH}" -H 'Content-Type: application/json' \
  -X POST "${BASE}/api/indexes" -d "$(jq -n --arg t "${RANDOM_UUID}" '{translation_id:$t}')")"
if [[ "${neg2//$'\r'/}" == "404" && "$(code_of "${TMPDIR_RUN}/neg2.json")" == "not_found" ]]; then
  pass "TC-NEG-02"
else
  fail_detail "TC-NEG-02" "POST" "${BASE}/api/indexes" "${neg2}" \
    "404 not_found" "$(cat "${TMPDIR_RUN}/neg2.json")"
fi

# --- TC-NEG-03 ---

neg3="$(http_save "${TMPDIR_RUN}/neg3.json" -u "${AUTH}" -H 'Content-Type: application/json' \
  -X POST "${BASE}/api/indexes" \
  -d "$(jq -n --arg t "${T1_ID}" --arg v "${RANDOM_UUID}" '{translation_id:$t, versification_id:$v}')")"
if [[ "${neg3//$'\r'/}" == "404" && "$(code_of "${TMPDIR_RUN}/neg3.json")" == "not_found" ]]; then
  pass "TC-NEG-03"
else
  fail_detail "TC-NEG-03" "POST" "${BASE}/api/indexes" "${neg3}" \
    "404 not_found" "$(cat "${TMPDIR_RUN}/neg3.json")"
fi

# --- TC-NEG-05 ---

neg5r="$(http_save "${TMPDIR_RUN}/neg5r.json" -u "${AUTH}" \
  -X POST "${BASE}/api/indexes/${RANDOM_UUID}/rebuild")"
neg5c="$(http_save "${TMPDIR_RUN}/neg5c.json" -u "${AUTH}" \
  -X POST "${BASE}/api/indexes/${RANDOM_UUID}/cancel")"
if [[ "${neg5r//$'\r'/}" == "404" && "$(code_of "${TMPDIR_RUN}/neg5r.json")" == "not_found" \
  && "${neg5c//$'\r'/}" == "404" && "$(code_of "${TMPDIR_RUN}/neg5c.json")" == "not_found" ]]; then
  pass "TC-NEG-05"
else
  fail "TC-NEG-05" "rebuild/cancel unknown id HTTP ${neg5r}/${neg5c}"
fi

# --- TC-CRUD-02 (also captures cold range for TC-BATCH-01) ---

crud2a_code="$(create_index "${T1_ID}")"
IDX1_ID="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
if [[ "${crud2a_code}" != "201" ]] || ! wait_ready "${IDX1_ID}" "CRUD-02 IDX1"; then
  fail_detail "TC-CRUD-02" "POST" "${BASE}/api/indexes" "${crud2a_code}" \
    "T1 index ready" "$(cat "${TMPDIR_RUN}/create-index.json")"
else
  get_index_file "${IDX1_ID}" >/dev/null
  M1_INBOUND="$(jq -r '.inbound_mappings' "${TMPDIR_RUN}/get-index.json")"
  COLD_RANGE_JSON="${TMPDIR_RUN}/cold-range.json"
  cold_code="$(range_call "${T1_ID}" "${T2_ID}" "${COLD_RANGE_JSON}")"
  cold_code="${cold_code//$'\r'/}"
  crud2b_code="$(create_index "${T2_ID}")"
  IDX2_ID="$(jq -r '.id // empty' "${TMPDIR_RUN}/create-index.json")"
  echo "Waiting for cartesian pair (IDX2 against ready IDX1)"
  if [[ "${crud2b_code}" == "201" ]] && wait_ready "${IDX2_ID}" "CRUD-02 IDX2" \
    && wait_ready "${IDX1_ID}" "CRUD-02 IDX1 still ready"; then
    get_index_file "${IDX1_ID}" "${TMPDIR_RUN}/idx1-after.json" >/dev/null
    get_index_file "${IDX2_ID}" "${TMPDIR_RUN}/idx2-after.json" >/dev/null
    inbound_after="$(jq -r '.inbound_mappings' "${TMPDIR_RUN}/idx1-after.json")"
    outbound2="$(jq -r '.outbound_mappings' "${TMPDIR_RUN}/idx2-after.json")"
    if jq -e '.status == "ready"' "${TMPDIR_RUN}/idx1-after.json" >/dev/null \
      && jq -e '.status == "ready"' "${TMPDIR_RUN}/idx2-after.json" >/dev/null \
      && [[ "${inbound_after}" -ge "${M1_INBOUND}" ]] \
      && [[ "${outbound2}" -gt 0 || "${inbound_after}" -gt "${M1_INBOUND}" ]]; then
      pass "TC-CRUD-02"
    else
      fail "TC-CRUD-02" "pair ready but metrics did not show cartesian mappings inbound ${M1_INBOUND}->${inbound_after} outbound2=${outbound2}"
    fi
  else
    fail "TC-CRUD-02" "second index did not reach ready HTTP ${crud2b_code}"
  fi
  if [[ "${cold_code}" != "200" ]]; then
    echo "  warning: cold range HTTP ${cold_code}" >&2
  fi
fi

# --- TC-RES-01 ---

if is_uuid "${IDX2_ID}"; then
  res_code="$(get_index_file "${IDX2_ID}" "${TMPDIR_RUN}/res.json")"
  usage_code="$(http_save "${TMPDIR_RUN}/usage.json" -u "${AUTH}" "${BASE}/api/indexes/usage")"
  if [[ "${res_code}" == "200" && "${usage_code//$'\r'/}" == "200" ]] \
    && jq -e '
        (.outbound_mappings | type == "number" and . >= 0)
        and (.inbound_mappings | type == "number" and . >= 0)
      ' "${TMPDIR_RUN}/res.json" >/dev/null \
    && jq -e '
        (.mapping_rows | type == "number" and . >= 0)
        and (.mapping_bytes | type == "number" and . >= 0)
      ' "${TMPDIR_RUN}/usage.json" >/dev/null; then
    pass "TC-RES-01"
  else
    fail_detail "TC-RES-01" "GET" "${BASE}/api/indexes/${IDX2_ID}" "${res_code}" \
      "non-negative mapping counts on index and usage" \
      "$(cat "${TMPDIR_RUN}/res.json") $(cat "${TMPDIR_RUN}/usage.json")"
  fi
else
  skip "TC-RES-01" "no ready IDX2"
fi

# --- TC-SCHEME-01 ---

if is_uuid "${IDX1_ID}"; then
  get_index_file "${IDX1_ID}" "${TMPDIR_RUN}/scheme1.json" >/dev/null
  if jq -e --arg pref "${T1_PREFERRED_ID}" '.versification_id == $pref' \
    "${TMPDIR_RUN}/scheme1.json" >/dev/null; then
    pass "TC-SCHEME-01"
  else
    fail "TC-SCHEME-01" "versification_id $(jq -r '.versification_id' "${TMPDIR_RUN}/scheme1.json") != preferred ${T1_PREFERRED_ID}"
  fi
else
  skip "TC-SCHEME-01" "no IDX1"
fi

# --- TC-AUTO-03 ---

if is_uuid "${IDX1_ID}" && is_uuid "${IDX2_ID}" && [[ -n "${M1_INBOUND}" ]]; then
  get_index_file "${IDX1_ID}" "${TMPDIR_RUN}/auto3-1.json" >/dev/null
  get_index_file "${IDX2_ID}" "${TMPDIR_RUN}/auto3-2.json" >/dev/null
  inbound_now="$(jq -r '.inbound_mappings' "${TMPDIR_RUN}/auto3-1.json")"
  if jq -e '.status == "ready"' "${TMPDIR_RUN}/auto3-1.json" >/dev/null \
    && jq -e '.status == "ready"' "${TMPDIR_RUN}/auto3-2.json" >/dev/null \
    && [[ "${inbound_now}" -gt "${M1_INBOUND}" ]]; then
    pass "TC-AUTO-03"
  else
    fail "TC-AUTO-03" "pair not ready or inbound ${inbound_now} did not exceed baseline ${M1_INBOUND}"
  fi
else
  skip "TC-AUTO-03" "CRUD-02 pair unavailable"
fi

# --- TC-BATCH-01 ---

if is_uuid "${IDX1_ID}" && is_uuid "${IDX2_ID}" && [[ -f "${COLD_RANGE_JSON}" ]]; then
  HOT_RANGE_JSON="${TMPDIR_RUN}/hot-range.json"
  hot_code="$(range_call "${T1_ID}" "${T2_ID}" "${HOT_RANGE_JSON}")"
  hot_code="${hot_code//$'\r'/}"
  verses_payload="$(jq -n --arg from "${T1_ID}" --arg to "${T2_ID}" \
    --argjson refs "$(jq '[.items[].ref] | .[:5]' "${HOT_RANGE_JSON}")" \
    '{from_translation:$from, to_translation:$to, refs:$refs}')"
  verses_code="$(http_save "${TMPDIR_RUN}/hot-verses.json" -u "${AUTH}" \
    -H 'Content-Type: application/json' -X POST "${BASE}/api/resolve/verses" \
    -d "${verses_payload}")"
  if [[ "${hot_code}" == "200" ]] \
    && jq -e '.index_used == false' "${COLD_RANGE_JSON}" >/dev/null \
    && jq -e '.index_used == true' "${HOT_RANGE_JSON}" >/dev/null \
    && jq -e --slurpfile cold "${COLD_RANGE_JSON}" --slurpfile hot "${HOT_RANGE_JSON}" -n '
        ($cold[0].items | map(.ref)) == ($hot[0].items | map(.ref))
        and ($cold[0].from_versification == $hot[0].from_versification)
        and ($cold[0].to_versification == $hot[0].to_versification)
        and (
          [range(0; $cold[0].items | length) | {
            c: $cold[0].items[.],
            h: $hot[0].items[.]
          }]
          | all(
              (.c.error == .h.error)
              and (
                (.c.result == null and .h.result == null)
                or (.c.result.relation == .h.result.relation)
              )
            )
        )
      ' >/dev/null \
    && [[ "${verses_code//$'\r'/}" == "200" ]] \
    && jq -e '.index_used == true' "${TMPDIR_RUN}/hot-verses.json" >/dev/null; then
    pass "TC-BATCH-01"
  else
    fail_detail "TC-BATCH-01" "GET" "${BASE}/api/resolve/range" "${hot_code}" \
      "cold vs indexed items match; index_used false then true" \
      "cold=$(jq -c '{index_used,n:(.items|length),from_versification}' "${COLD_RANGE_JSON}") hot=$(jq -c '{index_used,n:(.items|length)}' "${HOT_RANGE_JSON}")"
  fi
else
  skip "TC-BATCH-01" "missing ready pair or cold capture"
fi

# --- TC-PERF-01 ---

if [[ -f "${TMPDIR_RUN}/hot-range.json" ]] && jq -e '.index_used == true' "${TMPDIR_RUN}/hot-range.json" >/dev/null; then
  timed="$(python3 - "${BASE}" "${AUTH}" "${T1_ID}" "${T2_ID}" <<'PY'
import base64, sys, time, urllib.parse, urllib.request, json

base, auth, from_id, to_id = sys.argv[1:5]
qs = urllib.parse.urlencode(
    {
        "from_translation": from_id,
        "to_translation": to_id,
        "from_ref": "JHN 3",
        "to_ref": "JHN 3",
    }
)
req = urllib.request.Request(
    f"{base}/api/resolve/range?{qs}",
    headers={"Authorization": "Basic " + base64.b64encode(auth.encode()).decode()},
)
# Warm
with urllib.request.urlopen(req) as resp:
    resp.read()
start = time.perf_counter()
with urllib.request.urlopen(req) as resp:
    body = json.loads(resp.read().decode())
elapsed = time.perf_counter() - start
print(f"{elapsed:.4f} {body.get('index_used')} {len(body.get('items') or [])} {body.get('total')}")
PY
)"
  echo "  local indexed JHN 3: ${timed} (informational)"
  skip "TC-PERF-01" "AWS/staging not available; local ${timed%% *}s is informational only"
else
  skip "TC-PERF-01" "no indexed range to time"
fi

# --- TC-NEG-04 ---

if is_uuid "${T1_ID}"; then
  neg4="$(http_save "${TMPDIR_RUN}/neg4.json" -u "${AUTH}" -H 'Content-Type: application/json' \
    -X POST "${BASE}/api/indexes" -d "$(jq -n --arg t "${T1_ID}" '{translation_id:$t}')")"
  if [[ "${neg4//$'\r'/}" == "409" && "$(code_of "${TMPDIR_RUN}/neg4.json")" == "conflict" ]]; then
    pass "TC-NEG-04"
  else
    fail_detail "TC-NEG-04" "POST" "${BASE}/api/indexes" "${neg4}" \
      "409 conflict" "$(cat "${TMPDIR_RUN}/neg4.json")"
  fi
else
  skip "TC-NEG-04" "no T1_ID"
fi

# Leave sample translations in place for reruns; drop indexes created for T1/T2.
if is_uuid "${IDX1_ID}"; then
  api -X DELETE "${BASE}/api/indexes/${IDX1_ID}" >/dev/null || true
fi
if is_uuid "${IDX2_ID}"; then
  api -X DELETE "${BASE}/api/indexes/${IDX2_ID}" >/dev/null || true
fi
for tid in "${CLEANUP_TRANSLATION_IDS[@]}"; do
  if [[ "${tid}" == "${T1_ID}" || "${tid}" == "${T2_ID}" ]]; then
    continue
  fi
  api -X DELETE "${BASE}/api/translations/${tid}" >/dev/null || true
done

echo
echo "PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0

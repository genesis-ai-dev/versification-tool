#!/usr/bin/env bash
# Time POST /api/resolve/verses for ~50 refs with and without a ready index pair.
# Requires a running API (see README) and jq. Raise LOG_LEVEL above DEBUG first
# or logging will dominate the measurement.
#
# Two different sample zips are required: ingest names come from metadata.xml,
# so the same zip cannot be ingested twice. On 409 the existing translation is
# reused. Translations created by this run are deleted afterward; reused ones
# are left in place.
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZIP_A="${FRVT_INDEX_BENCH_ZIP_A:-${REPO_ROOT}/research/SampleTranslations/biblica-spanish-1.zip}"
ZIP_B="${FRVT_INDEX_BENCH_ZIP_B:-${REPO_ROOT}/research/SampleTranslations/american-standard-1.zip}"
BASE="${FRVT_BASE_URL:-http://localhost:8000}"
AUTH="${FRVT_BASIC_AUTH:-admin:Admin123!}"

CREATED_IDS=()

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

find_translation_id() {
  local name="$1"
  api -G "${BASE}/api/translations" --data-urlencode "limit=500" \
    | jq -er --arg n "${name}" '.items[] | select(.name == $n) | .id'
}

ingest_zip_into() {
  local zip="$1"
  local dest="$2"
  local tmp code translation_id
  tmp="$(mktemp)"
  code="$(
    curl -sS -o "${tmp}" -w '%{http_code}' -u "${AUTH}" \
      -X POST "${BASE}/api/ingest/project" \
      -F "file=@${zip};type=application/zip"
  )"
  code="${code//$'\r'/}"
  if [[ "${code}" == "201" ]]; then
    translation_id="$(jq -er '.translation.id' "${tmp}")"
    CREATED_IDS+=("${translation_id}")
  elif [[ "${code}" == "409" ]]; then
    echo "  already present: $(zip_translation_name "${zip}")" >&2
    translation_id="$(find_translation_id "$(zip_translation_name "${zip}")")"
  else
    die "ingest ${zip} HTTP ${code}: $(cat "${tmp}")"
  fi
  rm -f "${tmp}"
  printf -v "${dest}" '%s' "${translation_id}"
}

require_cmd curl
require_cmd jq
require_cmd python3
[[ -f "$ZIP_A" ]] || die "missing sample zip: $ZIP_A"
[[ -f "$ZIP_B" ]] || die "missing sample zip: $ZIP_B"

echo "Ingesting ${ZIP_A}"
ingest_zip_into "${ZIP_A}" ID_A
echo "Ingesting ${ZIP_B}"
ingest_zip_into "${ZIP_B}" ID_B
[[ "${ID_A}" != "${ID_B}" ]] || die "both zips resolved to the same translation"

ensure_index() {
  local translation_id="$1"
  local tmp code
  tmp="$(mktemp)"
  code="$(
    curl -sS -o "${tmp}" -w '%{http_code}' -u "${AUTH}" \
      -X POST "${BASE}/api/indexes" \
      -H 'Content-Type: application/json' \
      -d "{\"translation_id\":\"${translation_id}\"}"
  )"
  code="${code//$'\r'/}"
  if [[ "${code}" == "201" ]]; then
    jq -er '.id' "${tmp}"
  elif [[ "${code}" == "409" ]]; then
    api -G "${BASE}/api/indexes" --data-urlencode "limit=500" \
      | jq -er --arg t "${translation_id}" \
        '.items[] | select(.translation_id == $t) | .id'
  else
    die "create index ${translation_id} HTTP ${code}: $(cat "${tmp}")"
  fi
  rm -f "${tmp}"
}

echo "Creating indexes"
IDX_A="$(ensure_index "${ID_A}")"
IDX_B="$(ensure_index "${ID_B}")"

echo "Waiting for both indexes to become ready"
for _ in $(seq 1 720); do
  STATUS_A="$(api "${BASE}/api/indexes/${IDX_A}" | jq -er '.status')"
  STATUS_B="$(api "${BASE}/api/indexes/${IDX_B}" | jq -er '.status')"
  echo "  ${STATUS_A} / ${STATUS_B}"
  if [[ "${STATUS_A}" == "ready" && "${STATUS_B}" == "ready" ]]; then
    break
  fi
  if [[ "${STATUS_A}" == "failed" || "${STATUS_B}" == "failed" ]]; then
    die "index build failed"
  fi
  sleep 5
done
[[ "${STATUS_A}" == "ready" && "${STATUS_B}" == "ready" ]] || die "timed out waiting for ready indexes"

echo "Resource usage with both indexes ready:"
api "${BASE}/api/indexes/usage" | jq .

REFS_JSON="$(api -G "${BASE}/api/translations/${ID_A}/spans" \
  --data-urlencode "book=JHN" \
  --data-urlencode "limit=100" | jq -c '[.items[] | select(.part == null) | "\(.book) \(.chapter):\(.verse)"] | unique | .[:50]')"
COUNT="$(echo "${REFS_JSON}" | jq 'length')"
[[ "${COUNT}" -ge 1 ]] || die "no stored refs in JHN"

PAYLOAD="$(jq -n --arg from "${ID_A}" --arg to "${ID_B}" --argjson refs "${REFS_JSON}" \
  '{from_translation:$from, to_translation:$to, refs:$refs}')"

time_post() {
  python3 - "$BASE" "$AUTH" "$PAYLOAD" <<'PY'
import json, sys, time, urllib.request, base64

base, auth, payload = sys.argv[1], sys.argv[2], sys.argv[3]
req = urllib.request.Request(
    base + "/api/resolve/verses",
    data=payload.encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": "Basic " + base64.b64encode(auth.encode()).decode(),
    },
    method="POST",
)
start = time.perf_counter()
with urllib.request.urlopen(req) as resp:
    body = json.loads(resp.read().decode())
elapsed = time.perf_counter() - start
print(f"{elapsed:.4f} index_used={body.get('index_used')} items={len(body.get('items') or [])}")
PY
}

echo "Indexed path (${COUNT} refs):"
time_post

echo "Deleting indexes so the next call is live resolve"
api -X DELETE "${BASE}/api/indexes/${IDX_A}" >/dev/null
api -X DELETE "${BASE}/api/indexes/${IDX_B}" >/dev/null

echo "Live path (${COUNT} refs):"
time_post

if [[ "${#CREATED_IDS[@]}" -gt 0 ]]; then
  echo "Deleting translations created by this run"
  for translation_id in "${CREATED_IDS[@]}"; do
    api -X DELETE "${BASE}/api/translations/${translation_id}" >/dev/null
  done
fi

#!/usr/bin/env bash
# Companion for .spec/frvt-8-test-plan-1.md — HTTP cases via curl.
# Does not replace pytest or the markdown plan. On FAIL, paste stdout+stderr.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZIP="${REPO_ROOT}/research/SampleTranslations/biblica-spanish-1.zip"
SAMPLE_NAME="${FRVT_BATCH_SAMPLE_NAME:-frvt-8-batch-sample}"
BASE="${FRVT_BASE_URL:-http://localhost:8000}"
AUTH="${FRVT_BASIC_AUTH:-admin:Admin123!}"
SKIP_MUTATIONS=0

PASS=0
FAIL=0
NA=0
SKIP=0

FROM_ID=""
ORG_TRANSLATION_ID=""
ORG_SCHEME_ID=""
PREFERRED_ID=""
LXX_ID=""
GOOD_REF=""
GOOD_REF_B=""

usage() {
  cat <<EOF
Usage: $0 [--skip-mutations]
  FRVT_BASE_URL        default http://localhost:8000
  FRVT_BASIC_AUTH      default admin:Admin123!
  FRVT_BATCH_SAMPLE_NAME  ingested translation name (default frvt-8-batch-sample)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-mutations) SKIP_MUTATIONS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
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
  local id="$1"
  local reason="$2"
  echo "[FAIL] ${id} ${reason}"
  echo "expected: ${reason}" >&2
  FAIL=$((FAIL + 1))
}

fail_detail() {
  local id="$1"
  local method="$2"
  local url="$3"
  local status="$4"
  local expected="$5"
  local actual="$6"
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

code_of() {
  jq -r '.code // empty' "$1" 2>/dev/null || true
}

require_cmd curl
require_cmd jq

health_code="$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" "${BASE}/api/health" || true)"
if [[ "${health_code}" != "200" ]]; then
  die "server not reachable at ${BASE} (HTTP ${health_code}) — complete TC-SETUP-01 first"
fi

skip "TC-SETUP-01" "operator starts Compose + uvicorn; health gated below"

auth_body="$(api "${BASE}/api/health")"
if [[ "${health_code}" == "200" ]] && echo "${auth_body}" | jq -e '.status == "ok"' >/dev/null; then
  pass "TC-AUTH-01"
else
  fail_detail "TC-AUTH-01" "GET" "${BASE}/api/health" "${health_code}" \
    "200 {status:ok}" "${auth_body}"
fi

load_canonical() {
  local schemes
  schemes="$(api "${BASE}/api/versifications?canonical=true&limit=100")"
  ORG_SCHEME_ID="$(echo "${schemes}" | jq -r '.items[] | select(.name | ascii_downcase == "org") | .id' | head -n 1)"
  LXX_ID="$(echo "${schemes}" | jq -r '.items[] | select(.name | ascii_downcase == "lxx") | .id' | head -n 1)"
  ORG_TRANSLATION_ID="$(echo "${schemes}" | jq -r '.items[] | select(.name | ascii_downcase == "eng") | .based_on_id' | head -n 1)"
}

translation_id_by_name() {
  api "${BASE}/api/translations?limit=500" \
    | jq -r --arg name "$1" '.items[] | select(.name == $name) | .id' \
    | head -n 1
}

load_canonical

if [[ -z "${ORG_SCHEME_ID}" || -z "${ORG_TRANSLATION_ID}" || -z "${LXX_ID}" ]]; then
  die "canonical org/eng/lxx rows missing from GET /api/versifications?canonical=true"
fi

FROM_ID="$(translation_id_by_name "${SAMPLE_NAME}")"
if [[ -z "${FROM_ID}" ]]; then
  if [[ "${SKIP_MUTATIONS}" -eq 1 ]]; then
    skip "TC-SETUP-02" "no ${SAMPLE_NAME} translation and --skip-mutations"
  else
    [[ -f "${ZIP}" ]] || die "missing ${ZIP}"
    ingest_code="$(curl -sS -o /tmp/frvt8-ingest.json -w '%{http_code}' -u "${AUTH}" \
      -X POST "${BASE}/api/ingest/project" \
      -F "file=@${ZIP};type=application/zip" \
      -F "name=${SAMPLE_NAME}" \
      -F "language=es")"
    if [[ "${ingest_code}" == "201" ]]; then
      FROM_ID="$(jq -r '.translation.id' /tmp/frvt8-ingest.json)"
    else
      fail_detail "TC-SETUP-02" "POST" "${BASE}/api/ingest/project" "${ingest_code}" \
        "201 ingest" "$(cat /tmp/frvt8-ingest.json)"
    fi
  fi
fi

if [[ -n "${FROM_ID}" ]]; then
  PREFERRED_ID="$(api "${BASE}/api/translations/${FROM_ID}/versifications" \
    | jq -r '.[] | select(.preferred) | .scheme_id' | head -n 1)"
  if [[ -n "${PREFERRED_ID}" && -n "${FROM_ID}" ]]; then
    pass "TC-SETUP-02"
  else
    fail "TC-SETUP-02" "missing preferred association on ${FROM_ID}"
  fi
  span_json="$(api "${BASE}/api/translations/${FROM_ID}/spans?book=JHN&chapter=3&limit=500")"
  GOOD_REF="$(echo "${span_json}" | jq -r '[.items[] | select(.part == null) | "\(.book) \(.chapter):\(.verse)"] | unique | .[0] // empty')"
  GOOD_REF_B="$(echo "${span_json}" | jq -r '[.items[] | select(.part == null) | "\(.book) \(.chapter):\(.verse)"] | unique | .[1] // empty')"
else
  skip "TC-RANGE-01" "needs FROM_ID"
  skip "TC-RANGE-02" "needs FROM_ID"
  skip "TC-RANGE-03" "needs FROM_ID"
  skip "TC-SET-01" "needs FROM_ID"
  skip "TC-SET-02" "needs FROM_ID"
  skip "TC-SCHEME-01" "needs FROM_ID"
  skip "TC-NEG-02" "needs FROM_ID"
  skip "TC-NEG-03" "needs FROM_ID"
  skip "TC-NEG-04" "needs FROM_ID"
  skip "TC-NEG-05" "needs FROM_ID"
  skip "TC-NEG-06" "needs FROM_ID"
fi

if [[ -n "${FROM_ID}" && -n "${GOOD_REF}" ]]; then
  range_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=JHN 3" \
    --data-urlencode "to_ref=JHN 3")"
  range_status="${range_body##*$'\n'}"
  range_json="${range_body%$'\n'*}"
  span_refs="$(api "${BASE}/api/translations/${FROM_ID}/spans?book=JHN&chapter=3&limit=500" \
    | jq -c '[.items[] | select(.part == null) | "\(.book) \(.chapter):\(.verse)"] | unique')"
  item_refs="$(echo "${range_json}" | jq -c '[.items[].ref]')"
  if [[ "${range_status}" == "200" ]] \
    && echo "${range_json}" | jq -e '.items | length > 0' >/dev/null \
    && echo "${range_json}" | jq -e --argjson spans "${span_refs}" '
        ($spans | length) > 0
        and ([.items[].ref | startswith("JHN 3:")] | all)
        and ((.items | map(.ref)) as $refs | ($spans - $refs) | length == 0)
        and (.from_versification != null)
        and (.items[0].error == null)
      ' >/dev/null; then
    pass "TC-RANGE-01"
  else
    fail_detail "TC-RANGE-01" "GET" "${BASE}/api/resolve/range" "${range_status}" \
      "200 chapter items matching JHN 3 spans" "${range_json:0:800}"
    echo "span_refs=${span_refs}" >&2
    echo "item_refs=${item_refs}" >&2
  fi

  book_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=JHN" \
    --data-urlencode "to_ref=JHN 3" \
    --data-urlencode "limit=5")"
  book_status="${book_body##*$'\n'}"
  book_json="${book_body%$'\n'*}"
  verse_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=JHN 3:1" \
    --data-urlencode "to_ref=JHN 3:5")"
  verse_status="${verse_body##*$'\n'}"
  verse_json="${verse_body%$'\n'*}"
  if [[ "${book_status}" == "200" && "${verse_status}" == "200" ]] \
    && echo "${book_json}" | jq -e '.total > 5 and (.items | length) == 5' >/dev/null \
    && echo "${verse_json}" | jq -e '
        .items[0].ref == "JHN 3:1"
        and (.items | last).ref == "JHN 3:5"
      ' >/dev/null; then
    pass "TC-RANGE-02"
  else
    fail_detail "TC-RANGE-02" "GET" "${BASE}/api/resolve/range" "${book_status}/${verse_status}" \
      "book window paged + JHN 3:1-5 closed interval" "${book_json:0:400} | ${verse_json:0:400}"
  fi

  page_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=JHN 3" \
    --data-urlencode "to_ref=JHN 3" \
    --data-urlencode "limit=2" \
    --data-urlencode "offset=1")"
  page_status="${page_body##*$'\n'}"
  page_json="${page_body%$'\n'*}"
  if [[ "${page_status}" == "200" ]] \
    && echo "${page_json}" | jq -e '
        (.items | length) == 2
        and .total >= 3
        and ([.items[].ref | startswith("JHN 3:")] | all)
      ' >/dev/null; then
    pass "TC-RANGE-03"
  else
    fail_detail "TC-RANGE-03" "GET" "${BASE}/api/resolve/range?limit=2" "${page_status}" \
      "2 items, total >= 3" "${page_json:0:400}"
  fi

  if [[ -z "${GOOD_REF_B}" ]]; then
    GOOD_REF_B="${GOOD_REF}"
  fi
  set_payload="$(jq -n \
    --arg from "${FROM_ID}" \
    --arg to "${ORG_TRANSLATION_ID}" \
    --arg a "${GOOD_REF}" \
    --arg b "${GOOD_REF_B}" \
    '{from_translation:$from, to_translation:$to, refs:[$a,$b,$a]}')"
  set_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -H 'Content-Type: application/json' \
    -X POST "${BASE}/api/resolve/verses" -d "${set_payload}")"
  set_status="${set_body##*$'\n'}"
  set_json="${set_body%$'\n'*}"
  if [[ "${set_status}" == "200" ]] \
    && echo "${set_json}" | jq -e --arg a "${GOOD_REF}" --arg b "${GOOD_REF_B}" '
        .total == 3
        and .items[0].ref == $a
        and .items[1].ref == $b
        and .items[2].ref == $a
      ' >/dev/null; then
    pass "TC-SET-01"
  else
    fail_detail "TC-SET-01" "POST" "${BASE}/api/resolve/verses" "${set_status}" \
      "200 order preserved with duplicate" "${set_json:0:600}"
  fi

  mixed_payload="$(jq -n \
    --arg from "${FROM_ID}" \
    --arg to "${ORG_TRANSLATION_ID}" \
    --arg a "${GOOD_REF}" \
    '{from_translation:$from, to_translation:$to, refs:[$a, "GEN 1:1a"]}')"
  mixed_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -H 'Content-Type: application/json' \
    -X POST "${BASE}/api/resolve/verses" -d "${mixed_payload}")"
  mixed_status="${mixed_body##*$'\n'}"
  mixed_json="${mixed_body%$'\n'*}"
  if [[ "${mixed_status}" == "200" ]] \
    && echo "${mixed_json}" | jq -e '
        .items[0].error == null and .items[0].result != null
        and .items[1].result == null and .items[1].error.code == "bad_request"
      ' >/dev/null; then
    pass "TC-SET-02"
  else
    fail_detail "TC-SET-02" "POST" "${BASE}/api/resolve/verses" "${mixed_status}" \
      "200 mixed result/error" "${mixed_json:0:600}"
  fi

  if echo "${range_json}" | jq -e --arg pref "${PREFERRED_ID}" \
    '.from_versification == $pref' >/dev/null; then
    pass "TC-SCHEME-01"
  else
    fail_detail "TC-SCHEME-01" "GET" "${BASE}/api/resolve/range" "${range_status}" \
      "from_versification == preferred ${PREFERRED_ID}" \
      "$(echo "${range_json}" | jq -c '{from_versification,to_versification}')"
  fi
elif [[ -n "${FROM_ID}" && -z "${GOOD_REF}" ]]; then
  fail "TC-RANGE-01" "no whole-verse JHN 3 spans on ${FROM_ID}"
  skip "TC-RANGE-02" "no JHN 3 spans"
  skip "TC-RANGE-03" "no JHN 3 spans"
  skip "TC-SET-01" "no JHN 3 spans"
  skip "TC-SET-02" "no JHN 3 spans"
  skip "TC-SCHEME-01" "no JHN 3 spans"
fi

if [[ "${SKIP_MUTATIONS}" -eq 1 ]]; then
  skip "TC-SCHEME-02" "--skip-mutations"
else
  unique_name="frvt-8-org-fallback-$(date +%s)"
  create_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -H 'Content-Type: application/json' \
    -X POST "${BASE}/api/translations" \
    -d "$(jq -n --arg n "${unique_name}" '{name:$n, language:"en", source_format:"usx"}')")"
  create_status="${create_body##*$'\n'}"
  create_json="${create_body%$'\n'*}"
  new_id="$(echo "${create_json}" | jq -r '.id // empty')"
  if [[ "${create_status}" != "201" || -z "${new_id}" ]]; then
    fail_detail "TC-SCHEME-02" "POST" "${BASE}/api/translations" "${create_status}" \
      "201 metadata-only translation" "${create_json}"
  else
    fb_payload="$(jq -n \
      --arg from "${new_id}" \
      --arg to "${ORG_TRANSLATION_ID}" \
      '{from_translation:$from, to_translation:$to, refs:["JHN 3:16"]}')"
    fb_body="$(curl -sS -w '\n%{http_code}' -u "${AUTH}" -H 'Content-Type: application/json' \
      -X POST "${BASE}/api/resolve/verses" -d "${fb_payload}")"
    fb_status="${fb_body##*$'\n'}"
    fb_json="${fb_body%$'\n'*}"
    if [[ "${fb_status}" == "200" ]] \
      && echo "${fb_json}" | jq -e --arg org "${ORG_SCHEME_ID}" \
        '.from_versification == $org' >/dev/null; then
      pass "TC-SCHEME-02"
    else
      fail_detail "TC-SCHEME-02" "POST" "${BASE}/api/resolve/verses" "${fb_status}" \
        "200 from_versification == org scheme ${ORG_SCHEME_ID}" "${fb_json:0:600}"
    fi
  fi
fi

neg_range="$(curl -sS -o /tmp/frvt8-neg-range.json -w '%{http_code}' \
  -G "${BASE}/api/resolve/range" \
  --data-urlencode "from_translation=00000000-0000-0000-0000-000000000000" \
  --data-urlencode "to_translation=00000000-0000-0000-0000-000000000000" \
  --data-urlencode "from_ref=GEN" \
  --data-urlencode "to_ref=GEN")"
neg_post="$(curl -sS -o /tmp/frvt8-neg-post.json -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -X POST "${BASE}/api/resolve/verses" \
  -d '{"from_translation":"00000000-0000-0000-0000-000000000000","to_translation":"00000000-0000-0000-0000-000000000000","refs":["GEN 1:1"]}')"
range_code="$(code_of /tmp/frvt8-neg-range.json)"
post_code="$(code_of /tmp/frvt8-neg-post.json)"
if [[ "${neg_range}" == "401" && "${neg_post}" == "401" \
  && "${range_code}" == "unauthorized" && "${post_code}" == "unauthorized" ]]; then
  pass "TC-NEG-01"
else
  fail_detail "TC-NEG-01" "GET/POST" "${BASE}/api/resolve/range" "${neg_range}/${neg_post}" \
    "401 unauthorized both routes" "range=$(cat /tmp/frvt8-neg-range.json) post=$(cat /tmp/frvt8-neg-post.json)"
fi

if [[ -n "${FROM_ID}" ]]; then
  missing_t="$(curl -sS -o /tmp/frvt8-404t.json -w '%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=00000000-0000-0000-0000-000000000001" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=JHN 3" \
    --data-urlencode "to_ref=JHN 3")"
  if [[ "${missing_t}" == "404" && "$(code_of /tmp/frvt8-404t.json)" == "not_found" ]]; then
    pass "TC-NEG-02"
  else
    fail_detail "TC-NEG-02" "GET" "${BASE}/api/resolve/range" "${missing_t}" \
      "404 not_found" "$(cat /tmp/frvt8-404t.json)"
  fi

  missing_s="$(curl -sS -o /tmp/frvt8-404s.json -w '%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=JHN 3" \
    --data-urlencode "to_ref=JHN 3" \
    --data-urlencode "from_versification=00000000-0000-0000-0000-000000000002")"
  if [[ "${missing_s}" == "404" && "$(code_of /tmp/frvt8-404s.json)" == "not_found" ]]; then
    pass "TC-NEG-03"
  else
    fail_detail "TC-NEG-03" "GET" "${BASE}/api/resolve/range" "${missing_s}" \
      "404 not_found unknown scheme" "$(cat /tmp/frvt8-404s.json)"
  fi

  bad_ref="$(curl -sS -o /tmp/frvt8-400.json -w '%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=GEN 3:" \
    --data-urlencode "to_ref=GEN 3:1")"
  if [[ "${bad_ref}" == "400" && "$(code_of /tmp/frvt8-400.json)" == "bad_request" ]]; then
    pass "TC-NEG-04"
  else
    fail_detail "TC-NEG-04" "GET" "${BASE}/api/resolve/range" "${bad_ref}" \
      "400 bad_request" "$(cat /tmp/frvt8-400.json)"
  fi

  unassoc="$(curl -sS -o /tmp/frvt8-409.json -w '%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=JHN 3" \
    --data-urlencode "to_ref=JHN 3" \
    --data-urlencode "from_versification=${LXX_ID}")"
  if [[ "${unassoc}" == "409" && "$(code_of /tmp/frvt8-409.json)" == "conflict" ]]; then
    pass "TC-NEG-05"
  else
    fail_detail "TC-NEG-05" "GET" "${BASE}/api/resolve/range" "${unassoc}" \
      "409 conflict" "$(cat /tmp/frvt8-409.json)"
  fi

  reversed="$(curl -sS -o /tmp/frvt8-422.json -w '%{http_code}' -u "${AUTH}" -G "${BASE}/api/resolve/range" \
    --data-urlencode "from_translation=${FROM_ID}" \
    --data-urlencode "to_translation=${ORG_TRANSLATION_ID}" \
    --data-urlencode "from_ref=EXO" \
    --data-urlencode "to_ref=GEN")"
  if [[ "${reversed}" == "422" && "$(code_of /tmp/frvt8-422.json)" == "validation_failed" ]]; then
    pass "TC-NEG-06"
  else
    fail_detail "TC-NEG-06" "GET" "${BASE}/api/resolve/range" "${reversed}" \
      "422 validation_failed" "$(cat /tmp/frvt8-422.json)"
  fi
fi

echo "PASS=${PASS} FAIL=${FAIL} N/A=${NA} SKIP=${SKIP}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0

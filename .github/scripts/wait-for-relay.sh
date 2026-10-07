#!/usr/bin/env bash
# Blocks until the content relay reflects a CMS publish, or fails the build.
#
# Usage: wait-for-relay.sh <collection> [relayVersion] [updatedAt]
# Env:   CONTENT_RELAY_URL, CONTENT_RELAY_READ_KEY  (the relay to poll)
#
# The CMS pushes the collection to the relay, then dispatches with
# client_payload.relayVersion — the version token the relay returned for THAT
# push. We poll until the relay's list endpoint reports a version at least that new.
#
# Why the list endpoint and not /v2/meta: KV serves every key from its own
# independent edge cache (default TTL 60s), so a fresh meta: read does not
# prove the collection: body is fresh. Polling the exact key the build
# consumes, from the same runner that will run the build, is what actually
# rules out a stale read.
#
# Versions are ISO 8601 UTC strings minted by the relay, so a lexical
# comparison is a chronological one — and both sides come from the relay's
# own clock, so there is no CMS/Cloudflare skew to account for. ">=" rather
# than "==" so a second publish landing mid-wait satisfies this run too.
#
# Shared by republish-prod.yml and deploy-staging.yml. Lives outside the code
# that gets built so it is available whichever tag the build later checks out.
set -uo pipefail

COLLECTION="${1:-}"
TARGET_VERSION="${2:-}"
UPDATED_AT="${3:-}"

if [[ -z "$COLLECTION" ]]; then
  # No client_payload at all: this is a code-deploy rebuild rather than a
  # content publish, so there is no specific relay write to wait for.
  echo "No collection in client_payload — not a content publish, skipping relay wait."
  exit 0
fi

MAX_WAIT=180
INTERVAL=5
ELAPSED=0

if [[ -n "$TARGET_VERSION" ]]; then
  echo "Waiting for relay '${COLLECTION}' version >= ${TARGET_VERSION}..."
else
  echo "::warning::client_payload has no relayVersion (CMS or relay worker predates versioning)."
  echo "Falling back to the weaker meta.updatedAt check."
  if [[ -z "$UPDATED_AT" ]]; then
    echo "::warning::No updatedAt either — cannot verify relay freshness."
    exit 0
  fi
  TARGET_TS=$(date -d "$UPDATED_AT" +%s)
fi

while [[ $ELAPSED -lt $MAX_WAIT ]]; do
  if [[ -n "$TARGET_VERSION" ]]; then
    # Read the same key the build reads. limit=1 keeps the response small;
    # `version` describes the whole stored collection, not the page.
    RELAY_VERSION=$(curl -sf --max-time 10 \
      -H "X-Read-Key: ${CONTENT_RELAY_READ_KEY}" \
      "${CONTENT_RELAY_URL}/v2/${COLLECTION}?limit=1" \
      | jq -r '.version // empty' 2>/dev/null || true)

    if [[ -n "$RELAY_VERSION" ]]; then
      if [[ ! "$RELAY_VERSION" < "$TARGET_VERSION" ]]; then
        echo "Relay is ready (version=${RELAY_VERSION}). Proceeding with build."
        exit 0
      fi
      echo "[${ELAPSED}s] Relay still stale (version=${RELAY_VERSION} < ${TARGET_VERSION}). Retrying in ${INTERVAL}s..."
    else
      # A deployed worker that predates versioning returns no version at
      # all. Degrade rather than spin here until the timeout.
      echo "::warning::Relay list endpoint reports no version — worker predates versioning."
      echo "Falling back to the weaker meta.updatedAt check."
      TARGET_VERSION=""
      if [[ -z "$UPDATED_AT" ]]; then
        echo "::warning::No updatedAt in client_payload — cannot verify relay freshness."
        exit 0
      fi
      TARGET_TS=$(date -d "$UPDATED_AT" +%s)
      continue
    fi
  else
    RELAY_UPDATED_AT=$(curl -sf --max-time 10 \
      -H "X-Read-Key: ${CONTENT_RELAY_READ_KEY}" \
      "${CONTENT_RELAY_URL}/v2/meta/${COLLECTION}" \
      | jq -r '.updatedAt // empty' 2>/dev/null || true)

    if [[ -n "$RELAY_UPDATED_AT" ]]; then
      RELAY_TS=$(date -d "$RELAY_UPDATED_AT" +%s)
      if [[ $RELAY_TS -ge $TARGET_TS ]]; then
        echo "Relay meta is ready (updatedAt=${RELAY_UPDATED_AT}). Proceeding with build."
        exit 0
      fi
      echo "[${ELAPSED}s] Relay meta not ready (relay=${RELAY_UPDATED_AT} < target=${UPDATED_AT}). Retrying in ${INTERVAL}s..."
    else
      echo "[${ELAPSED}s] No relay meta yet. Retrying in ${INTERVAL}s..."
    fi
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

# Fail rather than warn. The CMS blocks the rebuild outright when its relay
# push fails; shipping a build from unverified relay data here would undo
# that guarantee and is exactly how stale content reached production before.
echo "::error::Relay did not reflect this publish within ${MAX_WAIT}s — refusing to build against unverified content."
echo "Recheck the relay, then re-run this workflow (or re-publish) once it is healthy."
exit 1

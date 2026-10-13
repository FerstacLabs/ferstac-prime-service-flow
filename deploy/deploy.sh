#!/usr/bin/env bash
set -euo pipefail

IMAGE_REPO="ghcr.io/ferstaclabs/ferstac-prime-service-flow"
CONTAINER="prime-flow"
PREVIOUS="${CONTAINER}-previous"

ENV_FILE="/opt/ferstaclabs-prime-flow/secrets/prime-app.env"
NETWORK="supabase_default"
HOST_PORT="3001"
CONTAINER_PORT="3000"

SHA="${1:-}"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <40-character-git-commit-sha>"
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file missing: $ENV_FILE"
  exit 1
fi

IMAGE="${IMAGE_REPO}:${SHA}"

echo "===== PRIME DEPLOY ====="
echo "image=${IMAGE}"
echo "container=${CONTAINER}"

echo "Pulling immutable image..."
docker pull "$IMAGE"

ARCH=$(docker image inspect "$IMAGE" --format '{{.Architecture}}')
if [[ "$ARCH" != "amd64" ]]; then
  echo "ERROR: expected amd64 image, got: $ARCH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$PREVIOUS"; then
  docker rm -f "$PREVIOUS" >/dev/null
fi

HAD_CURRENT="no"
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  HAD_CURRENT="yes"
  docker stop "$CONTAINER" >/dev/null || true
  docker rename "$CONTAINER" "$PREVIOUS"
fi

rollback() {
  echo "DEPLOY FAILED - rolling back"

  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

  if [[ "$HAD_CURRENT" == "yes" ]] &&
     docker ps -a --format '{{.Names}}' | grep -qx "$PREVIOUS"; then
    docker rename "$PREVIOUS" "$CONTAINER"
    docker start "$CONTAINER" >/dev/null
    echo "Rollback completed."
  else
    echo "No previous container was available."
  fi

  exit 1
}

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --init \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  -p "127.0.0.1:${HOST_PORT}:${CONTAINER_PORT}" \
  "$IMAGE" >/dev/null

echo "Waiting for healthcheck..."

HEALTH=""
for _ in $(seq 1 30); do
  HEALTH=$(docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$CONTAINER" 2>/dev/null || true)

  if [[ "$HEALTH" == "healthy" ]]; then
    break
  fi

  if [[ "$HEALTH" == "unhealthy" ]]; then
    rollback
  fi

  sleep 2
done

if [[ "$HEALTH" != "healthy" ]]; then
  docker logs --tail 50 "$CONTAINER" || true
  rollback
fi

if ! curl -fsS \
  "http://127.0.0.1:${HOST_PORT}/login" \
  >/dev/null; then
  docker logs --tail 50 "$CONTAINER" || true
  rollback
fi

echo "===== DEPLOY VERIFIED ====="
echo "sha=${SHA}"
echo "health=healthy"
echo "login_http=PASS"

if [[ "$HAD_CURRENT" == "yes" ]]; then
  echo "previous_container=${PREVIOUS}"
fi

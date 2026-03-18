#!/usr/bin/env bash
# Build and push a universal multi-platform Docker image.
# Supports: linux/amd64 (x86_64) and linux/arm64 (Apple Silicon, AWS Graviton)
#
# Prerequisites:
#   docker buildx create --use   # create a buildx builder (once)
#
# Usage:
#   ./build-multiplatform.sh <image-name> [tag]
#
# Examples:
#   ./build-multiplatform.sh myrepo/delphi-analyser
#   ./build-multiplatform.sh myrepo/delphi-analyser v1.2.0

set -euo pipefail

IMAGE="${1:-delphi-analyser}"
TAG="${2:-latest}"
FULL_IMAGE="${IMAGE}:${TAG}"

echo "Building universal image: ${FULL_IMAGE}"
echo "Platforms: linux/amd64, linux/arm64"
echo ""

# Ensure a buildx builder exists and is active
if ! docker buildx inspect multiplatform-builder &>/dev/null; then
  docker buildx create --name multiplatform-builder --use
else
  docker buildx use multiplatform-builder
fi

# Build and push (--push is required for multi-platform manifests)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag "${FULL_IMAGE}" \
  --push \
  .

echo ""
echo "Done. Image pushed: ${FULL_IMAGE}"
echo "Pull on any platform with: docker pull ${FULL_IMAGE}"

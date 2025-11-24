#!/bin/bash
# Script to detect changed services in monorepo

set -e

# Get base branch (default to develop for PRs, main for pushes)
BASE_BRANCH="${1:-develop}"

# Get changed files
if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
	CHANGED_FILES=$(git diff --name-only origin/$BASE_BRANCH...HEAD)
else
	CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD)
fi

# Initialize services array
SERVICES=()
HAS_CHANGES=false

# Check each service directory
for SERVICE in auth-worker cart-worker fulfillment-worker gateway-worker inventory-worker order-worker payment-worker product-worker; do
	if echo "$CHANGED_FILES" | grep -q "^$SERVICE/"; then
		SERVICES+=("$SERVICE")
		HAS_CHANGES=true
	fi
done

# Check root changes (affects all services)
if echo "$CHANGED_FILES" | grep -qE "^(package\.json|knip\.json|\.github/|\.prettierrc)"; then
	HAS_CHANGES=true
	SERVICES=("auth-worker" "cart-worker" "fulfillment-worker" "gateway-worker" "inventory-worker" "order-worker" "payment-worker" "product-worker")
fi

# Output results
if [ "$HAS_CHANGES" = "true" ]; then
	echo "Changed services: ${SERVICES[*]}"
	echo "services=${SERVICES[*]}" >> $GITHUB_OUTPUT
	echo "has-changes=true" >> $GITHUB_OUTPUT
else
	echo "No service changes detected"
	echo "has-changes=false" >> $GITHUB_OUTPUT
fi


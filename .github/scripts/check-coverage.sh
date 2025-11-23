#!/bin/bash
# Script to check coverage threshold

set -e

SERVICE=$1
THRESHOLD=${2:-90}
COVERAGE_FILE="$SERVICE/coverage/coverage-summary.json"

if [ ! -f "$COVERAGE_FILE" ]; then
	echo "::error::Coverage file not found: $COVERAGE_FILE"
	exit 1
fi

# Extract coverage percentage using node
COVERAGE=$(node -e "const data = require('./$COVERAGE_FILE'); console.log(data.total.lines.pct);")

echo "Current coverage: $COVERAGE%"
echo "Required coverage: $THRESHOLD%"

# Compare coverage using node (no bc dependency needed)
RESULT=$(node -e "console.log($COVERAGE >= $THRESHOLD ? 'pass' : 'fail');")

if [ "$RESULT" != "pass" ]; then
	echo "::error::Coverage $COVERAGE% is below required $THRESHOLD% for $SERVICE"
	exit 1
fi

echo "✅ Coverage check passed: $COVERAGE% for $SERVICE"


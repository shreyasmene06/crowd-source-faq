#!/bin/bash
# ============================================================
# capture-startup-logs.sh — Capture fresh startup logs
#
# Designed for CI/CD pipelines (GitHub Actions). After a service
# restart, this script waits for the backend to become healthy
# and then dumps only the NEW log lines written since the restart.
#
# Usage:
#   # Before restarting the service, snapshot the log:
#   PRE_LINES=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
#
#   # ... restart service ...
#
#   # Then capture startup logs:
#   ./scripts/capture-startup-logs.sh <log-file> <pre-lines> [health-url] [max-wait-secs] [settle-secs]
#
# Arguments:
#   log-file       Path to the application log file
#   pre-lines      Line count of the log file BEFORE the restart
#   health-url     URL to poll for readiness (default: http://localhost:6767/csfaq/api/health)
#   max-wait-secs  Max seconds to wait for health (default: 60)
#   settle-secs    Extra seconds to wait after health OK for startup tasks to log (default: 10)
#
# Exit codes:
#   0  — Logs captured successfully
#   1  — Backend never became healthy (logs still dumped)
# ============================================================

set -euo pipefail

LOG_FILE="${1:?Usage: capture-startup-logs.sh <log-file> <pre-lines> [health-url] [max-wait] [settle]}"
PRE_LINES="${2:?Usage: capture-startup-logs.sh <log-file> <pre-lines> [health-url] [max-wait] [settle]}"
HEALTH_URL="${3:-http://localhost:6767/csfaq/api/health}"
MAX_WAIT="${4:-60}"
SETTLE="${5:-10}"

HEALTHY=0

echo "==> Waiting for backend to become healthy (max ${MAX_WAIT}s)..."
echo "    health endpoint: $HEALTH_URL"

waited=0
while [ "$waited" -lt "$MAX_WAIT" ]; do
  status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    echo "==> Backend healthy after ${waited}s (HTTP $status)"
    HEALTHY=1
    break
  fi
  sleep 2
  waited=$((waited + 2))
  echo -n "."
done

if [ "$HEALTHY" -eq 0 ]; then
  echo ""
  echo "⚠️  Backend did NOT become healthy after ${MAX_WAIT}s — dumping available logs anyway"
fi

# Wait a few extra seconds for startup tasks (cron schedulers,
# bookmark sync, bot registration, etc.) to finish logging
if [ "$HEALTHY" -eq 1 ] && [ "$SETTLE" -gt 0 ]; then
  echo "==> Waiting ${SETTLE}s for startup tasks to settle..."
  sleep "$SETTLE"
fi

# Dump only the new lines added since the restart
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  STARTUP LOGS (lines added after restart)"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "$LOG_FILE" ]; then
  echo "⚠️  Log file not found: $LOG_FILE"
  echo "    The application may not have started yet or logs are written elsewhere."
  exit 1
fi

CURRENT_LINES=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
NEW_LINES=$((CURRENT_LINES - PRE_LINES))

if [ "$NEW_LINES" -le 0 ]; then
  echo "⚠️  No new log lines written since restart."
  echo "    Pre-restart lines: $PRE_LINES"
  echo "    Current lines:     $CURRENT_LINES"
  # Still show the last 50 lines as a fallback
  echo ""
  echo "    Showing last 50 lines of log file as fallback:"
  echo ""
  tail -n 50 "$LOG_FILE" || true
else
  echo "    New lines: $NEW_LINES (pre-restart: $PRE_LINES, current: $CURRENT_LINES)"
  echo ""
  # Show at most 500 new lines to avoid flooding the CI output
  if [ "$NEW_LINES" -gt 500 ]; then
    echo "    (showing first 500 of $NEW_LINES new lines)"
    tail -n +"$((PRE_LINES + 1))" "$LOG_FILE" | head -n 500
    echo ""
    echo "    ... ($((NEW_LINES - 500)) more lines truncated)"
  else
    tail -n +"$((PRE_LINES + 1))" "$LOG_FILE"
  fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════"

exit $((1 - HEALTHY))

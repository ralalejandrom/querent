#!/usr/bin/env bash
# Runs a command; if it fails, turns the end of its output into an error annotation,
# so the reason shows on the run's summary page without opening the full log.
# Usage: logged.sh "Step title" command args...
title="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg="$(grep -v '^\s*$' "$log" | tail -n 45 | sed -e 's/%/%25/g' -e 's/\r/%0D/g' | awk 'BEGIN{ORS="%0A"} {print}')"
  echo "::error title=${title}::${msg}"
fi
exit "$code"

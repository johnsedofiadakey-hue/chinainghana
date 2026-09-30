#!/usr/bin/env bash
# Starts the Firebase emulators with Java 21+ (the emulators need it) and
# rebuilds Cloud Functions on every change.
set -euo pipefail
cd "$(dirname "$0")/.."

for candidate in "${JAVA21_HOME:-}" /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21 "$(/usr/libexec/java_home -v 21+ 2>/dev/null || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate/bin/java" ]; then
    export JAVA_HOME="$candidate"
    export PATH="$candidate/bin:$PATH"
    break
  fi
done
java -version 2>&1 | head -1

npm --prefix functions run build
npm --prefix functions run build:watch >/dev/null 2>&1 &
WATCH_PID=$!
trap 'kill $WATCH_PID 2>/dev/null || true' EXIT

# Emulator data is saved on exit and reloaded next time.
IMPORT=""
if [ -d .emulator-data ]; then IMPORT="--import=.emulator-data"; fi
firebase emulators:start --project demo-cig $IMPORT --export-on-exit=.emulator-data

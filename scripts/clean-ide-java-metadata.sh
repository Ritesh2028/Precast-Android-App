#!/bin/bash
# Removes Eclipse/Java IDE metadata from node_modules so VS Code/Cursor Java
# extension does not treat RN/Expo Gradle plugins as broken Java projects.
# Also removes android/bin copies (Android Studio "Make Module"), which duplicate
# Expo package classes and crash the dev client on startup.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NM="$ROOT/node_modules"

if [ ! -d "$NM" ]; then
  exit 0
fi

find "$NM" -name '.project' -type f -delete 2>/dev/null || true
find "$NM" -name '.classpath' -type f -delete 2>/dev/null || true
find "$NM" -depth -type d -name '.settings' 2>/dev/null | while read -r d; do
  rm -rf "$d"
done
find "$NM" -depth -type d -path '*/android/bin' 2>/dev/null | while read -r d; do
  rm -rf "$d"
done

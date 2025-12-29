#!/bin/bash

# Quick APK Build Script
# This script fixes EAS permissions and builds the APK

set -e

echo "🔧 Fixing EAS Project Permissions..."
echo ""

# Backup app.json
cp app.json app.json.backup
echo "✅ Backup created: app.json.backup"

# Remove projectId to allow new project creation
echo "📝 Removing old project ID from app.json..."
node -e "
const fs = require('fs');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
if (appJson.expo.extra && appJson.expo.extra.eas) {
  delete appJson.expo.extra.eas.projectId;
  if (Object.keys(appJson.expo.extra.eas).length === 0) {
    delete appJson.expo.extra.eas;
  }
  if (Object.keys(appJson.expo.extra).length === 0) {
    delete appJson.expo.extra;
  }
}
fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2));
"

echo "✅ Project ID removed"
echo ""

# Initialize new EAS project
echo "🆕 Initializing new EAS project..."
echo "   (This will create a new project ID)"
npx eas-cli init

echo ""
echo "🔨 Building APK..."
npx eas-cli build --platform android --profile preview

echo ""
echo "✅ Build process started!"
echo "📱 Check build status: https://expo.dev/accounts/$(npx eas-cli whoami)/projects/mobile/builds"
echo "📥 Download link will be available when build completes."


#!/bin/bash

# Build APK Script for Precast App
# This script helps build the APK using EAS Build

echo "🚀 Precast App - APK Builder"
echo "=============================="
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI not found. Installing..."
    npm install -g eas-cli
fi

# Check if logged in
echo "📋 Checking EAS login status..."
if ! eas whoami &> /dev/null; then
    echo "⚠️  Not logged in to EAS. Please login:"
    eas login
fi

echo "✅ Logged in as: $(eas whoami)"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit for EAS build"
    echo "✅ Git repository initialized"
    echo ""
fi

# Option 1: Try to build with existing project
echo "🔨 Attempting to build APK with EAS..."
echo ""

# Try building
if eas build --platform android --profile preview --non-interactive; then
    echo ""
    echo "✅ Build started successfully!"
    echo "📱 Check your build status at: https://expo.dev/accounts/$(eas whoami)/projects/mobile/builds"
    echo "📥 Download link will be provided when build completes."
else
    echo ""
    echo "⚠️  Build failed. Trying to fix project permissions..."
    echo ""
    
    # Option 2: Create new EAS project
    read -p "Would you like to create a new EAS project? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🆕 Creating new EAS project..."
        # Remove old project ID from app.json temporarily
        if grep -q "projectId" app.json; then
            echo "⚠️  Removing old project ID from app.json..."
            # Backup app.json
            cp app.json app.json.backup
            
            # Remove projectId from extra.eas
            # This is a simple approach - you may need to manually edit app.json
            echo "📝 Please manually remove the 'projectId' from app.json under 'extra.eas' section"
            echo "   Then run: eas init"
            echo ""
            echo "   Or continue with local build instructions in BUILD_APK.md"
        else
            eas init
            eas build --platform android --profile preview
        fi
    else
        echo ""
        echo "📖 Please see BUILD_APK.md for alternative build methods:"
        echo "   1. Local build with Android Studio"
        echo "   2. Manual EAS project setup"
        echo ""
    fi
fi


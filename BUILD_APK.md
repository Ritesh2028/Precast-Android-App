# Building APK for Precast App

## Option 1: Using EAS Build (Recommended - Cloud Build)

### Prerequisites:
- EAS CLI installed (already installed)
- Logged into EAS (currently logged in as: ritesh_628)

### Steps:

1. **Fix EAS Project Permissions** (if needed):
   ```bash
   # If you get permission errors, you may need to:
   # 1. Create a new EAS project, or
   # 2. Get access to the existing project
   
   # To create a new project:
   npx eas-cli init
   ```

2. **Build APK using EAS:**
   ```bash
   npx eas-cli build --platform android --profile preview
   ```
   
   This will:
   - Build the APK in the cloud
   - Provide a download link when complete
   - APK will be available for download from EAS dashboard

3. **Download the APK:**
   - After build completes, you'll get a download link
   - Or visit: https://expo.dev/accounts/ritesh_628/projects/mobile/builds

---

## Option 2: Local Build (Requires Android Studio)

### Prerequisites:
- Android Studio installed
- Android SDK configured
- JAVA_HOME set

### Steps:

1. **Install Android Studio:**
   - Download from: https://developer.android.com/studio
   - Install Android SDK (API level 33 or higher recommended)

2. **Set up environment variables:**
   ```bash
   # Add to ~/.zshrc or ~/.bash_profile:
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   ```

3. **Build the APK:**
   ```bash
   # Navigate to project directory
   cd /Users/riteshrai/Downloads/Precast-Android-App-main
   
   # Prebuild native code (if needed)
   npx expo prebuild --platform android
   
   # Build release APK
   cd android
   ./gradlew assembleRelease
   
   # APK will be at:
   # android/app/build/outputs/apk/release/app-release.apk
   ```

4. **Sign the APK (for production):**
   - The debug keystore is at: `android/app/debug.keystore`
   - For production, you'll need to create a release keystore

---

## Option 3: Using Expo Development Build (Quick Test)

```bash
# Build development client
npx expo run:android --variant release

# This creates an APK at:
# android/app/build/outputs/apk/release/app-release.apk
```

---

## Current Project Info:
- **Package Name:** com.riteshrai628.mobile
- **App Name:** Precast App
- **Version:** 1.0.0
- **EAS Project ID:** 888baaa5-6adb-447a-94ec-40fa9b1a7520

---

## Troubleshooting:

### EAS Permission Error:
If you get permission errors with EAS, try:
```bash
# Create a new EAS project
npx eas-cli init
# Follow prompts to create new project
```

### Android SDK Not Found:
1. Install Android Studio
2. Open Android Studio → SDK Manager
3. Install Android SDK Platform-Tools
4. Set ANDROID_HOME environment variable

### Build Fails:
- Check that all dependencies are installed: `npm install`
- Clear cache: `npx expo start --clear`
- Check Android SDK version compatibility


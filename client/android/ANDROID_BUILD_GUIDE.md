# Android APK Build & Release Guide for Walkie Talkie

This guide explains how to build the Debug APK and Signed Release APK from the Capacitor Android project located in `client/android`.

---

## 1. Setting Your Final Application Package ID

The current temporary package ID is `com.example.walkietalkie`.

Before signing and distributing your release APK, change it to your custom domain/organization ID (e.g., `com.yourcompany.walkietalkie`):

1. **`client/capacitor.config.ts`**:
   ```ts
   appId: 'com.yourcompany.walkietalkie',
   ```
2. **`client/android/app/build.gradle`**:
   ```groovy
   defaultConfig {
       applicationId "com.yourcompany.walkietalkie"
       ...
   }
   ```
3. Sync Capacitor:
   ```bash
   cd client && npm run cap:sync
   ```

---

## 2. Connecting to Your VPS from the Android App

When running as an installed Android app on a mobile device, API requests and WebSockets must connect to your public VPS domain over HTTPS/WSS rather than `localhost`:

In `client/src/services/api.ts`:
```ts
// Set to your Hostinger VPS domain:
const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('http://')
  ? 'https://talk.yourdomain.com/api'
  : '/api';
```

And in `client/src/services/realtime.ts`:
```ts
const host = window.location.host.includes('localhost') ? 'talk.yourdomain.com' : window.location.host;
```

Then rebuild and sync:
```bash
cd client
npm run build
npx cap sync android
```

---

## 3. Java & Android SDK Setup

Building the APK requires **Java 17 or 21** and the Android SDK.

### On macOS:
```bash
# Install OpenJDK 17 via Homebrew
brew install openjdk@17

# Link Java to system path
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
```

---

## 4. Building the Debug APK

Run the following command from the `client/android` directory:

```bash
cd client/android
./gradlew assembleDebug
```

### Exact Output APK Path:
```
client/android/app/build/outputs/apk/debug/app-debug.apk
```

### Installing the Debug APK on your Physical Phone via ADB:
Connect your Android phone via USB with **USB Debugging** enabled:

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## 5. Building the Signed Release APK

> [!CAUTION]
> Never commit your `.jks` keystore file, passwords, or aliases to Git.

### Step 1: Generate a Release Keystore (Once)

Run outside of the repository (e.g. in your home directory `~/.keystores`):

```bash
mkdir -p ~/.keystores
keytool -genkey -v -keystore ~/.keystores/walkietalkie-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias walkie-key
```

### Step 2: Configure Gradle Keystore Properties (Outside Git)

Edit your global Gradle properties in `~/.gradle/gradle.properties`:

```properties
WALKIE_RELEASE_STORE_FILE=/Users/your_user/.keystores/walkietalkie-release.jks
WALKIE_RELEASE_STORE_PASSWORD=your_keystore_password
WALKIE_RELEASE_KEY_ALIAS=walkie-key
WALKIE_RELEASE_KEY_PASSWORD=your_key_password
```

### Step 3: Link Signing Config in `client/android/app/build.gradle`

In `client/android/app/build.gradle`:

```groovy
android {
    signingConfigs {
        release {
            if (project.hasProperty('WALKIE_RELEASE_STORE_FILE')) {
                storeFile file(WALKIE_RELEASE_STORE_FILE)
                storePassword WALKIE_RELEASE_STORE_PASSWORD
                keyAlias WALKIE_RELEASE_KEY_ALIAS
                keyPassword WALKIE_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Step 4: Build the Release APK

```bash
cd client/android
./gradlew assembleRelease
```

### Exact Release APK Path:
```
client/android/app/build/outputs/apk/release/app-release.apk
```

---

## 6. Microphone Permissions & Physical Device Testing

The Android project is pre-configured with:
1. `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` in `AndroidManifest.xml`.
2. Custom `MainActivity.java` with `WebChromeClient.onPermissionRequest` handler granting `RESOURCE_AUDIO_CAPTURE` directly to the WebRTC audio context.

When you launch the app on your physical Android phone:
1. Android displays the system prompt: *"Allow Walkie Talkie to record audio?"*.
2. Tap **"While using the app"**.
3. Press and hold the "HOLD TO TALK" button to transmit live voice!

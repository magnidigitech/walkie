# Walkie Talkie

Production-grade Push-to-Talk (PTT) walkie-talkie application featuring a Progressive Web App (PWA), real-time WebSocket channel arbiter, self-hosted LiveKit WebRTC media transport, and a Capacitor-powered Android APK.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │              Clients                   │
                      │  - Mobile / Desktop Browser (PWA)     │
                      │  - Android App (Capacitor Native APK) │
                      └─────────────────┬──────────────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │ HTTPS / WSS Reverse Proxy (Caddy / Let's Encrypt)   │
             │ talk.example.com               rtc.example.com      │
             └──────────┬───────────────────────────────┬──────────┘
                        │                               │
       ┌────────────────┴───────────────┐               │
       │                                │               │
┌──────▼──────────────┐       ┌─────────▼──────┐        │
│ PWA Web App (Nginx) │       │ Node.js & TS   │        │
│ - React 18, Vite    │       │ Express & WSS  │        │
│ - Service Worker    │       │ - Auth & PTT   │        │
│ - Offline Shell     │       │   Arbiter      │        │
└─────────────────────┘       └────────┬───────┘        │
                                       │                │
            ┌──────────────────────────┼────────────────┤
            │                          │                │
     ┌──────▼───────┐           ┌──────▼──────┐   ┌─────▼──────────┐
     │ PostgreSQL 16│           │ LiveKit Room│   │ LiveKit Server │
     │ (Private)    │           │ Management  │──>│ WebRTC Audio   │
     │ - Accounts   │           └─────────────┘   │ Transport      │
     │ - Channels   │                             │ - UDP 7882     │
     │ - Invites    │                             │ - UDP 50k-60k  │
     └──────────────┘                             │ - TURN 3478    │
                                                  └────────────────┘
```

---

## Key Features

1. **Push-To-Talk Engine**:
   - Single speaker rule strictly arbitrated at the server; simultaneous button presses are atomically resolved.
   - Live state indicators: *Channel Clear* -> *Connecting…* -> *Talking* / *[Speaker] is talking*.
   - Instant cut-off on release, touch cancellation, window blur, or app minimization.
   - Server-side watchdog timeout (3.5s heartbeat, 30s max turn duration) preventing stalled clients from blocking channels.
   - Microphone permission denied handling and browser audio autoplay unlock banner (*Enable Audio*).
   - Spacebar shortcut for desktop users.

2. **Self-Hosted WebRTC Voice Transport**:
   - LiveKit WebRTC server with credentials securely stored on the backend.
   - Channel listeners receive tokens with `canPublish: false` (strictly listen-only).
   - Only the speaker with an active turn granted by the arbiter is authorized to publish audio.
   - Media permissions revoked immediately upon turn release.
   - No voice recordings or audio streams are ever stored on disk.

3. **Installable PWA**:
   - Offline-capable app shell caching via `sw.js`.
   - Web App Manifest with adaptive icons (`client/public/icons/icon.svg`, PNGs).
   - Install prompt banner with iOS Safari installation instructions.

4. **Private Channels & Revocable Invites**:
   - Channels are strictly private to invited members.
   - Generate revocable invite codes with expiration dates.
   - Owners can revoke active links at any time.

5. **Android APK Ready**:
   - Bundled using Capacitor 7.
   - Preconfigured `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` permissions.
   - Custom `WebChromeClient` implementation in `MainActivity.java` for seamless WebRTC microphone permissions.

---

## Local Development Quickstart

### 1. Install Dependencies
```bash
npm --prefix server install
npm --prefix client install
```

### 2. Run Test Suite
```bash
npm --prefix server test
```

### 3. Start Development Servers
In terminal 1 (Backend API on port 3001):
```bash
cd server
npm run dev
```

In terminal 2 (Frontend Client on port 5173):
```bash
cd client
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Production Deployment on Hostinger VPS

Complete documentation with exact DNS, UFW firewall, Docker Compose, automated backups, and troubleshooting is provided in:
- **[HOSTINGER_DEPLOYMENT.md](file:///Users/venkatavivek/WALKIE%20TALKIE/deploy/HOSTINGER_DEPLOYMENT.md)**

Quick deployment summary:
```bash
# 1. On your Hostinger VPS
git clone <your-repo> /opt/walkie-talkie
cd /opt/walkie-talkie/deploy

# 2. Configure environment
cp .env.example .env
nano .env # Set your domains and secrets

# 3. Launch Docker Compose stack
docker compose up -d --build
```

---

## Building the Android APK

Complete instructions for building Debug and Signed Release APKs with Gradle are provided in:
- **[ANDROID_BUILD_GUIDE.md](file:///Users/venkatavivek/WALKIE%20TALKIE/client/android/ANDROID_BUILD_GUIDE.md)**

To build the debug APK:
```bash
cd client/android
./gradlew assembleDebug
```
Output:
`client/android/app/build/outputs/apk/debug/app-debug.apk`

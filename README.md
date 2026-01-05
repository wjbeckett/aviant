# Aviant

A cross-platform mobile app for Frigate NVR built with React Native and Expo.

**Aviant** is your vigilant eye on Frigate - a third-party mobile client for viewing and managing your Frigate NVR system.

## Features

- **Dual URL Support**: Configure both local (HTTP) and remote (HTTPS) URLs
- **Auto-Switching**: Automatically uses local URL when on home network, switches to remote when away
- **JWT Authentication**: Secure authentication with Frigate's /api/login endpoint
- **Live Camera Streams**: WebRTC, MSE, and MJPEG stream support
- **Event Management**: View and manage motion detection events
- **Cross-Platform**: Works on iOS, Android, and Web

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI
- EAS CLI (for building APK/IPA)

### Installation

```bash
cd react_native_space
npm install
```

### Configuration

1. Copy `.env.example` to `.env`
2. Add your Sentry DSN (optional):
   ```
   SENTRY_DSN=your_sentry_dsn_here
   ```

### Development

```bash
# Start development server
npx expo start

# Run on Android
npx expo start --android

# Run on iOS  
npx expo start --ios

# Run on Web
npx expo start --web
```

### Building

#### Build APK (Android)

```bash
eas build --platform android --profile preview
```

#### Build IPA (iOS)

```bash
eas build --platform ios --profile preview
```

## Network Configuration

The app supports automatic network detection:

- **Local URL**: Used when on home network (e.g., `http://192.168.101.4:5000`)
- **Remote URL**: Used when away from home (e.g., `https://cctv.beckettnet.org`)

The app tests the local URL first (faster), then falls back to remote if local is unreachable.

### Port Configuration

Frigate has two ports:
- **Port 5000**: Unauthenticated API (no /api/login)
- **Port 8971**: Authenticated API (has /api/login) ← **Required for this app**

Make sure your reverse proxy forwards to port 8971!

## Project Structure

```
aviant/
├── react_native_space/          # React Native app
│   ├── src/
│   │   ├── screens/            # UI screens
│   │   ├── services/           # Frigate API client
│   │   └── context/            # React Context providers
│   ├── assets/                 # Images, icons (Aviant branding)
│   ├── android/                # Android-specific config
│   ├── app.json               # Expo configuration
│   └── package.json
└── nodejs_space/               # Backend (if needed)
```

## Syncing with Git

### Initial Setup

```bash
# Clone this repository
git clone https://github.com/wjbeckett/aviant.git
cd aviant

# Install dependencies
cd react_native_space
npm install
```

### Pulling Updates

```bash
# Pull latest changes
git pull origin main

# Reinstall dependencies if package.json changed
npm install
```

### Pushing Your Changes

```bash
# Add your changes
git add .
git commit -m "Your commit message"
git push origin main
```

## Debugging

See [DEBUGGING.md](react_native_space/DEBUGGING.md) for detailed debugging instructions.

### View Logs

```bash
# Android logs
adb logcat | grep -E "FrigateAPI|AuthScreen|ReactNativeJS"

# iOS logs
npx react-native log-ios
```

### Sentry Error Tracking

All errors are automatically sent to Sentry (if configured). View them at:
https://sentry.io/issues/

## About Aviant

**Aviant** is a third-party mobile client for Frigate NVR. It is not officially associated with the Frigate project.

The name "Aviant" comes from combining "avi" (bird) and "vigilant" (watchful), following Frigate's bird-themed naming convention while establishing its own identity as an independent viewer application.

## API Authentication

The app uses Frigate's JWT authentication:

1. POST to `/api/login` with `{user, password}`
2. Receives JWT token in response
3. Sends token as `Authorization: Bearer <token>` header
4. Token stored securely in expo-secure-store

## Troubleshooting

### Build Errors

```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install

# Verify dependencies
npx expo doctor
```

### Network Errors

- Ensure Frigate is running and accessible
- Check firewall rules
- Verify reverse proxy configuration
- Test URLs in browser first

### Authentication Errors

- Verify username/password are correct
- Check Frigate user accounts in Settings > Users
- Ensure reverse proxy forwards to port 8971 (authenticated API)
- Check console logs with `adb logcat`

## License

MIT

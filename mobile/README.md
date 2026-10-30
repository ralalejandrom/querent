# Lyncei for iOS

The iOS app is a native shell (Capacitor 7) around https://lyncei.com. Every website deploy updates the
app too; a new App Store release is only needed when this folder changes.

Native parts: push notifications, the iOS share sheet, lyncei.com links that open in the app (sign-in,
password reset, notifications), splash screen, offline screen, camera and photo access for video posts.

## Build on a Mac

Needs a Mac with Xcode 16 or newer and Node.js 20+.

```sh
cd mobile
npm install
npx cap sync ios
npx cap open ios        # opens ios/App/App.xcodeproj in Xcode
```

In Xcode: select the **App** target → **Signing & Capabilities** → choose your Team. Bundle ID is
`com.lyncei.app`. Push Notifications and Associated Domains are already in `App/App.entitlements`.

## Server settings (Vercel → querent → Settings → Environment Variables)

| Variable | Value |
|---|---|
| `APPLE_TEAM_ID` | Your 10-character Team ID (developer.apple.com → Membership). Turns on lyncei.com links opening in the app. |
| `APNS_KEY_ID` | Key ID of an APNs key (developer.apple.com → Keys → +, enable Apple Push Notifications service). |
| `APNS_TEAM_ID` | Same as `APPLE_TEAM_ID`. |
| `APNS_KEY` | The full contents of the downloaded `.p8` key file. |
| `APNS_ENV` | Leave empty for TestFlight and the App Store. Set to `development` only while testing from Xcode. |

## Files

- `capacitor.config.ts`: app ID, start URL, user agent (`LynceiApp`), splash and push options.
- `www/offline.html`: shown when there's no connection.
- `resources/`: source images for the app icon (1024×1024) and splash screen.
- `ios/App/App/Info.plist`: permissions text, iPhone-only, portrait.
- `ios/App/App/AppDelegate.swift`: forwards push tokens to Capacitor.

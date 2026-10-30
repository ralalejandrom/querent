# Lyncei for iOS and Android

Both apps are native shells (Capacitor 7) around https://lyncei.com. Every website deploy updates the
apps too; a new store release is only needed when this folder changes.

Native parts: the share sheet, lyncei.com links that open in the app, splash screen, offline screen,
camera and photo access for video posts, and push notifications on iOS (Android push needs Firebase,
not set up yet).

## Built in the cloud (no Mac needed)

`.github/workflows/mobile.yml` runs on GitHub Actions whenever this folder changes, or by hand from
GitHub → Actions → **Mobile apps** → **Run workflow**.

- **Android:** builds a test APK every run and publishes it under GitHub → **Releases**
  (`Lyncei for Android (test build N)`). On an Android phone, download the APK and open it.
- **iOS:** compiles the app every run. When the App Store Connect secrets below exist, it also signs
  the app and uploads a build to **TestFlight**.

### Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Where it comes from |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Membership → Team ID |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with the **Admin** role (Xcode needs Admin to create the distribution certificate in the cloud) |
| `APP_STORE_CONNECT_ISSUER_ID` | Same page, "Issuer ID" above the keys |
| `APP_STORE_CONNECT_KEY` | Full text of the downloaded `AuthKey_XXXX.p8` file |
| `ANDROID_KEYSTORE_BASE64` | Optional, for Google Play: `base64 -w0 lyncei.keystore` of an upload keystore |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | The keystore's passwords and key alias |

Before the first TestFlight upload, create the app once in App Store Connect (My Apps → + → New App,
bundle ID `com.lyncei.app`). Keep the keystore safe: Google Play needs the same one for every update.

## Build on a Mac (optional)

```sh
cd mobile
npm install
npx cap sync
npx cap open ios        # Xcode
npx cap open android    # Android Studio
```

## Server settings (Vercel → querent → Settings → Environment Variables)

| Variable | Value |
|---|---|
| `APPLE_TEAM_ID` | Your 10-character Team ID. Turns on lyncei.com links opening in the iOS app. |
| `APNS_KEY_ID` | Key ID of an APNs key (developer.apple.com → Keys → +, enable Apple Push Notifications service). |
| `APNS_TEAM_ID` | Same as `APPLE_TEAM_ID`. |
| `APNS_KEY` | The full contents of the downloaded `.p8` key file. |
| `APNS_ENV` | Leave empty for TestFlight and the App Store. Set to `development` only while testing from Xcode. |

## Files

- `capacitor.config.ts`: app ID (`com.lyncei.app`), start URL, user agent (`LynceiApp`), splash and push options.
- `www/offline.html`: shown when there's no connection.
- `resources/`: source images for the app icon (1024×1024) and splash screen.
- `ios/App/App/Info.plist`: permissions text, iPhone-only, portrait.
- `ios/App/App/AppDelegate.swift`: forwards push tokens to Capacitor.
- `android/app/build.gradle`: version code from CI, release signing from the environment.

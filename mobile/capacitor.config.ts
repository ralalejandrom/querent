import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Lyncei iOS app loads lyncei.com inside a native shell, so the app and the website are always
 * the same version: every deploy of the website updates the app without a new App Store release.
 * Native parts: push notifications, the share sheet, links that open in the app, splash screen,
 * and an offline screen. Links to other sites (DOIs, journals) open in Safari.
 */
const config: CapacitorConfig = {
  appId: "com.lyncei.app",
  appName: "Lyncei",
  webDir: "www",
  server: {
    url: "https://lyncei.com",
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
    appendUserAgent: "LynceiApp/1.0",
    backgroundColor: "#ffffff",
    allowsLinkPreview: false,
    scheme: "Lyncei",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

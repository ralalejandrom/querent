import "server-only";
import { connect, constants } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Apple Push Notification service (APNs) sender for the Lyncei iOS app, using token-based auth.
 * Needs APNS_KEY (the .p8 key's contents), APNS_KEY_ID, APNS_TEAM_ID and APNS_BUNDLE_ID (default
 * com.lyncei.app). APNS_ENV=development sends to the sandbox (apps run from Xcode); production otherwise.
 * Without the key it does nothing, so the web app works the same with or without the iOS app.
 */
const BUNDLE = () => process.env.APNS_BUNDLE_ID || "com.lyncei.app";
export const pushConfigured = () => !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);

let cached: { jwt: string; at: number } | null = null;
/** Provider token: an ES256 JWT, reused for up to 50 minutes (Apple accepts 20–60). */
function providerToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.at < 50 * 60) return cached.jwt;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "ES256", kid: process.env.APNS_KEY_ID })}.${b64({ iss: process.env.APNS_TEAM_ID, iat: now })}`;
  const key = createPrivateKey((process.env.APNS_KEY ?? "").replace(/\\n/g, "\n"));
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  cached = { jwt: `${unsigned}.${signature}`, at: now };
  return cached.jwt;
}

/** Sends one alert to every iOS device the person signed in on. Drops tokens Apple says are no longer valid. */
export async function sendPush(userId: string, alert: { body: string; url?: string | null }): Promise<void> {
  if (!pushConfigured()) return;
  const tokens = await db.select({ token: schema.deviceTokens.token }).from(schema.deviceTokens).where(eq(schema.deviceTokens.userId, userId));
  if (!tokens.length) return;
  const host = process.env.APNS_ENV === "development" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const payload = JSON.stringify({ aps: { alert: { title: "Lyncei", body: alert.body.slice(0, 220) }, sound: "default" }, url: alert.url ?? "/notifications" });
  const dead: string[] = [];
  const client = connect(host);
  client.on("error", () => {});
  try {
    await Promise.all(tokens.map(({ token }) => new Promise<void>((resolve) => {
      const req = client.request({
        [constants.HTTP2_HEADER_METHOD]: "POST", [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
        authorization: `bearer ${providerToken()}`, "apns-topic": BUNDLE(), "apns-push-type": "alert", "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0, body = "";
      req.on("response", (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS]); });
      req.on("data", (d) => { body += d; });
      req.on("end", () => {
        if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body)) dead.push(token);
        else if (status >= 400) console.error("APNs push failed", status, body);
        resolve();
      });
      req.on("error", () => resolve());
      req.setTimeout(10_000, () => { req.close(); resolve(); });
      req.end(payload);
    })));
  } finally {
    client.close();
  }
  if (dead.length) await db.delete(schema.deviceTokens).where(inArray(schema.deviceTokens.token, dead));
}

export function getPublicAppUrl(): string {
  return process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:8088";
}

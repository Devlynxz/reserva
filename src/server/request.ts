import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

/**
 * The client's IP, from the one header our edge sets (CLIENT_IP_HEADER, `x-real-ip` on
 * Vercel). Never trusts arbitrary X-Forwarded-For entries a client could forge; for XFF
 * it takes the first hop only when explicitly configured.
 */
export function clientIpFrom(requestHeaders: Headers, headerName = env().CLIENT_IP_HEADER): string {
  const raw = requestHeaders.get(headerName)?.split(",")[0]?.trim();
  return raw && /^[0-9a-f.:]{2,45}$/i.test(raw) ? raw : "unknown";
}

export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

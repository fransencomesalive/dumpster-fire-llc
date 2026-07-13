import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ResolvedAddress = { address: string; family: number };
export type HostnameResolver = (hostname: string) => Promise<ResolvedAddress[]>;

function publicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function publicIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  const mappedIpv4 = normalized.match(/^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return publicIpv4(mappedIpv4);
  if (normalized === "::" || normalized === "::1") return false;
  if (/^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized) || /^ff/.test(normalized)) return false;
  if (/^2001:db8(?::|$)/.test(normalized)) return false;
  return true;
}

export function isPublicIpAddress(address: string) {
  const family = isIP(address.split("%")[0]);
  if (family === 4) return publicIpv4(address);
  if (family === 6) return publicIpv6(address);
  return false;
}

const defaultResolver: HostnameResolver = async (hostname) => {
  return lookup(hostname, { all: true, verbatim: true });
};

export async function assertSafePublicUrl(rawUrl: string, resolveHostname: HostnameResolver = defaultResolver) {
  const url = new URL(rawUrl);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Source URL is not a safe public HTTP URL.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await resolveHostname(hostname);

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Source URL resolved to a non-public network address.");
  }
}

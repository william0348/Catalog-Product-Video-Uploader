const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fd/,
];

const ALLOWED_PROTOCOLS = ["https:"];

const ALLOWED_HOSTNAMES = [
  /\.fbcdn\.net$/,
  /\.facebook\.com$/,
  /\.cdninstagram\.com$/,
  /\.googleusercontent\.com$/,
  /\.googleapis\.com$/,
  /\.ggpht\.com$/,
  /\.google\.com$/,
];

function isPrivateIp(hostname: string): boolean {
  return BLOCKED_IP_RANGES.some(re => re.test(hostname));
}

export function validateProxyUrl(rawUrl: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, error: `Protocol ${parsed.protocol} is not allowed. Only HTTPS is permitted.` };
  }

  if (isPrivateIp(parsed.hostname)) {
    return { valid: false, error: "URLs pointing to private/internal IP addresses are not allowed." };
  }

  if (parsed.hostname === "localhost" || parsed.hostname === "metadata.google.internal") {
    return { valid: false, error: "URLs pointing to localhost or metadata endpoints are not allowed." };
  }

  return { valid: true };
}

export function validateProxyUrlStrict(rawUrl: string): { valid: boolean; error?: string } {
  const base = validateProxyUrl(rawUrl);
  if (!base.valid) return base;

  const parsed = new URL(rawUrl);
  const isAllowed = ALLOWED_HOSTNAMES.some(re => re.test(parsed.hostname));
  if (!isAllowed) {
    return { valid: false, error: `Hostname ${parsed.hostname} is not in the allowed list.` };
  }

  return { valid: true };
}

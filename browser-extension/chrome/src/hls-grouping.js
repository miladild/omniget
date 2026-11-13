const MASTER_NAMES = new Set([
  "master",
  "playlist",
  "index",
  "main",
  "manifest",
  "stream",
]);

const QUALITY_LABELS = new Set([
  "high",
  "medium",
  "low",
  "sd",
  "hd",
  "fhd",
  "uhd",
  "best",
  "auto",
]);

export function getHlsVariantToken(filename) {
  if (!filename) return "";
  const lower = String(filename).toLowerCase();
  const extStripped = lower.replace(/\.(m3u8|mp4|webm|m4v)(\?.*)?$/, "");
  const base = extStripped.split("?")[0];
  if (!base) return "";
  if (MASTER_NAMES.has(base)) return "master";
  if (/^\d{3,4}p?$/.test(base)) return "master";
  if (/^\d{3,4}x\d{3,4}$/.test(base)) return "master";
  if (QUALITY_LABELS.has(base)) return "master";
  return base;
}

function isQualityPathSegment(part) {
  const lower = String(part || "").toLowerCase();
  if (/^\d{3,4}x\d{3,4}$/.test(lower)) return true;
  if (/^\d{3,4}p$/.test(lower)) return true;
  if (QUALITY_LABELS.has(lower)) return true;
  return lower === "audio";
}

function kalturaEntryId(url) {
  try {
    const match = new URL(url).pathname.match(/\/entryId\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

const QUALITY_RANK = {
  low: 360,
  sd: 480,
  medium: 720,
  hd: 720,
  high: 1080,
  fhd: 1080,
  uhd: 2160,
  best: 2160,
};

function qualityScore(token, allowBareHeight) {
  const lower = String(token || "")
    .toLowerCase()
    .replace(/\.(m3u8|mp4|webm|m4v|ts)(\?.*)?$/, "")
    .split("?")[0];
  const size = lower.match(/(\d{3,4})x(\d{3,4})/);
  if (size) return Number(size[2]);
  const height = lower.match(/(?:^|_)(\d{3,4})p$/);
  if (height) return Number(height[1]);
  if (allowBareHeight && /^\d{3,4}$/.test(lower)) {
    const n = Number(lower);
    if (n >= 144 && n <= 4320) return n;
  }
  return QUALITY_RANK[lower] || 0;
}

function decodeJwtPayload(token) {
  const body = String(token || "").split(".")[1];
  if (!body || body.length < 8) return null;
  try {
    const padded = body.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (body.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function describedMediaPath(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const payload = decodeJwtPayload(parts[index]);
      const path = payload && typeof payload.path === "string" ? payload.path.split("?")[0] : "";
      if (path.includes("/")) return path;
    }
  } catch {
    /* the value is not a URL */
  }
  return "";
}

export function describedFileName(url) {
  const described = describedMediaPath(url);
  const path = described || (() => {
    try { return new URL(url).pathname; } catch { return String(url || ""); }
  })();
  return (path.split("/").pop() || "").split("?")[0].toLowerCase();
}

function pluralsightClipKey(path) {
  const match = String(path || "").match(/clips2\/([^/]+)\/versions\/([^/]+)/i);
  return match ? `pluralsight:${match[1]}/${match[2]}` : "";
}

export function isCaptionMedia(url) {
  return /caption|subtitle/.test(describedFileName(url));
}

export function isStreamingFragment(url) {
  try {
    const filename = new URL(url).pathname.split("/").pop()?.toLowerCase() || "";
    if (!filename.endsWith(".ts")) return false;
    return filename.startsWith("hls_") || /\d{3,4}x\d{3,4}/.test(filename);
  } catch {
    return false;
  }
}

export function getStatedQuality(url) {
  const described = describedMediaPath(url);
  let pathname = described || String(url || "");
  let filename = "";
  if (!described) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/");
      filename = parts.pop() || "";
      pathname = parts.join("/");
    } catch {
      /* keep the raw string */
    }
  } else {
    const parts = described.split("/");
    filename = parts.pop() || "";
    pathname = parts.join("/");
  }
  let best = qualityScore(filename, true);
  for (const part of pathname.split("/")) best = Math.max(best, qualityScore(part, false));
  return best;
}

export function getHlsGroupKey(url) {
  const clipKey = pluralsightClipKey(describedMediaPath(url));
  if (clipKey) return clipKey;
  const entryId = kalturaEntryId(url);
  if (entryId) return `kaltura:${entryId}`;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const filename = parts.pop() || "";
    const dir = parts.filter((part) => !isQualityPathSegment(part)).join("/");
    const variant = getHlsVariantToken(filename);
    return `${u.origin}${dir}|${variant}`;
  } catch {
    return url;
  }
}

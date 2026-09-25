import { getDomain } from "tldts";

export type LinkAnalysis =
  | { ok: true; matchedDomain: string }
  | { ok: false; status: "invalid_input" | "unsupported_input"; detail: string };

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const CREDENTIALS_RE = /:\/\/[^/?#]*@/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// Matches the domain (not the page) of a link, per the registered-domain
// boundary rules (e.g. co.uk). Does not follow redirects.
export function analyzeLink(raw: string): LinkAnalysis {
  const value = raw.trim();
  if (!value) {
    return { ok: false, status: "invalid_input", detail: "Missing link value" };
  }
  if (CREDENTIALS_RE.test(value)) {
    return {
      ok: false,
      status: "unsupported_input",
      detail: "URLs with embedded sign-in details are not supported",
    };
  }

  const hasScheme = SCHEME_RE.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `http://${value}`);
  } catch {
    return { ok: false, status: "invalid_input", detail: "Could not parse as a URL or domain" };
  }

  if (hasScheme && url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      status: "unsupported_input",
      detail: `Unsupported scheme: ${url.protocol.replace(":", "")}`,
    };
  }

  const hostname = url.hostname.toLowerCase();
  if (IPV4_RE.test(hostname) || hostname.includes(":")) {
    return { ok: false, status: "unsupported_input", detail: "IP address literals are not supported" };
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { ok: false, status: "unsupported_input", detail: "Local-only addresses are not supported" };
  }

  const domain = getDomain(hostname);
  if (!domain) {
    return { ok: false, status: "invalid_input", detail: "Could not determine a registered domain" };
  }

  return { ok: true, matchedDomain: domain };
}

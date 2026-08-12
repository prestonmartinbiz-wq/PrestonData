/**
 * Minimal, dependency-free RFC 822 / MIME (.eml) parser.
 *
 * It extracts the useful headers (subject/date/from) and a best-effort plain-text
 * body. It understands multipart messages, base64 / quoted-printable transfer
 * encodings, and will strip HTML when only an HTML part is available.
 *
 * This is intentionally pragmatic (not a full MIME implementation): the goal is to
 * turn a coordinator's email into readable text we can scrape for power data.
 */

export type ParsedEmail = {
  headers: Record<string, string>;
  subject: string;
  date: string;
  from: string;
  text: string;
};

function unfoldHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  // Join folded header lines (continuation lines start with whitespace).
  const lines = rawHeaders.replace(/\r\n/g, "\n").split("\n");
  let current = "";
  const flush = () => {
    const idx = current.indexOf(":");
    if (idx > 0) {
      const key = current.slice(0, idx).trim().toLowerCase();
      const value = current.slice(idx + 1).trim();
      if (key) headers[key] = value;
    }
    current = "";
  };
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current += " " + line.trim();
    } else {
      if (current) flush();
      current = line;
    }
  }
  if (current) flush();
  return headers;
}

function splitHeadersAndBody(raw: string): { headers: string; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const idx = normalized.indexOf("\n\n");
  if (idx === -1) return { headers: normalized, body: "" };
  return {
    headers: normalized.slice(0, idx),
    body: normalized.slice(idx + 2),
  };
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function decodeBase64(input: string): string {
  try {
    const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, "");
    return Buffer.from(cleaned, "base64").toString("utf-8");
  } catch {
    return input;
  }
}

function decodeBody(body: string, transferEncoding: string): string {
  const enc = (transferEncoding || "").toLowerCase();
  if (enc.includes("base64")) return decodeBase64(body);
  if (enc.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getBoundary(contentType: string): string {
  const m = /boundary="?([^";]+)"?/i.exec(contentType || "");
  return m ? m[1] : "";
}

type Part = { text: string; isHtml: boolean };

function extractParts(body: string, contentType: string): Part[] {
  const boundary = getBoundary(contentType);
  if (!boundary) return [];

  const marker = "--" + boundary;
  const segments = body
    .split(marker)
    .map((s) => s.replace(/^\r?\n/, ""))
    .filter((s) => s.trim() && !/^--\s*$/.test(s.trim()));

  const parts: Part[] = [];
  for (const segment of segments) {
    const { headers: rawHeaders, body: partBody } = splitHeadersAndBody(segment);
    const headers = unfoldHeaders(rawHeaders);
    const partType = headers["content-type"] || "text/plain";
    const cte = headers["content-transfer-encoding"] || "";

    if (/multipart\//i.test(partType)) {
      parts.push(...extractParts(partBody, partType));
      continue;
    }

    const decoded = decodeBody(partBody, cte);
    if (/text\/plain/i.test(partType)) {
      parts.push({ text: decoded, isHtml: false });
    } else if (/text\/html/i.test(partType)) {
      parts.push({ text: decoded, isHtml: true });
    }
  }
  return parts;
}

/** Decode RFC 2047 encoded-word header values (e.g. subjects). Best effort. */
function decodeHeaderValue(value: string): string {
  return value.replace(
    /=\?[^?]+\?([BbQq])\?([^?]*)\?=/g,
    (_m, enc: string, data: string) => {
      if (enc.toLowerCase() === "b") return decodeBase64(data);
      return decodeQuotedPrintable(data.replace(/_/g, " "));
    }
  );
}

export function parseEml(raw: string): ParsedEmail {
  const { headers: rawHeaders, body } = splitHeadersAndBody(raw);
  const headers = unfoldHeaders(rawHeaders);
  const contentType = headers["content-type"] || "";
  const cte = headers["content-transfer-encoding"] || "";

  let text = "";
  if (/multipart\//i.test(contentType)) {
    const parts = extractParts(body, contentType);
    const plain = parts.filter((p) => !p.isHtml).map((p) => p.text);
    if (plain.join("").trim()) {
      text = plain.join("\n\n");
    } else {
      text = parts
        .filter((p) => p.isHtml)
        .map((p) => stripHtml(p.text))
        .join("\n\n");
    }
  } else {
    const decoded = decodeBody(body, cte);
    text = /text\/html/i.test(contentType) ? stripHtml(decoded) : decoded;
  }

  // Fallback: if we somehow got nothing usable, treat the whole raw input as text
  // (covers the case where a user saved just the email body as .eml/.txt).
  if (!text.trim()) {
    text = /<[a-z][\s\S]*>/i.test(raw) ? stripHtml(raw) : raw;
  }

  return {
    headers,
    subject: decodeHeaderValue(headers["subject"] || ""),
    date: headers["date"] || "",
    from: decodeHeaderValue(headers["from"] || ""),
    text: text.replace(/\r\n/g, "\n").trim(),
  };
}

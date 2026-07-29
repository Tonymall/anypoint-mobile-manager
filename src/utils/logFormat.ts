// ═══════════════════════════════════════════════════════════════════
// Log payload formatting
// ═══════════════════════════════════════════════════════════════════
// Mule application logs habitually cram a whole JSON or XML payload
// onto the end of a single log line:
//
//   2026-07-29 11:02:14 INFO  [http.worker.01] o.m.OrderFlow: Received
//   order {"orderId":"A-1001","lines":[{"sku":"X","qty":2}]}
//
// Rendered as plain text that is an unreadable wall. This module finds
// the payload *inside* the line, keeps the human-readable prose
// separate, and can pretty-print / tokenise the payload for display.
//
// Everything here is pure, dependency-free and total: nothing throws on
// malformed input, and every entry point is bounded so one pathological
// payload cannot lock up the UI thread.
// ═══════════════════════════════════════════════════════════════════

// ── Guards ──────────────────────────────────────────────────────────
// Log lists render hundreds of rows, so all of this has to stay cheap.

/** Beyond this we refuse to pretty-print and say so instead. */
export const MAX_FORMAT_CHARS = 200 * 1024;

/** Nesting deeper than this is a red flag (and blows up indentation). */
export const MAX_DEPTH = 64;

/** Upper bound on tokeniser output; the tail is returned as one span. */
export const MAX_SPANS = 4000;

/** Default line budget for `clampLines`. */
export const MAX_RENDER_LINES = 400;

/**
 * Only the head of a message is searched for a payload start. The prose
 * prefix of a log line is short by nature, so this keeps detection O(1)
 * in the size of a huge payload.
 */
const MAX_PREFIX_SCAN = 16 * 1024;

/** How many plausible payload starts we are willing to try per message. */
const MAX_CANDIDATES = 8;

/**
 * Shorter than this is prose, not a payload — `[1, 2]` in a sentence
 * should not sprout a collapsible "JSON" block.
 */
const MIN_PAYLOAD_CHARS = 16;

// ── Types ───────────────────────────────────────────────────────────

export type PayloadKind = 'json' | 'xml' | 'none';

export interface DetectedPayload {
  kind: PayloadKind;
  /** Index of the first payload character, or -1 when `kind` is 'none'. */
  start: number;
  /** Index one past the last payload character, or -1. */
  end: number;
  /** The payload substring, verbatim. Empty when `kind` is 'none'. */
  raw: string;
  /** Everything before the payload — the readable part of the line. */
  prose: string;
  /** Anything after the payload. */
  trailing: string;
}

export type FormatSkipReason = 'too-large' | 'too-deep';

export interface FormatResult {
  /** Pretty-printed text, or the raw payload when a guard tripped. */
  text: string;
  /** False when a guard stopped us from pretty-printing. */
  formatted: boolean;
  /** Why formatting was skipped. Only set when `formatted` is false. */
  reason?: FormatSkipReason;
}

export type SpanKind =
  // shared
  | 'plain'
  | 'punctuation'
  // json
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  // xml
  | 'tag'
  | 'attrName'
  | 'attrValue'
  | 'text'
  | 'comment'
  | 'cdata'
  | 'declaration';

/** A run of characters sharing one syntax role. */
export interface Span {
  text: string;
  kind: SpanKind;
}

// ── Character helpers ───────────────────────────────────────────────

function isNameStart(ch: string | undefined): boolean {
  if (!ch) return false;
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isNameChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return (
    isNameStart(ch) ||
    (ch >= '0' && ch <= '9') ||
    ch === '-' ||
    ch === '.' ||
    ch === ':'
  );
}

function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

// ── JSON scanning ───────────────────────────────────────────────────

interface JsonExtent {
  /** Index one past the closing bracket. */
  end: number;
  /** Deepest bracket nesting seen. */
  depth: number;
}

/**
 * Walk from an opening bracket to its match, string- and escape-aware.
 * Returns null when the region never closes or the brackets cross.
 *
 * This is the cheap half of detection: one linear pass, no allocation,
 * no `JSON.parse` on text that cannot possibly be a payload.
 */
function scanJsonExtent(src: string, start: number): JsonExtent | null {
  const first = src[start];
  if (first !== '{' && first !== '[') return null;

  const stack: string[] = [];
  let maxDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < src.length; i++) {
    const ch = src[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch);
      if (stack.length > maxDepth) maxDepth = stack.length;
      continue;
    }
    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (open !== (ch === '}' ? '{' : '[')) return null;
      if (stack.length === 0) return { end: i + 1, depth: maxDepth };
    }
  }

  return null;
}

// ── XML scanning ────────────────────────────────────────────────────

type XmlTokenType =
  | 'decl'
  | 'comment'
  | 'cdata'
  | 'doctype'
  | 'open'
  | 'close'
  | 'selfclose'
  | 'text';

interface XmlToken {
  type: XmlTokenType;
  raw: string;
  name?: string;
}

interface XmlScan {
  tokens: XmlToken[];
  /** Index one past the end of the document. */
  end: number;
  /** Deepest element nesting seen. */
  maxDepth: number;
  /** Number of elements (open + self-closing). */
  elements: number;
}

interface TagRead {
  name: string;
  raw: string;
  end: number;
  selfClose: boolean;
}

/** Read `<name attr="v">` / `<name/>` starting at `<`. Quote-aware. */
function readTag(src: string, i: number): TagRead | null {
  const n = src.length;
  let j = i + 1;
  while (j < n && isNameChar(src[j])) j++;
  const name = src.slice(i + 1, j);
  if (!name) return null;

  let k = j;
  let quote = '';
  while (k < n) {
    const ch = src[k];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      break;
    } else if (ch === '<') {
      return null; // unterminated tag
    }
    k++;
  }
  if (k >= n) return null;

  return {
    name,
    raw: src.slice(i, k + 1),
    end: k + 1,
    selfClose: src[k - 1] === '/',
  };
}

/**
 * Tokenise a well-formed XML region starting at `start`, stopping the
 * moment the root element closes. Returns null the instant anything is
 * not well formed — mismatched tags, a stray `<`, an unterminated
 * comment — so a false positive costs one linear scan and no more.
 */
function scanXml(src: string, start: number): XmlScan | null {
  const n = src.length;
  const tokens: XmlToken[] = [];
  const stack: string[] = [];
  let i = start;
  let maxDepth = 0;
  let elements = 0;
  let rootClosed = false;

  while (i < n) {
    if (src[i] === '<') {
      if (src.startsWith('<!--', i)) {
        const e = src.indexOf('-->', i + 4);
        if (e < 0) return null;
        tokens.push({ type: 'comment', raw: src.slice(i, e + 3) });
        i = e + 3;
      } else if (src.startsWith('<![CDATA[', i)) {
        const e = src.indexOf(']]>', i + 9);
        if (e < 0) return null;
        tokens.push({ type: 'cdata', raw: src.slice(i, e + 3) });
        i = e + 3;
      } else if (src.startsWith('<?', i)) {
        const e = src.indexOf('?>', i + 2);
        if (e < 0) return null;
        tokens.push({ type: 'decl', raw: src.slice(i, e + 2) });
        i = e + 2;
      } else if (src.startsWith('<!', i)) {
        const e = src.indexOf('>', i + 2);
        if (e < 0) return null;
        tokens.push({ type: 'doctype', raw: src.slice(i, e + 1) });
        i = e + 1;
      } else if (src[i + 1] === '/') {
        const e = src.indexOf('>', i + 2);
        if (e < 0) return null;
        const name = src.slice(i + 2, e).trim();
        if (stack[stack.length - 1] !== name) return null;
        stack.pop();
        tokens.push({ type: 'close', raw: src.slice(i, e + 1), name });
        i = e + 1;
        if (stack.length === 0) {
          rootClosed = true;
          break;
        }
      } else if (isNameStart(src[i + 1])) {
        const tag = readTag(src, i);
        if (!tag) return null;
        elements++;
        i = tag.end;
        if (tag.selfClose) {
          tokens.push({ type: 'selfclose', raw: tag.raw, name: tag.name });
          if (stack.length === 0) {
            rootClosed = true;
            break;
          }
        } else {
          tokens.push({ type: 'open', raw: tag.raw, name: tag.name });
          stack.push(tag.name);
          if (stack.length > maxDepth) maxDepth = stack.length;
          // Runaway nesting: bail rather than build a giant stack.
          if (stack.length > MAX_DEPTH * 4) return null;
        }
      } else {
        return null; // a bare '<' — not markup
      }
      continue;
    }

    const next = src.indexOf('<', i);
    const stop = next < 0 ? n : next;
    const raw = src.slice(i, stop);

    if (stack.length === 0) {
      // Outside the root element only whitespace is legal. Anything
      // else means the document ended (or never started).
      if (raw.trim() !== '') return null;
      if (next < 0) return null;
      i = stop;
      continue;
    }

    tokens.push({ type: 'text', raw });
    if (next < 0) return null; // unterminated element
    i = stop;
  }

  if (!rootClosed || stack.length > 0) return null;
  return { tokens, end: i, maxDepth: Math.max(maxDepth, 1), elements };
}

// ── Detection ───────────────────────────────────────────────────────

function noPayload(message: string): DetectedPayload {
  return {
    kind: 'none',
    start: -1,
    end: -1,
    raw: '',
    prose: message,
    trailing: '',
  };
}

function payloadAt(
  kind: 'json' | 'xml',
  message: string,
  start: number,
  end: number,
): DetectedPayload {
  return {
    kind,
    start,
    end,
    raw: message.slice(start, end),
    prose: message.slice(0, start),
    trailing: message.slice(end),
  };
}

function tryJson(message: string, start: number): DetectedPayload | null {
  const extent = scanJsonExtent(message, start);
  if (!extent) return null;
  if (extent.end - start < MIN_PAYLOAD_CHARS) return null;

  // Only validate by parsing when the candidate is small enough to be
  // worth it — beyond the format budget the balanced scan is all the
  // confidence we need, and the UI will refuse to pretty-print anyway.
  if (extent.end - start <= MAX_FORMAT_CHARS) {
    try {
      const value = JSON.parse(message.slice(start, extent.end));
      if (value === null || typeof value !== 'object') return null;
    } catch {
      return null;
    }
  }

  return payloadAt('json', message, start, extent.end);
}

function tryXml(message: string, start: number): DetectedPayload | null {
  const scan = scanXml(message, start);
  if (!scan) return null;
  if (scan.end - start < MIN_PAYLOAD_CHARS) return null;

  // A lone `<id>123</id>` inside a sentence is prose, not a payload.
  // Real payloads either nest or carry a declaration.
  const hasDecl = scan.tokens.some((tok) => tok.type === 'decl');
  if (scan.elements < 2 && !hasDecl) return null;

  return payloadAt('xml', message, start, scan.end);
}

/**
 * One-character shape test for a JSON opener, applied before any scan.
 *
 * This is what keeps the common `... INFO [http.worker.01] ...` prefix
 * from eating the candidate budget: only `"` or `}` may follow `{`, and
 * only a JSON value may follow `[`.
 */
function plausibleJsonStart(src: string, i: number): boolean {
  let j = i + 1;
  while (isSpace(src[j])) j++;
  const ch = src[j];
  if (ch === undefined) return false;
  if (src[i] === '{') return ch === '"' || ch === '}';
  return (
    ch === '"' ||
    ch === '{' ||
    ch === '[' ||
    ch === ']' ||
    ch === '-' ||
    (ch >= '0' && ch <= '9') ||
    ch === 't' ||
    ch === 'f' ||
    ch === 'n'
  );
}

/**
 * Find the first JSON or XML payload embedded in a log message.
 *
 * Strategy — cheap first, expensive last:
 *   1. Reject anything too short to hold a payload.
 *   2. One character pass over the head of the message looking for `{`,
 *      `[` or `<` — the only characters that can open a payload — each
 *      filtered by a one-character shape test on what follows it.
 *   3. For each surviving candidate (at most `MAX_CANDIDATES`) run a linear,
 *      string-aware balance scan to find where the region ends.
 *   4. Only then validate — `JSON.parse` for JSON, well-formedness for
 *      XML. A failed candidate falls through to the next one, so
 *      `... failed {not json} but {"real":"payload"}` still resolves.
 *
 * The prose before the payload is returned separately so the UI can
 * show a readable message plus a collapsible payload block.
 */
export function detectPayload(message: string): DetectedPayload {
  if (typeof message !== 'string' || message.length < MIN_PAYLOAD_CHARS) {
    return noPayload(typeof message === 'string' ? message : '');
  }

  const limit = Math.min(message.length, MAX_PREFIX_SCAN);
  let candidates = 0;

  for (let i = 0; i < limit; i++) {
    const ch = message[i];
    if (ch !== '{' && ch !== '[' && ch !== '<') continue;

    if (ch === '<') {
      const after = message[i + 1];
      if (!isNameStart(after) && after !== '?' && after !== '!') continue;
    } else if (!plausibleJsonStart(message, i)) {
      continue;
    }

    if (++candidates > MAX_CANDIDATES) break;

    const found =
      ch === '<' ? tryXml(message, i) : tryJson(message, i);
    if (found) return found;
  }

  return noPayload(message);
}

// ── Formatting ──────────────────────────────────────────────────────

/**
 * Pretty-print JSON with a 2-space indent.
 *
 * Returns null when `raw` is not a JSON object/array — the caller falls
 * back to rendering the raw text. Never throws.
 */
export function formatJson(raw: string): FormatResult | null {
  if (typeof raw !== 'string') return null;
  const src = raw.trim();
  if (src[0] !== '{' && src[0] !== '[') return null;

  if (src.length > MAX_FORMAT_CHARS) {
    return { text: src, formatted: false, reason: 'too-large' };
  }

  const extent = scanJsonExtent(src, 0);
  if (!extent || extent.end !== src.length) return null;
  if (extent.depth > MAX_DEPTH) {
    return { text: src, formatted: false, reason: 'too-deep' };
  }

  try {
    const value = JSON.parse(src);
    if (value === null || typeof value !== 'object') return null;
    return { text: JSON.stringify(value, null, 2), formatted: true };
  } catch {
    return null;
  }
}

/** Render scanned XML tokens as indented lines. */
function renderXml(tokens: XmlToken[]): string {
  const lines: string[] = [];
  let depth = 0;
  const pad = (d: number) => '  '.repeat(d);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === 'text') {
      const text = tok.raw.trim();
      if (text) lines.push(pad(depth) + text);
      continue;
    }

    if (tok.type === 'open') {
      const next = tokens[i + 1];
      const after = tokens[i + 2];
      // <a>text</a> and <a></a> stay on one line — a leaf per line is
      // what makes a payload skimmable.
      if (
        next?.type === 'text' &&
        after?.type === 'close' &&
        after.name === tok.name &&
        !next.raw.includes('\n')
      ) {
        lines.push(pad(depth) + tok.raw + next.raw.trim() + after.raw);
        i += 2;
        continue;
      }
      if (next?.type === 'close' && next.name === tok.name) {
        lines.push(pad(depth) + tok.raw + next.raw);
        i += 1;
        continue;
      }
      lines.push(pad(depth) + tok.raw);
      depth++;
      continue;
    }

    if (tok.type === 'close') {
      depth = Math.max(0, depth - 1);
      lines.push(pad(depth) + tok.raw);
      continue;
    }

    // decl / doctype / comment / cdata / selfclose
    lines.push(pad(depth) + tok.raw);
  }

  return lines.join('\n');
}

/**
 * Indent XML. Handles the XML declaration, doctype, comments, CDATA,
 * attributes, self-closing tags and text nodes.
 *
 * Returns null when `raw` is not a well-formed XML document — the
 * caller falls back to rendering the raw text. Never throws.
 */
export function formatXml(raw: string): FormatResult | null {
  if (typeof raw !== 'string') return null;
  const src = raw.trim();
  if (src[0] !== '<') return null;

  if (src.length > MAX_FORMAT_CHARS) {
    return { text: src, formatted: false, reason: 'too-large' };
  }

  const scan = scanXml(src, 0);
  if (!scan) return null;
  if (src.slice(scan.end).trim() !== '') return null;
  if (scan.maxDepth > MAX_DEPTH) {
    return { text: src, formatted: false, reason: 'too-deep' };
  }

  return { text: renderXml(scan.tokens), formatted: true };
}

/** Dispatch to the formatter for a detected payload kind. */
export function formatPayload(
  kind: PayloadKind,
  raw: string,
): FormatResult | null {
  if (kind === 'json') return formatJson(raw);
  if (kind === 'xml') return formatXml(raw);
  return null;
}

// ── Tokenising (syntax colouring) ───────────────────────────────────

function spanPusher(spans: Span[]) {
  return (text: string, kind: SpanKind) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    // Merge runs of structural filler so the UI renders fewer nodes.
    if (last && last.kind === kind && (kind === 'plain' || kind === 'punctuation')) {
      last.text += text;
      return;
    }
    spans.push({ text, kind });
  };
}

/** Tokenise (already pretty-printed) JSON into typed spans. */
export function tokenizeJson(text: string): Span[] {
  const spans: Span[] = [];
  const push = spanPusher(spans);
  const n = text.length;
  let i = 0;

  while (i < n) {
    if (spans.length >= MAX_SPANS) {
      spans.push({ text: text.slice(i), kind: 'plain' });
      break;
    }

    const ch = text[i];

    if (ch === '"') {
      let j = i + 1;
      let escaped = false;
      while (j < n) {
        const c = text[j];
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') break;
        j++;
      }
      const end = Math.min(j + 1, n);
      // A string immediately followed by ':' is an object key.
      let k = end;
      while (k < n && isSpace(text[k])) k++;
      push(text.slice(i, end), text[k] === ':' ? 'key' : 'string');
      i = end;
      continue;
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i + 1;
      while (j < n && /[0-9eE+.-]/.test(text[j])) j++;
      push(text.slice(i, j), 'number');
      i = j;
      continue;
    }

    if (text.startsWith('true', i)) {
      push('true', 'boolean');
      i += 4;
      continue;
    }
    if (text.startsWith('false', i)) {
      push('false', 'boolean');
      i += 5;
      continue;
    }
    if (text.startsWith('null', i)) {
      push('null', 'null');
      i += 4;
      continue;
    }

    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',' || ch === ':') {
      push(ch, 'punctuation');
      i++;
      continue;
    }

    push(ch, 'plain');
    i++;
  }

  return spans;
}

/** Find the `>` closing a tag, ignoring any inside attribute quotes. */
function findTagEnd(text: string, from: number): number {
  let quote = '';
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

const ATTR_RE = /([A-Za-z_][A-Za-z0-9_.:-]*)(\s*=\s*)("[^"]*"|'[^']*')/g;

function pushTagSpans(raw: string, push: (t: string, k: SpanKind) => void) {
  const nameMatch = raw.match(/^<\/?[A-Za-z_][A-Za-z0-9_.:-]*/);
  if (!nameMatch) {
    push(raw, 'tag');
    return;
  }
  push(nameMatch[0], 'tag');

  const rest = raw.slice(nameMatch[0].length);
  if (!rest.endsWith('>')) {
    push(rest, 'plain');
    return;
  }
  const tail = rest.endsWith('/>') ? '/>' : '>';
  const attrs = rest.slice(0, rest.length - tail.length);

  ATTR_RE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(attrs)) !== null) {
    if (match.index > last) push(attrs.slice(last, match.index), 'plain');
    push(match[1], 'attrName');
    push(match[2], 'punctuation');
    push(match[3], 'attrValue');
    last = match.index + match[0].length;
  }
  if (last < attrs.length) push(attrs.slice(last), 'plain');
  push(tail, 'tag');
}

/** Tokenise (already indented) XML into typed spans. */
export function tokenizeXml(text: string): Span[] {
  const spans: Span[] = [];
  const push = spanPusher(spans);
  const n = text.length;
  let i = 0;

  while (i < n) {
    if (spans.length >= MAX_SPANS) {
      spans.push({ text: text.slice(i), kind: 'plain' });
      break;
    }

    if (text[i] === '<') {
      if (text.startsWith('<!--', i)) {
        const e = text.indexOf('-->', i + 4);
        const end = e < 0 ? n : e + 3;
        push(text.slice(i, end), 'comment');
        i = end;
        continue;
      }
      if (text.startsWith('<![CDATA[', i)) {
        const e = text.indexOf(']]>', i + 9);
        const end = e < 0 ? n : e + 3;
        push(text.slice(i, end), 'cdata');
        i = end;
        continue;
      }
      if (text.startsWith('<?', i)) {
        const e = text.indexOf('?>', i + 2);
        const end = e < 0 ? n : e + 2;
        push(text.slice(i, end), 'declaration');
        i = end;
        continue;
      }
      if (text.startsWith('<!', i)) {
        const e = text.indexOf('>', i + 2);
        const end = e < 0 ? n : e + 1;
        push(text.slice(i, end), 'declaration');
        i = end;
        continue;
      }
      const gt = findTagEnd(text, i);
      if (gt < 0) {
        push(text.slice(i), 'text');
        break;
      }
      pushTagSpans(text.slice(i, gt + 1), push);
      i = gt + 1;
      continue;
    }

    const next = text.indexOf('<', i);
    const end = next < 0 ? n : next;
    push(text.slice(i, end), 'text');
    i = end;
  }

  return spans;
}

/** Dispatch to the tokeniser for a payload kind. */
export function tokenizePayload(kind: PayloadKind, text: string): Span[] {
  if (kind === 'json') return tokenizeJson(text);
  if (kind === 'xml') return tokenizeXml(text);
  return [{ text, kind: 'plain' }];
}

// ── Display helpers ─────────────────────────────────────────────────

export interface ClampedText {
  text: string;
  /** Lines actually present in `text`. */
  shown: number;
  /** Lines in the original. */
  total: number;
  clamped: boolean;
}

/**
 * Cap how many lines the UI is asked to lay out. A 200 KB payload is
 * inside the format budget but still thousands of lines of text nodes.
 */
export function clampLines(
  text: string,
  maxLines: number = MAX_RENDER_LINES,
): ClampedText {
  const lines = text.split('\n');
  if (lines.length <= maxLines) {
    return { text, shown: lines.length, total: lines.length, clamped: false };
  }
  return {
    text: lines.slice(0, maxLines).join('\n'),
    shown: maxLines,
    total: lines.length,
    clamped: true,
  };
}

/** Human-readable size for the collapsed payload affordance. */
export function formatSize(chars: number): string {
  if (!Number.isFinite(chars) || chars < 0) return '0 B';
  if (chars < 1024) return `${Math.round(chars)} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
}

/** Label for the collapsed affordance, e.g. "JSON · 1.4 KB". */
export function payloadLabel(kind: PayloadKind, raw: string): string {
  if (kind === 'none') return '';
  return `${kind.toUpperCase()} · ${formatSize(raw.length)}`;
}

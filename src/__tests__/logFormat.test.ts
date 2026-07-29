import {
  MAX_DEPTH,
  MAX_FORMAT_CHARS,
  clampLines,
  detectPayload,
  formatJson,
  formatPayload,
  formatSize,
  formatXml,
  payloadLabel,
  tokenizeJson,
  tokenizePayload,
  tokenizeXml,
} from '../utils/logFormat';

// A realistic CloudHub log line: prose prefix, payload crammed on the end.
const JSON_LINE =
  '2026-07-29 11:02:14 INFO  [http.worker.01] o.m.OrderFlow: Received order {"orderId":"A-1001","total":42.5,"paid":true,"note":null,"lines":[{"sku":"X-9","qty":2}]}';

const XML_LINE =
  '2026-07-29 11:02:14 INFO  [http.worker.02] o.m.OrderFlow: Payload <order id="A-1001" currency="EUR"><line sku="X-9">2</line></order>';

describe('detectPayload', () => {
  it('leaves a plain log line untouched', () => {
    const line = '2026-07-29 11:02:14 INFO  [main] o.m.Startup: Application deployed successfully';
    const result = detectPayload(line);
    expect(result.kind).toBe('none');
    expect(result.prose).toBe(line);
    expect(result.raw).toBe('');
    expect(result.start).toBe(-1);
    expect(result.end).toBe(-1);
  });

  it('finds JSON embedded after prose and keeps the prose separate', () => {
    const result = detectPayload(JSON_LINE);
    expect(result.kind).toBe('json');
    expect(result.prose).toBe(
      '2026-07-29 11:02:14 INFO  [http.worker.01] o.m.OrderFlow: Received order ',
    );
    expect(result.raw).toBe(
      '{"orderId":"A-1001","total":42.5,"paid":true,"note":null,"lines":[{"sku":"X-9","qty":2}]}',
    );
    expect(result.trailing).toBe('');
    expect(JSON_LINE.slice(result.start, result.end)).toBe(result.raw);
  });

  it('extracts exact boundaries when text follows the payload', () => {
    const line = 'Sending body {"customer":{"id":77},"ok":true} to the CRM endpoint';
    const result = detectPayload(line);
    expect(result.kind).toBe('json');
    expect(result.raw).toBe('{"customer":{"id":77},"ok":true}');
    expect(result.prose).toBe('Sending body ');
    expect(result.trailing).toBe(' to the CRM endpoint');
  });

  it('detects a top-level JSON array payload', () => {
    const line = 'Batch accepted [{"id":1},{"id":2},{"id":3}]';
    const result = detectPayload(line);
    expect(result.kind).toBe('json');
    expect(result.raw).toBe('[{"id":1},{"id":2},{"id":3}]');
  });

  it('does not stop at a brace inside a JSON string value', () => {
    const line = 'Reply {"template":"hello {name}","done":true}';
    const result = detectPayload(line);
    expect(result.kind).toBe('json');
    expect(result.raw).toBe('{"template":"hello {name}","done":true}');
  });

  it('skips a malformed candidate and finds the real payload after it', () => {
    const line = 'context {not json here} then {"realPayload":"yes","n":1}';
    const result = detectPayload(line);
    expect(result.kind).toBe('json');
    expect(result.raw).toBe('{"realPayload":"yes","n":1}');
  });

  it('finds embedded XML and keeps the prose separate', () => {
    const result = detectPayload(XML_LINE);
    expect(result.kind).toBe('xml');
    expect(result.prose).toBe(
      '2026-07-29 11:02:14 INFO  [http.worker.02] o.m.OrderFlow: Payload ',
    );
    expect(result.raw).toBe(
      '<order id="A-1001" currency="EUR"><line sku="X-9">2</line></order>',
    );
    expect(XML_LINE.slice(result.start, result.end)).toBe(result.raw);
  });

  it('detects XML introduced by a declaration', () => {
    const line = 'Response <?xml version="1.0"?><ack status="OK"/> received';
    const result = detectPayload(line);
    expect(result.kind).toBe('xml');
    expect(result.raw).toBe('<?xml version="1.0"?><ack status="OK"/>');
    expect(result.trailing).toBe(' received');
  });

  it('ignores a lone inline element — that is prose, not a payload', () => {
    const result = detectPayload('Processing record <id>1234567</id> for tenant acme');
    expect(result.kind).toBe('none');
  });

  it('ignores mismatched XML tags', () => {
    const result = detectPayload('Broken <order><line>2</wrong></order> payload');
    expect(result.kind).toBe('none');
  });

  it('ignores unbalanced JSON', () => {
    const result = detectPayload('Truncated payload {"orderId":"A-1001","lines":[{"sku"');
    expect(result.kind).toBe('none');
  });

  it('ignores tiny bracket noise in prose', () => {
    expect(detectPayload('Retry [1] of [3] for connector').kind).toBe('none');
  });

  it('ignores a short message that cannot hold a payload', () => {
    expect(detectPayload('{"a":1}').kind).toBe('none');
    expect(detectPayload('').kind).toBe('none');
  });

  it('is not thrown off by bracketed log prefix fields', () => {
    const line =
      '11:02:14 INFO [http.worker.01] [corr-9f2] [tenant/acme] [v2] [eu-c1] [retry 1] o.m.Flow: {"ok":true,"id":"A-1"}';
    const result = detectPayload(line);
    expect(result.kind).toBe('json');
    expect(result.raw).toBe('{"ok":true,"id":"A-1"}');
  });

  it('gives up after a bounded number of candidates instead of scanning forever', () => {
    const noise = '{"a" bad} '.repeat(30);
    const result = detectPayload(`${noise}{"real":"payload","n":1}`);
    expect(result.kind).toBe('none');
  });
});

describe('formatJson', () => {
  it('pretty-prints with a 2-space indent', () => {
    expect(formatJson('{"a":1,"b":{"c":[1,2]}}')).toEqual({
      formatted: true,
      text: ['{', '  "a": 1,', '  "b": {', '    "c": [', '      1,', '      2', '    ]', '  }', '}'].join('\n'),
    });
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(formatJson('{"a":1,}')).toBeNull();
    expect(formatJson('{"a" 1}')).toBeNull();
    expect(formatJson('{"a":1')).toBeNull();
    expect(formatJson('not json at all')).toBeNull();
    expect(formatJson('')).toBeNull();
  });

  it('returns null for JSON scalars — a payload block is for structures', () => {
    expect(formatJson('"just a string"')).toBeNull();
    expect(formatJson('42')).toBeNull();
  });

  it('returns null when there is trailing junk after the value', () => {
    expect(formatJson('{"a":1} trailing')).toBeNull();
  });

  it('refuses to format beyond the size guard and flags why', () => {
    const huge = `{"blob":"${'x'.repeat(MAX_FORMAT_CHARS)}"}`;
    const result = formatJson(huge);
    expect(result).not.toBeNull();
    expect(result!.formatted).toBe(false);
    expect(result!.reason).toBe('too-large');
    expect(result!.text).toBe(huge);
  });

  it('refuses to format beyond the depth guard and flags why', () => {
    const depth = MAX_DEPTH + 5;
    const deep = '['.repeat(depth) + ']'.repeat(depth);
    const result = formatJson(deep);
    expect(result).not.toBeNull();
    expect(result!.formatted).toBe(false);
    expect(result!.reason).toBe('too-deep');
  });

  it('formats right up to the depth limit', () => {
    const deep = '['.repeat(MAX_DEPTH) + ']'.repeat(MAX_DEPTH);
    expect(formatJson(deep)!.formatted).toBe(true);
  });
});

describe('formatXml', () => {
  it('indents nested elements and keeps leaf text inline', () => {
    const result = formatXml('<order id="A-1001"><line sku="X-9">2</line><line sku="Y-1">1</line></order>');
    expect(result).toEqual({
      formatted: true,
      text: [
        '<order id="A-1001">',
        '  <line sku="X-9">2</line>',
        '  <line sku="Y-1">1</line>',
        '</order>',
      ].join('\n'),
    });
  });

  it('handles declarations, comments, CDATA and self-closing tags', () => {
    const raw =
      '<?xml version="1.0" encoding="UTF-8"?><env><!-- note --><flag enabled="true"/><body><![CDATA[a < b]]></body></env>';
    expect(formatXml(raw)!.text).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<env>',
        '  <!-- note -->',
        '  <flag enabled="true"/>',
        '  <body>',
        '    <![CDATA[a < b]]>',
        '  </body>',
        '</env>',
      ].join('\n'),
    );
  });

  it('collapses insignificant whitespace between elements', () => {
    const result = formatXml('<a>\n   <b>1</b>\n   <c/>\n</a>');
    expect(result!.text).toBe(['<a>', '  <b>1</b>', '  <c/>', '</a>'].join('\n'));
  });

  it('returns null for malformed XML instead of throwing', () => {
    expect(formatXml('<a><b></a></b>')).toBeNull();
    expect(formatXml('<a><b>1</b>')).toBeNull();
    expect(formatXml('<a><!-- unterminated </a>')).toBeNull();
    expect(formatXml('<a>1 < 2</a>')).toBeNull();
    expect(formatXml('plain text')).toBeNull();
    expect(formatXml('')).toBeNull();
  });

  it('returns null when content follows the root element', () => {
    expect(formatXml('<a><b>1</b></a> tail')).toBeNull();
  });

  it('refuses to format beyond the size guard and flags why', () => {
    const huge = `<a>${'x'.repeat(MAX_FORMAT_CHARS)}</a>`;
    const result = formatXml(huge);
    expect(result!.formatted).toBe(false);
    expect(result!.reason).toBe('too-large');
  });

  it('refuses to format beyond the depth guard and flags why', () => {
    const depth = MAX_DEPTH + 3;
    const deep = '<n>'.repeat(depth) + '</n>'.repeat(depth);
    const result = formatXml(deep);
    expect(result!.formatted).toBe(false);
    expect(result!.reason).toBe('too-deep');
  });
});

describe('formatPayload', () => {
  it('dispatches on the detected kind', () => {
    const json = detectPayload(JSON_LINE);
    expect(formatPayload(json.kind, json.raw)!.text).toContain('"orderId": "A-1001"');

    const xml = detectPayload(XML_LINE);
    expect(formatPayload(xml.kind, xml.raw)!.text).toContain('  <line sku="X-9">2</line>');
  });

  it('returns null when there is no payload', () => {
    expect(formatPayload('none', 'anything')).toBeNull();
  });
});

describe('tokenizeJson', () => {
  it('separates keys, strings, numbers, booleans and null', () => {
    const spans = tokenizeJson(formatJson('{"k":"v","n":-1.5e3,"b":false,"z":null}')!.text);
    const byKind = (kind: string) =>
      spans.filter((s) => s.kind === kind).map((s) => s.text);

    expect(byKind('key')).toEqual(['"k"', '"n"', '"b"', '"z"']);
    expect(byKind('string')).toEqual(['"v"']);
    expect(byKind('number')).toEqual(['-1500']);
    expect(byKind('boolean')).toEqual(['false']);
    expect(byKind('null')).toEqual(['null']);
  });

  it('keeps an exponent notation number in one span', () => {
    const spans = tokenizeJson('{"n": -1.5e-3}');
    expect(spans.filter((s) => s.kind === 'number').map((s) => s.text)).toEqual([
      '-1.5e-3',
    ]);
  });

  it('does not mistake a colon inside a string value for a key marker', () => {
    const spans = tokenizeJson('{"url": "https://example.com:8080"}');
    expect(spans.filter((s) => s.kind === 'key').map((s) => s.text)).toEqual(['"url"']);
    expect(spans.filter((s) => s.kind === 'string').map((s) => s.text)).toEqual([
      '"https://example.com:8080"',
    ]);
  });

  it('handles escaped quotes inside strings', () => {
    const spans = tokenizeJson('{"msg": "say \\"hi\\""}');
    expect(spans.filter((s) => s.kind === 'string').map((s) => s.text)).toEqual([
      '"say \\"hi\\""',
    ]);
  });

  it('reproduces the input exactly when spans are concatenated', () => {
    const text = formatJson('{"a":[1,true,null,"x"],"b":{"c":2}}')!.text;
    expect(tokenizeJson(text).map((s) => s.text).join('')).toBe(text);
  });
});

describe('tokenizeXml', () => {
  it('separates tags, attribute names, attribute values and text', () => {
    const spans = tokenizeXml('<order id="A-1">\n  <line>2</line>\n</order>');
    const byKind = (kind: string) =>
      spans.filter((s) => s.kind === kind).map((s) => s.text);

    expect(byKind('tag')).toEqual(['<order', '>', '<line', '>', '</line', '>', '</order', '>']);
    expect(byKind('attrName')).toEqual(['id']);
    expect(byKind('attrValue')).toEqual(['"A-1"']);
    expect(byKind('text').join('')).toContain('2');
  });

  it('marks comments, CDATA and declarations', () => {
    const spans = tokenizeXml('<?xml version="1.0"?>\n<!-- hi -->\n<a><![CDATA[raw]]></a>');
    expect(spans.find((s) => s.kind === 'declaration')!.text).toBe('<?xml version="1.0"?>');
    expect(spans.find((s) => s.kind === 'comment')!.text).toBe('<!-- hi -->');
    expect(spans.find((s) => s.kind === 'cdata')!.text).toBe('<![CDATA[raw]]>');
  });

  it('reproduces the input exactly when spans are concatenated', () => {
    const text = formatXml('<a x="1"><b>2</b><c/></a>')!.text;
    expect(tokenizeXml(text).map((s) => s.text).join('')).toBe(text);
  });
});

describe('tokenizePayload', () => {
  it('falls back to a single plain span when there is no payload', () => {
    expect(tokenizePayload('none', 'hello')).toEqual([{ text: 'hello', kind: 'plain' }]);
  });
});

describe('clampLines', () => {
  it('passes short text through untouched', () => {
    const result = clampLines('a\nb\nc', 10);
    expect(result).toEqual({ text: 'a\nb\nc', shown: 3, total: 3, clamped: false });
  });

  it('caps long text and reports the real total', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const result = clampLines(text, 10);
    expect(result.clamped).toBe(true);
    expect(result.shown).toBe(10);
    expect(result.total).toBe(50);
    expect(result.text.split('\n')).toHaveLength(10);
  });
});

describe('formatSize / payloadLabel', () => {
  it('formats byte counts', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1434)).toBe('1.4 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('builds the collapsed affordance label', () => {
    expect(payloadLabel('json', 'x'.repeat(1434))).toBe('JSON · 1.4 KB');
    expect(payloadLabel('xml', 'x'.repeat(20))).toBe('XML · 20 B');
    expect(payloadLabel('none', '')).toBe('');
  });
});

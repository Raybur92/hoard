import { renderRelicDither, extractRelicSource, RELIC_DITHER_CONSTANTS } from './relicDither';

// Use sharp to generate a deterministic test image so we don't depend on
// IGDB or any network reachability during CI.
import sharp from 'sharp';

async function makeTestImageBuffer(width: number, height: number): Promise<Buffer> {
  // A solid mid-grey square — every cell gets a non-zero bucket, so the
  // renderer is exercised across the shape vocabulary.
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  }).png().toBuffer();
}

// Stub global.fetch so renderRelicDither's `fetch(url)` returns our test
// image. The URL itself is opaque to the renderer (sharp consumes the
// raw bytes); we just need the response shape.
function stubFetchWithBuffer(buf: Buffer): void {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  });
}

describe('GD-PR4a — renderRelicDither', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a valid SVG containing the relic-dither class + viewBox at expected dims', async () => {
    stubFetchWithBuffer(await makeTestImageBuffer(120, 68));
    const svg = await renderRelicDither('https://images.example.test/hero.jpg');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('class="relic-dither"');
    const expectedW = RELIC_DITHER_CONSTANTS.ART_COLS * RELIC_DITHER_CONSTANTS.ART_CELL;
    const expectedH = RELIC_DITHER_CONSTANTS.ART_ROWS * RELIC_DITHER_CONSTANTS.ART_CELL;
    expect(svg).toContain(`viewBox="0 0 ${expectedW} ${expectedH}"`);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it('embeds the source URL as an XML comment immediately after the opening svg tag', async () => {
    stubFetchWithBuffer(await makeTestImageBuffer(120, 68));
    const url = 'https://images.igdb.com/igdb/image/upload/t_screenshot_big/abc123.jpg';
    const svg = await renderRelicDither(url);
    expect(svg).toContain(`<!-- src=${url} -->`);
    expect(extractRelicSource(svg)).toBe(url);
  });

  it('emits per-cell animation-delay attributes spanning the full wave window (D7)', async () => {
    stubFetchWithBuffer(await makeTestImageBuffer(120, 68));
    const svg = await renderRelicDither('https://images.example.test/hero.jpg');
    // Centroid sits at (59.5, 33.5) — between cells — so nearest cell
    // gets a small but non-zero delay. Assert the full range:
    //  - SOME cell has a near-zero delay (single-digit ms)
    //  - SOME cell has a delay near MAX_WAVE_DELAY_MS (corner)
    const delays = [...svg.matchAll(/animation-delay:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(delays.length).toBeGreaterThan(1000);
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    expect(min).toBeLessThan(20);
    expect(max).toBeGreaterThanOrEqual(RELIC_DITHER_CONSTANTS.MAX_WAVE_DELAY_MS - 5);
  });

  it('wraps every cell in a <g class="rd-cell"> so frontend animation targets them uniformly', async () => {
    stubFetchWithBuffer(await makeTestImageBuffer(120, 68));
    const svg = await renderRelicDither('https://images.example.test/hero.jpg');
    const cellCount = (svg.match(/<g class="rd-cell"/g) ?? []).length;
    expect(cellCount).toBeGreaterThan(1000); // mid-grey image fills most cells
  });

  it('throws on network failure (caller wraps + falls back to coverUrl)', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(renderRelicDither('https://images.example.test/bad.jpg'))
      .rejects.toThrow(/503/);
  });
});

describe('GD-PR4a — extractRelicSource', () => {
  it('returns null when input is null / undefined / no comment', () => {
    expect(extractRelicSource(null)).toBeNull();
    expect(extractRelicSource(undefined)).toBeNull();
    expect(extractRelicSource('<svg>no comment here</svg>')).toBeNull();
  });

  it('parses the source URL out of a valid comment', () => {
    const svg = '<svg class="relic-dither"><!-- src=https://example.com/a.jpg --><g></g></svg>';
    expect(extractRelicSource(svg)).toBe('https://example.com/a.jpg');
  });

  it('returns null when the comment is malformed (missing closing)', () => {
    const svg = '<svg><!-- src=https://example.com/a.jpg';
    expect(extractRelicSource(svg)).toBeNull();
  });
});

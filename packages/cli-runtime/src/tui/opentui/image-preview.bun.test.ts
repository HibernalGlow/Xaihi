import { expect, test } from "bun:test";
import sharp from "sharp";
import {
  decodeTerminalImageFrames,
  encodeRgbaToSixel,
  eraseTerminalGraphicsRect,
  prepareRgbaForSixel,
  projectRgbaToHalfBlocks,
  resolveTerminalImageBackend,
  writeTerminalBytes,
} from "./image-preview.js";
import { TerminalImageDecodeService, type TerminalDecodedImageFrame } from "./terminal-image-decode-service.js";

test("selects SIXEL before Kitty and half-block", () => {
  expect(
    resolveTerminalImageBackend("auto", {
      sixel: true,
      kitty_graphics: true,
    } as never),
  ).toBe("sixel");
  expect(
    resolveTerminalImageBackend("auto", {
      sixel: false,
      kitty_graphics: true,
    } as never),
  ).toBe("kitty");
  expect(resolveTerminalImageBackend("auto", null)).toBe("half-block");
});

test("projects RGBA pixels into portable upper-half terminal cells", () => {
  const rgba = new Uint8Array([
    255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255,
  ]);
  const rows = projectRgbaToHalfBlocks({ rgba, width: 2, height: 2 }, 2, 1);
  expect(rows[0]?.[0]).toEqual({
    character: "▀",
    foreground: "#ff0000",
    background: "#00ff00",
  });
  expect(rows[0]?.[1]).toEqual({
    character: "▀",
    foreground: "#0000ff",
    background: "#ffffff",
  });
});

test("encodes true-colour pixels as a complete SIXEL control sequence", () => {
  const encoded = new TextDecoder().decode(
    encodeRgbaToSixel({
      rgba: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
    }),
  );
  expect(encoded).toStartWith("\u001bP");
  expect(encoded).toContain("\u001bP0;2;q");
  expect(encoded).toEndWith("\u001b\\");
});

test("flattens SIXEL transparency without mutating the cached RGBA frame", () => {
  const rgba = new Uint8Array([
    10, 20, 30, 0,
    100, 50, 0, 128,
    1, 2, 3, 255,
  ]);
  const original = rgba.slice();

  expect(prepareRgbaForSixel(rgba)).toEqual(
    new Uint8Array([
      255, 255, 255, 255,
      177, 152, 127, 255,
      1, 2, 3, 255,
    ]),
  );
  encodeRgbaToSixel({ rgba, width: 3, height: 1 });
  expect(rgba).toEqual(original);
});

test("keeps the full SIXEL palette budget for detailed images", () => {
  const rgba = new Uint8Array(256 * 4);
  for (let pixel = 0; pixel < 256; pixel += 1) {
    const offset = pixel * 4;
    rgba[offset] = pixel;
    rgba[offset + 1] = (pixel * 37) % 256;
    rgba[offset + 2] = (pixel * 73) % 256;
    rgba[offset + 3] = 255;
  }
  const encoded = new TextDecoder().decode(
    encodeRgbaToSixel({ rgba, width: 256, height: 1 }),
  );

  expect(encoded.match(/#[0-9]+;2;/g)?.length ?? 0).toBeGreaterThan(128);
});

test("writes graphic bytes as a byte-preserving string to OpenTUI", () => {
  let output: unknown;
  const renderer = {
    writeOut: (value: unknown) => {
      output = value;
      return true;
    },
  };
  writeTerminalBytes(
    renderer as never,
    new Uint8Array([0x1b, 0x50, 0x71, 0xff, 0x1b, 0x5c]),
  );

  expect(typeof output).toBe("string");
  expect(Buffer.from(output as string, "latin1")).toEqual(
    Buffer.from([0x1b, 0x50, 0x71, 0xff, 0x1b, 0x5c]),
  );
  expect(output).not.toContain("27,80,113");
});

test("disables SIXEL scrolling and erases the gallery rectangle with DECERA", () => {
  let output = "";
  eraseTerminalGraphicsRect(
    {
      writeOut: (value: string) => {
        output += value;
        return true;
      },
    } as never,
    4,
    7,
    20,
    6,
  );
  expect(output).toContain("\u001b[?80l");
  expect(output).toContain("\u001b[8;5;13;24$z");
});

test("decodes animated GIF pages and preserves frame delays", async () => {
  const rgba = Buffer.concat([
    Buffer.from([255, 0, 0, 255, 255, 0, 0, 255]),
    Buffer.from([0, 0, 255, 255, 0, 0, 255, 255]),
  ]);
  const gif = await sharp(rgba, {
    raw: { width: 2, height: 2, channels: 4, pageHeight: 1 },
  })
    .gif({ loop: 0, delay: [60, 90] })
    .toBuffer();
  const frames = await decodeTerminalImageFrames(gif, 2, 1, "cover", 8);
  expect(frames).toHaveLength(2);
  expect(frames.map((frame) => frame.delayMs)).toEqual([60, 90]);
});

test("decodes a Web stream without collecting the original image in the caller", async () => {
  const png = await sharp({
    create: { width: 4, height: 6, channels: 4, background: "#4c8f6b" },
  }).png().toBuffer();
  const stream = new Blob([png]).stream() as ReadableStream<Uint8Array>;
  const frames = await decodeTerminalImageFrames(stream, 8, 8, "contain", 1);

  expect(frames).toHaveLength(1);
  expect(frames[0]?.width).toBeLessThanOrEqual(8);
  expect(frames[0]?.height).toBeLessThanOrEqual(8);
  expect(frames[0]?.png.length).toBeGreaterThan(0);
});

test("[terminal.image.decode.byte-budget] bounds decoded terminal frames by their actual RGBA and PNG bytes", async () => {
  const service = new TerminalImageDecodeService({ maxBytes: 12, maxConcurrent: 1 });
  let firstDecodes = 0;
  const first = () => {
    firstDecodes += 1;
    return Promise.resolve([decodedFrame(4, 4)]);
  };
  await service.decode("first", first);
  await service.decode("first", first);
  expect(firstDecodes).toBe(1);
  expect(service.snapshot()).toMatchObject({ cachedEntries: 1, cachedBytes: 8 });

  await service.decode("second", async () => [decodedFrame(4, 4)]);
  expect(service.snapshot()).toMatchObject({ cachedEntries: 1, cachedBytes: 8 });
  await service.decode("first", first);
  expect(firstDecodes).toBe(2);
  service.clear();
  expect(service.snapshot()).toMatchObject({ cachedEntries: 0, cachedBytes: 0 });
});

test("[terminal.image.decode.cancellation] removes an aborted terminal decode before it enters the bounded queue", async () => {
  const service = new TerminalImageDecodeService({ maxBytes: 64, maxConcurrent: 1 });
  const active = deferred<readonly TerminalDecodedImageFrame[]>();
  const first = service.decode(undefined, () => active.promise);
  let secondStarted = false;
  const abort = new AbortController();
  const second = service.decode(undefined, async () => {
    secondStarted = true;
    return [decodedFrame(4, 4)];
  }, abort.signal);
  await Bun.sleep(0);
  expect(service.snapshot()).toMatchObject({ running: 1, queued: 1 });
  abort.abort(new DOMException("not visible", "AbortError"));
  await expect(second).rejects.toBeTruthy();
  expect(secondStarted).toBe(false);
  active.resolve([decodedFrame(4, 4)]);
  await first;
  expect(service.snapshot()).toMatchObject({ running: 0, queued: 0 });
});

test("[terminal.image.decode.scheduler] acquires and releases the injected host CPU pool", async () => {
  let active = 0;
  let peakActive = 0;
  const requests: unknown[] = [];
  const service = new TerminalImageDecodeService({
    maxBytes: 64,
    maxConcurrent: 2,
    ownerId: "fixture:tui",
    resourceScheduler: {
      async acquire(request) {
        requests.push(request);
        active += 1;
        peakActive = Math.max(peakActive, active);
        let released = false;
        return { release() { if (!released) { released = true; active -= 1; } } };
      },
    },
  });
  await service.decode("scheduled", async () => [decodedFrame(4, 4)]);
  expect(requests).toEqual([{
    resource: "cpu",
    kind: "terminal.image.decode",
    priority: "view",
    ownerId: "fixture:tui",
  }]);
  expect(peakActive).toBe(1);
  expect(active).toBe(0);
});

function decodedFrame(rgbaBytes: number, pngBytes: number): TerminalDecodedImageFrame {
  return {
    rgba: new Uint8Array(rgbaBytes),
    png: new Uint8Array(pngBytes),
    width: 1,
    height: 1,
    delayMs: 100,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((current) => { resolve = current; });
  return { promise, resolve };
}

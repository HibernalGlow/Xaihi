/* @jsxImportSource @opentui/react */
import {
  CliRenderEvents,
  type BoxRenderable,
  type CliRenderer,
  type TerminalCapabilities,
} from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { Readable } from "node:stream";
import { image2sixel } from "sixel";
import sharp from "sharp";
import {
  defaultTerminalImageDecodeService,
  type TerminalDecodedImageFrame,
  type TerminalImageDecodeService,
} from "./terminal-image-decode-service.js";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export type TerminalImageBackend = "auto" | "sixel" | "kitty" | "half-block";
export interface TerminalImageStreamHandle extends AsyncDisposable {
  readonly stream: ReadableStream<Uint8Array>;
  close(): Promise<void>;
}
export interface TerminalImageStreamSource {
  readonly cacheKey: string;
  open(signal: AbortSignal): Promise<TerminalImageStreamHandle>;
}
export type TerminalImageSource = string | Uint8Array | TerminalImageStreamSource;
export interface TerminalImagePreviewProps {
  source?: TerminalImageSource;
  width: number;
  height: number;
  alt?: string;
  fit?: "contain" | "cover";
  backend?: TerminalImageBackend;
  placeholder?: string;
  maxAnimationFrames?: number;
  viewportRef?: RefObject<{ viewport?: BoxRenderable } | null>;
  drawingPausedRef?: RefObject<boolean>;
  drawingGenerationRef?: RefObject<number>;
  deferUntilVisible?: boolean;
  decodeService?: TerminalImageDecodeService;
}
export interface TerminalImageFrame extends TerminalDecodedImageFrame {}
interface HalfBlockCell {
  character: string;
  foreground: string;
  background: string;
}
const sixelPayloadCache = new WeakMap<TerminalImageFrame, Uint8Array>();

/** Shared image surface: SIXEL animation first, Kitty next, half-block fallback. */
export function TerminalImagePreview({
  source,
  width,
  height,
  alt = "Image preview",
  fit = "cover",
  backend = "auto",
  placeholder = "▧",
  maxAnimationFrames = 48,
  viewportRef,
  drawingPausedRef,
  drawingGenerationRef,
  deferUntilVisible = false,
  decodeService = defaultTerminalImageDecodeService,
}: TerminalImagePreviewProps): ReactNode {
  const renderer = useRenderer();
  const boxRef = useRef<BoxRenderable | null>(null);
  const resolvedBackend = resolveTerminalImageBackend(
    backend,
    renderer.capabilities,
  );
  const pixelSize = resolvePixelSize(renderer, width, height, resolvedBackend);
  const [frames, setFrames] = useState<readonly TerminalImageFrame[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    setFrames([]);
    setFrameIndex(0);
    setFailed(false);
    if (!source || width < 1 || height < 1) return;
    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      renderer.off(CliRenderEvents.FRAME, maybeLoad);
      void loadTerminalImageFrames(
        source,
        pixelSize.width,
        pixelSize.height,
        fit,
        maxAnimationFrames,
        decodeService,
        abort.signal,
      )
        .then((next) => {
          if (!cancelled) setFrames(next);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    const maybeLoad = () => {
      const box = boxRef.current;
      const viewport = viewportRef?.current?.viewport;
      if (!deferUntilVisible || !viewport || !box) return load();
      const overscan = box.height;
      if (
        box.x + box.width > viewport.x &&
        box.x < viewport.x + viewport.width &&
        box.y + box.height > viewport.y - overscan &&
        box.y < viewport.y + viewport.height + overscan
      )
        load();
    };
    if (deferUntilVisible) {
      renderer.on(CliRenderEvents.FRAME, maybeLoad);
      renderer.requestRender();
      maybeLoad();
    } else load();
    return () => {
      cancelled = true;
      abort.abort("terminal image preview replaced");
      renderer.off(CliRenderEvents.FRAME, maybeLoad);
    };
  }, [
    deferUntilVisible,
    decodeService,
    fit,
    height,
    maxAnimationFrames,
    pixelSize.height,
    pixelSize.width,
    source,
    renderer,
    viewportRef,
    width,
  ]);

  useEffect(() => {
    const frame = frames[frameIndex];
    if (!frame || frames.length < 2) return;
    const timer = setTimeout(
      () => setFrameIndex((frameIndex + 1) % frames.length),
      Math.max(80, frame.delayMs),
    );
    return () => clearTimeout(timer);
  }, [frameIndex, frames]);

  useEffect(() => {
    if (resolvedBackend === "half-block" || !frames[frameIndex]) return;
    let lastPosition = "";
    const draw = () => {
      if (drawingPausedRef?.current) return;
      const box = boxRef.current;
      const frame = frames[frameIndex];
      if (!box || !frame) return;
      const viewport = viewportRef?.current?.viewport;
      const fullyVisible =
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= renderer.terminalWidth &&
        box.y + box.height <= renderer.terminalHeight &&
        (!viewport ||
          (box.x >= viewport.x &&
            box.y >= viewport.y &&
            box.x + box.width <= viewport.x + viewport.width &&
            box.y + box.height <= viewport.y + viewport.height));
      if (!fullyVisible) return;
      const position = `${box.x}:${box.y}:${box.width}:${box.height}:${frameIndex}:${drawingGenerationRef?.current ?? 0}`;
      if (position === lastPosition) return;
      lastPosition = position;
      const payload =
        resolvedBackend === "sixel"
          ? getCachedSixelPayload(frame)
          : encodeKittyFrame(frame, box.width, box.height);
      writeGraphic(renderer, box.x, box.y, payload);
    };
    renderer.on(CliRenderEvents.FRAME, draw);
    renderer.requestRender();
    return () => {
      renderer.off(CliRenderEvents.FRAME, draw);
    };
  }, [
    drawingPausedRef,
    drawingGenerationRef,
    frameIndex,
    frames,
    renderer,
    resolvedBackend,
    viewportRef,
  ]);

  useEffect(
    () => () => {
      const box = boxRef.current;
      if (box && resolvedBackend !== "half-block")
        clearGraphic(
          renderer,
          box.x,
          box.y,
          box.width,
          box.height,
          resolvedBackend,
        );
    },
    [renderer, resolvedBackend],
  );

  const halfBlockRows = useMemo(
    () =>
      frames[frameIndex]
        ? projectRgbaToHalfBlocks(frames[frameIndex], width, height)
        : [],
    [frameIndex, frames, height, width],
  );
  if (!source || failed)
    return (
      <box
        ref={boxRef}
        width={width}
        height={height}
        alignItems="center"
        justifyContent="center"
      >
        <text>{`${placeholder} ${alt}`}</text>
      </box>
    );
  if (!frames.length)
    return (
      <box
        ref={boxRef}
        width={width}
        height={height}
        alignItems="center"
        justifyContent="center"
      >
        <text>{`◌ ${alt}`}</text>
      </box>
    );
  if (resolvedBackend !== "half-block")
    return <box ref={boxRef} width={width} height={height} overflow="hidden" />;
  return (
    <box ref={boxRef} width={width} height={height} overflow="hidden">
      <text>
        {halfBlockRows.map((row, rowIndex) => (
          <Fragment key={rowIndex}>
            {row.map((cell, columnIndex) => (
              <span
                key={`${rowIndex}-${columnIndex}`}
                fg={cell.foreground}
                bg={cell.background}
              >
                {cell.character}
              </span>
            ))}
            {rowIndex < halfBlockRows.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </text>
    </box>
  );
}

export function resolveTerminalImageBackend(
  requested: TerminalImageBackend,
  capabilities: TerminalCapabilities | null | undefined,
): Exclude<TerminalImageBackend, "auto"> {
  if (requested !== "auto") return requested;
  if (capabilities?.sixel) return "sixel";
  if (capabilities?.kitty_graphics) return "kitty";
  return "half-block";
}

export async function decodeTerminalImageFrames(
  source: string | Uint8Array | ReadableStream<Uint8Array>,
  width: number,
  height: number,
  fit: "contain" | "cover",
  maxFrames: number,
  signal?: AbortSignal,
): Promise<readonly TerminalImageFrame[]> {
  signal?.throwIfAborted();
  if (source instanceof ReadableStream) {
    return decodeTerminalImageStream(source, width, height, fit, signal);
  }
  const metadata = await sharp(source, { animated: true }).metadata();
  const pageCount = Math.max(1, Math.min(metadata.pages ?? 1, maxFrames));
  const delays = metadata.delay ?? [];
  const frames: TerminalImageFrame[] = [];
  for (let page = 0; page < pageCount; page += 1) {
    const pipeline = sharp(source, { page, pages: 1, animated: false })
      .resize(width, height, {
        fit,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha();
    const { data, info } = await pipeline
      .clone()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const png = await sharp(data, { raw: info }).png().toBuffer();
    frames.push({
      rgba: new Uint8Array(data),
      width: info.width,
      height: info.height,
      delayMs: Number(delays[page] ?? 100),
      png: new Uint8Array(png),
    });
  }
  return frames;
}

async function decodeTerminalImageStream(
  source: ReadableStream<Uint8Array>,
  width: number,
  height: number,
  fit: "contain" | "cover",
  signal?: AbortSignal,
): Promise<readonly TerminalImageFrame[]> {
  signal?.throwIfAborted();
  const input = Readable.fromWeb(source as never);
  const pipeline = sharp({
    animated: false,
    failOn: "warning",
    limitInputPixels: 100_000_000,
    sequentialRead: true,
  })
    .resize(width, height, {
      fit,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha();
  const abort = () => {
    const error = new DOMException("Terminal image decode aborted", "AbortError");
    input.destroy(error);
    pipeline.destroy(error);
  };
  signal?.addEventListener("abort", abort, { once: true });
  input.on("error", (error) => pipeline.destroy(error));
  input.pipe(pipeline);
  try {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    const png = await sharp(data, { raw: info }).png().toBuffer();
    signal?.throwIfAborted();
    return [{
      rgba: new Uint8Array(data),
      width: info.width,
      height: info.height,
      delayMs: 100,
      png: new Uint8Array(png),
    }];
  } finally {
    signal?.removeEventListener("abort", abort);
    input.destroy();
  }
}

function loadTerminalImageFrames(
  source: TerminalImageSource,
  width: number,
  height: number,
  fit: "contain" | "cover",
  maxFrames: number,
  decodeService: TerminalImageDecodeService,
  signal: AbortSignal,
): Promise<readonly TerminalImageFrame[]> {
  const cacheKey = source instanceof Uint8Array
    ? undefined
    : `${typeof source === "string" ? `path:${source}` : `stream:${source.cacheKey}`}\0${width}x${height}\0${fit}\0${maxFrames}`;
  return decodeService.decode(cacheKey, async (decodeSignal) => {
    if (typeof source === "string" || source instanceof Uint8Array) {
      return decodeTerminalImageFrames(source, width, height, fit, maxFrames, decodeSignal);
    }
    decodeSignal.throwIfAborted();
    const handle = await source.open(decodeSignal);
    try {
      return await decodeTerminalImageFrames(handle.stream, width, height, fit, 1, decodeSignal);
    } finally {
      await handle.close();
    }
  }, signal);
}

export function projectRgbaToHalfBlocks(
  frame: Pick<TerminalImageFrame, "rgba" | "width" | "height">,
  width: number,
  cellHeight: number,
): HalfBlockCell[][] {
  const rows: HalfBlockCell[][] = [];
  const sample = (x: number, y: number) => {
    const sx = Math.min(frame.width - 1, Math.floor((x * frame.width) / width));
    const sy = Math.min(
      frame.height - 1,
      Math.floor((y * frame.height) / (cellHeight * 2)),
    );
    const offset = (sy * frame.width + sx) * 4;
    return {
      hex: `#${hex(frame.rgba[offset] ?? 0)}${hex(frame.rgba[offset + 1] ?? 0)}${hex(frame.rgba[offset + 2] ?? 0)}`,
      alpha: frame.rgba[offset + 3] ?? 255,
    };
  };
  for (let y = 0; y < cellHeight * 2; y += 2) {
    const row: HalfBlockCell[] = [];
    for (let x = 0; x < width; x += 1) {
      const top = sample(x, y),
        bottom = sample(x, y + 1);
      row.push(
        top.alpha < 16 && bottom.alpha < 16
          ? { character: " ", foreground: "#000000", background: "#000000" }
          : {
              character: "▀",
              foreground: top.alpha < 16 ? bottom.hex : top.hex,
              background: bottom.alpha < 16 ? top.hex : bottom.hex,
            },
      );
    }
    rows.push(row);
  }
  return rows;
}

export function encodeRgbaToSixel(
  frame: Pick<TerminalImageFrame, "rgba" | "width" | "height">,
): Uint8Array {
  return new TextEncoder().encode(
    image2sixel(
      prepareRgbaForSixel(frame.rgba),
      frame.width,
      frame.height,
      256,
      2,
    ),
  );
}

export function prepareRgbaForSixel(rgba: Uint8Array): Uint8Array {
  const opaque = rgba.slice();
  for (let offset = 0; offset < opaque.length; offset += 4) {
    const alpha = opaque[offset + 3] ?? 255;
    if (alpha === 255) continue;
    const inverseAlpha = 255 - alpha;
    opaque[offset] = compositeChannel(opaque[offset] ?? 0, alpha, inverseAlpha);
    opaque[offset + 1] = compositeChannel(
      opaque[offset + 1] ?? 0,
      alpha,
      inverseAlpha,
    );
    opaque[offset + 2] = compositeChannel(
      opaque[offset + 2] ?? 0,
      alpha,
      inverseAlpha,
    );
    opaque[offset + 3] = 255;
  }
  return opaque;
}

function compositeChannel(channel: number, alpha: number, inverseAlpha: number) {
  return Math.round((channel * alpha + 255 * inverseAlpha) / 255);
}

function getCachedSixelPayload(frame: TerminalImageFrame) {
  let payload = sixelPayloadCache.get(frame);
  if (!payload) {
    payload = encodeRgbaToSixel(frame);
    sixelPayloadCache.set(frame, payload);
  }
  return payload;
}

function encodeKittyFrame(
  frame: TerminalImageFrame,
  columns: number,
  rows: number,
): Uint8Array {
  const base64 = Buffer.from(frame.png).toString("base64");
  const chunks: string[] = [];
  for (let offset = 0; offset < base64.length; offset += 4096)
    chunks.push(
      `\x1b_Ga=T,f=100,t=d,c=${columns},r=${rows},q=2,m=${offset + 4096 < base64.length ? 1 : 0};${base64.slice(offset, offset + 4096)}\x1b\\`,
    );
  return new TextEncoder().encode(chunks.join(""));
}

function resolvePixelSize(
  renderer: CliRenderer,
  width: number,
  height: number,
  backend: Exclude<TerminalImageBackend, "auto">,
) {
  if (backend === "half-block") return { width, height: height * 2 };
  const resolution = renderer.resolution;
  return {
    width: Math.max(
      1,
      Math.round(
        (width * (resolution?.width ?? renderer.terminalWidth * 8)) /
          renderer.terminalWidth,
      ),
    ),
    height: Math.max(
      1,
      Math.round(
        (height * (resolution?.height ?? renderer.terminalHeight * 16)) /
          renderer.terminalHeight,
      ),
    ),
  };
}
function writeGraphic(
  renderer: CliRenderer,
  x: number,
  y: number,
  payload: Uint8Array,
) {
  const move = new TextEncoder().encode(
      `\x1b7\x1b[?80l\x1b[?1070h\x1b[${y + 1};${x + 1}H`,
    ),
    restore = new TextEncoder().encode("\x1b8");
  writeRenderer(renderer, concat([move, payload, restore]));
}
function clearGraphic(
  renderer: CliRenderer,
  x: number,
  y: number,
  width: number,
  height: number,
  backend: Exclude<TerminalImageBackend, "auto">,
) {
  if (backend === "kitty")
    writeRenderer(renderer, new TextEncoder().encode("\x1b_Ga=d,d=A\x1b\\"));
  const lines = Array.from(
    { length: height },
    (_, row) => `\x1b[${y + row + 1};${x + 1}H${" ".repeat(width)}`,
  ).join("");
  writeRenderer(renderer, new TextEncoder().encode(`\x1b7${lines}\x1b8`));
  renderer.requestRender();
}
export function writeTerminalBytes(renderer: CliRenderer, data: Uint8Array) {
  const internal = renderer as unknown as {
    writeOut?: (data: string) => boolean;
    stdout?: NodeJS.WriteStream;
  };
  if (typeof internal.writeOut === "function") {
    // OpenTUI's private synchronous writer calls `.toString()` on its input.
    // Passing Uint8Array would therefore print `27,80,...` instead of emitting
    // the SIXEL/Kitty control sequence. Latin-1 preserves every byte 1:1.
    internal.writeOut(Buffer.from(data).toString("latin1"));
  } else {
    internal.stdout?.write(Buffer.from(data));
  }
}
export function eraseTerminalGraphicsRect(
  renderer: CliRenderer,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (width < 1 || height < 1) return;
  const top = y + 1,
    left = x + 1,
    bottom = y + height,
    right = x + width;
  writeTerminalBytes(
    renderer,
    new TextEncoder().encode(
      `\x1b7\x1b[?80l\x1b[${top};${left};${bottom};${right}$z\x1b8`,
    ),
  );
}
function writeRenderer(renderer: CliRenderer, data: Uint8Array) {
  writeTerminalBytes(renderer, data);
}
function concat(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function hex(value: number) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

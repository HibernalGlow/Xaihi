/* @jsxImportSource @opentui/react */
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActionTabs,
  ClickTarget,
  eraseTerminalGraphicsRect,
  ExecutionActions,
  ProgressBar,
  resolveTerminalTheme,
  TerminalImagePreview,
  TerminalPreferencesScreen,
  TerminalThemeProvider,
  terminalIcon,
  useAnimation,
  useTerminalChromeActions,
  useTerminalTheme,
  useTerminalUiSession,
  WorkbenchButton,
  WorkbenchField,
  WorkbenchPanel,
} from "@hibernalglow/xaihi-cli-runtime/terminal/opentui";
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal";
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n";
import type { EngineVInput, EngineVResult, EngineVWallpaper } from "./core.ts";

export function EngineVTui(
  props: TerminalUiScreenProps<EngineVInput, EngineVResult>,
): import('react').ReactNode {
  const [previewTheme, setPreviewTheme] = useState(
    props.theme ?? props.preferences?.current.theme ?? "inherit",
  );
  return (
    <TerminalThemeProvider
      theme={resolveTerminalTheme(
        previewTheme === "inherit" ? "nord" : previewTheme,
      )}
    >
      <EngineVGallery {...props} onThemePreview={setPreviewTheme} />
    </TerminalThemeProvider>
  );
}

function EngineVGallery({
  definition,
  language,
  preferences,
  onExit,
  onThemePreview,
}: TerminalUiScreenProps<EngineVInput, EngineVResult> & {
  onThemePreview: (theme: string) => void;
}) {
  const theme = useTerminalTheme(),
    dimensions = useTerminalDimensions(),
    t = createTerminalTranslator(language);
  const renderer = useRenderer();
  const galleryRef = useRef<ScrollBoxRenderable | null>(null);
  const sixelDrawingPausedRef = useRef(false);
  const sixelDrawingGenerationRef = useRef(0);
  const lastDrawnScrollTopRef = useRef(0);
  const galleryRedrawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const session = useTerminalUiSession(definition),
    [settings, setSettings] = useState(false),
    [selectedIndex, setSelectedIndex] = useState(0),
    [animationIndex, setAnimationIndex] = useState(0);
  const pulse = useAnimation({
    intervalMs: session.phase === "running" ? 90 : 520,
  });
  const fields = definition.schema.fields,
    field = (id: string) => fields.find((candidate) => candidate.id === id)!;
  const wallpapers = useMemo(() => {
    const data = session.result?.data;
    return data?.filteredWallpapers?.length
      ? data.filteredWallpapers
      : (data?.wallpapers ?? []);
  }, [session.result]);
  const ids = String(session.values.idsText ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const requestedColumns = clamp(
    Number(session.values.galleryColumns) || 0,
    0,
    6,
  );
  const columns = requestedColumns || resolveGalleryColumns(dimensions.width);
  const action = String(session.values.action ?? "scan");
  const tileWidth = Math.max(
    22,
    Math.floor((Math.max(36, dimensions.width - 7) - columns + 1) / columns),
  );
  const imageHeight = clamp(Math.round(((tileWidth - 2) * 9) / 32), 4, 9);
  const set = (id: string) => (value: string | number | boolean) =>
    session.setField(id, value);
  const rowStride = imageHeight + 5;
  const eraseGalleryImages = () => {
    const viewport = galleryRef.current?.viewport;
    if (!viewport) return;
    for (const rect of resolveSixelImageSlots(
      viewport,
      columns,
      tileWidth,
      imageHeight,
      rowStride,
      lastDrawnScrollTopRef.current,
    ))
      eraseTerminalGraphicsRect(
        renderer,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      );
  };
  const scheduleGalleryRedraw = () => {
    sixelDrawingPausedRef.current = true;
    if (galleryRedrawTimerRef.current)
      clearTimeout(galleryRedrawTimerRef.current);
    galleryRedrawTimerRef.current = setTimeout(() => {
      const scrollTop = galleryRef.current?.scrollTop ?? 0;
      const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowStride));
      const firstVisibleIndex = Math.min(
        Math.max(0, wallpapers.length - 1),
        firstVisibleRow * columns,
      );
      const animationOffset = wallpapers
        .slice(firstVisibleIndex, firstVisibleIndex + columns * 3)
        .findIndex((item) => /\.(?:gif|apng)$/i.test(item.preview));
      if (wallpapers.length)
        setAnimationIndex(
          animationOffset >= 0
            ? firstVisibleIndex + animationOffset
            : firstVisibleIndex,
        );
      galleryRedrawTimerRef.current = null;
      requestAnimationFrame(() => {
        lastDrawnScrollTopRef.current = galleryRef.current?.scrollTop ?? 0;
        sixelDrawingGenerationRef.current += 1;
        sixelDrawingPausedRef.current = false;
      });
      renderer.requestRender();
    }, 50);
  };
  const handleGalleryScroll = (event: MouseEvent) => {
    const gallery = galleryRef.current;
    const direction = event.scroll?.direction;
    if (!gallery || !direction) return;
    const maxScrollTop = Math.max(
      0,
      gallery.scrollHeight - gallery.viewport.height,
    );
    if (
      !shouldScheduleGalleryScroll(direction, gallery.scrollTop, maxScrollTop)
    )
      return;
    const target = clamp(
      gallery.scrollTop + (direction === "down" ? rowStride : -rowStride),
      0,
      maxScrollTop,
    );
    sixelDrawingPausedRef.current = true;
    queueMicrotask(() => {
      gallery.scrollTop = target;
      scheduleGalleryRedraw();
    });
  };

  useEffect(() => {
    if (selectedIndex >= wallpapers.length) setSelectedIndex(0);
  }, [selectedIndex, wallpapers.length]);
  useEffect(() => {
    const firstAnimated = wallpapers.findIndex((item) =>
      /\.(?:gif|apng)$/i.test(item.preview),
    );
    setAnimationIndex(firstAnimated >= 0 ? firstAnimated : 0);
  }, [wallpapers]);
  useEffect(() => {
    scheduleGalleryRedraw();
  }, [columns, renderer, wallpapers]);
  useEffect(
    () => () => {
      if (galleryRedrawTimerRef.current)
        clearTimeout(galleryRedrawTimerRef.current);
      eraseGalleryImages();
    },
    [renderer],
  );
  useTerminalChromeActions({
    onReset: session.reset,
    onExit,
    resetLabel: `↻ ${t("reset")}`,
    exitLabel: `× ${language === "zh" ? "退出" : "Exit"}`,
  });
  useKeyboard((key) => {
    if (key.name !== "escape") return;
    if (settings) setSettings(false);
    else if (session.confirming) session.dismissConfirmation();
    else if (session.phase === "running" || session.phase === "paused")
      void session.cancel();
    else onExit();
  });
  const toggleWallpaper = (item: EngineVWallpaper, index: number) => {
    setSelectedIndex(index);
    setAnimationIndex(index);
    session.setField(
      "idsText",
      (ids.includes(item.workshopId)
        ? ids.filter((id) => id !== item.workshopId)
        : [...ids, item.workshopId]
      ).join(","),
    );
  };
  const galleryColumnActions = (
    <box height={1} flexShrink={0} flexDirection="row">
      {[0, 1, 2, 3, 4, 5, 6].map((value) => (
        <ClickTarget
          key={value}
          id={`gallery-columns-${value}`}
          selected={requestedColumns === value}
          disabled={session.phase === "running"}
          onClick={() => {
            eraseGalleryImages();
            scheduleGalleryRedraw();
            session.focus("galleryColumns");
            session.setField("galleryColumns", value);
          }}
        >
          {value === 0 ? (language === "zh" ? "自动" : "Auto") : String(value)}
        </ClickTarget>
      ))}
    </box>
  );

  if (settings && preferences)
    return (
      <TerminalPreferencesScreen
        controller={preferences}
        focusedId={session.focusedControlId}
        onFocus={session.focus}
        onPreviewTheme={onThemePreview}
        onBack={() => setSettings(false)}
      />
    );
  if (session.confirming)
    return (
      <Confirmation
        language={language}
        count={ids.length}
        preview={[...session.preview]}
        onConfirm={() => void session.confirmExecute()}
        onDismiss={session.dismissConfirmation}
      />
    );

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      <box
        height={4}
        flexShrink={0}
        borderStyle="single"
        borderColor={theme.colors.border}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <box flexDirection="column">
          <text fg={theme.colors.primary}>
            <b>{`${terminalIcon("status")} ENGINEV // WALLPAPER DECK`}</b>
          </text>
          <text fg={theme.colors.mutedForeground}>
            {session.status ||
              (language === "zh"
                ? "工坊扫描、动态图预览与批量管理"
                : "Workshop scan, animated preview and batch management")}
          </text>
        </box>
        <box flexDirection="column" alignItems="flex-end">
          <text
            fg={
              session.phase === "running"
                ? theme.colors.warning
                : theme.colors.primary
            }
          >{`${session.phase === "running" ? "INDEXING" : "GALLERY_READY"} ${["◐", "◓", "◑", "◒"][pulse % 4]}`}</text>
          {preferences ? (
            <WorkbenchButton
              id="settings"
              onClick={() => setSettings(true)}
            >{`${terminalIcon("settings")} CONFIG`}</WorkbenchButton>
          ) : null}
        </box>
      </box>
      <box
        height={3}
        marginTop={1}
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
      >
        <ActionTabs
          id="field-action"
          options={[
            { value: "scan", label: "⌕ 扫描" },
            { value: "filter", label: "◇ 筛选" },
            { value: "rename", label: "✎ 重命名" },
            { value: "delete", label: "⚠ 删除" },
            { value: "export", label: "⇩ 导出" },
          ]}
          value={String(session.values.action ?? "scan")}
          focused={session.focusedControlId === "action"}
          disabled={session.phase === "running"}
          onFocus={() => session.focus("action")}
          onChange={set("action")}
        />
        <text
          fg={theme.colors.mutedForeground}
        >{`${terminalIcon("result")} ${wallpapers.length} · ● ${ids.length} · ${session.progress}%`}</text>
      </box>
      <box height={5} minHeight={5} flexShrink={0} flexDirection="row" gap={1}>
        {action === "rename" ? (
          <>
            <FieldBox width="30%" id="workshopPath" />
            <FieldBox width="28%" id="template" />
            <FieldBox width="10%" id="copyMode" />
          </>
        ) : action === "delete" ? (
          <>
            <FieldBox width="40%" id="workshopPath" />
            <FieldBox width="12%" id="dryRun" />
            <FieldBox width="12%" id="permanent" />
          </>
        ) : action === "export" ? (
          <>
            <FieldBox width="34%" id="workshopPath" />
            <FieldBox width="24%" id="exportPath" />
            <FieldBox width="10%" id="exportFormat" />
          </>
        ) : (
          <>
            <FieldBox width="34%" id="workshopPath" />
            <FieldBox width="11%" id="titleFilter" />
            <FieldBox width="11%" id="ratingFilter" />
            <FieldBox width="11%" id="typeFilter" />
          </>
        )}
        <box
          flexGrow={1}
          flexDirection="row"
          gap={1}
          borderStyle="rounded"
          borderColor={
            session.dangerous ? theme.colors.error : theme.colors.border
          }
          paddingLeft={1}
          paddingRight={1}
        >
          {action === "scan" || action === "rename" ? (
            <box width="44%">
              <FieldBox id="maxWorkers" />
            </box>
          ) : null}
          <box flexGrow={1} flexDirection="column">
            <text
              fg={theme.colors.mutedForeground}
            >{`${ids.length} ${language === "zh" ? "项已选" : "selected"}`}</text>
            <box flexGrow={1} />
            <ExecutionActions
              session={session}
              executeLabel={`▶ ${actionLabel(action, language)}`}
              confirmLabel={`${terminalIcon("danger")} ${language === "zh" ? "确认执行" : "Confirm"}`}
            />
          </box>
        </box>
      </box>
      <WorkbenchPanel
        title={`${terminalIcon("result")} ${language === "zh" ? "工坊图库" : "Workshop gallery"} · ${requestedColumns ? `${columns} ${language === "zh" ? "列" : "columns"}` : `${language === "zh" ? "自动" : "auto"} ${columns}`}`}
        headerActions={galleryColumnActions}
        flexGrow={1}
      >
        <box flexDirection="column" flexGrow={1} minHeight={0}>
          <scrollbox
            ref={galleryRef}
            flexGrow={1}
            minHeight={4}
            viewportCulling={true}
            onMouseScroll={handleGalleryScroll}
          >
            <box
              flexDirection="row"
              flexWrap="wrap"
              gap={1}
              alignItems="flex-start"
            >
              {wallpapers.length ? (
                wallpapers.map((item, index) => (
                  <WallpaperTile
                    key={item.workshopId}
                    item={item}
                    index={index}
                    width={tileWidth}
                    imageHeight={imageHeight}
                    viewportRef={galleryRef}
                    drawingPausedRef={sixelDrawingPausedRef}
                    drawingGenerationRef={sixelDrawingGenerationRef}
                    onFocus={() => setAnimationIndex(index)}
                    animated={animationIndex === index}
                    selected={ids.includes(item.workshopId)}
                    focused={selectedIndex === index}
                    onClick={() => toggleWallpaper(item, index)}
                  />
                ))
              ) : (
                <text fg={theme.colors.mutedForeground}>
                  {language === "zh"
                    ? "运行扫描后，这里会显示可点击、可滚动的壁纸卡片。"
                    : "Run scan to populate the scrollable wallpaper gallery."}
                </text>
              )}
            </box>
          </scrollbox>
          <ProgressBar
            value={session.progress}
            label={session.status || "READY"}
          />
        </box>
      </WorkbenchPanel>
      <box
        height={0}
        minHeight={0}
        flexShrink={0}
        marginTop={0}
        visible={false}
        borderStyle="rounded"
        borderColor={
          session.dangerous ? theme.colors.error : theme.colors.border
        }
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        gap={2}
      >
        <box width="70%" flexDirection="column">
          <box flexDirection="row" gap={1}>
            <FieldBox width="34%" id="imageBackend" />
            <FieldBox width="44%" id="template" />
            <FieldBox width="22%" id="maxWorkers" />
          </box>
          <box flexDirection="row" gap={2}>
            <FieldBox flexGrow={1} id="dryRun" />
            <FieldBox flexGrow={1} id="permanent" />
            <FieldBox flexGrow={1} id="copyMode" />
          </box>
        </box>
        <box flexGrow={1} flexDirection="column">
          <text
            fg={theme.colors.mutedForeground}
          >{`${ids.length} ${language === "zh" ? "项已选" : "selected"}`}</text>
          <box flexGrow={1} />
          <ExecutionActions
            session={session}
            executeLabel={`▶ ${actionLabel(String(session.values.action), language)}`}
            confirmLabel={`${terminalIcon("danger")} ${language === "zh" ? "确认执行" : "Confirm"}`}
          />
        </box>
      </box>
    </box>
  );

  function FieldBox({
    id,
    width,
    flexGrow,
  }: {
    id: string;
    width?: number | `${number}%`;
    flexGrow?: number;
  }) {
    return (
      <box width={width} flexGrow={flexGrow}>
        <WorkbenchField
          field={field(id)}
          value={session.values[id]}
          error={session.fieldErrors[id]}
          focused={session.focusedControlId === id}
          disabled={session.phase === "running"}
          t={t}
          onFocus={() => session.focus(id)}
          onChange={set(id)}
        />
      </box>
    );
  }
}

function WallpaperTile({
  item,
  index,
  width,
  imageHeight,
  viewportRef,
  drawingPausedRef,
  drawingGenerationRef,
  onFocus,
  animated,
  selected,
  focused,
  onClick,
}: {
  item: EngineVWallpaper;
  index: number;
  width: number;
  imageHeight: number;
  viewportRef: RefObject<ScrollBoxRenderable | null>;
  drawingPausedRef: RefObject<boolean>;
  drawingGenerationRef: RefObject<number>;
  onFocus: () => void;
  animated: boolean;
  selected: boolean;
  focused: boolean;
  onClick: () => void;
}) {
  const theme = useTerminalTheme(),
    title = item.title || item.folderName;
  return (
    <box
      id={`wallpaper-${item.workshopId}`}
      width={width}
      height={imageHeight + 4}
      flexShrink={0}
      flexDirection="column"
      borderStyle={selected ? "double" : "rounded"}
      borderColor={
        selected
          ? theme.colors.primary
          : focused
            ? theme.colors.focusRing
            : theme.colors.border
      }
      onMouseDown={onClick}
      onMouseOver={onFocus}
      overflow="hidden"
    >
      <TerminalImagePreview
        source={previewPath(item)}
        width={Math.max(1, width - 2)}
        height={imageHeight}
        alt={title}
        fit="cover"
        backend="sixel"
        maxAnimationFrames={animated ? 24 : 1}
        viewportRef={viewportRef}
        drawingPausedRef={drawingPausedRef}
        drawingGenerationRef={drawingGenerationRef}
        deferUntilVisible
      />
      <box paddingLeft={1} paddingRight={1} flexDirection="column">
        <text fg={selected ? theme.colors.primary : theme.colors.foreground}>
          <b>{`${selected ? "✓" : "◇"} ${item.workshopId} ${truncate(title, Math.max(8, width - item.workshopId.length - 7))}`}</b>
        </text>
        <text
          fg={theme.colors.mutedForeground}
        >{`${item.wallpaperType || "unknown"} · ${formatBytes(item.size)} · ${index + 1}`}</text>
      </box>
    </box>
  );
}

function Confirmation({
  language,
  count,
  preview,
  onConfirm,
  onDismiss,
}: {
  language: "zh" | "en";
  count: number;
  preview: string[];
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const theme = useTerminalTheme();
  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center">
      <box
        width="70%"
        height={10}
        flexDirection="column"
        borderStyle="double"
        borderColor={theme.colors.error}
        paddingLeft={2}
        paddingRight={2}
      >
        <text fg={theme.colors.error}>
          <b>{`${terminalIcon("danger")} ${language === "zh" ? "确认修改工坊" : "Confirm workshop change"}`}</b>
        </text>
        <text
          fg={theme.colors.mutedForeground}
        >{`${count} selected · ${preview.join(" · ")}`}</text>
        <box flexDirection="row" gap={2}>
          <WorkbenchButton id="confirm-execute" danger onClick={onConfirm}>
            {language === "zh" ? "确认执行" : "Run now"}
          </WorkbenchButton>
          <WorkbenchButton id="confirm-dismiss" onClick={onDismiss}>
            {language === "zh" ? "取消" : "Cancel"}
          </WorkbenchButton>
        </box>
      </box>
    </box>
  );
}
export function resolveGalleryColumns(width: number) {
  return width >= 170
    ? 5
    : width >= 140
      ? 4
      : width >= 105
        ? 3
        : width >= 72
          ? 2
          : 1;
}
export function shouldScheduleGalleryScroll(
  direction: string,
  scrollTop: number,
  maxScrollTop: number,
) {
  if (direction === "up") return scrollTop > 0;
  if (direction === "down") return scrollTop < maxScrollTop;
  return false;
}
export function resolveSixelImageSlots(
  viewport: { x: number; y: number; width: number; height: number },
  columns: number,
  tileWidth: number,
  imageHeight: number,
  rowStride: number,
  scrollTop: number,
) {
  const slots: Array<{ x: number; y: number; width: number; height: number }> =
    [];
  const visibleRows = Math.ceil(viewport.height / rowStride) + 1;
  const rowOffset = -(scrollTop % rowStride);
  for (let row = 0; row < visibleRows; row += 1) {
    const y = viewport.y + rowOffset + row * rowStride + 1;
    if (y < viewport.y || y + imageHeight > viewport.y + viewport.height)
      continue;
    for (let column = 0; column < columns; column += 1) {
      const x = viewport.x + column * (tileWidth + 1) + 1;
      const width = tileWidth - 2;
      if (x < viewport.x || x + width > viewport.x + viewport.width) continue;
      slots.push({ x, y, width, height: imageHeight });
    }
  }
  return slots;
}
function previewPath(item: EngineVWallpaper) {
  const preview = item.preview.trim();
  if (!preview) return "";
  if (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(preview) ||
    /^[A-Za-z]:[\\/]/.test(preview) ||
    preview.startsWith("/") ||
    preview.startsWith("\\\\")
  )
    return preview;
  const separator = item.path.includes("\\") ? "\\" : "/";
  return `${item.path.replace(/[\\/]+$/, "")}${separator}${preview.replace(/^[\\/]+/, "")}`;
}
function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value,
    unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}
function truncate(value: string, width: number) {
  return value.length > width
    ? `${value.slice(0, Math.max(1, width - 1))}…`
    : value;
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function actionLabel(action: string, language: "zh" | "en") {
  const zh = language === "zh";
  return action === "scan"
    ? zh
      ? "扫描工坊"
      : "Scan workshop"
    : action === "filter"
      ? zh
        ? "应用筛选"
        : "Apply filters"
      : action === "rename"
        ? zh
          ? "执行重命名"
          : "Run rename"
        : action === "delete"
          ? zh
            ? "删除所选"
            : "Delete selected"
          : zh
            ? "导出结果"
            : "Export results";
}

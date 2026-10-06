// 转录件（不是本仓的实现）：下面 BODY 分隔线之后是姊妹项目 Kisaki 那份设计系统的**逐字全份副本**。
// 源文件：Prometheus/Kisaki/kisaki_app/lib/theme/board_theme.dart
// 取用日期：2026-10-06　源文件 sha256：573a468b6b15ab2135a48bdea2bbb6889446fa7f0000c57ff188653843247a59
// 为什么要有这份文件：孤星配方（src/lib/design-theme/lonestar/）的每一个色值与几何都自称
//   「沿自这份校准」，而原件在本仓之外、别人随时会改。写进 docs/ 之后，`lonestar/spec.test.ts`
//   可以现读 BODY 的 sha256 与逐条十六进制常量做反查——出处不再是一句看起来像的话。
// 许可：源文件属 Kisaki（同为用户自己的项目，MIT）。本仓只把它当**事实转录件**，不 import、不编译，
//   所以它不参与构建（vitest 只按 .test.* 收集；这个文件名不会命中任何收集模式）。
// --- BODY ---
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Swiss / International Typographic Style tokens.
///
/// Measured against two references rather than invented:
/// - SBB's Flutter design system (`sbb_typography.dart`, `sbb_spacing.dart`, the list-item and
///   divider themes) for the type scale and its line heights, `letterSpacing 0`, the 44px touch
///   height, 1px flush separators, elevation 0 everywhere, and a two-weight system.
/// - The Swiss-Minimalist composition for the rest: square corners, hairline and structural rules
///   as the only ornament, one accent colour, uppercase micro-labels set loose and figures set
///   tight, and hierarchy carried by tone instead of hue.
///
/// Deviations from SBB are deliberate and named at the site: their pill buttons and 16px content
/// boxes are brand geometry, and this board keeps `radius = 0`.
/// Which visual system the board is dressed in.
///
/// `cassette` is the Swiss-typography skeleton with the Lone Trail skin: chamfered corners, hairline
/// rules, no elevation. `material` is the standard Material 3 reading of the same board: seeded
/// `ColorScheme`, `surfaceContainer` tiers for separation, rounded corners, and elevation kept for
/// overlays only.
enum BoardThemeKind { cassette, material }

class BoardTokens {
  const BoardTokens._();

  /// Spacing scale - SBB's `xxSmall/xSmall/small/medium/large/xLarge` (4/8/12/16/24/32).
  static const double gap = 8;
  static const double gapSmall = 4;
  static const double pad = 8;
  static const double section = 24;
  static const double gutter = 16;

  /// Swiss surfaces carry no round corner, but a Cassette panel is cut, not filleted: every corner
  /// is a 45° chamfer. The two sizes are the extracted Arknights token contract's `cut-sm` and
  /// `cut-md` (6 and 12), and its rule is one cut treatment per component.
  static const double radius = 0;
  static const double cutPanel = 6;
  static const double cutBlock = 12;

  /// The same two roles in the Material theme, where a corner is filleted instead of cut.
  /// The Material kind seeds its whole scheme from the board's own accent, so the two themes
  /// agree on brand while M3 derives the container tiers.
  static const Color md3Seed = Color(0xFFF6540E);

  static const double radiusPanel = 16;
  static const double radiusBlock = 28;
  static const double hairline = 1;

  /// Grid: the page is 12 columns; content spans columns instead of using ad-hoc pixel widths.
  static const int gridColumns = 12;

  /// Body measure limit in characters, so a wide window never produces a full-bleed text line.
  static const int measureCharacters = 60;

  /// The type scale is SBB's seven steps with SBB's line heights, one ratio per step.
  /// Body text sits at 16 because this is a desktop application, not because 16 is a nice number.
  static const double fsCaption = 10;
  static const double lhCaption = 12;
  static const double fsMicro = 12;
  static const double lhMicro = 16;
  static const double fsLabel = 14;
  static const double lhLabel = 20;
  static const double fsBody = 16;
  static const double lhBody = 20;
  static const double fsTitle = 18;
  static const double lhTitle = 24;
  static const double fsHeadline = 24;
  static const double lhHeadline = 32;
  static const double fsDisplay = 30;
  static const double lhDisplay = 32;

  /// SBB sets `letterSpacing: 0` everywhere; the only two exceptions are the Swiss label devices,
  /// which are tracking-based *by definition*: an uppercase step label is set loose (.08em/.2em)
  /// and a large figure block is set tight (-.02em).
  static const double trackingMicro = 0.8;
  static const double trackingStep = 2.0;
  static const double trackingDisplay = -0.5;

  /// Two weights only, like SBB's light/bold pair. Nothing in this app may use w500/w600/w800:
  /// the intermediate weights are what makes a Material skin look designed.
  static const FontWeight weightText = FontWeight.w400;
  static const FontWeight weightEmphasis = FontWeight.w700;

  // SBB's touch heights: a tab and a single-line row are 44, the app header is 56. The results row
  // is a two-line item (name over directory), so it gets the 44 minimum plus the second line -
  // SBB's own list rows grow the same way rather than shrinking the type.
  static const double rowHeight = 52;
  static const double laneHeaderHeight = 44;
  static const double laneCollapsedWidth = 44;
  static const double headerHeight = 56;

  /// The active step's rule: a structural bar, not an underline - the composition reference draws
  /// its section number with a 32x4 accent rule.
  static const double stepRuleWidth = 32;
  static const double stepRuleThickness = 4;

  static const double colSelect = 44;
  static const double colGroup = 76;
  static const double colName = 236;

  // Control widths inside the dialogs, all on the 4px grid so rows line up across sections.
  static const double fieldWidth = 152;
  static const double modeWidth = 132;
  static const double directionWidth = 104;

  static const double minWindowWidth = 940;
  static const double minWindowHeight = 560;

  static const double sourceLaneDefault = 300;
  static const double sourceLaneMin = 220;
  static const double sourceLaneMax = 560;
  static const double resultsLaneDefault = 300;
  static const double resultsLaneMin = 210;
  static const double resultsLaneMax = 520;
}

/// The skin is 孤星 / Cassette Futurism on the SBB bones.
///
/// Documented about the event, and only this: the ground is **a white with a polyester tint**, the
/// accent is **a high-brightness orange reserved for mechanical interaction**, the geometry is
/// **plane plus curve**, and Hypergryph's own project manager names **Dieter Rams and "less is
/// better"** as the influence. Nobody publishes its hex values, so every number below is a
/// calibration against those four stated properties plus the functional hues of the extracted
/// Arknights token contract (`#F6540E` orange, `#3FF7FF` cyan, `#FFD802` yellow, `#46C47C` green,
/// `#9C9C9C` grey) - they are ours to defend, not quotes from the source.
///
/// Two rules are taken literally from that contract: a colour change must always be paired with a
/// text, icon or geometry change, and a glow is feedback, never a permanent background.
class BoardPalette {
  BoardPalette({required this.dark, this.kind = BoardThemeKind.cassette});

  final bool dark;
  final BoardThemeKind kind;

  /// The Material kind reads every colour off a seeded `ColorScheme`, which is what makes it the
  /// standard design rather than a hand-picked palette with rounded corners. Built once per palette,
  /// and `BoardTheme` memoises the palette, so a rebuild does not re-run the M3 harmony.
  late final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: BoardTokens.md3Seed,
    brightness: dark ? Brightness.dark : Brightness.light,
  );

  bool get _md3 => kind == BoardThemeKind.material;
  Color _pick({required Color cassette, required Color material}) =>
      _md3 ? material : cassette;

  /// A panel's outline: a 45° chamfer in the cassette theme, a fillet in the Material one. This is
  /// the only place a corner is chosen, which is what lets a second theme vary it without a widget
  /// ever naming a radius (Rossi keeps the same single seam, behind a `ThemeShapeScope`).
  OutlinedBorder panelShape(Color rule) =>
      _bevel(rule, BoardTokens.cutPanel, BoardTokens.radiusPanel);

  /// A lifted block - dialog, menu, sheet - which the Material theme rounds harder than a panel.
  OutlinedBorder blockShape(Color rule) =>
      _bevel(rule, BoardTokens.cutBlock, BoardTokens.radiusBlock);

  OutlinedBorder _bevel(Color rule, double cut, double radius) =>
      kind == BoardThemeKind.cassette
      ? BeveledRectangleBorder(
          borderRadius: BorderRadius.circular(cut),
          side: BorderSide(color: rule),
        )
      : RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: rule),
        );

  /// Two grounds only: the panel the cabin is built from, and the paper laid on top of it.
  Color get bg => _pick(
    cassette: _d(const Color(0xFF15150F), const Color(0xFFE7E2D6)),
    material: scheme.surfaceContainerLow,
  );
  Color get card => _pick(
    cassette: _d(const Color(0xFF211F1A), const Color(0xFFFAF7F0)),
    material: scheme.surfaceContainer,
  );

  Color get raised =>
      _pick(cassette: card, material: scheme.surfaceContainerHigh);

  Color get sunken =>
      _pick(cassette: bg, material: scheme.surfaceContainerHighest);
  Color get border => _pick(
    cassette: _d(const Color(0xFF45423A), const Color(0xFFCFC8B8)),
    material: scheme.outlineVariant,
  );
  Color get hairline => border;

  Color get fg => _pick(
    cassette: _d(const Color(0xFFF4F1E9), const Color(0xFF16150F)),
    material: scheme.onSurface,
  );

  /// Hierarchy is a warm neutral step, so a greyscale rendering keeps the same reading order.
  Color get fgMuted => _pick(
    cassette: _d(const Color(0xFFB4AE9F), const Color(0xFF5C574B)),
    material: scheme.onSurfaceVariant,
  );
  Color get fgFaint => _d(const Color(0xFF7E796C), const Color(0xFF8A8474));
  Color get fgInverted =>
      _pick(cassette: const Color(0xFF16150F), material: scheme.onPrimary);

  /// One accent, and it is the interaction colour: the primary action and the stage in progress.
  Color get primary =>
      _pick(cassette: const Color(0xFFF6540E), material: scheme.primary);
  Color get primarySoft => _d(const Color(0xFFFF7A3C), const Color(0xFFC2400A));

  /// Selection is the contract's info cyan, deliberately not the orange: on this board an orange bar
  /// means "this stage is working", and a picked row must never be able to impersonate that. The
  /// bright panel cyan is illegible as text on the polyester ground, so the light theme keeps the hue
  /// and darkens it rather than reusing the indicator value.
  Color get cyan => _pick(
    cassette: _d(const Color(0xFF3FF7FF), const Color(0xFF0B6E75)),
    material: scheme.secondaryContainer,
  );

  /// A picked row is a container in the Material kind - M3's own answer to selection - and still
  /// never the accent.
  Color get selection => _pick(
    cassette: cyan.withValues(alpha: dark ? 0.22 : 0.16),
    material: scheme.secondaryContainer,
  );
  Color get selectionInk =>
      _pick(cassette: cyan, material: scheme.onSecondaryContainer);

  Color get hover => _d(const Color(0xFF2B2924), const Color(0xFFEFEAE0));
  Color get pressed => _d(const Color(0xFF0C0C08), const Color(0xFFD8D1C2));

  /// Destructive state keeps a tinted treatment rather than a filled block, so a warning never
  /// competes with the one accent.
  Color get danger => _pick(
    cassette: _d(const Color(0xFFFF6B5E), const Color(0xFFB02A1E)),
    material: scheme.error,
  );
  Color get dangerSoft => danger.withValues(alpha: 0.05);
  Color get warn => _d(const Color(0xFFFFD802), const Color(0xFF8A6A00));
  Color get ok => _d(const Color(0xFF46C47C), const Color(0xFF1F6B44));

  Color get scrim => Color(0x00000000).withValues(alpha: dark ? 0.6 : 0.4);

  /// Group identity is this cycle plus a printed group number, never colour alone - and the cycle is
  /// the panel's own lamp colours, not a chart library palette.
  Color chartByIndex(int index) => const <Color>[
    Color(0xFFF6540E),
    Color(0xFF3FF7FF),
    Color(0xFFFFD802),
    Color(0xFF46C47C),
    Color(0xFF9C9C9C),
  ][index % 5];

  Color _d(Color darkColor, Color lightColor) => dark ? darkColor : lightColor;

  /// A Cassette panel sets its identifiers and its figures in a monospace so the digits align on the
  /// column. The board ships no font assets, so the family is whatever the platform already has.
  /// Only the Cassette panel sets its figures in a monospace; the Material kind keeps the theme's own
  /// family and relies on the tabular feature for column alignment.
  String? get figureFamily => _md3
      ? null
      : switch (defaultTargetPlatform) {
          TargetPlatform.macOS => 'Menlo',
          TargetPlatform.windows => 'Consolas',
          TargetPlatform.linux => 'DejaVu Sans Mono',
          _ => 'monospace',
        };

  TextTheme get text => TextTheme(
    displaySmall: _style(
      BoardTokens.fsDisplay,
      BoardTokens.lhDisplay,
      BoardTokens.weightEmphasis,
      fg,
      tracking: BoardTokens.trackingDisplay,
    ),
    headlineSmall: _style(
      BoardTokens.fsHeadline,
      BoardTokens.lhHeadline,
      BoardTokens.weightEmphasis,
      fg,
      tracking: BoardTokens.trackingDisplay,
    ),
    titleMedium: _style(
      BoardTokens.fsTitle,
      BoardTokens.lhTitle,
      BoardTokens.weightText,
      fg,
    ),
    titleSmall: microLabel(),
    bodyLarge: _style(
      BoardTokens.fsBody,
      BoardTokens.lhBody,
      BoardTokens.weightText,
      fg,
    ),
    bodyMedium: _style(
      BoardTokens.fsLabel,
      BoardTokens.lhLabel,
      BoardTokens.weightText,
      fg,
    ),
    bodySmall: _style(
      BoardTokens.fsLabel,
      BoardTokens.lhLabel,
      BoardTokens.weightText,
      fgMuted,
    ),
    labelMedium: microLabel(),
    labelSmall: _style(
      BoardTokens.fsCaption,
      BoardTokens.lhCaption,
      BoardTokens.weightText,
      fgMuted,
    ),
  );

  /// The uppercase label device: micro type, set loose, in ink one step down. Every section
  /// heading, column caption and step label in the board is set with this, so a screen cannot
  /// invent its own micro style.
  TextStyle microLabel({Color? color}) => TextStyle(
    fontSize: BoardTokens.fsCaption,
    height: BoardTokens.lhCaption / BoardTokens.fsCaption,
    fontWeight: BoardTokens.weightEmphasis,
    letterSpacing: BoardTokens.trackingMicro,
    color: color ?? fgMuted,
  );

  /// A metric figure: the headline step, set tight, in tabular numerals.
  TextStyle metricFigure({Color? color}) => TextStyle(
    fontSize: BoardTokens.fsHeadline,
    height: BoardTokens.lhHeadline / BoardTokens.fsHeadline,
    fontWeight: BoardTokens.weightEmphasis,
    letterSpacing: BoardTokens.trackingDisplay,
    color: color ?? fg,
    fontFamily: figureFamily,
    fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
  );

  /// A table figure: one step below the row text, in tabular numerals, so a column of sizes or
  /// timestamps aligns on the digit rather than on the glyph and the table stays denser than prose.
  TextStyle tableFigure({Color? color}) => TextStyle(
    fontSize: BoardTokens.fsMicro,
    height: BoardTokens.lhMicro / BoardTokens.fsMicro,
    fontWeight: BoardTokens.weightText,
    color: color ?? fg,
    fontFamily: figureFamily,
    fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
  );

  /// The stage marker: a panel identifier, so it is set in the same monospace as the figures and one
  /// step looser than a caption. It is the only tracking in the board that reaches 0.2em.
  TextStyle stepLabel({Color? color}) => TextStyle(
    fontSize: BoardTokens.fsCaption,
    height: BoardTokens.lhCaption / BoardTokens.fsCaption,
    fontWeight: BoardTokens.weightEmphasis,
    letterSpacing: BoardTokens.trackingStep,
    color: color ?? fgMuted,
    fontFamily: figureFamily,
  );

  TextStyle _style(
    double size,
    double lineHeight,
    FontWeight weight,
    Color color, {
    double tracking = 0,
  }) => TextStyle(
    fontSize: size,
    height: lineHeight / size,
    fontWeight: weight,
    color: color,
    letterSpacing: tracking,
  );
}

class BoardTheme extends InheritedWidget {
  BoardTheme({
    required this.dark,
    required super.child,
    this.kind = BoardThemeKind.material,
    super.key,
  });

  final bool dark;
  final BoardThemeKind kind;

  /// Memoised because the Material palette builds a `ColorScheme` from a seed, and every widget in the
  /// board asks for the palette on every build.
  late final BoardPalette palette = BoardPalette(dark: dark, kind: kind);

  static BoardPalette of(BuildContext context) {
    final BoardTheme? theme = context
        .dependOnInheritedWidgetOfExactType<BoardTheme>();
    return theme?.palette ?? BoardPalette(dark: true);
  }

  @override
  bool updateShouldNotify(BoardTheme oldWidget) =>
      oldWidget.dark != dark || oldWidget.kind != kind;
}

/// Flat shell: hairlines and the two grounds carry separation, so elevation stays 0 and no
/// control gets a corner. SBB's own geometry (44 touch height, 1px border outside, label above
/// a field with a single bottom rule) is what these themes encode.
ThemeData boardThemeData(BoardPalette palette) =>
    palette.kind == BoardThemeKind.material
    ? _materialTheme(palette)
    : _cassetteTheme(palette);

/// The standard Material 3 shell: `ThemeData.from` derives shapes, state layers, elevation and
/// typography from the seeded scheme, so those are the framework's answers rather than ours. What is
/// overridden here is density - the touch strip, the row padding and the hairline the table needs -
/// plus the type scale, which M3's own roles are too large for a file listing to carry.
ThemeData _materialTheme(BoardPalette palette) {
  final ThemeData base = ThemeData.from(colorScheme: palette.scheme);
  return base.copyWith(
    scaffoldBackgroundColor: palette.bg,
    canvasColor: palette.bg,
    textTheme: palette.text,
    dividerTheme: DividerThemeData(
      color: palette.hairline,
      thickness: BoardTokens.hairline,
      space: BoardTokens.hairline,
    ),
    listTileTheme: base.listTileTheme.copyWith(
      minVerticalPadding: 10,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: BoardTokens.gutter,
      ),
    ),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      isDense: true,
      filled: true,
      fillColor: palette.sunken,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      linearTrackColor: palette.hairline,
      color: palette.primary,
    ),
  );
}

ThemeData _cassetteTheme(BoardPalette palette) {
  final TextTheme text = palette.text;
  return ThemeData(
    useMaterial3: true,
    brightness: palette.dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: palette.bg,
    canvasColor: palette.bg,
    textTheme: text,
    // Built, not seeded: ColorScheme.fromSeed derives a tonal palette whose secondary and tertiary
    // steps are muddy purples off a red seed, and any M3 widget left un-overridden would wear them.
    colorScheme: ColorScheme(
      brightness: palette.dark ? Brightness.dark : Brightness.light,
      primary: palette.primary,
      onPrimary: palette.fgInverted,
      primaryContainer: palette.primarySoft,
      onPrimaryContainer: palette.fgInverted,
      secondary: palette.fgMuted,
      onSecondary: palette.bg,
      error: palette.danger,
      onError: palette.fgInverted,
      surface: palette.card,
      onSurface: palette.fg,
      onSurfaceVariant: palette.fgMuted,
      surfaceContainerHighest: palette.sunken,
      outline: palette.border,
      outlineVariant: palette.hairline,
      scrim: palette.scrim,
      // Elevation is 0 board-wide, so the M3 tint must be a no-op rather than a grey the palette
      // never named.
      surfaceTint: palette.card,
    ),
    splashFactory: NoSplash.splashFactory,
    highlightColor: palette.pressed,
    appBarTheme: AppBarTheme(
      backgroundColor: palette.card,
      foregroundColor: palette.fg,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleMedium,
    ),
    cardTheme: CardThemeData(
      color: palette.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: palette.panelShape(palette.hairline),
    ),
    dividerTheme: DividerThemeData(
      color: palette.hairline,
      thickness: BoardTokens.hairline,
      space: BoardTokens.hairline,
    ),
    listTileTheme: const ListTileThemeData(
      // SBB's list row: 44 tall, 16 horizontal, title and subtitle on a 4px gap, and no icon
      // background to lift it off the ground.
      minVerticalPadding: 10,
      contentPadding: EdgeInsets.symmetric(horizontal: BoardTokens.gutter),
      titleTextStyle: TextStyle(
        fontSize: BoardTokens.fsBody,
        height: BoardTokens.lhBody / BoardTokens.fsBody,
        fontWeight: BoardTokens.weightText,
      ),
      subtitleTextStyle: TextStyle(
        fontSize: BoardTokens.fsLabel,
        height: BoardTokens.lhLabel / BoardTokens.fsLabel,
        fontWeight: BoardTokens.weightText,
      ),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? palette.primary
            : palette.sunken,
      ),
      side: BorderSide(color: palette.border),
      shape: const RoundedRectangleBorder(),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? palette.primary
            : palette.fgMuted,
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? palette.fgInverted
            : palette.fgMuted,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? palette.primary
            : palette.sunken,
      ),
      trackOutlineColor: WidgetStatePropertyAll<Color>(palette.border),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: palette.fg,
        backgroundColor: palette.raised,
        fixedSize: const Size.fromHeight(BoardTokens.rowHeight),
        padding: const EdgeInsets.symmetric(horizontal: BoardTokens.gutter),
        textStyle: text.bodyMedium,
        shape: palette.panelShape(palette.border),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: palette.fg,
        side: BorderSide(color: palette.border),
        fixedSize: const Size.fromHeight(BoardTokens.rowHeight),
        padding: const EdgeInsets.symmetric(horizontal: BoardTokens.gutter),
        textStyle: text.bodyMedium,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: palette.primary,
        foregroundColor: palette.fgInverted,
        fixedSize: const Size.fromHeight(BoardTokens.rowHeight),
        padding: const EdgeInsets.symmetric(horizontal: BoardTokens.gutter),
        textStyle: text.bodyMedium,
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        // SBB's icon button is a 44 square with the glyph at 24 and no corner.
        fixedSize: const Size.square(BoardTokens.rowHeight),
        padding: EdgeInsets.zero,
        iconSize: 24,
        shape: const RoundedRectangleBorder(),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: palette.sunken,
      hintStyle: text.bodyMedium?.copyWith(color: palette.fgFaint),
      labelStyle: text.bodySmall,
      floatingLabelStyle: palette.microLabel(),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: BoardTokens.gap,
        vertical: 10,
      ),
      border: OutlineInputBorder(
        borderSide: BorderSide(color: palette.border),
        borderRadius: BorderRadius.circular(BoardTokens.radius),
      ),
      enabledBorder: OutlineInputBorder(
        borderSide: BorderSide(color: palette.border),
        borderRadius: BorderRadius.circular(BoardTokens.radius),
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: palette.primary),
        borderRadius: BorderRadius.circular(BoardTokens.radius),
      ),
    ),
    sliderTheme: const SliderThemeData(trackHeight: 4).copyWith(
      activeTrackColor: palette.primary,
      thumbColor: palette.fg,
      inactiveTrackColor: palette.hairline,
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: palette.fg,
      unselectedLabelColor: palette.fgMuted,
      indicatorSize: TabBarIndicatorSize.tab,
      dividerColor: palette.hairline,
      labelStyle: text.titleSmall?.copyWith(color: palette.fg),
      unselectedLabelStyle: text.titleSmall,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: palette.raised,
        border: Border.all(color: palette.border),
      ),
      textStyle: text.bodySmall,
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: palette.card,
      textStyle: text.bodyMedium,
      shape: palette.blockShape(palette.border),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: palette.card,
      elevation: 0,
      titleTextStyle: text.titleMedium,
      contentTextStyle: text.bodyMedium,
      shape: palette.blockShape(palette.border),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: palette.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      modalElevation: 0,
      shape: palette.blockShape(palette.border),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      linearTrackColor: palette.hairline,
      color: palette.primary,
      linearMinHeight: 4,
    ),
    textSelectionTheme: TextSelectionThemeData(cursorColor: palette.primary),
  );
}

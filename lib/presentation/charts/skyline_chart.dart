import 'dart:math' as math;

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:khazana_domain/services/skyline.dart';

import '../../features/home/home_palette.dart';
import 'chart_tokens.dart';

/// A run of days as a 3D "skyline": one bar per day, weeks running left to
/// right and weekdays front to back, bar height and shade by the day's figure.
/// A Grid view shows the same cells flat, like the spend calendar.
///
/// The Flutter twin of `packages/ui-ts/src/charts/Skyline.tsx`. One
/// [CustomPainter] draws everything in isometric projection: three polygons per
/// bar, painted back to front, so no depth buffer is needed. The polygons are
/// built once per data / view / palette change, as [Path]s in view units; a
/// resize only changes the scale they are drawn at. Selection moves a
/// [ValueNotifier] that the painter listens to, so a hover repaints this one
/// painter and rebuilds nothing else.
///
/// Heights are on a square-root scale of the largest day, so one rent payment
/// does not flatten every other bar; the shading uses five steps. In
/// [SkylineMode.change] bars are signed: green for a rise, rose for a fall.
enum SkylineView { threeD, grid }

enum SkylineMode { spend, change }

/// The colours the chart draws with, all taken from existing theme tokens.
@immutable
class SkylinePalette {
  const SkylinePalette({
    required this.card,
    required this.tray,
    required this.lineStrong,
    required this.ink,
    required this.muted,
    required this.rose,
    required this.green,
  });

  /// The surface the chart sits on; bar shades are mixed onto it.
  final Color card;
  final Color tray;
  final Color lineStrong;
  final Color ink;
  final Color muted;
  final Color rose;
  final Color green;

  /// [card] defaults to the theme surface; pass the host card's own fill when
  /// it differs (the home's `HomeGroup` is not the Material surface).
  factory SkylinePalette.of(BuildContext context, {Color? card}) {
    final theme = Theme.of(context);
    final p = HomePalette.of(context);
    return SkylinePalette(
      card: card ?? theme.colorScheme.surface,
      tray: HomeTray.colorFor(theme.brightness),
      lineStrong: theme.colorScheme.outline,
      ink: p.ink,
      muted: p.muted,
      rose: p.rose,
      green: p.green,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SkylinePalette &&
      other.card == card &&
      other.tray == tray &&
      other.lineStrong == lineStrong &&
      other.ink == ink &&
      other.muted == muted &&
      other.rose == rose &&
      other.green == green;

  @override
  int get hashCode =>
      Object.hash(card, tray, lineStrong, ink, muted, rose, green);
}

const _steps = [0.16, 0.30, 0.48, 0.72, 1.0];
const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const _weekdayRows = [(0, 'Sun'), (2, 'Tue'), (4, 'Thu'), (6, 'Sat')];

// Week axis down-right, weekday axis down-left, in view units per cell.
const _ex = Offset(17, 5.2);
const _ey = Offset(-10, 7.5);
const _maxH = 120.0;
const _inset = 0.13;
const _narrowPx = 520.0;
const _maxWidthPx = 920.0;

/// Smallest label on screen, in logical px, whatever the chart's scale.
const _minLabelPx = 12.0;

int _level(double v, double max) =>
    max <= 0 || v <= 0 ? -1 : math.min(4, (math.sqrt(v / max) * 5).floor());

Color _shade(Color hue, Color card, int s) => Color.lerp(card, hue, _steps[s])!;
Color _darker(Color c, double pct) =>
    Color.lerp(c, const Color(0xFF000000), pct)!;

Offset _pt(double x, double y, double z) =>
    Offset(x * _ex.dx + y * _ey.dx, x * _ex.dy + y * _ey.dy - z);

Path _poly(List<Offset> ps) {
  final p = Path()..moveTo(ps.first.dx, ps.first.dy);
  for (final o in ps.skip(1)) {
    p.lineTo(o.dx, o.dy);
  }
  return p..close();
}

Path _dashed(Path src, {double dash = 2, double gap = 2}) {
  final out = Path();
  for (final m in src.computeMetrics()) {
    for (var d = 0.0; d < m.length; d += dash + gap) {
      out.addPath(m.extractPath(d, math.min(d + dash, m.length)), Offset.zero);
    }
  }
  return out;
}

class _Face {
  const _Face(this.path, this.color);
  final Path path;
  final Color color;
}

class _Shape {
  const _Shape(this.index, this.faces, this.top);
  final int index;
  final List<_Face> faces;

  /// What a selection outlines: the top face (3D) or the tile (grid).
  final Path top;
}

enum _AnchorX { left, center, right }

enum _AnchorY { baseline, middle, top }

class _LabelSpec {
  const _LabelSpec(this.painter, this.at, this.ax, this.ay);
  final TextPainter painter;

  /// Position in view units.
  final Offset at;
  final _AnchorX ax;
  final _AnchorY ay;
}

/// Everything derived from data + view + palette, in view units. Rebuilt only
/// when one of those changes, never per paint or per resize.
class _Geo {
  _Geo({
    required this.view,
    required this.mode,
    required this.weeks,
    required this.shapes,
    required this.dashed,
    required this.base,
    required this.left,
    required this.top,
    required this.right,
    required this.bottom,
    required this.barsBottom,
    required this.labels,
    required this.labelRightPx,
    required this.labelLeftPx,
    required this.byIndex,
  });

  final SkylineView view;
  final SkylineMode mode;
  final int weeks;
  final List<_Shape> shapes;
  final Path dashed;
  final Path? base;
  final double left, top, right, bottom;

  /// The y the grow-in scales about (the bottom of the bars).
  final double barsBottom;
  final List<_LabelSpec> labels;

  /// Screen px the labels need beyond the drawing, per side.
  final double labelRightPx;
  final double labelLeftPx;
  final Map<int, _Shape> byIndex;
}

_Geo _buildGeo({
  required List<SkyCell> cells,
  required int firstWeek,
  required SkylineView view,
  required SkylineMode mode,
  required SkylinePalette palette,
  required double labelPx,
  required bool narrow,
}) {
  final shown = [
    for (var i = 0; i < cells.length; i++)
      if (cells[i].week >= firstWeek)
        (i: i, c: cells[i], w: cells[i].week - firstWeek),
  ];
  final totalWeeks = cells.isEmpty ? 0 : cells.last.week + 1;
  final weeks = totalWeeks - firstWeek;
  var max = 0.0;
  for (final s in shown) {
    max = math.max(max, (s.c.value ?? 0).abs());
  }
  Color hueFor(double v) =>
      mode == SkylineMode.change && v >= 0 ? palette.green : palette.rose;

  TextPainter text(String s) => TextPainter(
    text: TextSpan(
      text: s,
      style: TextStyle(
        fontSize: labelPx,
        color: palette.muted,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    ),
    textDirection: TextDirection.ltr,
    textScaler: TextScaler.noScaling,
    maxLines: 1,
  )..layout();

  // Month labels along the front edge. A label less than three weeks after
  // the previous one is dropped in favour of the later, fuller month.
  final monthStarts = <(int, String)>[];
  var lastMonth = -1;
  for (var w = 0; w < weeks; w++) {
    final sat = shown.where((s) => s.w == w && s.c.weekday == 6);
    if (sat.isEmpty) continue;
    final m = sat.first.c.day.month - 1;
    if (m != lastMonth) {
      if (monthStarts.isNotEmpty && w - monthStarts.last.$1 < 3) {
        monthStarts.removeLast();
      }
      monthStarts.add((w, _months[m]));
      lastMonth = m;
    }
  }

  final shapes = <_Shape>[];
  final dashedSrc = Path();
  final labels = <_LabelSpec>[];
  Path? base;
  double l, t, r, b, barsBottom;
  var labelRightPx = 0.0;
  var labelLeftPx = 0.0;

  if (view == SkylineView.threeD) {
    const pad = 0.35;
    base = _poly([
      _pt(-pad, -pad, 0),
      _pt(weeks + pad, -pad, 0),
      _pt(weeks + pad, 7 + pad, 0),
      _pt(-pad, 7 + pad, 0),
    ]);
    final order = [...shown]
      ..sort((a, b) {
        final d = (a.w + a.c.weekday) - (b.w + b.c.weekday);
        return d != 0 ? d : a.w - b.w;
      });
    var minY = _pt(0, 0, 0).dy;
    for (final s in order) {
      final c = s.c;
      final x0 = s.w + _inset, x1 = s.w + 1 - _inset;
      final y0 = c.weekday + _inset, y1 = c.weekday + 1 - _inset;
      final flat = _poly([
        _pt(x0, y0, 0),
        _pt(x1, y0, 0),
        _pt(x1, y1, 0),
        _pt(x0, y1, 0),
      ]);
      final v = c.value;
      if (v == null) {
        dashedSrc.addPath(flat, Offset.zero);
        continue;
      }
      final lvl = _level(v.abs(), max);
      if (lvl < 0) {
        shapes.add(_Shape(s.i, [_Face(flat, palette.lineStrong)], flat));
        continue;
      }
      final h = math.max(2.5, math.sqrt(v.abs() / max) * _maxH);
      final top = _shade(hueFor(v), palette.card, lvl);
      final topPath = _poly([
        _pt(x0, y0, h),
        _pt(x1, y0, h),
        _pt(x1, y1, h),
        _pt(x0, y1, h),
      ]);
      minY = math.min(minY, _pt(x0, y0, h).dy);
      shapes.add(
        _Shape(s.i, [
          _Face(
            _poly([
              _pt(x0, y1, 0),
              _pt(x1, y1, 0),
              _pt(x1, y1, h),
              _pt(x0, y1, h),
            ]),
            _darker(top, 0.14),
          ),
          _Face(
            _poly([
              _pt(x1, y0, 0),
              _pt(x1, y1, 0),
              _pt(x1, y1, h),
              _pt(x1, y0, h),
            ]),
            _darker(top, 0.30),
          ),
          _Face(topPath, top),
        ], topPath),
      );
    }
    var baseline = _pt(weeks + pad, 7 + pad, 0).dy;
    for (final (w, name) in monthStarts) {
      final at = _pt(w + 0.5, 8.1, 0);
      baseline = math.max(baseline, at.dy);
      labels.add(
        _LabelSpec(text(name), at, _AnchorX.center, _AnchorY.baseline),
      );
    }
    if (!narrow) {
      for (final (wd, name) in _weekdayRows) {
        final tp = text(name);
        labelRightPx = math.max(labelRightPx, tp.width);
        labels.add(
          _LabelSpec(
            tp,
            _pt(weeks + 0.7, wd + 0.5, 0),
            _AnchorX.left,
            _AnchorY.middle,
          ),
        );
      }
    }
    l = _pt(-pad, 7 + pad, 0).dx - 8;
    r = _pt(weeks + pad, -pad, 0).dx + 8;
    if (!narrow) {
      // Make room for the weekday names if they poke past the base plate.
      r = math.max(r, _pt(weeks + 0.7, 6.5, 0).dx + labelRightPx + 4);
    }
    t = minY - 8;
    b = baseline;
    barsBottom = _pt(weeks - _inset, 7 - _inset, 0).dy;
  } else {
    const cell = 16.0, pitch = 19.0;
    for (final s in shown) {
      final c = s.c;
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(s.w * pitch, c.weekday * pitch, cell, cell),
        const Radius.circular(4),
      );
      final path = Path()..addRRect(rect);
      final v = c.value;
      if (v == null) {
        dashedSrc.addPath(path, Offset.zero);
        continue;
      }
      final lvl = _level(v.abs(), max);
      shapes.add(
        _Shape(s.i, [
          _Face(
            path,
            lvl < 0 ? palette.tray : _shade(hueFor(v), palette.card, lvl),
          ),
        ], path),
      );
    }
    for (final (wd, name) in _weekdayRows) {
      final tp = text(name);
      labelLeftPx = math.max(labelLeftPx, tp.width);
      labels.add(
        _LabelSpec(
          tp,
          Offset(0, wd * pitch + cell / 2),
          _AnchorX.right,
          _AnchorY.middle,
        ),
      );
    }
    for (final (w, name) in monthStarts) {
      labels.add(
        _LabelSpec(
          text(name),
          Offset(w * pitch, 7 * pitch - 3),
          _AnchorX.left,
          _AnchorY.top,
        ),
      );
    }
    l = 0;
    t = 0;
    r = weeks * pitch - 3;
    b = 7 * pitch - 3;
    barsBottom = b;
  }

  return _Geo(
    view: view,
    mode: mode,
    weeks: weeks,
    shapes: shapes,
    dashed: _dashed(dashedSrc),
    base: base,
    left: l,
    top: t,
    right: r,
    bottom: b,
    barsBottom: barsBottom,
    labels: labels,
    labelRightPx: labelRightPx,
    labelLeftPx: labelLeftPx,
    byIndex: {for (final s in shapes) s.index: s},
  );
}

/// Where the geometry sits on screen: a uniform scale and an x offset.
@immutable
class _Frame {
  const _Frame(this.scale, this.offX, this.width, this.height);
  final double scale, offX, width, height;

  @override
  bool operator ==(Object other) =>
      other is _Frame &&
      other.scale == scale &&
      other.offX == offX &&
      other.width == width &&
      other.height == height;

  @override
  int get hashCode => Object.hash(scale, offX, width, height);
}

_Frame _frameFor(_Geo g, double avail, double labelPx) {
  final drawn = math.min(avail, _maxWidthPx);
  if (g.view == SkylineView.threeD) {
    final w = g.right - g.left;
    final s = math.min(1.6, drawn / w);
    final content = w * s;
    final h = (g.bottom - g.top) * s + labelPx * 0.6;
    return _Frame(s, (avail - content) / 2, avail, h);
  }
  final lead = g.labelLeftPx + 8;
  final w = g.right - g.left;
  final s = math.min(2.0, (drawn - lead) / w);
  final content = lead + w * s;
  final h = (g.bottom - g.top) * s + labelPx * 1.9;
  return _Frame(s, (avail - content) / 2 + lead, avail, h);
}

class _SkylinePainter extends CustomPainter {
  _SkylinePainter({
    required this.geo,
    required this.frame,
    required this.palette,
    required this.selected,
    required this.progress,
  }) : super(repaint: Listenable.merge([selected, progress]));

  final _Geo geo;
  final _Frame frame;
  final SkylinePalette palette;
  final ValueListenable<int?> selected;
  final Animation<double> progress;

  Offset _screen(Offset v) => Offset(
    (v.dx - geo.left) * frame.scale + frame.offX,
    (v.dy - geo.top) * frame.scale,
  );

  @override
  void paint(Canvas canvas, Size size) {
    final s = frame.scale;
    final is3d = geo.view == SkylineView.threeD;
    canvas.save();
    canvas.translate(frame.offX - geo.left * s, -geo.top * s);
    canvas.scale(s);

    final fill = Paint()..style = PaintingStyle.fill;
    if (is3d && geo.base != null) {
      canvas.drawPath(geo.base!, fill..color = palette.tray);
    }

    // The grow-in scales the bars (not the plate) up from their feet.
    canvas.save();
    if (is3d) {
      final k =
          0.04 + 0.96 * ChartTokens.entranceCurve.transform(progress.value);
      canvas.translate(0, geo.barsBottom);
      canvas.scale(1, k);
      canvas.translate(0, -geo.barsBottom);
    }
    for (final shape in geo.shapes) {
      for (final f in shape.faces) {
        canvas.drawPath(f.path, fill..color = f.color);
      }
    }
    canvas.drawPath(
      geo.dashed,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1 / s
        ..color = palette.lineStrong,
    );
    final sel = selected.value;
    final picked = sel == null ? null : geo.byIndex[sel];
    if (picked != null) {
      canvas.drawPath(
        picked.top,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeJoin = StrokeJoin.round
          ..strokeWidth = (is3d ? 1.6 : 2.0) / s
          ..color = palette.ink,
      );
    }
    canvas.restore();
    canvas.restore();

    // Labels are drawn at screen scale so they stay readable at any zoom.
    for (final l in geo.labels) {
      final p = _screen(l.at);
      final tp = l.painter;
      final dx = switch (l.ax) {
        _AnchorX.left => p.dx,
        _AnchorX.center => p.dx - tp.width / 2,
        _AnchorX.right => frame.offX - 8 - tp.width,
      };
      final dy = switch (l.ay) {
        _AnchorY.baseline =>
          p.dy - tp.computeDistanceToActualBaseline(TextBaseline.alphabetic),
        _AnchorY.middle => p.dy - tp.height / 2,
        _AnchorY.top => p.dy + 4,
      };
      tp.paint(canvas, Offset(dx, dy));
    }
  }

  @override
  bool shouldRepaint(_SkylinePainter old) =>
      old.geo != geo ||
      old.frame != frame ||
      old.palette != palette ||
      old.selected != selected ||
      old.progress != progress;
}

typedef _GeoKey = (
  List<SkyCell>,
  int,
  SkylineView,
  SkylineMode,
  SkylinePalette,
  double,
);

class SkylineChart extends StatefulWidget {
  const SkylineChart({
    required this.cells,
    required this.describe,
    required this.semanticLabel,
    this.mode = SkylineMode.spend,
    this.narrowWeeks,
    this.card,
    super.key,
  });

  /// Stable list: a new instance rebuilds the geometry.
  final List<SkyCell> cells;

  /// Readout text for a cell index, e.g. "Tue 14 Oct · ₹2,340.00 · 3 entries".
  final String Function(int index) describe;

  /// Summary of the whole chart, for screen readers.
  final String semanticLabel;
  final SkylineMode mode;

  /// On a narrow card, show only this many most recent weeks.
  final int? narrowWeeks;

  /// The host card's fill, when it is not the Material surface.
  final Color? card;

  @override
  State<SkylineChart> createState() => _SkylineChartState();
}

class _SkylineChartState extends State<SkylineChart>
    with SingleTickerProviderStateMixin {
  static const _idle = 'Hover or tap a day';

  final _selected = ValueNotifier<int?>(null);
  late final AnimationController _anim = AnimationController(vsync: this);
  SkylineView _view = SkylineView.threeD;
  bool _started = false;

  _Geo? _geo;
  _GeoKey? _geoKey;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _anim.duration = ChartTokens.entranceFor(context);
    if (!_started) {
      _started = true;
      _grow();
    }
  }

  void _grow() {
    if (_anim.duration == Duration.zero) {
      _anim.value = 1;
    } else {
      _anim.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _anim.dispose();
    _selected.dispose();
    super.dispose();
  }

  void _setView(SkylineView v) {
    if (v == _view) return;
    _selected.value = null;
    setState(() => _view = v);
    if (v == SkylineView.threeD) _grow();
  }

  // The geometry is a pure function of these; rebuild only when one changes.
  _Geo _geometry(SkylinePalette palette, double labelPx, bool narrow) {
    final total = widget.cells.isEmpty ? 0 : widget.cells.last.week + 1;
    final nw = widget.narrowWeeks;
    final firstWeek = narrow && nw != null && nw < total ? total - nw : 0;
    final key = (widget.cells, firstWeek, _view, widget.mode, palette, labelPx);
    final prev = _geoKey;
    if (_geo == null ||
        prev == null ||
        !identical(prev.$1, key.$1) ||
        prev.$2 != key.$2 ||
        prev.$3 != key.$3 ||
        prev.$4 != key.$4 ||
        prev.$5 != key.$5 ||
        prev.$6 != key.$6) {
      _geo = _buildGeo(
        cells: widget.cells,
        firstWeek: firstWeek,
        view: _view,
        mode: widget.mode,
        palette: palette,
        labelPx: labelPx,
        narrow: narrow,
      );
      _geoKey = key;
    }
    return _geo!;
  }

  int? _hit(_Geo g, _Frame f, Offset p) {
    final v = Offset(
      (p.dx - f.offX) / f.scale + g.left,
      p.dy / f.scale + g.top,
    );
    // Front-most first: the shapes are in back-to-front paint order.
    for (final shape in g.shapes.reversed) {
      for (final face in shape.faces.reversed) {
        if (face.path.contains(v)) return shape.index;
      }
    }
    return null;
  }

  KeyEventResult _key(KeyEvent e) {
    if (e is KeyUpEvent) return KeyEventResult.ignored;
    final step = {
      LogicalKeyboardKey.arrowRight: 7,
      LogicalKeyboardKey.arrowLeft: -7,
      LogicalKeyboardKey.arrowDown: 1,
      LogicalKeyboardKey.arrowUp: -1,
    }[e.logicalKey];
    if (step == null) return KeyEventResult.ignored;
    final cells = widget.cells;
    final live = [
      for (var i = 0; i < cells.length; i++)
        if (cells[i].value != null && (_geo?.byIndex.containsKey(i) ?? false))
          i,
    ];
    if (live.isEmpty) return KeyEventResult.handled;
    final cur = _selected.value;
    final next = cur == null ? live.last : cur + step;
    if (live.contains(next)) _selected.value = next;
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final palette = SkylinePalette.of(context, card: widget.card);
    final text = Theme.of(context).textTheme;
    final scaler = MediaQuery.textScalerOf(context);
    final labelPx = math.max(_minLabelPx, scaler.scale(_minLabelPx));
    final small = TextStyle(
      fontSize: _minLabelPx,
      color: palette.muted,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

    return LayoutBuilder(
      builder: (context, box) {
        final avail = box.maxWidth.isFinite ? box.maxWidth : _maxWidthPx;
        final narrow = avail < _narrowPx;
        final geo = _geometry(palette, labelPx, narrow);
        final frame = _frameFor(geo, avail, labelPx);
        final total = widget.cells.isEmpty ? 0 : widget.cells.last.week + 1;
        final nw = widget.narrowWeeks;
        final cut = narrow && nw != null && nw < total;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SegmentedButton<SkylineView>(
                  showSelectedIcon: false,
                  style: const ButtonStyle(
                    visualDensity: VisualDensity.compact,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  segments: const [
                    ButtonSegment(value: SkylineView.threeD, label: Text('3D')),
                    ButtonSegment(value: SkylineView.grid, label: Text('Grid')),
                  ],
                  selected: {_view},
                  onSelectionChanged: (s) => _setView(s.first),
                ),
                if (cut) Text('Last $nw weeks on this screen', style: small),
              ],
            ),
            const SizedBox(height: 12),
            Semantics(
              container: true,
              image: true,
              label:
                  '${widget.semanticLabel} Use the arrow keys to read each day.',
              child: Focus(
                onKeyEvent: (_, e) => _key(e),
                child: MouseRegion(
                  onHover: (e) =>
                      _selected.value = _hit(geo, frame, e.localPosition),
                  onExit: (_) => _selected.value = null,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTapDown: (d) =>
                        _selected.value = _hit(geo, frame, d.localPosition),
                    child: RepaintBoundary(
                      child: CustomPaint(
                        size: Size(frame.width, frame.height),
                        painter: _SkylinePainter(
                          geo: geo,
                          frame: frame,
                          palette: palette,
                          selected: _selected,
                          progress: _anim,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 12,
              runSpacing: 6,
              children: [
                ValueListenableBuilder<int?>(
                  valueListenable: _selected,
                  builder: (_, i, _) => Semantics(
                    liveRegion: true,
                    child: Text(
                      i == null || i >= widget.cells.length
                          ? _idle
                          : widget.describe(i),
                      style: (text.bodySmall ?? small).copyWith(
                        fontSize: _minLabelPx,
                        color: palette.muted,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
                _Legend(mode: widget.mode, palette: palette, style: small),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({
    required this.mode,
    required this.palette,
    required this.style,
  });

  final SkylineMode mode;
  final SkylinePalette palette;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    Widget swatch(Color c) => Container(
      width: 12,
      height: 12,
      margin: const EdgeInsets.symmetric(horizontal: 1.5),
      decoration: BoxDecoration(
        color: c,
        borderRadius: BorderRadius.circular(3),
      ),
    );
    final hue = mode == SkylineMode.change ? palette.green : palette.rose;
    return ExcludeSemantics(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: mode == SkylineMode.change
            ? [
                swatch(palette.rose),
                Text(' Fell', style: style),
                const SizedBox(width: 8),
                swatch(palette.green),
                Text(' Rose', style: style),
              ]
            : [
                Text('Less ', style: style),
                for (var s = 0; s < _steps.length; s++)
                  swatch(_shade(hue, palette.card, s)),
                Text(' More', style: style),
              ],
      ),
    );
  }
}

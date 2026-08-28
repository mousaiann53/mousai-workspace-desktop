# Mousai Workspace brand assets

The Product Owner supplied the final Mousai Workspace portrait logo on
2026-08-28. It is the product's primary logo and must not be replaced by a
geometric letter or abstract `M` mark.

Visual invariants:

- blue-and-white monochrome palette;
- retro engraving / print-line texture;
- layered long wavy hair;
- thin-frame glasses;
- portrait composition ending near the collarbone.
- rounded-square outer silhouette with transparent corners (21.5% corner
  radius); the rounding changes only the outer mask, not the portrait artwork.

The `1024`, `512`, and `256` PNGs are faithful Lanczos exports from the supplied
square artwork. The `128`, `64`, and `32` PNGs are **derived small-icon
variants**: they retain the same crop and artwork, with only mild contrast and
unsharp-mask compensation for legibility. No geometry or subject matter was
redrawn.

Packaging aliases:

- `../icon.png`: 1024 px master packaging PNG;
- `../icon.ico`: Windows multi-resolution icon (16–256 px);
- `../icon.icns`: macOS icon family;
- `../../public/apple-touch-icon.png`: renderer / notification icon.
- `mousai-workspace-shortcut-v2.ico`: current rounded, versioned Windows
  shortcut icon. The
  distinct filename prevents Explorer from reusing the old executable-icon
  cache after a branding update.

Run `scripts/build-mousai-brand-icons.py` with Pillow to reproduce the PNG,
ICO, ICNS, touch-icon, and shortcut assets from the approved 1024 px master.

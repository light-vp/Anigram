<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Fonts for PNG rendering

`render_scene` draws PNGs with resvg compiled to wasm, which can't see the
system's fonts, so the sheet's typeface ships with the server. These are
[Inter](https://github.com/rsms/inter) 4.1 (Regular, Medium and SemiBold,
the weights the sheet uses), under the SIL Open Font License in `OFL.txt`.

They are cut down to Latin, Greek, punctuation, arrows, maths and common
symbols (about 190 KB each instead of 410 KB). Text outside those ranges
draws as blank in a PNG; the SVG is unaffected. To remake them from the
release's `extras/ttf/` files:

```sh
pip install fonttools
for w in Regular Medium SemiBold; do
  python3 -m fontTools.subset Inter-$w.ttf \
    --unicodes="U+0020-007E,U+00A0-024F,U+0300-036F,U+0370-03FF,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+2600-26FF,U+2700-27BF" \
    --layout-features+=tnum --name-IDs='*' --name-languages='*' \
    --output-file=mcp/fonts/Inter-$w.ttf
done
```

Keep `--name-IDs='*'`: without the typographic family names, Medium and
SemiBold stop being matched as weights of "Inter" and everything draws in
Regular.

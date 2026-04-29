# Huawei PPTX Style Rules

Use this reference after inspecting `assets/slides_ref/` and before writing generation code.

## Visual Language

- Default page background: white.
- Primary accent: Huawei red `C00000`.
- Neutral system: `000000`, `333333`, `595959`, `8C8C8C`, `BFBFBF`, `D9D9D9`, `F2F2F2`, `F7F7F7`, `FFFFFF`.
- Soft emphasis: `FFF1EF`, `FCE4E0`, `E6E6E6`.
- Use thin gray or red outlines; normal line width is `0.5`.
- Avoid decorative gradients, shadows, blobs, ornamental icons, and image-heavy title pages unless the source material requires a real image.

## Typography

| Role | Size | Weight | Notes |
| --- | ---: | --- | --- |
| Page title | 24 | Bold | Chinese viewpoint sentence; must fit on one line |
| First-level card title | 14 | Bold or medium | Usually white text in red card |
| Second-level title | 14 | Medium | Card-internal headings |
| Body | 12 | Regular | Dense Chinese business prose |
| Conclusion / interpretation body | 14 | Regular | Use only for larger conclusion or interpretation boxes |
| KPI / data emphasis | 18 | Regular | Impact allowed for large numbers |
| Footers and compact captions | 6 | Regular | Never below 6 |

Use only 6, 12, 14, 18, and 24 pt. Use no more than five font sizes on one slide, and prefer fewer when the layout is not a dense table or data panel.

## Layout Components

- Page title: top-left, 24 pt, Huawei red, single line, with a red rule underneath.
- Red title card: red fill, white 14 pt title, compact vertical padding.
- Gray content card: light gray fill, 0.5 pt gray outline, 12 pt body.
- Data card: large Impact number, small unit/label, short explanatory line.
- Table: red or dark gray header, light gray alternating rows, 12 pt cell text unless the table is exceptionally dense.
- Bar chart: restrained gray bars with red highlight for the current, risk, or target category.
- Flow: numbered red nodes or red headers connected by 0.5 pt gray arrows.
- Footer: thin gray rule, note/source on left, page number on right.

## Content Density

- One slide can combine a short text panel, a table/chart, and up to four micro-cards if alignment is clean.
- Keep the main argument to three messages or fewer.
- Use red only for section heads, key figures, or decisive conclusions.
- Use gray regions as content structure, not as decorative panels.

## Required Mechanical Constraints

- No animations.
- No transitions.
- No colors with `#` in generation code.
- No 8-digit ARGB/RGBA hex colors.
- No Unicode bullet glyphs.
- Minimum font size is 6 pt.
- Standard line width is 0.5 pt.

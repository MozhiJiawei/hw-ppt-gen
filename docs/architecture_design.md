# Architecture Design

This is the development-time architecture document for the Huawei PPT generation repository. It explains the repository as a system first, then attaches constraints to the architecture elements that own them.

`SKILL.md` is runtime guidance for deck-generation agents. This document is for maintainers and coding agents changing this repository.

## Architectural Goal

The repository turns structured content plans into Huawei-style PPTX decks with deterministic AI execution.

Two invariants define the system:

1. Layout, visual rendering, and text outline are independent architecture elements.
2. Runtime instructions, generation scripts, and verification feedback must stay consistent so agent output is predictable.

## Logical Architecture Elements

This view lists the architectural elements only. It intentionally does not draw relationships; relationships belong in the runtime flow view below.

```text
+----------------------------------------------------------------------------------+
| L1 Runtime Contract / 运行契约层                                                   |
|                                                                                  |
|        +--------------------------+        +-------------------------------+      |
|        | Deck-generation agent    |        | SKILL.md                      |      |
|        | runtime executor         |        | runtime workflow              |      |
|        +--------------------------+        +-------------------------------+      |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| L2 Schema Contract / Schema 契约层                                                 |
|                                                                                  |
|  +--------------------------+  +--------------------------+  +------------------+ |
|  | references/*.md          |  | *_plan.json              |  | Slide schema     | |
|  | semantic/style contracts |  | planned intent           |  | layout+visual+txt| |
|  +--------------------------+  +--------------------------+  +------------------+ |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| L3 Composition / 页面编排层                                                        |
|                                                                                  |
|  +--------------------------+  +--------------------------+  +------------------+ |
|  | addVisualAnchorContent   |  | hw_visual_anchor_slide   |  | PPT text layer   | |
|  | unified content API      |  | Body DSL layout engine    |  | editable notes   | |
|  +--------------------------+  +--------------------------+  +------------------+ |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| L4 Visual Rendering / 视觉渲染层                                                   |
|                                                                                  |
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
  | | Template contract | | hw_diagram_helpers| | Supporting comps  | | Evidence    | |
  | | fixed mapping     | | conceptual visual | | tables/cards      | | source image| |
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| L5 Artifact / 产物层                                                               |
|                                                                                  |
|        +--------------------------+ +--------------------------+ +-------------+  |
|        | PPTX output              | | visual manifest          | | PNG evidence|  |
|        | generated deck           | | rendered anchor evidence | | COM render  |  |
|        +--------------------------+ +--------------------------+ +-------------+  |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| L6 Verification / 验证层                                                           |
|                                                                                  |
|        +--------------------------+        +-------------------------------+      |
|        | Runtime feedback         |        | Development smoke tests       |      |
|        | compile/layout/render    |        | scripts/smoke/*.js           |      |
|        +--------------------------+        +-------------------------------+      |
+----------------------------------------------------------------------------------+
```

The system is intentionally layered:

- L1 tells the agent how to work at runtime.
- L2 defines the schemas and records planned intent.
- L3 composes Huawei pages and keeps layout, visual anchors, and text outline separate.
- L4 owns visual-anchor validation and implementation-owned output handling.
- L5 stores generated artifacts and render evidence.
- L6 verifies that the artifacts match the plan and contracts.

Dependencies flow downward during generation and back into L6 during verification. Lower layers must not invent semantics that belong to upper layers. Upper layers must not bypass lower-layer evidence and render inspection.

## Runtime Flow View

This view shows the main runtime relationship. It deliberately omits most internal elements so the logical element view remains readable.

```mermaid
flowchart LR
  skill["SKILL.md"]
  refs["references/*.md"]
  plan["plan.json"]
  schema["slide schema"]
  compose["addVisualAnchorContentSlide"]
  render["visual output"]
  artifacts["PPTX + manifest + PNG"]
  verify["compile/layout/render feedback + smoke"]

  skill --> refs
  refs --> plan
  refs --> schema
  plan --> compose
  schema --> compose
  compose --> render
  compose --> artifacts
  render --> artifacts
  artifacts --> verify
  plan --> verify
```

## Architecture Elements

### Runtime Workflow

Owned by:

- `SKILL.md`

Responsibility:

- tell a deck-generation agent how to research, plan, generate, export, review, and inspect a deck;
- define the runtime sequence an agent follows;
- avoid development-only explanations.

Constraints:

- `SKILL.md` should not be the primary home for architecture rationale.
- If runtime behavior changes, update `SKILL.md` only after the reference contract, implementation, feedback producers, and smoke coverage are aligned.

### Reference Contracts

Owned by:

- `references/delivery_standard.md`
- `references/page_standards.md`
- `references/brief_contract.md`
- `references/skeleton_plan_schema.md`
- `references/slide_dsl_authoring_schema.md`
- `references/layout_standards.md`
- `references/evidence_schema.md`
- `references/generated_visual_schema.md`

Responsibility:

- define the delivery standard a generated deck must satisfy;
- define immutable brief fields and how brief evidence is consumed;
- define page, layout, evidence, and generated-visual schemas;
- keep runtime-facing rules separate from implementation details and test fixtures.
- document the skeleton/frame plan separately from creative body-content authoring.
- document Body DSL as the AI-facing creative body authoring surface and native component model.

Constraints:

- reference docs must describe schema and quality standards, not implementation shortcuts;
- evidence visuals and generated visuals are separate contracts;
- visual templates are semantic categories, not renderer-specific categories;
- new schema fields require matching implementation and feedback/smoke support;
- smoke fixtures such as `scripts/smoke/fixtures/visual_diagram_test_cases.js` are development assets, not runtime references.

### Deck Plan

Owned by:

- `.tmp/<deck>/<deck>_plan.json`
- generation scripts that write the plan

Responsibility:

- record what the agent intended to render;
- record every content slide's real visual anchors and supporting components with relevant semantic reasons.

Constraints:

- output handling is implementation-owned and must not be recorded as plan configuration;
- plan must record all real visual anchors and supporting components on a slide, not only the first rendered object;
- plan and manifest must be comparable by `id`, `kind`, and `template`.

### Skeleton Plan

Owned by:

- `references/skeleton_plan_schema.md`
- `scripts/pptx/hw_ppt_skeleton.js`
- `scripts/pptx/skeleton/page_skeleton.js`

Responsibility:

- record the mechanical frame/chrome fields needed to render a blank-body Huawei deck skeleton;
- preserve cover, contents, section tags, title, title note, analysis summary, footer source, and page number;
- leave creative body content to later body-authoring layers.

Constraints:

- skeleton plan owns only the fields proven by `scripts/smoke/test_ppt_skeleton_rendering.js`;
- body content, evidence inventory, reference images, visual anchors, supporting components, delivery constraints, and body slot coordinates are outside skeleton plan scope;
- skeleton rendering must route summary/content pages through the same content-slide entrypoint while suppressing body rendering.

### Slide Schema

Owned by:

- deck-specific generation scripts;
- `bodyDsl` compiled through `scripts/pptx/dsl/*`;
- fixed body layout data resolved from Body DSL before rendering;

Responsibility:

- combine layout selection, visual anchors, supporting components, and text outline into a page-level data structure.

The slide schema has three independent substructures:

1. `bodyDsl`: web-like body tree, layout family, modules, components, and editable text.
2. `visual_anchor`: evidence or diagram/chart that acts as the page/module's visual proof.
3. `supporting_component`: structured readout/compression such as KPI cards, tables, capability matrices/stacks, or heatmaps.
4. text fields: summary, captions, legends, source notes, interpretation, and conclusions.

Constraints:

- the DSL root layout chooses where content goes;
- visual anchors choose what evidence or diagram relationship anchors the module;
- supporting components structure secondary readouts but do not satisfy visual-anchor requirements;
- text fields explain the slide and remain editable PPT text;
- do not put captions, source notes, reading guidance, or conclusions under `visual_anchor.visual_spec`.

### Body DSL

Owned by:

- `references/slide_dsl_authoring_schema.md`
- `references/generated_dsl_component_catalog.md`
- `scripts/pptx/dsl/*`

Responsibility:

- expose a web-like tree authoring surface for the creative body region;
- register discoverable components with AI visibility, maturity, layout-intent constraints, budget hints, alternatives, and repair hints;
- validate component props before rendering;
- resolve DSL nodes against registry contracts before measurement and rendering.

Constraints:

- Body DSL owns only the body region below the fixed skeleton/frame chrome;
- `bodyDsl` is the only accepted creative body input to `addVisualAnchorContentSlide`;
- component discovery must hide internal atoms from the default AI index;
- layout intent is limited to registered props such as `align`, `valign`, `fit`, `density`, `priority`, `maxLines`, and `maxItems`;
- Body DSL must reject arbitrary style objects, page coordinates, raw width/height percentages, z-index, and manual margins/padding;
- source evidence must enter through Evidence components and preserve aspect ratio;
- supporting components remain secondary readouts and must not satisfy the real visual-anchor requirement;
- `Visual(draw, model)` is an official escape hatch for existing registered draw functions, not arbitrary dynamic code in this step;
- the resolved DSL tree is an internal parser/typechecker result, not a separate plan layer.

### Body DSL Layout Engine

Owned by:

- `scripts/pptx/contracts/visual_templates.js`
- `scripts/pptx/contracts/body_layout_types.js`
- `scripts/pptx/hw_visual_anchor_slide.js`
- `scripts/pptx/layout/*`

Responsibility:

- define the shared kind/template, supporting-component, renderer-path, measurement-support, resize-policy, and Body DSL layout family facts used by renderer, planner, feedback producers, and smoke tests;
- create Huawei content pages;
- apply fixed Body DSL layout families such as `two_column`, `biased_column`, `three_column`, and `four_column`;
- classify body-content blocks into Huawei layout primitives;
- measure primitive minimum, preferred, and maximum useful sizes before rendering;
- allocate module-internal boxes and record diagnostics;
- place module blocks;
- invoke visual rendering for `visual_anchor` and `supporting_component` blocks through the same implementation path;
- keep official body-content primitives backed by PowerPoint COM measurement; non-COM height estimates are not accepted as layout measurement input;
- write manifest entries for rendered visual anchors and supporting components.

Constraints:

- contract modules are the code-level source of truth; renderer, feedback producers, and tests should import them instead of copying official template/layout lists;
- Body DSL layout is a container, not a visual-template layer;
- allowed blocks are layout/text blocks, `visual_anchor` blocks, and `supporting_component` blocks;
- do not add layout-specific visual roles such as `image_text`, `metric_row`, `mini_card_grid`, or `sectioned_card_grid`;
- if a module needs multiple visuals, supporting readouts, and text fragments, represent them as multiple `visual_anchor`, `supporting_component`, and `text` blocks;
- source images must enter through `Evidence`, not a direct image block.
- primitive diagnostics may explain a layout decision, but they must not become a second rendering path.
- `legacy_fallback` and `unsupported` are hard failures in strict Body DSL layout; they are not accepted render-success states.

### Visual Output

Owned by:

- `scripts/pptx/contracts/visual_templates.js`
- `scripts/pptx/hw_diagram_helpers.js`

Responsibility:

- validate visual-anchor specs;
- route each semantic template through its fixed implementation;
- render conceptual anchors, evidence anchors, and supporting components through their fixed handling.

Constraints:

- implementation routing is not part of the model-facing visual spec;
- never accept slide-level, module-level, or anchor-level output overrides;
- generated visuals must contain only relationship-native content such as labels, axes, values, nodes, and edges;
- `Quantity/data_cards`, generated `heatmap`, `Matrix/table`, `Matrix/capability_matrix`, and `Hierarchy/capability_stack` are supporting components, not visual anchors;
- page-level prose remains outside `visual_spec`;
- generated image placement preserves aspect ratio and uses contain placement;
- do not silently substitute one template implementation for another to pass PowerPoint export.

### PPT Text Layer

Owned by:

- `scripts/pptx/hw_visual_anchor_slide.js`
- `scripts/pptx/hw_pptx_helpers.js`

Responsibility:

- render titles, section tabs, analysis summaries, captions, legends, source notes, interpretation text, and footers as editable PPT text.

Constraints:

- text that explains the visual belongs here, not inside `visual_spec`;
- visual captions and source notes must remain visible to review/export inspection;
- text layer may surround and explain visuals but must not become an untracked visual renderer.

### Manifest

Owned by:

- `writeVisualAnchorManifest`
- `pptx._hwVisualAnchorManifest`

Responsibility:

- record every rendered visual anchor and supporting component;
- capture page, id, kind, template, renderer, render status, image dimensions, visual slot, image area, and layout metadata.

Constraints:

- every正文内容页 must have at least one manifest-backed rendered real visual anchor; supporting components alone are insufficient;
- dense pages may have multiple manifest entries;
- manifest must be sufficient for review tooling to prove the implementation matched the plan.

### Feedback Contract

Owned by:

- `scripts/pptx/feedback/*`

Responsibility:

- define the shared `FeedbackIssue` shape used by compile, layout, and render producers;
- normalize existing diagnostics without moving validation rules into the reporter;
- provide agent-readable JSON and Markdown reports with target, detail, and repair context.

Constraints:

- feedback is a cross-layer data contract, not a separate verification subsystem;
- lower layers may emit or normalize feedback issues, but they must not depend on retired rule sets;
- reporters must not become a second rule engine; producers remain responsible for detecting problems;
- feedback targets should preserve the most specific available location, such as slide, module, block, component id, or schema path.

### Smoke Tests

Owned by:

- `scripts/smoke/*.js`
- `package.json` scripts

Responsibility:

- preserve architecture contracts during development;
- generate regression decks for visual-anchor templates;
- exercise PowerPoint COM export;
- verify helper export surfaces and compile/layout/render contracts.

Constraints:

- when a schema or visual-anchor rule changes, smoke tests must change in the same commit;
- template output paths need coverage when visual-anchor behavior changes;
- PowerPoint COM failures should reveal implementation or environment problems, not trigger silent output substitution.

## Core Data Flow

```mermaid
flowchart LR
  Layout["bodyDsl layout\npage shape + modules + components"]
  VisualSpec["visual_anchor\nevidence + diagram/chart"]
  SupportSpec["supporting_component\ncards + tables + grids"]
  TextOutline["text outline\nsummary + captions + notes"]
  RenderedPage["PPT content page"]
  ManifestEntry["manifest entries"]
  VerifyCompare["verification comparison"]

  Layout --> RenderedPage
  VisualSpec --> RenderedPage
  SupportSpec --> RenderedPage
  TextOutline --> RenderedPage
  VisualSpec --> ManifestEntry
  SupportSpec --> ManifestEntry
  RenderedPage --> ManifestEntry
  Layout --> ManifestEntry
  ManifestEntry --> VerifyCompare
  TextOutline --> VerifyCompare
```

The three inputs are independent:

- Body DSL layout tags must not carry visual semantics.
- `visual_anchor` must not carry page explanation prose.
- `supporting_component` must not be used as proof that the page has a visual anchor.
- text outline must not bypass visual-anchor evidence.

## Visual Output Flow

```mermaid
flowchart TB
  Anchor["visual_anchor"]
  Evidence["Evidence"]
  Support["supporting_component"]
  EditableTemplates["Editable-output templates"]
  ImageTemplates["Image-output templates"]
  ImageOutput["image output"]
  EditableOutput["editable PPT output"]
  Manifest["manifest"]

  Anchor --> Evidence
  Anchor --> EditableTemplates
  Anchor --> ImageTemplates
  Support --> EditableTemplates
  Evidence --> Manifest
  EditableTemplates --> EditableOutput
  ImageTemplates --> ImageOutput
  ImageOutput --> Manifest
  EditableOutput --> Manifest
```

Output constraints attach to this flow:

- `Evidence` is source-backed evidence handling.
- `supporting_component` is the fixed handling path for structured readouts such as `Quantity/data_cards`, generated `heatmap`, `Matrix/table`, `Matrix/capability_matrix`, and `Hierarchy/capability_stack`.
- all anchors and supporting components follow the fixed output path mapped from their semantic template.
- no slide, layout, or anchor can override output handling.

## Table Boundary

Tables are supporting components, not general page-level helpers and not visual anchors.

Architecture rule:

- if a generated/transcribed table appears on a正文内容页 and carries comparison, judgment, or a structured claim, it must be represented as a `supporting_component` using `kind = "Matrix"` and `template = "table"`;
- the native table implementation is an internal rendering detail of that supporting-component template;
- page schemas must not expose table drawing as a standalone layout helper.

This prevents native table drawing from becoming a bypass around plan, manifest, and verification feedback.

## Image Boundary

Images are not a general page-level helper.

Architecture rule:

- source figures, screenshots, and charts must be `Evidence` anchors;
- generated diagram output may be inserted as an image only as the final artifact of a visual anchor;
- direct image roles such as `image_text` are not allowed in Body DSL layout.

This prevents image placement from bypassing semantic anchors and source tracking.

## Consistency Contract

The repository has three surfaces that must remain consistent:

1. runtime instructions in `SKILL.md`;
2. implementation in `scripts/pptx/*`;
3. enforcement in compile/layout/render producers and `scripts/smoke/*`.

When changing behavior:

- update references so the schema is explicit;
- update generation helpers so the schema renders;
- update compile/layout/render feedback producers so bad output fails early where possible;
- update smoke tests so the contract stays protected;
- update `SKILL.md` only when the runtime workflow changes.

Do not merge changes where only the script works but the skill still asks for old behavior, or where runtime instructions and smoke coverage disagree.

## Recent Architecture Drift Patterns

These are concrete drift patterns this repository should avoid:

- layout shortcut becomes visual semantics: `image_text`, `metric_row`, or mini-grid roles in Body DSL layout;
- structured readout becomes fake anchor: `data_cards`, `Matrix/table`, `capability_matrix`, `capability_stack`, or generated `heatmap` is used to satisfy visual-anchor requirements;
- visual-anchor bypass: part of the visual is drawn through untracked helper calls;
- silent fallback: one template implementation quietly substitutes another to pass PowerPoint export;
- first-anchor-only checks: multi-anchor pages validate only the first manifest entry;
- unbounded helper exposure: low-level drawing helper becomes a schema-level escape hatch;
- runtime docs carry development principles while `AGENTS.md` and `docs/` stay silent.

## Known Enhancement

Issue [#2](https://github.com/MozhiJiawei/hw-ppt-gen/issues/2) tracks diagram density problems in small two-column and four-column anchors. This should be fixed inside the visual-anchor implementation through compact layouts, padding reduction, or target-size-aware template choices.

It must not be fixed by stretching generated images or bypassing visual anchors with untracked helper fragments.

## Change Checklist

Before merging architecture-sensitive changes, verify:

- the change fits the logical architecture above;
- layout, visual rendering, and text outline remain separate;
- new visual needs use existing `kind` / `template` semantics unless a new semantic template is truly required;
- source images use `Evidence`;
- tables on content pages use `Matrix/table` supporting components;
- visual output handling remains implementation-owned;
- fixed template implementations do not silently substitute for each other;
- plan and manifest cover every visual anchor and supporting component;
- compile/layout/render feedback checks the behavior being introduced where possible;
- smoke tests cover affected visual-anchor templates when relevant;
- PowerPoint COM export remains part of the quality bar;
- PowerPoint COM calls go through the repository broker (`scripts/pptx/powerpoint_com_broker.js` / `.ps1`) so measurement, export, and parallel forward-test agents reuse one serialized desktop COM instance instead of creating, quitting, or racing PowerPoint directly;
- `SKILL.md`, references, scripts, and smoke tests agree.

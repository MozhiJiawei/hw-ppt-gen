---
status: completed
created: 2026-06-02
type: refactor
topic: runtime QA pipeline redesign
---

# Runtime QA Pipeline Redesign Plan

## Problem Frame

The retired QA stack mixed implementation-contract checks, runtime AI-output checks, and final PPTX artifact checks in one rule set. The replacement QA framework should be a runtime diagnostics pipeline that helps generation agents recover from uncertain or incomplete output.

The pipeline follows the runtime flow:

```text
DSL input -> compile -> measure -> layout -> render/export
```

Each page must be evaluated independently. A failure on one page must not prevent diagnostics from being produced for other pages.

---

## Scope Boundary

This plan records the runtime QA redesign. It does not reintroduce the retired `scripts/qa/check_huawei_pptx.js` implementation.

### In Scope

- Runtime diagnostics that detect AI-generated page failures.
- Page-level reports for each pipeline phase.
- DSL-indexed feedback for phases that can trace issues to `bodyDsl`.
- Final render/export checks as a COM/PPTX artifact fallback.
- Compatibility with the old capability inventory in `.tmp/qa_compile_feedback_matrix.utf8bom.csv`.

### Out Of Scope

- Smoke-only compiler contract checks such as "unknown component is rejected" or "manual style props are unsupported".
- Treating implementation source-map failures as AI-output QA failures.
- Requiring render/export artifact checks to always map back to DSL.
- Expanding DSL schema features such as formal font-size configuration as part of the QA framework.

---

## Key Design Principles

- Runtime QA checks AI output, not code correctness. Code contracts belong in smoke tests.
- `compile`, `measure`, and `layout` diagnostics should be DSL-indexed when the relevant page can be compiled far enough to provide a target.
- `render/export` diagnostics are final artifact fallback checks. They may duplicate earlier checks and may report only at slide or deck level.
- Page failures are isolated. One broken page cannot stop diagnostics for the rest of the deck.
- Report location quality explicitly instead of turning missing framework metadata into an AI-facing QA failure.
- The first three layers should follow a compiler-style architecture: source DSL -> DSL AST -> compile IR -> measurement IR -> layout IR.
- Borrow from web development diagnostics where it improves agent repair loops: source maps, code frames, component stacks, DOM-like selectors, box-model inspection, and per-page incremental builds.
- Do not borrow web-style arbitrary CSS, permissive compatibility behavior, silent fallback, or runtime patching. The pipeline should fail loudly and produce repairable diagnostics.

---

## Web-Style Diagnostics Inspiration

The desired developer experience is closer to browser DevTools plus compiler diagnostics than to the old hard-QA rule set.

| Web Development Concept | Runtime QA Equivalent |
|-------------------------|-----------------------|
| Source map | DSL node `sourceSpan`, line, column, selector, and semantic stack |
| Compiler diagnostic | Layer-local issue with code, severity, message, code frame, and repair hint |
| React component stack | `semanticStack`, such as `Columns > Module > EvidenceFigure` |
| DOM selector | Existing JSX-like selector, such as `Slide > TwoColumn:nth-child(1) > Module:nth-child(1)` |
| Virtual DOM | Compile IR with component tree, semantic roles, and visible primitives |
| CSS/layout box model | Layout IR with body, module, block, and final boxes |
| DevTools Elements panel | Page/module/component grouped report view |
| Incremental build | Per-page pipeline execution where one page failure does not block other pages |
| Lighthouse/artifact audit | Render/export fallback checks on PPTX, PNG evidence, render evidence, brief, and visible text |

## Runtime Error Gate

Runtime QA has four delivery gates: DSL input, measurement, layout, and render/export. Every issue with `severity = "error"` is blocking. A generated deck is not acceptable until all error-level issues from all four layers have been repaired and the affected layer plus downstream layers have been rerun cleanly.

Visual review and content review are additive quality checks. They may find additional problems, but they must not waive or downgrade a runtime QA error. DSL-mapped errors should be fixed at the DSL or source-content level; artifact-only render/export errors should be fixed in the produced PPTX/export path.

The design should support IR dumps for debugging, such as:

```text
page_006.dsl-ir.json
page_006.compile-ir.json
page_006.measurement-ir.json
page_006.layout-ir.json
```

These are diagnostics artifacts, not compatibility shims.

---

## High-Level Pipeline

```mermaid
flowchart LR
  PageInput["Page bodyDsl"]
  DslQa["DSL input diagnostics"]
  Compile["Compile"]
  Measure["Measure"]
  Layout["Layout"]
  Render["Render/export fallback"]
  PageReport["Independent page report"]
  DeckReport["Deck summary"]

  PageInput --> DslQa
  DslQa --> Compile
  Compile --> Measure
  Measure --> Layout
  Layout --> Render
  Render --> PageReport
  PageReport --> DeckReport
```

Each page report should carry:

- `pageIndex`
- `pageId` when available
- per-phase status: `passed`, `failed`, or `skipped_due_to_page_dependency`
- phase-local issues
- issue `location_quality`: `dsl_mapped`, `page_only`, or `artifact_only`

---

## DSL Input Layer Decisions

The DSL input layer has one narrow responsibility:

> Check whether AI-generated `bodyDsl` can be consumed by the next measurement and layout stages.

It should not become a broad text-quality, style, or implementation-contract checker.

### Accepted Runtime Checks

| code | Check | Failure Meaning | Target |
|------|-------|-----------------|--------|
| `dsl_page_missing_body` | Content page is missing `bodyDsl`. | The page has no body input for the downstream pipeline. | Page-level |
| `dsl_body_not_compilable` | `bodyDsl` cannot compile into a render model. | The AI-generated body input cannot be consumed by measure/layout. | DSL target when available, otherwise page-level |
| `dsl_real_anchor_missing` | Compiled body has no real visual anchor. | The page lacks the core visual object required by downstream visual measurement/layout. | DSL layout/root target |
| `dsl_source_trace_missing` | Real anchor lacks required traceability such as `id`, `source`, or `claim`. | Render evidence cannot establish a reliable evidence chain. | DSL component target |

### Explicitly Excluded From Runtime DSL QA

| Excluded Item | Owner |
|---------------|-------|
| Unknown components, illegal props, illegal child structure, enum/range rejection details | Smoke tests and compiler contract tests |
| Forbidden manual layout/style props such as `style`, `x`, `y`, `w`, `h`, `margin`, `padding`, `zIndex` | Smoke tests and compiler contract tests |
| Missing `selector`, `semanticStack`, or `sourceComponent` in compiler output | Smoke tests and diagnostics contract tests |
| Font size, font face, color, and line width allowlists | Render/export fallback or future DSL schema design |
| Placeholder text, language quality, and broad text semantics | Later layer decision, not part of "can downstream consume this page" |
| Text overflow, text wall, density, readable area | Measure/layout layers |

---

## Measurement Layer Decisions

The measurement layer has one narrow responsibility:

> Check whether every visible primitive compiled from DSL is covered by a trustworthy PowerPoint-backed measurement result that corresponds to the DSL input.

It should not judge final layout quality. It should not decide whether a visual is ultimately too small, whether a table is too dense after allocation, or whether text forms a wall. Those are layout or render/export fallback concerns.

### Accepted Runtime Checks

| code | Check | Failure Meaning | Target |
|------|-------|-----------------|--------|
| `measure_component_unmeasured` | A visible DSL-compiled component/block has no corresponding measurement result. | The layout phase would not have dimensions for a component the AI authored. | DSL component/block target |
| `measure_component_unmeasurable` | A component enters an `UNSUPPORTED` or `LEGACY_FALLBACK` measurement path. | The compiled DSL component cannot be consumed by the current measurement system. | DSL component/block target |
| `measure_component_mismatch` | The measurement record does not match the DSL primitive by component id, block type, kind, or template. | Measurement may be describing a different object than the DSL component that layout will place. | DSL component/block target |
| `measure_powerpoint_failed` | A measurable primitive fails PowerPoint COM measurement. | Runtime measurement could not obtain reliable PowerPoint-backed bounds. | DSL component/block target when available |
| `measure_bounds_invalid` | PowerPoint measurement returns missing, zero, negative, NaN, or otherwise unusable text/shape bounds. | Measurement output cannot be trusted as layout input. | DSL component/block target when available |

### Explicitly Excluded From Runtime Measurement QA

| Excluded Item | Owner |
|---------------|-------|
| Whether `minSize`, `preferredSize`, `maxUsefulSize`, and `resizePolicy` are always present for official primitives | Smoke tests and measurement contract tests |
| The exact min/preferred/max sizing and resize policy strategy | Future design discussion |
| Evidence final box below readable floor | Layout layer |
| Table/KPI/capability final density after allocation | Layout layer or render/export fallback |
| Text wall, block gaps, module fill, and column alignment | Layout layer |
| Font size, font face, color, line width, animation, transition | Render/export fallback |

### Deferred Measurement Design Topic

The sizing strategy for `minSize`, `preferredSize`, `maxUsefulSize`, and `resizePolicy` remains intentionally deferred. The current plan only requires runtime QA to prove measurement coverage, consistency, and trustworthy bounds. It does not yet define how min/max scaling policy should be changed or validated.

---

## Layout Layer Decisions

The current implementation has only a module-level independent layout result from `layoutModuleStack()`. Page-level layout information is still produced while rendering in `scripts/pptx/hw_visual_anchor_slide.js`. Because the layout algorithm is expected to change substantially, the first runtime layout QA should stay thin.

The layout layer should check two stable concerns:

1. whether measured components received valid final boxes that render can consume;
2. whether style facts that are about to be rendered are already known to violate Huawei constraints, while DSL/component context is still available.

Style checks are intentionally duplicated with final render/export checks. The layout layer preserves DSL semantics and repair location; the final layer proves the PPTX/COM artifact really matches the style contract.

### Accepted Runtime Checks

| code | Check | Failure Meaning | Target |
|------|-------|-----------------|--------|
| `layout_page_infeasible` | A page/module layout status is `infeasible`, `unsupported`, or `legacy_fallback`. | The measured page cannot produce a safe layout for rendering. | Page/module target, plus DSL block target when available |
| `layout_component_unplaced` | A compiled and measured visible component has no final box. | The AI-authored component would disappear from render output. | DSL component/block target |
| `layout_box_invalid` | A final box is missing, NaN, negative, or has zero width/height. | Render cannot safely consume the final allocation. | DSL component/block target |
| `layout_component_out_of_bounds` | A final box is substantially outside the module body or page body bounds. | Rendered content will escape the body region. | DSL component/block target |
| `layout_text_does_not_fit` | Measured text height/width cannot fit the final text box after allowed shrink behavior. | Text is known to overflow before final PPTX export. | DSL text component/block target |
| `layout_text_font_size_invalid` | A text block's resolved font size is outside the Huawei allowlist. | The component is about to render non-compliant text size. | DSL text component/block target |
| `layout_text_font_face_invalid` | A text block's resolved font face is outside the allowed font set. | The component is about to render non-compliant text face. | DSL text component/block target |
| `layout_text_color_invalid` | A text block's resolved color is outside the allowed palette or uses 8-digit ARGB. | The component is about to render non-compliant text color. | DSL text component/block target |
| `layout_shape_color_invalid` | A shape/frame/supporting component fill or line color is outside the allowed palette or uses 8-digit ARGB. | The component is about to render non-compliant shape color. | DSL component/block target when available |
| `layout_line_width_invalid` | A resolved line width is not the standard value. | The component is about to render non-compliant stroke width. | DSL component/block target when available |

### Explicitly Excluded From Runtime Layout QA For Now

| Excluded Item | Owner |
|---------------|-------|
| Precise module top/bottom alignment thresholds | Future layout algorithm design |
| Block gap aesthetics | Future layout algorithm design |
| Text wall/readability density beyond direct fit failure | Future layout algorithm design or render/export fallback |
| Evidence final readable floor and table/KPI final density thresholds | Future min/max sizing strategy discussion |
| Fixed title, summary, and section chrome drift | Render/export fallback unless body layout directly causes the violation |

---

## Render / Export Fallback Layer Decisions

The final quality layer has one narrow responsibility:

> Check the real PPTX / COM export artifacts for hard delivery failures.

This layer is intentionally not DSL-indexed. It reports at deck, slide, or artifact level only. It may duplicate earlier DSL/measurement/layout checks, but it must not add source-map or DSL backtracking complexity.

### Accepted Runtime Checks

| code | Check | Failure Meaning | Target |
|------|-------|-----------------|--------|
| `render_evidence_missing` | Required PNG export directory or render evidence is missing. | There is no final COM/export evidence for delivery review. | Artifact-level |
| `render_evidence_incomplete` | Exported PNG count does not match PPT slide count. | COM export evidence is incomplete. | Artifact-level |
| `render_animation_forbidden` | PPTX XML contains animation timing/anim nodes. | Final deck contains forbidden animation. | Deck/slide-level |
| `render_transition_forbidden` | PPTX XML contains slide or presentation transition nodes. | Final deck contains forbidden transitions. | Deck/slide-level |
| `render_text_style_invalid` | PPTX XML text runs contain invalid font size, font face, color, or 8-digit ARGB. | Final text style violates Huawei delivery constraints. | Slide-level |
| `render_shape_style_invalid` | PPTX XML shapes contain invalid fill color, line color, or line width. | Final shape style violates Huawei delivery constraints. | Slide-level |
| `render_visual_evidence_invalid` | Render evidence is missing, structurally invalid, or contains unrendered entries. | Final visual evidence chain is incomplete. | Artifact/slide-level |
| `render_visual_evidence_mismatch` | Render evidence and plan disagree on id, kind, template, or renderer. | Final rendered visuals do not match planned visual evidence. | Slide-level |
| `render_placeholder_present` | Visible text contains TODO, TBD, Lorem, `待补充`, `XX`, or similar placeholders. | Final deck still contains unfinished content. | Slide-level |
| `render_brief_visible_text_mismatch` | Required brief-backed title, title note, section, summary, or TOC text is missing/mismatched in visible text. | Final deck content does not match the delivery brief. | Slide-level |

### Explicitly Excluded From Render / Export Fallback QA For Now

| Excluded Item | Owner |
|---------------|-------|
| DSL source mapping or component-level traceback | Earlier pipeline layers |
| Large-shape overlap and sparse-card aesthetics | Future final-quality expansion |
| English/CJK language ratio rules | Future content-quality discussion |
| Fixed chrome drift thresholds for title, summary, and section indicator | Future final-quality expansion |
| Image contain area / aspect-ratio precision checks | Future render/image evidence expansion |
| Highlight explanation and score-basis visible explanation | Future semantic-quality discussion |

---

## Smoke Testing Strategy

Smoke tests are not runtime QA. Runtime QA diagnoses AI-generated deck failures; smoke tests prove that the QA framework, IR artifacts, checks, reports, and supporting implementation are correct.

The smoke suite should cover three levels:

| Level | Purpose |
|-------|---------|
| Contract smoke | Prove IR, source mapping, report shape, and serialization contracts are stable. |
| Rule smoke | Prove each runtime QA code has deterministic positive/negative coverage. |
| Integration smoke | Prove page isolation and cross-layer pipeline behavior across representative deck inputs. |

### Coverage Objects

| Object | Smoke Should Prove |
|--------|--------------------|
| DSL parser/source map | JSX-like DSL produces stable AST, selectors, source spans, and semantic stacks. |
| Compile IR | Compiled IR is serializable and contains the expected visible primitives, ids, kind/template facts, and source trace. |
| DSL input runtime checks | Only the accepted DSL input runtime codes are emitted; compiler-contract details remain nested under `dsl_body_not_compilable`. |
| Measurement IR | Every visible primitive has a comparable measurement identity and measurement record. |
| Measurement runtime checks | Unmeasured, unmeasurable, mismatched, COM-failed, and invalid-bound cases are detected. |
| Layout IR | Layout output records module/block final boxes, status, diagnostics, and style facts needed by checks. |
| Layout runtime checks | Infeasible, unplaced, invalid-box, out-of-bounds, text-fit, and style preflight cases are detected. |
| Render/export runtime checks | Artifact-level checks report deck/slide/artifact targets and never require DSL mapping. |
| Page isolation | A failure on one page does not prevent reports for other pages. |
| Report contract | JSON/Markdown reports preserve phase, code, page, target, location quality, details, and repairs. |
| No legacy QA references | Retired QA entrypoints and rule files are not imported or invoked. |
| Final integration | A minimal deck pipeline can produce page reports plus final artifact reports. |

### Proposed Test Layout

```text
scripts/smoke/qa/
  fixtures/
    dsl_pages.js
    compile_ir_fixtures.js
    measurement_ir_fixtures.js
    layout_ir_fixtures.js
    artifact_fixtures.js

  test_dsl_source_map_contract.js
  test_compile_ir_contract.js
  test_dsl_input_runtime_checks.js
  test_measurement_ir_contract.js
  test_measurement_runtime_checks.js
  test_layout_ir_contract.js
  test_layout_runtime_checks.js
  test_render_export_runtime_checks.js
  test_runtime_pipeline_page_isolation.js
  test_runtime_report_contract.js
  test_no_legacy_qa_references.js
```

### Smoke Testing Principles

- Every runtime QA code needs at least one deterministic failing fixture.
- IR contract tests should fail before downstream rule tests become confusing.
- Most measurement-rule tests should use constructed Measurement IR fixtures; only a small number should require actual PowerPoint COM.
- Render/export checks should use minimal artifact fixtures where possible instead of regenerating large decks.
- Smoke tests should check whether diagnostics are accurate and stable, not whether an AI-generated deck is aesthetically good.

---

## Implementation Units

- U1. **Page-Level Diagnostics Runner**

**Goal:** Run DSL input, compile, measure, layout, and render/export diagnostics per page without cross-page failure propagation.

**Requirements:** page isolation, phase status, deck summary aggregation.

**Files:**
- Create: `scripts/pptx/qa/runtime_pipeline.js`
- Test: `scripts/smoke/qa/test_runtime_pipeline_page_isolation.js`

**Approach:**
- Accept a deck/page model and produce page reports.
- Catch page-local exceptions and continue other pages.
- Mark downstream phases as `skipped_due_to_page_dependency` only for the affected page.

**Test scenarios:**
- Error path: page 2 has uncompilable DSL while pages 1 and 3 still produce reports.
- Integration: deck summary includes all page reports and aggregates issue counts by phase.

---

- U2. **DSL Input Runtime Checks**

**Goal:** Implement the four accepted DSL input diagnostics and keep compiler-contract details nested under `dsl_body_not_compilable`.

**Requirements:** `dsl_page_missing_body`, `dsl_body_not_compilable`, `dsl_real_anchor_missing`, `dsl_source_trace_missing`.

**Files:**
- Create: `scripts/pptx/qa/dsl_input_checks.js`
- Modify: `scripts/pptx/dsl/compile_slide_dsl.js` only if needed to expose existing compile issues cleanly.
- Test: `scripts/smoke/qa/test_dsl_input_runtime_checks.js`

**Approach:**
- Reuse `parseSlideBodyDsl` / `compileSlideDsl` behavior instead of duplicating compiler rules.
- Preserve compiler issue details under the body-not-compilable report.
- Do not promote illegal prop or unknown component details into separate runtime QA codes.

**Test scenarios:**
- Error path: missing `bodyDsl` creates `dsl_page_missing_body`.
- Error path: bad DSL creates one `dsl_body_not_compilable` runtime issue with nested compiler details.
- Error path: supporting-only DSL creates `dsl_real_anchor_missing`.
- Error path: anchor without traceability creates `dsl_source_trace_missing`.

---

- U3. **Diagnostics Report Shape**

**Goal:** Define a shared runtime QA issue/report shape that supports DSL-style locations without making source-map completeness a runtime QA failure.

**Requirements:** phase, page, code, severity, target, details, repairs, location quality.

**Files:**
- Modify: `scripts/pptx/feedback/feedback_issue.js`
- Modify: `scripts/pptx/feedback/feedback_reporter.js`
- Test: `scripts/smoke/qa/test_runtime_feedback_report_shape.js`

**Approach:**
- Extend the feedback contract enough for runtime QA reports.
- Add `location_quality` values such as `dsl_mapped`, `page_only`, and `artifact_only`.
- Keep missing location metadata as report metadata, not an AI-facing QA failure.

**Test scenarios:**
- Happy path: DSL-mapped issue includes selector/semantic stack.
- Edge case: page-only issue remains valid.
- Edge case: artifact-only issue remains valid for render/export checks.

---

- U4. **Measurement Coverage And Consistency Checks**

**Goal:** Add runtime measurement diagnostics that prove every visible DSL primitive has a corresponding trustworthy measurement record.

**Requirements:** `measure_component_unmeasured`, `measure_component_unmeasurable`, `measure_component_mismatch`, `measure_powerpoint_failed`, `measure_bounds_invalid`.

**Files:**
- Create: `scripts/pptx/qa/measurement_checks.js`
- Modify: `scripts/pptx/layout/measure_primitives.js` only if needed to expose measurement records without duplicating measurement logic.
- Test: `scripts/smoke/qa/test_measurement_runtime_checks.js`

**Approach:**
- Treat the compiled render model as the source of expected visible primitives.
- Treat measurement output as the observed set.
- Compare by stable DSL metadata and primitive identity such as component id, block type, kind, and template.
- Surface PowerPoint COM measurement failures as runtime measurement issues.
- Keep min/preferred/max sizing-policy completeness in smoke tests, not runtime QA.

**Test scenarios:**
- Error path: a compiled primitive without a measurement record reports `measure_component_unmeasured`.
- Error path: unsupported or legacy fallback primitive reports `measure_component_unmeasurable`.
- Error path: measurement record with mismatched component id or template reports `measure_component_mismatch`.
- Error path: COM measurement failure reports `measure_powerpoint_failed`.
- Error path: invalid bounds report `measure_bounds_invalid`.

---

- U5. **Thin Layout Runtime Checks**

**Goal:** Add stable runtime layout diagnostics without overfitting to the current layout algorithm.

**Requirements:** geometry consumability checks plus pre-render style compliance checks.

**Files:**
- Create: `scripts/pptx/qa/layout_checks.js`
- Modify: `scripts/pptx/hw_visual_anchor_slide.js` only if needed to expose layout records before render-side evidence collection.
- Test: `scripts/smoke/qa/test_layout_runtime_checks.js`

**Approach:**
- Use `layoutModuleStack()` and the current `moduleLayout` / `layoutInfo` records as the initial observed layout source.
- Compare measured visible primitives against final block areas.
- Validate final boxes for existence, numeric validity, and body-bound containment.
- Resolve text/shape style facts at the point where DSL/component context is still available.
- Keep final PPTX XML style checks in the render/export layer as a duplicate artifact fallback.

**Test scenarios:**
- Error path: infeasible module layout reports `layout_page_infeasible`.
- Error path: measured primitive without final area reports `layout_component_unplaced`.
- Error path: invalid or out-of-bounds area reports `layout_box_invalid` or `layout_component_out_of_bounds`.
- Error path: measured text taller than final text box reports `layout_text_does_not_fit`.
- Error path: invalid resolved font size, font face, text color, shape color, or line width reports the matching style issue with DSL target when available.

---

- U6. **Render / Export Fallback Checks**

**Goal:** Add deck/slide/artifact-level final quality diagnostics without DSL mapping.

**Requirements:** `render_evidence_missing`, `render_evidence_incomplete`, `render_animation_forbidden`, `render_transition_forbidden`, `render_text_style_invalid`, `render_shape_style_invalid`, `render_visual_evidence_invalid`, `render_visual_evidence_mismatch`, `render_placeholder_present`, `render_brief_visible_text_mismatch`.

**Files:**
- Create: `scripts/pptx/qa/render_export_checks.js`
- Test: `scripts/smoke/qa/test_render_export_runtime_checks.js`

**Approach:**
- Treat PPTX XML, COM-exported PNG files, render evidence, plan, brief, and visible text as artifact inputs.
- Report only deck, slide, or artifact targets.
- Do not attempt DSL/source mapping in this layer.
- Allow intentional duplication of earlier style and render-evidence checks because this layer proves final artifact truth.

**Test scenarios:**
- Error path: missing export directory or render evidence reports `render_evidence_missing`.
- Error path: mismatched PNG count reports `render_evidence_incomplete`.
- Error path: animation or transition XML reports the corresponding forbidden-motion issue.
- Error path: invalid text or shape style in XML reports slide-level style issues.
- Error path: invalid or mismatched render evidence reports artifact-only issues without DSL target.
- Error path: placeholder or brief-visible-text mismatch reports slide-level content issues.

---

- U7. **Smoke Coverage For Runtime QA Framework**

**Goal:** Add a smoke suite that proves the runtime QA framework and its supporting IR/report contracts are correct.

**Requirements:** contract smoke, rule smoke, integration smoke, no-legacy-reference smoke.

**Files:**
- Create: `scripts/smoke/qa/fixtures/dsl_pages.js`
- Create: `scripts/smoke/qa/fixtures/compile_ir_fixtures.js`
- Create: `scripts/smoke/qa/fixtures/measurement_ir_fixtures.js`
- Create: `scripts/smoke/qa/fixtures/layout_ir_fixtures.js`
- Create: `scripts/smoke/qa/fixtures/artifact_fixtures.js`
- Create: `scripts/smoke/qa/test_dsl_source_map_contract.js`
- Create: `scripts/smoke/qa/test_compile_ir_contract.js`
- Create: `scripts/smoke/qa/test_dsl_input_runtime_checks.js`
- Create: `scripts/smoke/qa/test_measurement_ir_contract.js`
- Create: `scripts/smoke/qa/test_measurement_runtime_checks.js`
- Create: `scripts/smoke/qa/test_layout_ir_contract.js`
- Create: `scripts/smoke/qa/test_layout_runtime_checks.js`
- Create: `scripts/smoke/qa/test_render_export_runtime_checks.js`
- Create: `scripts/smoke/qa/test_runtime_pipeline_page_isolation.js`
- Create: `scripts/smoke/qa/test_runtime_report_contract.js`
- Create: `scripts/smoke/qa/test_no_legacy_qa_references.js`
- Modify: `package.json`

**Approach:**
- Put IR shape and report shape under contract tests.
- Put each runtime QA code under at least one deterministic negative fixture.
- Keep COM-dependent tests small and explicit.
- Use constructed IR fixtures for most measurement/layout rule tests.
- Add no-legacy-reference coverage to prevent retired QA code from creeping back in.

**Test scenarios:**
- Contract: DSL source map and semantic stack remain stable for representative JSX-like fixtures.
- Contract: compile, measurement, and layout IR serialize without losing required identity fields.
- Rule: every accepted DSL, measurement, layout, and render/export runtime code has a failing fixture.
- Integration: one broken page does not block reports for other pages.
- Regression: retired QA entrypoint names are not referenced by runtime code or smoke scripts.

---

## Future Discussion Checkpoints

The next layers should be discussed and scoped separately:

1. Compile layer: checks that ensure compiled render models are semantically ready for measurement.
2. Min/preferred/max sizing and resize policy strategy for measured primitives.
3. Future layout algorithm artifact split: `planLayout(page) -> layoutResult -> renderPage(layoutResult)`.

---

## Sources & References

- Runtime architecture: `docs/architecture_design.md`
- DSL authoring contract: `references/slide_dsl_authoring_schema.md`
- Current DSL parser: `scripts/pptx/dsl/jsx_dsl.js`
- Current DSL compiler: `scripts/pptx/dsl/compile_slide_dsl.js`
- Existing feedback contract: `scripts/pptx/feedback/feedback_issue.js`
- Existing DSL bad-case fixtures: `scripts/smoke/dsl/test_dsl_bad_case_feedback_matrix.js`
- Old capability inventory: `.tmp/qa_compile_feedback_matrix.utf8bom.csv`

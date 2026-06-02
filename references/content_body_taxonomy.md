# Content Body Taxonomy

This reference defines the semantic coverage for body content below the `分析总结` band. Page chrome, section tabs, title, analysis summary, and footer are outside this taxonomy.

The taxonomy is a classification layer, not a drawing API. Components report what they are, whether they are a real anchor or supporting component, how well they can be measured, and how they may resize. Layout containers compute positions; renderers draw existing PPT primitives.

## Required Metadata

Every body-content block should derive:

- `family`: `LayoutContainer`, `Evidence`, `QuantitativeReadout`, `StructuredText`, `RelationshipDiagram`, `MatrixTable`, or `MediaDecorative`.
- `type`: a concrete semantic type such as `SourceFigure`, `KpiCardRow`, `RichBulletBlock`, or `NativeTable`.
- `anchorEligibility`: `real_anchor`, `supporting_component`, or `not_anchor`.
- `measureSupport`: `measured`, `estimated`, `legacy_fallback`, or `unsupported`. Official body-content templates must be `measured`; `estimated`, `legacy_fallback`, and `unsupported` are not acceptable for the strict Body DSL layout path.
- `resizePolicy`: `fixed`, `preserve_aspect`, `flexible`, `shrink_text`, `simplify`, or `fail_below_floor`.

## Families

### Layout Containers

`BodyRegion`, `ColumnGrid`, `BiasedGrid`, `FourGrid`, `ModuleFrame`, `ModuleStack`, `HorizontalGroup`, `VerticalGroup`, and `OverlayGroup`.

### Evidence

`SourceFigure`, `SourceChart`, and `SourceDiagram`.

Evidence is normally `real_anchor`. Source-backed evidence should preserve aspect ratio and fail or warn when it falls below a readable floor.

### Quantitative Readout

`KpiCard`, `KpiCardRow`, `MetricTileGrid`, `DeltaCard`, `BadgeNumber`, `ProgressBar`, `MiniBarChart`, `MiniLineChart`, `Sparkline`, `DonutReadout`, and `ProportionBar`.

KPI rows and metric tiles are supporting components unless the template is a generated chart that acts as a real visual anchor.

### Structured Text

`RichBulletBlock`, `NumberedPointList`, `ClaimExplanationPair`, `LabelValueList`, `CalloutNote`, `SourceNote`, `Caption`, `WarningNote`, `DecisionNote`, and `DefinitionBlock`.

Structured text is editable PPT text and is not an anchor.

### Relationship Diagram

`ProcessFlow`, `Timeline`, `Pipeline`, `ArchitectureMap`, `CausalChain`, `DecisionGraph`, `ConstraintMap`, `ComparisonFlow`, `LayerStack`, `TreeHierarchy`, `CycleLoop`, and `NetworkGraph`.

Generated relationship diagrams can be real anchors when they explain the module claim. Official relationship templates must have measured geometry before they can enter strict Body DSL layout.

### Matrix / Table

`NativeTable`, `ComparisonTable`, `CapabilityMatrix`, `TradeoffMatrix`, `ChecklistMatrix`, `HeatmapMatrix`, `QuadrantMatrix`, `TwoByTwoMatrix`, `FeatureComparison`, and `RiskMatrix`.

Tables and matrices are supporting components unless the schema explicitly defines a generated visual anchor template.

### Media / Decorative

`Icon`, `Logo`, `ProductImage`, `DecorativeIllustration`, `AIConceptImage`, `BackgroundShape`, `Divider`, `Arrow`, and `HighlightBox`.

Decorative media does not satisfy visual-anchor requirements.

## Implementation Mapping

- `Evidence/source_figure` -> `Evidence.SourceFigure`, `real_anchor`, `measured`.
- `Evidence/source_chart` -> `Evidence.SourceChart`, `real_anchor`, `measured`.
- `Quantity/data_cards` -> `QuantitativeReadout.KpiCardRow`, `supporting_component`, `measured`.
- `Quantity/bar_chart` -> `QuantitativeReadout.MiniBarChart`, `real_anchor`, `measured`.
- `Quantity/line_chart` -> `QuantitativeReadout.MiniLineChart`, `real_anchor`, `measured`.
- `Quantity/proportion_chart` -> `QuantitativeReadout.DonutReadout`, `real_anchor`, `measured`.
- `Quantity/heatmap` -> `MatrixTable.HeatmapMatrix`, `supporting_component`, `measured`.
- `Matrix/table` -> `MatrixTable.NativeTable`, `supporting_component`, `measured`.
- `Matrix/capability_matrix` -> `MatrixTable.CapabilityMatrix`, `supporting_component`, `measured`.
- `Matrix/heatmap` -> `MatrixTable.HeatmapMatrix`, `supporting_component`, `measured`.
- `Matrix/quadrant_matrix` -> `MatrixTable.QuadrantMatrix`, `real_anchor`, `measured`.
- `Hierarchy/capability_stack` -> `RelationshipDiagram.LayerStack`, `supporting_component`, `measured`.
- `Sequence/*`, `Loop/*`, `Hierarchy/tree`, `Hierarchy/layered_architecture`, and `Network/*` -> relationship families, `real_anchor`, `measured`.
- plain text blocks -> `StructuredText.RichBulletBlock` or `StructuredText.CalloutNote`, `not_anchor`, `measured`.

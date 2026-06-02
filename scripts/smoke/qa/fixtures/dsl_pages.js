"use strict";

const VALID_BODY_DSL = `
<Slide>
  <TwoColumn>
    <Module title="主证据">
      <EvidenceFigure id="main_evidence" title="来源图" claim="来源图支撑判断。" source={source} priority="primary" />
      <InsightText body={body} maxLines={2} />
    </Module>
    <Module title="结论">
      <InsightText body={body} />
    </Module>
  </TwoColumn>
</Slide>`;

const SUPPORTING_ONLY_BODY_DSL = `
<Slide>
  <TwoColumn>
    <Module title="辅助读数">
      <Table id="support_table" title="辅助表格" claim="表格只是辅助。" rows={rows} />
    </Module>
    <Module title="说明">
      <InsightText body={body} />
    </Module>
  </TwoColumn>
</Slide>`;

const TRACELESS_ANCHOR_BODY_DSL = `
<Slide>
  <TwoColumn>
    <Module title="无证据链">
      <EvidenceFigure id="missing_source" title="来源图" claim="缺 source。" />
    </Module>
    <Module title="说明">
      <InsightText body={body} />
    </Module>
  </TwoColumn>
</Slide>`;

const BAD_BODY_DSL = `<Slide><TwoColumn><Module><MysteryBox /></Module></TwoColumn></Slide>`;

const scope = {
  source: { path: ".tmp/source.png", caption: "source" },
  body: ["判断：保留 DSL 溯源。"],
  rows: [["项", "判断"], ["A", "B"]],
};

module.exports = {
  BAD_BODY_DSL,
  SUPPORTING_ONLY_BODY_DSL,
  TRACELESS_ANCHOR_BODY_DSL,
  VALID_BODY_DSL,
  scope,
};

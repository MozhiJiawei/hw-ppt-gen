# Research Audit

## Research Frame
Target audience: inference system and model serving leaders who need to decide whether TiDAR deserves reproduction, benchmark, or engineering validation.

Reader current belief: MTP, EAGLE, speculative decoding, and diffusion LLMs are likely understood as adjacent acceleration families, but TiDAR's architectural novelty, training cost, and serving constraints need clarification.

Desired belief change: treat TiDAR as a diffusion-style upgrade to the built-in drafter direction, not as a training-free decoding plugin. Evaluate it through reproduction cost, kernel dependency, batch profile, acceptance length, and quality loss.

Final use: 9-page technical review PPT.

Primary source package:
- `pdf_xml\final\tidar.xml`
- `pdf_xml\final\images\`
- `pdf_xml\tidar.pdf`

Supplemental sources:
- DeepSeek-V3 Technical Report, arXiv: `https://arxiv.org/abs/2412.19437`
- romsto/Speculative-Decoding reference figure: `https://github.com/romsto/Speculative-Decoding`
- NVIDIA TensorRT-LLM speculative decoding docs: `https://nvidia.github.io/TensorRT-LLM/legacy/advanced/speculative-decoding.html`

## Source Understanding
TiDAR is a sequence-level hybrid architecture initialized from AR models and continually pretrained. It combines diffusion drafting and autoregressive sampling inside one model forward. It is not a pure speculative decoding wrapper and not a training-free acceleration method.

Core problem: AR decoding is memory-bound in low-batch latency-critical settings and usually advances one token per model forward. Diffusion language models can parallelize token prediction but face a quality/parallization tradeoff. Traditional speculative decoding improves throughput through draft/verify but often relies on a weaker drafter and sequential draft-then-verify flow.

Distinctive mechanism: TiDAR uses diffusion one-step pre-drafting for the next proposal batch while AR sampling/rejection sampling validates the previous draft batch. Its structured attention mask allows prefix causal attention, drafted token causal attention, and block-bidirectional mask token attention. It also supports exact KV cache with eviction for rejected tokens.

Key evidence inventory:
- Figure 1: Qwen3-32B, NVIDIA H100, batch size 1, Flash Attention 2 latency scaling over token slots; supports free/cheap token slots premise.
- Figure 2: TiDAR architecture; supports single-forward sampling plus pre-drafting.
- Figure 3: TiDAR attention masks; supports hybrid causal/bidirectional structure.
- Figure 4: efficiency-quality benchmarking; supports wall-clock speedup and task-level tradeoff.
- Table 2: generative task quality and T/NFE; supports acceptance length and quality statements.
- Table 3: likelihood task comparison; supports quality claims beyond coding/math generation.
- Limitations section: supports batch-size caution, long-context caution, and system optimization caveat.
- Section 4.1: supports training data, batch, steps, optimizer, hardware, framework, and precision claims.

## Executive Thesis
TiDAR is best framed as the diffusion version of the built-in drafter direction: it continues the MTP intuition that draft quality should use main-model capacity, but replaces AR future-token prediction with diffusion parallel pre-drafting and overlaps that with AR sampling in a single forward. It is worth reproducing for small-batch low-latency inference, but only under a benchmark plan that measures acceptance length, T/NFE-to-tokens/s conversion, quality loss, and serving/kernel cost.

Approved top-level summary page:
- 页面标题：TiDAR
- 标题说明：沿着MTP“内置drafter”方向继续走，但把AR未来预测换成diffusion并行草稿
- 分析总结：
  - 收益：平均接收长度达7.45/8.25 token，转化为1.5B/8B的4.71x/5.91x加速
  - 关键技术：同一模型内diffusion并行draft，AR负责sampling并重叠下一批预草稿
  - 落地边界：需50B/150B继续训练，收益受小batch、H100 kernel和KV cache实现约束

## Reader Cognitive Path
1. Start with a familiar reference: MTP and speculative decoding already internalize or improve drafters.
2. Explain TiDAR's conceptual move: built-in drafter becomes diffusion-style parallel pre-drafting.
3. Distinguish TiDAR from ordinary speculative decoding and pure diffusion LLMs.
4. Explain the algorithm and structure enough for serving readers to evaluate implementation implications.
5. Convert mechanism to measured benefit: T/NFE, tokens/s speedup, and quality impact.
6. End with boundaries: batch profile, task variability, training token cost, missing GPU-hours, long-context and kernel constraints.

## Pyramid Outline
Top-level summary:
- TiDAR is MTP-style built-in drafting upgraded with diffusion parallel pre-drafting; it is promising but must be evaluated as a new trained architecture.

Chapter 1: 路线定位
- Page 4: MTP参照系
- Page 5: 不是普通投机

Chapter 2: 结构与收益
- Page 6: 算法与结构
- Page 7: 收益表现

Chapter 3: 落地边界
- Page 8: 场景边界
- Page 9: 训练成本

## Chapter Logic
路线定位:
- Role: establish comparison frame.
- Claim: TiDAR belongs to the built-in drafter family but changes the drafter mechanism from AR future prediction to diffusion parallel drafting.
- Main visuals: DeepSeek-V3 MTP Figure 3, speculative decoding draft-target diagram, TiDAR Figure 2.

结构与收益:
- Role: prove the mechanism and its measured payoff.
- Claim: single-forward AR sampling plus diffusion pre-drafting can convert high acceptance length into tokens/s speedup while retaining competitive quality.
- Main visuals: TiDAR Figure 2, Figure 3, Figure 4, Table 2, Table 3.

落地边界:
- Role: prevent overclaiming and make reproduction decision concrete.
- Claim: benefits are strongest in batch=1 low-latency benchmark conditions and require nontrivial continual pretraining plus serving/kernel adaptation.
- Main visuals: TiDAR Figure 1, Table 2, Figure 3.

## Page Logic Audit
Page 2:
- Role: executive summary.
- Supported claim: TiDAR is diffusion-style MTP evolution with measured acceleration and nontrivial deployment boundary.
- Boundary: T/NFE is not directly wall-clock speedup; 8B generation is not fully lossless.

Page 4:
- Role: analogy and relationship.
- Supported claim: TiDAR and MTP both internalize drafting, but TiDAR changes AR future prediction into diffusion parallel drafting.
- Boundary: DeepSeek-V3 MTP figure is supplemental, not from TiDAR paper.

Page 5:
- Role: contrast against common categories.
- Supported claim: TiDAR is neither ordinary two-model speculative decoding nor pure diffusion generation.
- Boundary: speculative decoding can preserve base model output distribution under strict conditions, unlike TiDAR's new trained model setup.

Page 6:
- Role: mechanism proof.
- Supported claim: TiDAR's algorithm/structure combines AR rejection sampling, diffusion one-step drafting, mixed attention masks, and KV cache eviction.
- Boundary: exact implementation details depend on serving framework and attention kernels.

Page 7:
- Role: evidence proof.
- Supported claim: T/NFE and tokens/s gains are substantial, quality is competitive with caveats.
- Boundary: task-level results vary; 8B generation average is lower than Qwen3 8B.

Page 8:
- Role: scenario boundary.
- Supported claim: benchmark evidence is strongest for H100 batch=1 and varies by domain.
- Boundary: no large-batch online curve in the paper.

Page 9:
- Role: cost boundary.
- Supported claim: TiDAR requires 50B/150B token continual pretraining and cannot be budgeted as a training-free plugin.
- Boundary: card count, training hours, GPU-hours, and exact data mixture are not disclosed.

## Claim Evidence Implication Table
| Claim | Evidence | Implication |
|---|---|---|
| TiDAR extends built-in drafter thinking beyond MTP | DeepSeek-V3 Figure 3; TiDAR Section 2.2 and Figure 2 | Use MTP as the reader's conceptual bridge, then distinguish diffusion drafting |
| TiDAR is not ordinary speculative decoding | TiDAR Section 2.2: single model, drafting and sampling simultaneously in one forward | Evaluate as architecture/serving change, not as a plug-in drafter |
| TiDAR uses AR sampling to constrain diffusion drafts | TiDAR Figure 2 and method text on rejection sampling | Avoid describing it as directly trusting diffusion outputs |
| TiDAR's speed comes from acceptance length and conversion to tokens/s | Table 2 T/NFE; Figure 4 tokens/s speedup | Present both metrics; avoid equating T/NFE and tokens/s |
| 1.5B quality is near or above AR counterpart; 8B generation has small loss | Table 2 averages: Qwen2.5 1.5B 41.64 vs TiDAR 47.45; Qwen3 8B 68.09 vs TiDAR Trust Diff 65.31 | Claim competitive quality, not universal lossless quality |
| Scenario evidence is batch=1-centered | Section 4.1 and Limitations | Require local benchmark for production batch profiles |
| Training cost is nontrivial but not from scratch | Section 4.1: continual pretraining from Qwen2.5/Qwen3 with 50B/150B tokens | Budget as continued pretraining; do not call training-free |

## Evidence Map
Primary evidence:
- Title and abstract: TiDAR paper package, `tidar.xml`, abstract lines about diffusion drafting, AR sampling, 4.71x to 5.91x tokens/s.
- Figure 1: `pdf_xml\final\images\picture_002.png`; H100 batch=1 free/cheap token slots.
- Figure 2: `pdf_xml\final\images\picture_003.png`; TiDAR architecture.
- Figure 3: `pdf_xml\final\images\picture_004.png`; attention masks.
- Figure 4: `pdf_xml\final\images\picture_005.png`; efficiency-quality benchmarking.
- Table 2: `pdf_xml\final\images\table_002.png`; generation quality and task T/NFE.
- Table 3: `pdf_xml\final\images\table_003.png`; likelihood evaluation.
- Section 4.1 from `tidar.txt`: training from Qwen2.5 1.5B / Qwen3 8B; 50B / 150B tokens; 2M token global batch; LR settings; 4096 max sequence length; H100s; BF16; distributed Adam; Megatron-LM with TorchTitan support.
- Limitations from `tidar.txt`: batch size focus, large batch caveat, long context extension issue, custom kernel/scheduling opportunity.

Supplemental evidence:
- DeepSeek-V3 Figure 3: `supplemental_images\deepseek_v3_mtp_figure3.png`; MTP architecture.
- Traditional speculative decoding diagram: `supplemental_images\speculative_decoding_draft_target.png`; two-model draft/verify reference.
- Medusa tree SVG: `supplemental_images\medusa_tree.svg`; optional background only.

Numeric checks:
- 1.5B steps: 50B tokens / 2M token global batch = 25,000 steps.
- 8B steps: 150B tokens / 2M token global batch = 75,000 steps.
- GSM8K vs MBPP+ gap, 1.5B: (9.43 - 5.07) / 9.43 = 46.2%.
- GSM8K vs MBPP+ gap, 8B Trust Diff: (10.13 - 7.07) / 10.13 = 30.2%.

## Source Usage Policy
- TiDAR Figures 1-4 and Tables 2-3: may use as source figures or rebuild into clearer Chinese charts.
- DeepSeek-V3 MTP Figure 3: may use as source figure for relationship framing; label clearly as MTP reference.
- Speculative decoding diagram: may use as source figure for traditional draft-target flow; label clearly as reference diagram.
- Medusa SVG: background only unless a later deck revision adds a Medusa/MTP intermediate comparison.
- Do not use the supplemental figures to support TiDAR performance claims; use only TiDAR paper figures/tables for TiDAR claims.

## Supplemental Research
Downloaded and prepared:
- `supplemental_sources\deepseek-v3.pdf`
- `supplemental_sources\deepseek-v3.txt`
- `supplemental_images\deepseek_v3_page10-10.png`
- `supplemental_images\deepseek_v3_mtp_figure3.png`
- `supplemental_images\speculative_decoding_draft_target.png`
- `supplemental_images\medusa_tree.svg`

How supplemental research supports the approved viewpoint:
- DeepSeek-V3 MTP supports the user's analogy: MTP internalizes future-token prediction modules and can be related to TiDAR's built-in drafter framing.
- Traditional speculative decoding diagram supports the contrast between serial draft/verify and TiDAR's single-forward overlapping approach.
- NVIDIA Medusa SVG is retained for optional context about built-in multiple heads/tree verification, but is not necessary for the approved page plan.

## Assumptions and Open Questions
Assumptions:
- "Average acceptance length" is used as a reader-friendly translation of T/NFE/raw acceptance rate in the speculative decoding context.
- The downstream PPT generator can use local image paths under Markdown image references.

Open questions:
- Exact GPU count, training hours, GPU-hours, training data mixture, and training throughput are not disclosed.
- Large-batch online serving performance is not shown; local benchmark required.
- Long context efficiency remains future work because current implementation appends mask tokens during training.
- Production integration complexity depends on attention kernel, KV cache manager, request scheduler, and rollback pathway.

Claims to soften:
- 8B quality: say "generation small loss" or "competitive quality", not "lossless".
- Speedup: say "reported under batch=1 H100 benchmark", not universal serving speedup.
- Training: say continual pretraining from AR models, not from scratch and not training-free.

## Approval Log
- Stage 1 audience: user selected technical decision review / route evaluation audience.
- Stage 1.5 source understanding: user challenged application constraints, training requirements, hardware dependence, speedup variability, and quality loss; baseline updated accordingly.
- MTP analogy: user approved framing that TiDAR resembles MTP direction but replaces AR future prediction with diffusion drafting.
- Stage 1.6 top-level summary: approved title `TiDAR`, subtitle about MTP built-in drafter direction and diffusion parallel drafting, and analysis bullets for benefit / key technology / landing boundary.
- Stage 2 page count: user selected 9 total PPT pages.
- Stage 2.5 table of contents: user approved `路线定位`, `结构与收益`, `落地边界`.
- Stage 3 chapter 1: user approved Page 4-5 and requested MTP and traditional speculative reference figures downloaded locally.
- Stage 3 chapter 2: user revised split to Page 6 algorithm/structure and Page 7 benefits, then approved.
- Stage 3 chapter 3: user revised dimensions to scenario boundary and training cost, requested quantitative GSM8K vs MBPP+ gap, then approved.
- Final hard-constraint bundle: QA passed and user approved with "ok".


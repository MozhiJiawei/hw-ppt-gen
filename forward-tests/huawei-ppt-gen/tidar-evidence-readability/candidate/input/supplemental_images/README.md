# Supplemental Reference Images for TiDAR PPT Deep Search

## Downloaded / Exported Images

1. `deepseek_v3_mtp_figure3.png`
   - Local path: `.tmp/ppt-deep-search/tidar/supplemental_images/deepseek_v3_mtp_figure3.png`
   - Source: DeepSeek-V3 Technical Report, Figure 3, arXiv: https://arxiv.org/abs/2412.19437
   - Usage policy: supplemental research; may summarize/rebuild or use as source figure for MTP reference.
   - Notes: Cropped from page 10 export. Full page backup: `deepseek_v3_page10-10.png`; source PDF: `.tmp/ppt-deep-search/tidar/supplemental_sources/deepseek-v3.pdf`.

2. `speculative_decoding_draft_target.png`
   - Local path: `.tmp/ppt-deep-search/tidar/supplemental_images/speculative_decoding_draft_target.png`
   - Source: romsto/Speculative-Decoding README figure, based on Leviathan et al. 2023: https://github.com/romsto/Speculative-Decoding
   - Raw image URL: https://github.com/romsto/Speculative-Decoding/raw/main/figures/specdec_method.png
   - Usage policy: supplemental research; may summarize/rebuild or use as source figure for traditional draft-target speculative decoding.

3. `medusa_tree.svg`
   - Local path: `.tmp/ppt-deep-search/tidar/supplemental_images/medusa_tree.svg`
   - Source: NVIDIA TensorRT-LLM speculative decoding docs: https://nvidia.github.io/TensorRT-LLM/legacy/advanced/speculative-decoding.html
   - Usage policy: supplemental research; background only or summarize/rebuild if comparing MTP/Medusa-style built-in heads.
   - Notes: Stored as SVG; PNG conversion not available in current environment.

## Source Notes
- DeepSeek-V3 MTP is used to anchor the “MTP / built-in drafter” analogy.
- Traditional speculative decoding image is used to show the small-drafter-then-large-target-verifier flow.
- NVIDIA Medusa tree is optional; use only if a page needs an intermediate point between MTP and classic two-model speculative decoding.

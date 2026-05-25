# PPT Content Brief

## Deck Metadata
主题：TiDAR 技术路线评估
目标读者：推理系统 / 模型服务负责人
页数口径：9 页总 PPT；Page 1 封面，Page 2 顶层总结，Page 3 目录，Page 4-9 正文
核心结论：TiDAR 是 MTP 思路的 diffusion 化升级，收益可观但必须按新结构训练、kernel 适配和小 batch 低延迟场景评估
内容来源：TiDAR paper package, DeepSeek-V3 technical report, speculative decoding reference diagram
关联审计文件：research_audit.md

## Summary Page
页码：Page 2
页面标题：TiDAR
标题说明：沿着MTP“内置drafter”方向继续走，但把AR未来预测换成diffusion并行草稿
分析总结：
- 收益：平均接收长度达7.45/8.25 token，转化为1.5B/8B的4.71x/5.91x加速
- 关键技术：同一模型内diffusion并行draft，AR负责sampling并重叠下一批预草稿
- 落地边界：需50B/150B继续训练，收益受小batch、H100 kernel和KV cache实现约束
正文内容：
- 收益：TiDAR 的核心实验收益应同时用“平均接收长度”和“真实吞吐”表达。论文在 coding/math 生成任务中报告，TiDAR 1.5B 平均 7.45 tokens per NFE，TiDAR 8B 平均 8.25 tokens per NFE；在 wall-clock decoding throughput 上，1.5B 相对 Qwen2.5 1.5B 达 4.71x，8B 相对 Qwen3 8B 达 5.91x。这里的阅读重点不是“每个任务都固定加速 5-6 倍”，而是 TiDAR 把一次 forward 中可接受的 token 数从传统 AR 的约 1 个推进到平均 7-8 个，并且在 H100、batch=1 的实测条件下能把接收长度有效转成 tokens/s。
- 关键技术：TiDAR 不是在已有 AR 模型外接一个小模型 drafter，而是沿着 MTP 的“内置 drafter”方向继续走。MTP 让主模型参与未来 token 预测，TiDAR 则把未来 token 提案改成 diffusion one-step drafting：同一模型中，AR 区域负责对上一批 draft token 做 sampling / rejection sampling，diffusion mask block 区域并行生成下一步 proposal。这样当前 step 的最终输出和下一 step 的草稿准备被压进同一次 forward，目标是吃掉 memory-bound decoding 中的 free / cheap token slots。
- 落地边界：TiDAR 不是 training-free。论文使用 Qwen2.5 1.5B / Qwen3 8B 作为初始化并继续预训练 50B / 150B tokens；global batch 为 2M tokens，对应约 25k / 75k steps。效率评测主场景是 single H100、batch=1、低延迟生成，作者虽说明可调 draft length 适配不同 compute profile，但没有给出大 batch 在线曲线。下游评估时，应先在小 batch、memory-bound 服务栈中复现接收长度、tokens/s conversion rate 和质量损失，再判断是否投入 8B 级训练与 serving 改造。
参考图片：
- ![TiDAR Figure 4: efficiency-quality benchmarking](pdf_xml\final\images\picture_005.png)
- Figure 4 展示 TiDAR、AR、EAGLE-3、Block Diffusion 在 1.5B / 8B 下的相对吞吐与任务分数。
- ![TiDAR Figure 2: single-forward sampling and pre-drafting](pdf_xml\final\images\picture_003.png)
- Figure 2 展示 TiDAR 如何在单 forward 内对上一批 draft tokens 进行 sampling，并为下一步 pre-draft proposals。
备注：
- T/NFE 应解释为平均接收或推进长度，不能直接写成 wall-clock 加速比。

## Table of Contents
01 小标题：路线定位
说明：先把 TiDAR 放在 MTP / speculative decoding / diffusion LLM 的坐标系里，判断它到底新在哪里。

02 小标题：结构与收益
说明：解释 TiDAR 如何用 diffusion 并行草稿 + AR sampling，把平均接收长度转化为 tokens/s 加速。

03 小标题：落地边界
说明：评估训练成本、硬件/kernel 依赖、质量损失和适用场景，给出是否复现的决策口径。

## Page Content

### Page 4: MTP参照系
所属章节：路线定位
页面标题：MTP参照系
标题说明：TiDAR延续内置drafter路线，但把AR未来预测替换为diffusion并行草稿
分析总结：
- 共同点：都用主模型能力提高draft质量，突破小模型drafter接受率瓶颈
- 差异点：MTP预测未来token，TiDAR预草稿下一批并同步验证上一批
正文内容：
- 共同点：DeepSeek-V3 的 MTP 模块把未来 token 预测任务放入主模型训练目标中，Figure 3 展示 Main Model 负责 next-token prediction，MTP Module 1/2 分别负责 next2/next3 token prediction，并共享 embedding layer 与 output head。TiDAR 与这一路线共享同一个动机：不要完全依赖弱小外部 drafter，而是让主模型表征参与未来 token 提案，提高 draft 质量、提高可接受长度，并降低传统 speculative decoding 中“草稿质量不足导致接受率低”的风险。
- 差异点：MTP 的未来 token 预测仍保持完整 causal chain，DeepSeek-V3 技术报告说明其逐深度预测 additional tokens，并保持每个 token 预测的因果链。TiDAR 则把“未来 token 提案”换成 diffusion one-step pre-drafting：在同一 forward 中，mask tokens 以 block-causal / bidirectional 方式生成下一批 proposal，同时 AR 侧处理上一批 draft 的采样与拒绝。换句话说，MTP 更像 AR 风格的内置未来预测器，TiDAR 更像 diffusion 风格的内置并行草稿器。
- 共同点：这页应帮助读者建立参照，而不是把 TiDAR 讲成孤立的新术语。它们都回应同一个系统问题：如果小 drafter 太弱，接受率会限制吞吐；如果让主模型参与 draft，未来 token 提案质量可能提高。TiDAR 的创新点是把参与方式从 AR 未来预测改成 diffusion 并行草稿，并试图把草稿生成与上一批验证重叠在单 forward 内。
- 差异点：这个差异决定后续评审口径。MTP 可在训练时作为辅助目标，推理时可丢弃或复用模块；TiDAR 的 diffusion draft 是推理路径的一部分，attention mask、KV cache 和 proposal selection 都参与线上服务。因此 TiDAR 不能只按训练辅助目标理解，也不能按普通 speculative 插件估算工程投入。
参考图片：
- ![DeepSeek-V3 Figure 3: MTP implementation](supplemental_images\deepseek_v3_mtp_figure3.png)
- DeepSeek-V3 Figure 3 展示 Main Model 与 MTP Module 1/2 如何共享 embedding/output head，并为 next / next2 / next3 token 建立训练目标。
备注：
- 该页建议用 MTP 图做“参照系”，旁边解释 TiDAR 把 AR 未来预测换成 diffusion 并行草稿。

### Page 5: 不是普通投机
所属章节：路线定位
页面标题：不是普通投机
标题说明：TiDAR把draft和sampling融入单模型单forward，代价是新结构训练和serving适配
分析总结：
- 对比投机：传统小模型draft串行发生，TiDAR用同一模型并行draft
- 对比扩散：纯diffusion并行易损质量，TiDAR由AR sampling把关最终token
正文内容：
- 对比投机：传统 speculative decoding 的典型流程是小 drafter 先生成 candidate tokens，再由 target model 进行验证。TiDAR 论文指出，小 drafter 如果质量下降，会因为低 acceptance rate 拖慢整体生成；EAGLE / MTP 类路线虽然提高 drafter 能力，但 draft 过程仍偏 autoregressive，并且与 base verification 顺序发生。TiDAR 的不同点是单模型、单 forward，同时完成上一批 draft 的 sampling 和下一批 proposal 的 pre-drafting。
- 对比扩散：纯 diffusion LLM 的并行能力来自一次预测多个 token，但 TiDAR 论文强调 parallel decoding 会引入 intra-step token independence assumption，可能损害 sequence-level coherence and correctness。论文还引用 Dream-7B 在 GSM8K 上从 1 token/step 增到 2 tokens/step 后 accuracy 下降 10% 的例子。TiDAR 的路径是：用 diffusion draft 获取并行度，用 AR sampling / rejection sampling 约束最终 token 质量。
- 对比投机：这意味着 TiDAR 的“投机性”不是外接小模型，而是内置在同一模型的不同 attention 区域中。传统流程中，小 drafter 的计算和 target verifier 的计算前后串行；TiDAR 则让当前 step 的 AR sampling 和下一 step 的 diffusion pre-draft 同时出现，目标是减少顺序草稿阶段的等待。
- 对比扩散：TiDAR 也不是直接相信 diffusion 输出。Figure 2 中上一批 drafted tokens 会被 sampled 或 rejected，被接受的前缀选择对应下一批 proposal；Figure 3 的 mask 则说明 causal 区域和 block-bidirectional 区域各司其职。读者应把 TiDAR 看成 AR 质量约束与 diffusion 并行草稿的混合，而不是纯 diffusion 生成器。
参考图片：
- ![Speculative decoding: draft model and target model verification](supplemental_images\speculative_decoding_draft_target.png)
- 该图展示传统 speculative decoding 中 draft model 先生成 candidate，target model 后续验证的两阶段流程。
- ![TiDAR Figure 2: architecture](pdf_xml\final\images\picture_003.png)
- TiDAR Figure 2 展示同一 forward 内对上一批 drafted tokens 进行 sampling，并为下一步 pre-draft proposals。
备注：
- 该页应明确 TiDAR 是新结构评估对象，不是给现有 AR 模型加一个外部 drafter。

### Page 6: 算法与结构
所属章节：结构与收益
页面标题：算法与结构
标题说明：TiDAR用三段token组织和混合attention mask，在单forward内并行完成验证与预草稿
分析总结：
- 算法：AR rejection sampling验证上一批draft，diffusion one-step drafting生成下一批proposal
- 结构：prefix causal、draft causal、mask block bidirectional，并配套KV保留与驱逐
正文内容：
- 算法：TiDAR 在每个 generation step 将 token 分为三段：prefix tokens、tokens proposed in previous step、tokens pre-drafted for next step。上一批 proposed tokens 由当前 step 计算出的 AR 分布进行 sampling / rejection sampling；同一 forward 内，diffusion 区域基于 rejection sampling 的所有可能 prefix outcome 并行 pre-draft 下一批 proposals。这样无论本步接受多少 token，都可以选择对应的下一步 proposal。
- 结构：Figure 3 展示 training mask 与 decoding mask。clean input tokens 使用 causal self-attention；mask tokens 在 block 内 bidirectional，并可关注 prefix，从而承担 one-step diffusion pre-drafting。推理时 TiDAR 通过重排 sampling-draft part 与 clean prefix，并切片预初始化 mask，避免每步重算 Flex Attention mask。
- 算法：one-step diffusion drafting 是 TiDAR 能把 draft 计算压进当前 forward 的关键。论文说明 one step 已足以产生质量足够好的 draft tokens，从而 secure high acceptance rate；训练时将 diffusion section 全部设为 mask tokens，用更强 diffusion loss signal 降低 train-test mismatch。这一点把 TiDAR 和需要多步 denoising 的 diffusion 生成方式区分开来。
- 结构：TiDAR 支持 exact KV cache。论文说明会保存所有 causal attention 计算过的 token KV cache，若 sampling length 短于 draft length，则驱逐被拒绝 token 的 KV cache；这避免重复计算已验证前缀，并区别于一些纯 diffusion cache 方法。该机制是把平均接收长度转化为 wall-clock speedup 的必要工程条件。
参考图片：
- ![TiDAR Figure 2: single-forward sampling and pre-drafting](pdf_xml\final\images\picture_003.png)
- Figure 2 展示 TiDAR 如何在单 forward 内处理 sampled/rejected tokens，并选择下一步 draft proposal。
- ![TiDAR Figure 3: attention masks](pdf_xml\final\images\picture_004.png)
- Figure 3 展示 training mask 与 decoding mask，说明 causal 区域与 block-bidirectional mask 区域如何组合。
备注：
- 讲解顺序建议是三段 token -> mixed mask -> rejection sampling -> KV cache。

### Page 7: 收益表现
所属章节：结构与收益
页面标题：收益表现
标题说明：1.5B/8B平均接收长度7.45/8.25 token，最终转化为4.71x/5.91x tokens/s
分析总结：
- 加速：代码和数学任务约5.07-10.13 T/NFE，任务间收益差异明显
- 质量：1.5B接近无损，8B生成小损但仍优于Dream/LLaDA/Block Diffusion
正文内容：
- 加速：Table 2 中 TiDAR 1.5B 在 HumanEval / HumanEval+ / MBPP / MBPP+ / GSM8K / Minerva Math 上的 T/NFE 分别为 6.50 / 6.50 / 9.25 / 9.43 / 5.07 / 7.92，平均 7.45。8B Trust Diff 的 T/NFE 分别为 7.30 / 7.29 / 10.00 / 10.13 / 7.07 / 7.68，平均 8.25。Figure 4 将这些平均接收长度进一步映射为 wall-clock tokens/s：1.5B 相对 Qwen2.5 1.5B 达 4.71x，8B 相对 Qwen3 8B 达 5.91x。
- 质量：1.5B 生成任务平均分 TiDAR 为 47.45%，高于 Qwen2.5 1.5B 的 41.64% 和 Block Diff 的 38.41%。8B 生成任务平均分 Qwen3 8B 为 68.09%，TiDAR Trust Diff 为 65.31%，存在小幅损失，但仍高于 LLaDA 8B 的 41.78%、Dream 7B 的 58.74%、Block Diff 4B 的 60.27%。Table 3 的 likelihood evaluation 中，TiDAR 8B average 为 75.40%，高于 Qwen3 8B 的 74.25%。
- 加速：这页应同时讲“接收长度”和“真实吞吐”，不要把 T/NFE 直接等同为加速比。TiDAR 的 wall-clock 加速来自高 T/NFE 与单 forward 并行 draft/sampling 的 conversion rate；论文也强调其 raw acceptance rate 和 T/NFE-to-T/s conversion rate 均高于 EAGLE-3 open weights。
- 质量：生成任务和 likelihood 任务要分开读。生成任务上 8B 存在小损失，因此不能写“8B 完全无损”；但相对 diffusion LLM baselines，TiDAR 同时保留更高效率和更好质量。这个结论更适合写成“competitive quality with large speedup”，而不是绝对质量领先所有 AR baseline。
参考图片：
- ![TiDAR Figure 4: efficiency-quality benchmarking](pdf_xml\final\images\picture_005.png)
- Figure 4 展示 TiDAR、AR、EAGLE-3、Block Diffusion 在 1.5B / 8B 下的相对吞吐与任务分数。
- ![TiDAR Table 2: generative evaluation results](pdf_xml\final\images\table_002.png)
- Table 2 给出 coding/math 任务质量分数，并在括号中报告 TiDAR 的 T/NFE。
- ![TiDAR Table 3: likelihood evaluation results](pdf_xml\final\images\table_003.png)
- Table 3 给出 factual knowledge 与 commonsense reasoning 的 likelihood evaluation 对比。
备注：
- 8B 的“生成小损”应保留，避免评审误解为全面无损。

### Page 8: 场景边界
所属章节：落地边界
页面标题：场景边界
标题说明：收益主要在batch=1低延迟评测成立，最大接收长度10.13 token且任务差异明显
分析总结：
- batch边界：论文主测batch=1，称可调draft length适配大batch但未给线上曲线
- 领域差异：GSM8K为5.07/7.07 T/NFE，较MBPP+的9.43/10.13低46%/30%
正文内容：
- batch边界：论文效率 benchmark 明确使用 downstream generative tasks 的 prompts，在 single H100 GPU、batch size = 1 下比较 AR、EAGLE-3、Block Diffusion 和 TiDAR。Limitations 中作者说明虽然聚焦 batch size = 1，并不代表 TiDAR 不能处理大 batch；可以 zero-shot 调整 block/draft length 来适配不同 compute profile，也可在 FLOPs/token 上保持竞争力。但论文没有给出大 batch 的实际 tokens/s 曲线或线上 request scheduling 结果。
- 领域差异：Table 2 的任务级 T/NFE 显示收益并不均匀。1.5B 下 GSM8K 为 5.07，MBPP+ 为 9.43，GSM8K 低约 46%；8B Trust Diff 下 GSM8K 为 7.07，MBPP+ 为 10.13，GSM8K 低约 30%。MBPP / MBPP+ 类代码任务更接近最大接收长度，GSM8K 数学推理任务的接收长度更短，应作为高推理难度场景的保守估计。
- batch边界：Figure 1 的 free / cheap token slots 来自 Qwen3-32B 在 NVIDIA H100、batch size=1、Flash Attention 2 下的 latency profiling。这个图证明在特定 serving profile 中，增加一定 token slots 不会线性增加 latency；但它并不证明所有 GPU、所有 batch、所有 prefix length 下都有同等 free slots。实际服务中若 continuous batching 已经把模型推到 compute-bound，TiDAR 的收益可能会变化。
- 领域差异：论文表格中最大 T/NFE 为 10.13，出现在 8B 的 MBPP+；最低的 TiDAR 任务级 T/NFE 是 1.5B 的 GSM8K 5.07。这个跨度说明“平均 7-8 token per NFE”背后有明显任务结构差异。复现时不应只跑平均样本，而要分别覆盖 coding、math、knowledge、reasoning 与真实线上 prompt。
参考图片：
- ![TiDAR Figure 1: latency scaling over token slots](pdf_xml\final\images\picture_002.png)
- Figure 1 展示 Qwen3-32B 在 H100、batch size=1、Flash Attention 2 下随 token slots 增加的 latency scaling，并标出 free / cheap token slots。
- ![TiDAR Table 2: task-level T/NFE](pdf_xml\final\images\table_002.png)
- Table 2 提供各任务 T/NFE，用于说明 MBPP+ 与 GSM8K 的接收长度差异。
备注：
- 不要把 batch=1 结果外推成所有 serving profile 的通用收益。

### Page 9: 训练成本
所属章节：落地边界
页面标题：训练成本
标题说明：TiDAR需基于AR模型继续预训练50B/150B tokens，不能按training-free插件估算
分析总结：
- 明确成本：1.5B约25k steps，8B约75k steps，H100训练但未披露卡数和GPU-hours
- 结构成本：训练需append mask tokens，长上下文效率和serving kernel仍需工程验证
正文内容：
- 明确成本：论文 Section 4.1 说明 TiDAR 采用 continual pretraining from AR models。1.5B 从 Qwen2.5 1.5B 继续训练 50B tokens，global batch 2M tokens，对应约 25k steps；8B 从 Qwen3 8B 继续训练 150B tokens，对应约 75k steps。训练使用 NVIDIA H100s、BF16、distributed Adam、max sequence length 4096，8B 开启 gradient checkpointing，框架为 modified Megatron-LM with TorchTitan support。
- 结构成本：TiDAR 的当前实现训练时需要 append mask tokens，作者在 Limitations 中说当前实现需要把 mask tokens 追加到序列中，因此长上下文扩展方法仍留作未来工作。推理侧还依赖 Flex Attention mask slicing、KV cache eviction、可能的 custom attention kernels 与 scheduling；这些都属于落地成本。
- 明确成本：论文没有披露 H100 卡数、训练小时、GPU-hours、具体语料组成或训练吞吐，因此复现预算不能从论文精确估算。对评审来说，应把它放在“继续预训练新结构”的成本档，而不是 speculative decoding 插件或 training-free 推理技巧的成本档。
- 结构成本：TiDAR 的训练成本还包括方法验证成本：需要确认混合 AR / diffusion loss 是否能稳定复现论文中的接收长度与质量；需要确认不同 draft length 是否能适配自家 GPU 与 serving profile；还需要确认模型改造后是否影响已有部署链路、监控指标和回滚策略。建议先做 1.5B 小规模复现，再决定是否进入 8B 级训练。
参考图片：
- ![TiDAR Figure 3: attention mask and training structure](pdf_xml\final\images\picture_004.png)
- Figure 3 可用于说明训练 mask 与推理 mask 的结构成本。
备注：
- 训练成本页应明确论文未披露卡数和 GPU-hours，避免制造虚假的复现预算精度。


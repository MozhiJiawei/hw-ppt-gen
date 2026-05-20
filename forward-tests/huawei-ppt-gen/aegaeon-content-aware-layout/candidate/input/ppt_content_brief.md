# PPT Content Brief

## Deck Metadata
主题：Aegaeon 面向模型市场并发 LLM 服务的 GPU Pooling 价值评估
目标读者：AI 平台/云服务技术负责人
页数口径：7 total PPT pages；Page 1 封面，Page 2 顶层总结页，Page 3 目录页，Page 4-7 正文内容页
核心结论：Aegaeon 用 token-level auto-scaling 把多模型市场服务从“为长尾和突发分别预留 GPU”推进到“按 token 间隙动态共享 GPU”，在论文实验中提升到达率或 goodput，并在 Alibaba Cloud Model Studio beta 部署中把 H20 GPU 需求从 1,192 降至 213。
内容来源：Aegaeon parsed source package（fresh run, 2026-05-18 14:57）
关联审计文件：research_audit.md

## Summary Page
页码：Page 2
页面标题：Aegaeon GPU Pooling
标题说明：面向模型市场长尾与突发并发，以 token-level scaling 将生产 GPU 需求降低 82%
分析总结：
- 场景：94.1% 长尾模型仅贡献 1.35% 请求，却占用 17.7% GPU
- 机制：token 粒度抢占换模，绕开 request-level HOL blocking
- 结果：1,192 个 H20 降至 213 个，70 小时未观察到 SLO violation
正文内容：
- 场景：这份材料应从平台负责人的成本问题讲起。论文描述的不是单模型高吞吐场景，而是模型市场：Alibaba Cloud Model Studio 面对 thousands of different models，调用分布高度倾斜。Figure 1(a) 给出最关键的规模信号：779 个模型中 94.1% 属于 less-used models，只贡献 1.35% of 167.6M requests，却占用 17.7% of 30K GPUs。这个比例说明，长尾模型如果采用专属实例或保守预留，会把 GPU 变成低频请求的固定成本；Figure 1(b) 又显示热门 270B、TP=8 模型会出现超过 reserved capacity 的 burst，使平台还要为峰值保留额外余量。
- 机制：Aegaeon 的判断价值在于，它没有把问题只归因于“调度更聪明一点”，而是指出 request-level auto-scaling 的结构上限。LLM request 服务时间较长，低频请求也会让模型长期处于 active 状态；在 100 个模型、总到达率 3.7 req/s 的例子中，平均 active model count 达到 46.55，导致有效 pooling 仍低于 3 models/GPU。Aegaeon 把抢占换模推进到 token 间隙，分别处理 prefill 的 TTFT 和 decoding 的 TBT，并通过 component reuse、显式内存管理、fine-grained KV cache synchronization 把换模相关开销从约 26.9s 降到 0.8s。
- 结果：对云平台负责人而言，最强信号不是单一曲线胜出，而是实验和部署共同指向可评估的 OPEX 价值。论文报告 Aegaeon 相比 ServerlessLLM、MuxServe 等方案可支撑 2-2.5x higher request arrival rates 或 1.5-9x more goodput，并支持 up to seven models per GPU。生产侧，Model Studio beta 部署服务 47 个模型，覆盖 1.8B-72B 参数规模，H20 GPU 从 1,192 降到 213，节省 82%；70 小时观测中 GPU 利用率提升至 48.1%，论文表述为未观察到 SLO violations 或 service disruptions。
- 阅读顺序建议：先看 Figure 1 的 workload shape，理解为什么模型市场不同于单模型服务；再看 Figure 2 / Figure 4，理解 request-level 的 active-model ceiling；然后看 Figure 7 / Figure 10，判断 token-level scaling 是否工程上可行；最后用 Figure 18 和部署数字收束为平台评估问题：这类机制适合拥有大量中低频模型、又必须控制 SLO 的服务平台优先验证。
参考图片：
- ![Figure 1: 长尾模型 CDF 与热门模型 burst](<source_images/figure01_workload.png>)
- Figure 1 展示模型市场中的长尾请求分布与热门 270B 模型 burst，是“场景”判断的主证据。
- ![Figure 2: request-level 与 token-level auto-scaling 对比](<source_images/figure02_request_token.png>)
- Figure 2 说明 request-level 等待完整请求结束，而 token-level 在 token 间隙插入新模型执行，是“机制”判断的入口图。
- ![Figure 18: Aegaeon 部署前后 GPU utilization](<source_images/figure18_gpu_utilization.png>)
- Figure 18 展示部署前后 70 小时 GPU utilization，对应“结果”判断中的生产侧信号。
备注：
- SLO 表述建议保持为“未观察到 violation / disruption”，不要改写成任何负载下的保证。

## Table of Contents
01 小标题：浪费来自市场形态
说明：证明 GPU 浪费来自模型市场的长尾与突发并发，而不是单模型 serving 性能不足。

02 小标题：突破在 token 粒度
说明：证明 Aegaeon 用 token-level preemptive scaling 绕开 request-level pooling 的 active-model 上限。

03 小标题：价值由生产验证
说明：证明该机制不只提升实验指标，也在 Alibaba Cloud Model Studio 形成 GPU 节省和稳定服务结果。

## Page Content

### Page 4: 市场型浪费
所属章节：浪费来自市场形态
页面标题：市场型浪费
标题说明：长尾模型只贡献 1.35% 请求却占 17.7% GPU，热门模型 burst 又推高冗余预留
分析总结：
- 长尾错配：94.1% 模型低频调用，专属预留放大闲置成本
- 突发冗余：热门 270B 模型请求峰值会超过 reserved capacity
正文内容：
- 长尾错配：Figure 1(a) 是本页主图。它把“模型市场”从抽象概念变成成本结构：94.1% of 779 models 位于长尾，只贡献 1.35% of 167.6M requests，却占用 17.7% of 30K GPUs。对平台负责人来说，这意味着问题不只是单卡吞吐不够，而是大量模型为了偶发调用被长期保留服务能力；如果每个模型都需要专属 GPU 或近似专属的实例容量，低频模型会把闲置成本系统性放大。
- 长尾错配：正文可以补充“平均少于 0.2 requests per second per GPU”的上下文，用来解释为什么单靠增加请求批处理或优化单模型 serving 难以解决问题。Aegaeon 关注的是跨模型共享：让不同模型的请求在同一个 GPU 池里更细粒度地交替服务，从而减少低频模型的固定 GPU 占用。
- 突发冗余：Figure 1(b) 展示 top model 的 request rate fluctuation。图中橙色 burst 超过绿色 reserved capacity，说明热门模型同样会制造浪费：平台必须为峰值保留冗余，平时则处于利用率不足。长尾和突发看似相反，其实都要求平台用更多预留资源换 SLO 安全垫。
- 突发冗余：本页的决策含义是，把 GPU pooling 的目标定义为“在不牺牲服务等级目标的前提下服务尽可能多模型”，而不是简单把多个模型塞进一张卡。传统 multiplexing 会受显存容量限制，论文示例指出 80GB GPU 最多只能容纳两个 14B FP16 模型；这解释了为什么模型市场需要动态换模，而不是静态共置。
- 可放在讲者备注中的连接句：如果平台服务的是少数稳定热门模型，本页材料并不足以证明 Aegaeon 一定必要；但如果平台拥有大量低频模型、热模型又有突发峰值，那么 GPU 成本的主要矛盾就来自市场形态本身，后续页才需要讨论 request-level 为什么不够、token-level 是否可行。
参考图片：
- ![Figure 1: concurrent LLM serving workloads](<source_images/figure01_workload.png>)
- Figure 1 展示 94.1% 长尾模型、1.35% 请求占比、17.7% GPU 占比，以及 top model burst 超过 reserved capacity。
备注：
- 不要把 Figure 1 外推为所有云平台的通用分布；它支撑的是模型市场型并发服务场景。

### Page 5: Request-Level 上限
所属章节：突破在 token 粒度
页面标题：Request-Level 上限
标题说明：3.7 req/s 已让 100 个模型平均 46.55 个 active，pooling 仍被压在 <3 models/GPU
分析总结：
- 根因：LLM request 服务时间长，低频调用也会形成大量 active models
- 后果：新模型需等待旧 request 结束，HOL blocking 转化为 SLO 风险
正文内容：
- 根因：本页要让读者看到，request-level auto-scaling 的瓶颈不是实现不够快，而是动作粒度太粗。论文用 Theorem 3.1 描述 active model count：只要某模型还有至少一个 request 在服务，它就会占据 active 状态。因为 LLM request 的服务时间通常较长，即使单个模型到达率不高，也会让许多模型同时 active。论文给出的现实参数是 M=100、lambda=0.037、T=16.79s，对应平均 active model count 为 46.55。
- 根因：这个 46.55 的含义需要翻译成平台语言：总到达率只有 3.7 req/s 时，系统仍要为近一半模型保留正在服务的实例状态。若采用 request-level scale-down，模型只有等当前 request 完整结束后才能释放 GPU；低频模型并不会因为请求少就马上变成可驱逐对象，反而会被长输出持续占用。
- 后果：Figure 2(a) 是本页第二个主证据。它展示了 request-level auto-scaling 下，新到达的 Model B / Model C 请求要等待旧模型 request 完成后才能执行。等待不是普通队列延迟，而是 head-of-line blocking：当前 GPU 被 active models 占满时，新模型请求即使很短，也要承受完整旧 request 的剩余服务时间，TTFT 和 TBT 都可能错过服务等级目标。
- 后果：正文可以把 pooling 上限讲清楚：如果 100 个模型平均 46.55 个 active，即使系统理想地只为 active models 保留 GPU，也只是 100/46.55，小于 3 models/GPU。这与传统 multiplexing 的 2-3 models/GPU 上限处在同一数量级，说明 request-level auto-scaling 没有真正打开模型市场需要的共享空间。
- 转场建议：本页结论不是“不要 auto-scaling”，而是“不能只在 request 结束时 scale”。下一页的 Aegaeon 正是把可抢占点从 request 边界前移到 token 边界：在不等待完整 request 结束的情况下，让待服务模型插入执行窗口。
参考图片：
- ![Figure 4: active model count over time](<source_images/figure04_active_model_count.png>)
- Figure 4 展示 M=100、lambda=0.037、T=16.79s 条件下的 active model count，估计值 E[m]=46.55。
- ![Figure 2: request-level auto-scaling causes waiting](<source_images/figure02_request_token.png>)
- Figure 2(a) 说明 request-level auto-scaling 下新模型请求需要等待旧 request 结束，对应 HOL blocking 与 SLO 风险。
备注：
- <3 models/GPU 是由论文给定参数推导出的直观解释，应放在该场景内使用。

### Page 6: Token-Level 破局
所属章节：突破在 token 粒度
页面标题：Token-Level 破局
标题说明：Aegaeon 在 token 间隙抢占换模，用 prefill/decoding 分治调度降低 SLO 违约
分析总结：
- 调度：prefill 优先 TTFT，decoding 用 weighted round-robin 控制 TBT
- 换模：component reuse、显式内存和 KV 同步将开销降至 0.8s
正文内容：
- 调度：Aegaeon 的核心不是把所有模型静态放在同一 GPU，而是在 token 生成的间隙做 preemptive auto-scaling。Figure 2(b) 可以作为开场图：与 request-level 等待完整请求结束不同，token-level 方法允许 GPU 在 Model A、B、C 的 token 工作之间切换，从而减少新模型请求的等待。这个机制的目标是提升 SLO attainment，而不是单纯追求平均吞吐。
- 调度：论文把 LLM 请求拆成 prefill 和 decoding 两类 token generation jobs，因为两者的延迟目标不同。Prefill 影响 Time-To-First-Token，Aegaeon 使用 grouped FCFS 思路，让同模型 prefill job 尽量成组并降低首 token 等待；decoding 影响 Time-Between-Tokens，Aegaeon 使用 weighted round-robin，按 token deadline 与等待情况控制不同请求的生成节奏。本页可以用“TTFT / TBT 两套目标”解释为什么一个统一队列不够。
- 调度：Figure 5 展示系统路径：proxy layer 接收请求并同步元数据，prefill instances 与 decode instances 承担不同阶段，memory management 管理 model cache 与 unified CPU KV cache，remote loading 与 Redis 状态同步支撑跨实例协作。PPT 正文不需要展开每个编号，只要让读者看到 Aegaeon 是完整 serving system，而不是单个调度算法。
- 换模：token-level 的最大质疑是换模太频繁会不会吞掉收益。Figure 7 给出关键回答：默认 preemptive scaling 包含 KV cache swap-out、garbage collection、engine reinitialization、model loading、profile、KV cache init 等步骤；Aegaeon 通过 component reuse 复用 tokenizer、communication group、distributed executor 等组件，把初始化相关延迟从约 26.9s 降到 0.8s。这个数量级变化是 token-level pooling 从想法变成可评估工程方案的关键。
- 换模：Figure 9 和 Figure 10 可作为补充素材。Figure 9 说明显式管理 GPU/host memory、model cache、unified CPU KV cache，减少碎片和重复加载；Figure 10 说明 fine-grained KV cache synchronization，把 critical operations 与 non-critical operations 分离，并通过 move lists 与 CUDA event 机制减少阻塞。讲法上应强调“减少换模的阻塞路径”，而不是把所有优化细节塞满页面。
- 本页收束语：Aegaeon 的工程答案是“调度粒度更细 + 换模路径更短”。若只有调度没有 0.8s 级换模，token-level 会被 overhead 抵消；若只有换模优化没有 TTFT/TBT 感知调度，也可能把高频抢占变成 SLO 风险。两者合在一起，才支撑后续实验和生产结果。
参考图片：
- ![Figure 2: token-level auto-scaling timeline](<source_images/figure02_request_token.png>)
- Figure 2(b) 展示 token-level auto-scaling 在 token 间隙插入不同模型执行，减少 request-level 等待。
- ![Figure 5: Aegaeon system overview](<source_images/figure05_system_overview.png>)
- Figure 5 展示 proxy、prefill/decode instances、memory management、model cache 与 unified CPU KV cache 的系统关系。
- ![Figure 7: preemptive scaling overhead breakdown](<source_images/figure07_scaling_overhead.png>)
- Figure 7 展示默认 preemptive auto-scaling 与 Aegaeon 优化后的 initialization latency breakdown，核心数字是约 26.9s 到 0.8s。
- ![Figure 9: explicitly managed memory in Aegaeon](<source_images/figure09_memory_management.png>)
- Figure 9 说明显式管理内存、model cache、unified CPU KV cache 与 PCIe 传输路径。
- ![Figure 10: fine-grained KV cache synchronization](<source_images/figure10_kv_sync.png>)
- Figure 10 展示 fine-grained KV cache synchronization 如何把关键和非关键操作分离。
备注：
- 不要把调度写成全局最优；论文明确采用可实时运行的 practical scheduling policies。

### Page 7: 生产级收益
所属章节：价值由生产验证
页面标题：生产级收益
标题说明：Model Studio beta 部署 47 个模型，H20 GPU 从 1,192 降至 213，节省 82%
分析总结：
- 实验：Aegaeon 支撑 2-2.5x arrival rate 或 1.5-9x goodput
- 生产：70 小时利用率升至 48.1%，未观察到 SLO violation
正文内容：
- 实验：论文实验把 Aegaeon 与 ServerlessLLM、ServerlessLLM+、MuxServe 等方案对比。摘要和 Evaluation 部分报告，Aegaeon 可 sustain 2-2.5x higher request arrival rates 或 1.5-9x more goodput，并支持 up to seven models per GPU。Figure 11 展示 ShareGPT dataset 下不同 RPS 与模型数量时的 SLO attainment，Aegaeon 曲线在更高模型数或更高到达率下保持更高服务等级目标达成率。
- 实验：Figure 13 可作为横向容量图，展示在 RPS=0.1、RPS=0.5 和 40 models 条件下，Aegaeon 相比 ServerlessLLM / ServerlessLLM+ / MuxServe 的 SLO attainment 下降更慢。Figure 17 可作为边界补充：在 4xA10 节点增加模型数、以及 8xH800 节点服务 72B models、TP=4 时，Aegaeon 仍展示较好的达成率，但 strict / normal / loose SLO 配置会影响可承受共享强度。
- 生产：生产部署是本页主结论。论文描述 Aegaeon 在 Alibaba Cloud Model Studio beta deployment 超过三个月，部署集群包含 213 H20 GPUs，服务 28 个 1.8-7B models、TP=1，以及 19 个 32-72B models、TP=4，共 47 个模型。原本这些模型由 1,192 H20 GPUs 服务，Aegaeon 后降至 213，形成 82% resource saving。
- 生产：Figure 18 展示 70-hour period 的 GPU utilization。部署前，最低负载实例和最高负载实例平均利用率分别为 13.3% 与 33.9%；部署后 Aegaeon 记录为 48.1%。论文同时说明，在监控期间没有 observable SLO violations 或 service disruptions。对平台负责人而言，这比单纯 benchmark 更重要，因为它把“可调度”转化成“可降低 GPU 需求且没有观察到服务风险”的平台信号。
- 决策含义：建议把 Aegaeon 作为模型市场型服务的候选基础设施方向，而不是立即替换所有推理服务栈。优先评估场景包括：模型数量多、长尾请求占比高、热门模型有 burst、当前 GPU 预留策略保守、平台可以接受更复杂的调度与内存管理。需要谨慎的场景包括：少数稳定高频模型、极端 strict SLO、或模型/硬件组合导致换模成本明显高于论文环境。
参考图片：
- ![Figure 11: end-to-end SLO attainment under varying RPS](<source_images/figure11_slo_attainment.png>)
- Figure 11 展示 ShareGPT dataset 下不同 RPS 与输出长度条件中的 SLO attainment 曲线。
- ![Figure 13: SLO attainment comparison across model counts](<source_images/figure13_slo_comparison.png>)
- Figure 13 展示 Aegaeon 与 ServerlessLLM、ServerlessLLM+、MuxServe 的服务等级目标达成率对比。
- ![Figure 17: larger model and SLO sensitivity boundary](<source_images/figure17_slo_sensitivity.png>)
- Figure 17 展示 A10 与 H800 场景下模型数量、到达率和 strict/normal/loose SLO 设置对达成率的影响。
- ![Figure 18: 70-hour GPU utilization after deployment](<source_images/figure18_gpu_utilization.png>)
- Figure 18 展示部署前后 70 小时 GPU utilization，是生产收益页的主图。
备注：
- 建议用“值得评估的基础设施方向”收束，而不是宣称所有平台都应采用。

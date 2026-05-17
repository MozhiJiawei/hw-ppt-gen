# PPT Content Brief

## Deck Metadata
主题：GPU Pooling 价值评估
目标读者：AI 平台技术负责人
页数口径：5 total PPT pages；Page 1 封面，Page 2 顶层总结页，Page 3 目录页，Page 4-5 正文内容页
核心结论：模型市场的长尾和突发并发让 GPU 预留成本系统性放大，token 级 pooling 值得优先评估。
内容来源：Aegaeon paper package
关联审计文件：research_audit.md

## Summary Page
页码：Page 2
页面标题：GPU Pooling
标题说明：面向模型市场长尾与突发并发，用 token 级共享降低保守预留。
分析总结：
- 场景：长尾模型低频调用会放大固定 GPU 占用。
- 机制：token 间隙抢占换模比 request 结束后释放更细。
- 判断：适合多模型市场先做受控评估，而不是替代所有服务。
正文内容：
- 场景：模型市场里大量模型请求频率低，但为了服务等级目标仍需要保留可用服务能力，这会把低频调用转成固定 GPU 成本。
- 机制：token 间隙抢占换模把释放资源的动作从完整 request 边界前移到 token 工作间隙，让新模型请求减少等待。
- 判断：这类方案最适合模型数量多、热门模型有 burst、当前 GPU 预留策略偏保守的平台先做验证。
参考图片：
- Figure 1：长尾模型和热门模型 burst，用于证明场景。
备注：
- 保持为评估建议，不宣称所有平台都适用。

## Table of Contents
01 小标题：浪费来自市场形态
说明：证明 GPU 浪费来自模型市场的长尾与突发并发。

02 小标题：突破在 token 粒度
说明：说明 token-level scaling 如何绕开 request-level 的等待上限。

## Page Content

### Page 4: 市场型浪费
所属章节：浪费来自市场形态
页面标题：市场型浪费
标题说明：长尾模型低频请求与热门模型 burst 共同推高 GPU 冗余预留。
分析总结：
- 长尾错配：低频模型需要保留服务能力，闲置成本被系统性放大。
- 突发冗余：热门模型峰值超过保守容量时，平台必须维持安全垫。
正文内容：
- 长尾错配：长尾模型贡献请求少，但如果每个模型都接近专属实例或专属容量，低频调用会持续占用 GPU 资源。
- 突发冗余：热门模型的短时峰值会迫使平台保留额外容量，平时这部分容量又会变成低利用率资源。
- 本页应把问题定义为模型市场的容量组织问题，而不是单模型推理性能问题。
参考图片：
- Figure 1(a)：长尾模型与请求占比。
- Figure 1(b)：热门模型 burst 超过 reserved capacity。
备注：
- 不外推为所有云平台的通用分布。

### Page 5: Token-Level 破局
所属章节：突破在 token 粒度
页面标题：Token-Level 破局
标题说明：Aegaeon 在 token 间隙抢占换模，降低 request-level 等待带来的 SLO 风险。
分析总结：
- 调度：prefill 和 decoding 分别服务 TTFT 与 TBT 目标。
- 换模：组件复用和显式内存管理压缩换模阻塞路径。
正文内容：
- 调度：Aegaeon 把请求拆成 prefill 和 decoding 工作，分别围绕首 token 与后续 token 间隔控制调度。
- 换模：组件复用、显式内存管理和 KV cache 同步减少频繁换模的阻塞开销，让 token-level pooling 具备工程可评估性。
- 本页应强调调度粒度和换模成本必须同时成立，单独任一项都不足以支撑生产评估。
参考图片：
- Figure 2(b)：token-level auto-scaling 示意。
- Figure 7：换模开销对比。
备注：
- 不写成全局最优调度。

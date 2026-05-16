const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");

const ShapeType = pptxgen.ShapeType || { rect: "rect" };

const {
  estimateTextBoxHeight,
  estimateWrappedLines,
} = require("../pptx/hw_pptx_helpers");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, ".tmp", "text_height_estimation_smoke");
const SLIDE = { w: 13.333, h: 7.5 };
const PX = { perIn: 180 };
const ALLOWED_TEXT_FONT_SIZES = new Set([10, 12, 14, 18, 24]);

const REGRESSION_CASES = [
  {
    id: "cjk_10_w1_6_narrow",
    label: "10pt窄栏纯中文",
    fontSize: 10,
    width: 1.6,
    text: "核心业务连续性保障需要在跨部门协同、异常升级与数据回填之间形成闭环，避免关键节点遗漏。",
  },
  {
    id: "cjk_10_w3_7_body",
    label: "10pt三分栏中文正文",
    fontSize: 10,
    width: 3.7,
    text: "左列说明背景，中列承载结构证据，右列给出边界条件。三栏都需要保持紧凑，不能留下明显空洞。",
  },
  {
    id: "apple_p2_method_12_w3_7",
    label: "Apple三分栏方法文字复现",
    fontSize: 12,
    width: 3.7,
    text: "Apple R-CLA的核心不是再做一个缓存调度器，而是把问题前移到模型训练阶段。\n部署时再固定为确定性分组策略，只缓存leader layer的KV，其余层复用最近的前层KV。",
  },
  {
    id: "apple_p2_benefit_12_w3_7",
    label: "Apple三分栏收益hyphen复现",
    fontSize: 12,
    width: 3.7,
    text: "- 8,192 input length、batch size 1时，group size g=4把KV cache从1,170MB降至293MB。\n- 相同8K context下，batch size 16时baseline g=1出现OOM，而g=4可以完成运行。\n- 所以收益证据不是“省一点显存”，而是长上下文高并发下的容量弹性。",
  },
  {
    id: "apple_p2_gate_12_w3_7",
    label: "Apple三分栏落地hyphen复现",
    fontSize: 12,
    width: 3.7,
    text: "- R-CLA的收益需要训练或微调预算购买。\n- PoC先测50% retention：业务质量、训练时长、GPU成本和推理节省是否回本。\n- 无官方代码时，需预留复现、评测集和业务样本适配成本。",
  },
  {
    id: "apple_p6_cost_12_w5_8",
    label: "Apple二分栏训练成本复现",
    fontSize: 12,
    width: 5.8,
    text: "- 微调设置：50,000 steps、batch size 128、maximum input length 8,192 tokens\n- 满长粗算：训练token上界约为50,000 × 128 × 8,192 ≈ 52.4B tokens\n- Figure 7显示Qwen3-8B和Llama-3.1-8B上，R-CLA的train/eval loss下降更慢",
  },
  {
    id: "apple_p6_quality_12_w5_8",
    label: "Apple二分栏精度边界复现",
    fontSize: 12,
    width: 5.8,
    text: "- SQuAD v2的50% retention F1，Llama-3.1-8B从0.427到0.740，Mistral-7B从0.388到0.654，Qwen3-8B从0.269到0.627。\n- 25% retention是激进压缩档；“优于Base崩溃”不等于“业务无损”。",
  },
  {
    id: "cjk_12_w3_7",
    label: "中文三分栏基线",
    fontSize: 12,
    width: 3.7,
    text: "训练阶段随机跨层读取KV，推理阶段按分组少存layer cache。\n收益来自长上下文高并发下的容量弹性，而不是单点显存节省。",
  },
  {
    id: "long_token_12_w3_7",
    label: "长英文token混排",
    fontSize: 12,
    width: 3.7,
    text: "平台兼容HuaweiCloudStack-OperationsTelemetryPipeline与edge-node-2026A批量日志，仍要保证回归测试可解释。",
  },
  {
    id: "punctuation_12_w3_7",
    label: "中英文标点混排",
    fontSize: 12,
    width: 3.7,
    text: "PoC建议从50% retention开始：先测业务质量、训练时长、GPU成本和推理节省；再决定是否进入25%档。",
  },
  {
    id: "plain_hyphen_not_native_bullet",
    label: "普通hyphen不是原生bullet",
    fontSize: 12,
    width: 3.7,
    text: "- 第一条是普通文本中的连字符，不应按原生项目符号扣缩进。\n- 第二条继续验证中文、English token和数字128混排。",
  },
  {
    id: "hard_breaks_12_w5_8",
    label: "12pt二分栏硬换行",
    fontSize: 12,
    width: 5.8,
    text: "第一阶段：梳理现网问题。\n第二阶段：补齐监控通知。\n第三阶段：形成周度复盘。",
  },
  {
    id: "many_spaces_10_w1_6",
    label: "10pt窄栏多空格",
    fontSize: 10,
    width: 1.6,
    text: "状态  正常    待确认  已关闭  需复核；字段间保留多空格用于模拟人工录入。",
  },
  {
    id: "bullet_14_w3_7",
    label: "14pt三分栏hyphen",
    fontSize: 14,
    width: 3.7,
    text: "- 统一问题入口与责任人\n- 关键告警15分钟内确认\n- 外部承诺、内部SOP、复盘材料同步归档",
  },
  {
    id: "hard_breaks_14_w5_8",
    label: "14pt二分栏硬换行",
    fontSize: 14,
    width: 5.8,
    text: "训练成本先评估。\n精度边界再验证。\n业务样本最后回放。",
  },
  {
    id: "summary_18_w7_2",
    label: "18pt摘要短句",
    fontSize: 18,
    width: 7.2,
    text: "先验证训练回本，再扩大到高并发长上下文场景。",
  },
  {
    id: "title_24_w7_2",
    label: "24pt标题短句",
    fontSize: 24,
    width: 7.2,
    text: "稳定、透明、可复盘。",
  },
  {
    id: "mixed_symbols_12_w3_7",
    label: "12pt符号混排",
    fontSize: 12,
    width: 3.7,
    text: "路径A/B/C -> owner=OPS; retry=3; error<0.15%; id=E-1007，需要同步回填。",
  },
  {
    id: "full_width_punctuation_12_w3_7",
    label: "12pt全角标点",
    fontSize: 12,
    width: 3.7,
    text: "“高优先级”场景需覆盖：识别、派单、处置、复盘；灰度发布不能被拆散。",
  },
  {
    id: "round1_mixed_model_percent_11_w2_6",
    label: "第1轮 12pt窄栏模型百分比混排",
    fontSize: 12,
    width: 2.6,
    text: "Qwen2.5-72B-Instruct在A/B组命中率提升至97.8%，但p95延迟仍需回看。",
  },
  {
    id: "round1_brackets_colon_12_w3_7",
    label: "第1轮 12pt括号冒号混排",
    fontSize: 12,
    width: 3.7,
    text: "阶段(灰度): API Gateway、NOC与一线SRE同步；失败码[E-42]要回填到周报。",
  },
  {
    id: "round1_chinese_quotes_punct_12_w3_7",
    label: "第1轮 12pt中文引号连续标点",
    fontSize: 12,
    width: 3.7,
    text: "“已确认”的告警不等于“已关闭”！！需补充owner、SLA%、根因与复盘链接。",
  },
  {
    id: "round1_short_long_lines_12_w5_8",
    label: "第1轮 12pt短行长行混合",
    fontSize: 12,
    width: 5.8,
    text: "结论：先保守上线。\n长行说明：跨Region容灾、Billing-2026Q2对账、客户承诺与内部SOP要在同一页里说清楚。",
  },
  {
    id: "round1_long_model_name_10_w3_7",
    label: "第1轮 10pt长模型名",
    fontSize: 10,
    width: 3.7,
    text: "模型HuaweiCloudStack-TelemetryRCA-2026-Preview-v3.1-beta与ops-kpi_rolling_28d指标绑定。",
  },
  {
    id: "round1_symbols_ratio_13_w5_8",
    label: "第1轮 12pt符号比例混排",
    fontSize: 12,
    width: 5.8,
    text: "CPU/GPU=1:4，cache-hit>=93%，rollback<=2次；owner=平台&交付，窗口20:30-21:10。",
  },
  {
    id: "round1_fullwidth_halfwidth_14_w3_7",
    label: "第1轮 14pt全半角混排",
    fontSize: 14,
    width: 3.7,
    text: "版本v2.0（Beta）覆盖“高价值客户”：Top-20、VIP-A、政企专线；异常率<0.5%。",
  },
  {
    id: "round1_parentheses_digits_12_w7_2",
    label: "第1轮 12pt宽栏括号数字",
    fontSize: 12,
    width: 7.2,
    text: "补充说明(仅用于周会): 3个Region、12条SLA、48小时观察窗，指标从99.90%提升到99.95%。",
  },
  {
    id: "round1_mixed_quote_breaks_11_w5_8",
    label: "第1轮 12pt引号硬换行",
    fontSize: 12,
    width: 5.8,
    text: "“先止血，再复盘。”\nAPI、工单、IM消息三路证据要对齐：时间戳、责任人、客户影响面。",
  },
  {
    id: "round1_dense_but_supported_13_w3_7",
    label: "第1轮 12pt合理密度正文",
    fontSize: 12,
    width: 3.7,
    text: "排障摘要：RCA-2026-05命中cache miss、token burst与限流阈值；预计节省18%人工复核。",
  },
  {
    id: "round2_formula_cn_11_w2_6",
    label: "第2轮 12pt窄栏中文公式",
    fontSize: 12,
    width: 2.6,
    text: "容量估算：QPS峰值 = 并发数 × 单请求token / p95耗时，需保留15%冗余。",
  },
  {
    id: "round2_url_fragment_11_w3_7",
    label: "第2轮 12pt URL片段",
    fontSize: 12,
    width: 3.7,
    text: "回放入口 /ops/rca?id=INC-2026-0515&region=cn-north-4，注意query不要折断语义。",
  },
  {
    id: "round2_currency_units_13_w5_8",
    label: "第2轮 12pt货币单位混排",
    fontSize: 12,
    width: 5.8,
    text: "单月成本从USD 128k降至USD 104.6k；存储节省2.4TB，出口带宽减少380GB/day。",
  },
  {
    id: "round2_nested_parentheses_11_w5_8",
    label: "第2轮 12pt括号嵌套",
    fontSize: 12,
    width: 5.8,
    text: "复盘范围包含告警(平台侧[含NOC/SRE]、客户侧[含VIP-A])，不含历史低优先级噪声。",
  },
  {
    id: "round2_cjk_symbol_markers_13_w3_7",
    label: "第2轮 12pt类图标符号",
    fontSize: 12,
    width: 3.7,
    text: "状态[OK]→观察；状态[WARN]→限流；状态[FAIL]→回滚，三类路径都要留痕。",
  },
  {
    id: "round2_abbrev_dense_11_w2_6",
    label: "第2轮 12pt英文缩写密集",
    fontSize: 12,
    width: 2.6,
    text: "SLA/SLO/SRE/NOC/RCA与MTTR、MTBF、RTO、RPO同步看，避免单指标误判。",
  },
  {
    id: "round2_formula_symbols_13_w7_2",
    label: "第2轮 12pt宽栏公式符号",
    fontSize: 12,
    width: 7.2,
    text: "判定规则：score = 0.45×质量 + 0.35×成本 + 0.20×时延；score>=0.82才进入扩容池。",
  },
  {
    id: "round2_ipv6_like_url_11_w3_7",
    label: "第2轮 12pt地址与URL混排",
    fontSize: 12,
    width: 3.7,
    text: "探测地址 fe80::a12:7bff:fe09:24c1/api/v1/health，失败时回落到gw-ops-01。",
  },
  {
    id: "round2_units_short_long_13_w5_8",
    label: "第2轮 12pt单位短长行",
    fontSize: 12,
    width: 5.8,
    text: "阈值：75ms。\n说明：当payload>512KB且burst>1,200 req/min时，优先启用边缘缓存与批量确认。",
  },
  {
    id: "round2_mixed_codes_money_11_w7_2",
    label: "第2轮 12pt宽栏代码货币",
    fontSize: 12,
    width: 7.2,
    text: "预算项CAPEX-Alpha(¥830,000)与OPEX-Beta(¥46,500/月)分开汇总；PO#CN-2026-OPS-017保留。",
  },
  {
    id: "round3_table_note_11_w3_7",
    label: "第3轮 12pt表格脚注混排",
    fontSize: 12,
    width: 3.7,
    text: "表注：N=1,248；缺失值按“-”展示，P0/P1合并统计，环比Δ仅用于趋势判断。",
  },
  {
    id: "round3_metric_chain_13_w3_7",
    label: "第3轮 12pt指标链路说明",
    fontSize: 12,
    width: 3.7,
    text: "漏斗口径：PV→UV→Lead→MQL→SQL，CVR分别为12.6%、4.8%、31.2%。",
  },
  {
    id: "round3_version_matrix_11_w2_6",
    label: "第3轮 12pt版本矩阵窄栏",
    fontSize: 12,
    width: 2.6,
    text: "兼容v1.9.x/v2.0-RC1/v2.1-nightly；老租户保留legacy-mode到6月。",
  },
  {
    id: "round3_cjk_english_terms_13_w5_8",
    label: "第3轮 12pt技术名词堆叠",
    fontSize: 12,
    width: 5.8,
    text: "方案组合：向量检索、rerank、prompt cache、tool-call tracing与灰度评测共同收敛。",
  },
  {
    id: "round3_serial_numbers_11_w5_8",
    label: "第3轮 12pt序列号长短token",
    fontSize: 12,
    width: 5.8,
    text: "样本ID含A7F9-20260515-000348、CN4-BJ-Edge-017与短码K3，需逐条映射。",
  },
  {
    id: "round3_finance_units_13_w7_2",
    label: "第3轮 12pt财务单位密集",
    fontSize: 12,
    width: 7.2,
    text: "收入确认口径：ARR 3.6M、NRR 118%、毛利率64.5%，一次性实施费按¥12.8万剔除。",
  },
  {
    id: "round3_semicolon_clauses_11_w3_7",
    label: "第3轮 12pt分号多分句",
    fontSize: 12,
    width: 3.7,
    text: "风险：依赖上游CMDB；缓解：每日校验；残留：手工标签漂移；负责人：Ops-DQ。",
  },
  {
    id: "round3_table_header_like_12_w2_6",
    label: "第3轮 12pt类表头窄栏",
    fontSize: 12,
    width: 2.6,
    text: "Region | AZ | SKU | Qty\ncn-east-3 | az2 | c7.large.4 | 128",
  },
  {
    id: "round3_multilingual_sku_13_w5_8",
    label: "第3轮 12pt多语言SKU说明",
    fontSize: 12,
    width: 5.8,
    text: "SKU说明：标准版Standard、专业版Pro、旗舰版Ultimate分别绑定中文合同条款A/B/C。",
  },
  {
    id: "round3_operator_heavy_11_w7_2",
    label: "第3轮 12pt运算符密集宽栏",
    fontSize: 12,
    width: 7.2,
    text: "过滤条件：(status!=closed && severity>=P1) || (impact_users>5000 && duration_min>=30)。",
  },
  {
    id: "round4_short_token_biz_11_w2_6",
    label: "第4轮 12pt业务缩写短token",
    fontSize: 12,
    width: 2.6,
    text: "BU/DU/PU按GMV、ARPU、CAC、LTV复盘；ToB与ToC口径不能混算。",
  },
  {
    id: "round4_quote_colon_range_13_w3_7",
    label: "第4轮 12pt引号冒号百分比区间",
    fontSize: 12,
    width: 3.7,
    text: "“健康”阈值：成功率99.3%-99.7%；低于99.1%即触发红线复核。",
  },
  {
    id: "round4_model_alias_11_w5_8",
    label: "第4轮 12pt模型别名长token",
    fontSize: 12,
    width: 5.8,
    text: "模型对比：DeepSeek-R1-Distill-Qwen-32B、glm-4.5-air与internal-reranker-v7同时跑。",
  },
  {
    id: "round4_file_path_13_w5_8",
    label: "第4轮 12pt路径文件名",
    fontSize: 12,
    width: 5.8,
    text: "证据文件位于 reports/2026/Q2/customer_escalation_final_v03.xlsx，需随PPT归档。",
  },
  {
    id: "round4_json_like_11_w3_7",
    label: "第4轮 12pt JSON-like片段",
    fontSize: 12,
    width: 3.7,
    text: "配置片段 {mode:\"canary\", ratio:0.15, owner:\"ops-ai\", ttl:\"48h\"} 仅灰度生效。",
  },
  {
    id: "round4_cn_short_longword_13_w3_7",
    label: "第4轮 12pt中文短句英文长词",
    fontSize: 12,
    width: 3.7,
    text: "先冻结。再验证observability-correlation-pipeline是否仍能覆盖P0事件。",
  },
  {
    id: "round4_nested_quote_status_11_w7_2",
    label: "第4轮 12pt嵌套引号状态",
    fontSize: 12,
    width: 7.2,
    text: "客户反馈“页面显示‘处理中’超过30分钟”，实际后台job_status=WAIT_RETRY，需解释口径差异。",
  },
  {
    id: "round4_percent_band_units_13_w7_2",
    label: "第4轮 12pt百分比区间单位",
    fontSize: 12,
    width: 7.2,
    text: "压缩收益区间为18%-27%，在64GB显存、8K context、batch=12时最稳定。",
  },
  {
    id: "round4_cli_args_11_w5_8",
    label: "第4轮 12pt命令参数混排",
    fontSize: 12,
    width: 5.8,
    text: "回放命令：replay --tenant cn4-vip --from 20:00 --to 21:30 --sample-rate 0.25。",
  },
  {
    id: "round4_parentheses_colon_biz_13_w3_7",
    label: "第4轮 12pt括号冒号业务缩写",
    fontSize: 12,
    width: 3.7,
    text: "责任边界(售前/交付/运维): SOW、UAT、SLA三项材料必须同页可追溯。",
  },
  {
    id: "round5_long_cn_terms_11_w3_7",
    label: "第5轮 12pt长中文英文术语",
    fontSize: 12,
    width: 3.7,
    text: "结论：现网瓶颈不是单点CPU，而是observability、capacity planning与变更节奏共同挤压。",
  },
  {
    id: "round5_view_list_13_w5_8",
    label: "第5轮 12pt列表式观点",
    fontSize: 12,
    width: 5.8,
    text: "观点一：先稳住体验；观点二：再优化成本；观点三：把rollback plan写进发布单。",
  },
  {
    id: "round5_project_phases_11_w5_8",
    label: "第5轮 12pt项目阶段",
    fontSize: 12,
    width: 5.8,
    text: "阶段0(准备)、阶段1(灰度)、阶段2(全量)、阶段3(复盘)分别绑定owner、验收口径与退出条件。",
  },
  {
    id: "round5_risk_mitigation_13_w3_7",
    label: "第5轮 12pt风险缓解",
    fontSize: 12,
    width: 3.7,
    text: "风险—上游数据延迟；缓解—预留manual override，并在日报中标注data freshness。",
  },
  {
    id: "round5_metric_explain_11_w2_6",
    label: "第5轮 12pt窄栏指标解释",
    fontSize: 12,
    width: 2.6,
    text: "MTTR下降不代表体验改善；需同时看首次响应、重复报障率、客户等待时长。",
  },
  {
    id: "round5_cross_team_resp_13_w7_2",
    label: "第5轮 12pt跨部门责任",
    fontSize: 12,
    width: 7.2,
    text: "平台负责容量与监控，交付负责客户沟通，研发负责缺陷修复；三方在war room内同步决策。",
  },
  {
    id: "round5_pause_dash_note_11_w3_7",
    label: "第5轮 12pt破折号备注",
    fontSize: 12,
    width: 3.7,
    text: "备注—若灰度期出现连续两次P1告警，立即暂停扩容，并触发post-mortem review。",
  },
  {
    id: "round5_semicolon_outcome_13_w5_8",
    label: "第5轮 12pt分号结论",
    fontSize: 12,
    width: 5.8,
    text: "结果可接受；成本仍偏高；下一步聚焦prompt routing、缓存复用、低峰批处理。",
  },
  {
    id: "round5_parenthetical_owner_11_w7_2",
    label: "第5轮 12pt括号责任备注",
    fontSize: 12,
    width: 7.2,
    text: "关键动作由客户成功团队牵头(含CSM、TAM、解决方案架构师)，研发只对可复现缺陷承诺SLA。",
  },
  {
    id: "round5_mixed_phrase_conclusion_13_w3_7",
    label: "第5轮 12pt短语结论混排",
    fontSize: 12,
    width: 3.7,
    text: "最终判断：go with guardrails，先小流量验证、再按业务线分批放量。",
  },
  {
    id: "round6_footnote_numbers_11_w2_6",
    label: "第6轮 12pt脚注编号窄栏",
    fontSize: 12,
    width: 2.6,
    text: "结论基于样本¹和回放²；注³：夜间批处理未计入SLA统计。",
  },
  {
    id: "round6_reference_fragment_11_w5_8",
    label: "第6轮 12pt参考文献片段",
    fontSize: 12,
    width: 5.8,
    text: "参考：[1] Zhang et al., 2025, “KV Cache Compression for LLM Serving”, pp.12-14。",
  },
  {
    id: "round6_version_compare_13_w3_7",
    label: "第6轮 12pt版本比较",
    fontSize: 12,
    width: 3.7,
    text: "v2.4.1-hotfix-3优于v2.4.0：冷启动-18ms、错误率-0.07pp。",
  },
  {
    id: "round6_range_symbols_units_11_w3_7",
    label: "第6轮 12pt范围符号单位",
    fontSize: 12,
    width: 3.7,
    text: "观测窗口T-7~T+14天；温度22–26°C，湿度40%–65%，机柜功耗≤8.5kW。",
  },
  {
    id: "round6_fullwidth_nested_punct_13_w5_8",
    label: "第6轮 12pt全角标点嵌套",
    fontSize: 12,
    width: 5.8,
    text: "判断依据：《发布记录》（灰度版）：稳定、可回滚、可观测；否则不进入全量。",
  },
  {
    id: "round6_english_parentheses_11_w7_2",
    label: "第6轮 12pt英文括号说明",
    fontSize: 12,
    width: 7.2,
    text: "The runbook (owned by SRE, reviewed by TAM) covers retry/backoff, alert routing, and rollback.",
  },
  {
    id: "round6_slash_colon_codes_13_w3_7",
    label: "第6轮 12pt斜杠冒号码",
    fontSize: 12,
    width: 3.7,
    text: "接口/队列/缓存：api:v3、mq:orders-high、redis:cluster-a，需逐项压测。",
  },
  {
    id: "round6_hyphenated_terms_11_w5_8",
    label: "第6轮 12pt短横线术语",
    fontSize: 12,
    width: 5.8,
    text: "采用zero-downtime、read-only-mode、fail-fast三种策略，避免长尾请求拖垮链路。",
  },
  {
    id: "round6_numeric_precision_13_w7_2",
    label: "第6轮 12pt高精度数字",
    fontSize: 12,
    width: 7.2,
    text: "抽样结果：均值0.9731，中位数0.9814，P99=1.284s；样本量12,048条。",
  },
  {
    id: "round6_footnote_units_mixed_11_w3_7",
    label: "第6轮 12pt脚注单位混排",
    fontSize: 12,
    width: 3.7,
    text: "带宽¹按GiB/s计，存储²按TiB/月计；价格³不含跨区流量费。",
  },
  {
    id: "round7_long_url_10_w3_7",
    label: "第7轮 10pt长URL",
    fontSize: 10,
    width: 3.7,
    text: "证据链接：https://console.example.com/ops/incidents/INC-2026-0515?tenant=vip-cn4&view=timeline。",
  },
  {
    id: "round7_cn_longword_12_w3_7",
    label: "第7轮 12pt中文英文长词",
    fontSize: 12,
    width: 3.7,
    text: "本页只说明cross-region-observability-correlation的收益，不展开训练集构造。",
  },
  {
    id: "round7_many_spaces_columns_10_w2_6",
    label: "第7轮 10pt多空格列对齐",
    fontSize: 10,
    width: 2.6,
    text: "P0   3起   已关闭\nP1   12起  复核中\nP2   48起  观察中",
  },
  {
    id: "round7_fullwidth_punctuation_12_w5_8",
    label: "第7轮 12pt全角标点密集",
    fontSize: 12,
    width: 5.8,
    text: "结论：可上线；前提：监控、回滚、通知、复盘四项闭环；例外：VIP客户需单独确认。",
  },
  {
    id: "round7_title_mixed_18_w5_8",
    label: "第7轮 18pt标题混排",
    fontSize: 18,
    width: 5.8,
    text: "RCA复盘：从P0告警到Customer Trust恢复",
  },
  {
    id: "round7_title_digits_24_w7_2",
    label: "第7轮 24pt标题数字单位",
    fontSize: 24,
    width: 7.2,
    text: "99.95% SLA达成路径",
  },
  {
    id: "round7_short_list_14_w3_7",
    label: "第7轮 14pt列表短句",
    fontSize: 14,
    width: 3.7,
    text: "- 先隔离影响面\n- 再恢复核心链路\n- 最后补齐客户解释",
  },
  {
    id: "round7_units_dense_12_w3_7",
    label: "第7轮 12pt数字单位密集",
    fontSize: 12,
    width: 3.7,
    text: "压测口径：8 vCPU、32GB RAM、1.2TB SSD、750MB/s吞吐，持续45min。",
  },
  {
    id: "round7_path_filename_10_w5_8",
    label: "第7轮 10pt路径文件名",
    fontSize: 10,
    width: 5.8,
    text: "归档文件：/mnt/share/war-room/2026-05-15/customer-impact-summary-final-v4.pptx。",
  },
  {
    id: "round7_parentheses_quotes_12_w7_2",
    label: "第7轮 12pt括号引号宽栏",
    fontSize: 12,
    width: 7.2,
    text: "客户原话（“页面一直转圈”）对应后端slow query，需在说明中区分感知故障与实际故障。",
  },
  {
    id: "round8_table_cell_status_10_w1_6",
    label: "第8轮 10pt表格单元状态",
    fontSize: 10,
    width: 1.6,
    text: "华北-4\nP1处理中\nETA 18:30",
  },
  {
    id: "round8_short_title_parentheses_18_w3_7",
    label: "第8轮 18pt短标题括号",
    fontSize: 18,
    width: 3.7,
    text: "灰度结论（待审批）",
  },
  {
    id: "round8_abbrev_high_density_10_w2_6",
    label: "第8轮 10pt英文缩写高密度",
    fontSize: 10,
    width: 2.6,
    text: "IAM/RAM/VPC/EIP/ELB/WAF/CDN/DNS统一纳入BCP演练清单。",
  },
  {
    id: "round8_many_numbers_cn_12_w3_7",
    label: "第8轮 12pt中文多数字",
    fontSize: 12,
    width: 3.7,
    text: "本周关闭37个缺陷、合并128条工单、回访19家客户，仍遗留4个P1问题。",
  },
  {
    id: "round8_full_half_mixed_14_w3_7",
    label: "第8轮 14pt全半角混杂",
    fontSize: 14,
    width: 3.7,
    text: "版本：V3.2（正式）；状态: Go；风险：medium-high；Owner: PMO。",
  },
  {
    id: "round8_long_token_boundary_12_w2_6",
    label: "第8轮 12pt长token临界宽",
    fontSize: 12,
    width: 2.6,
    text: "observabilitycorrelationpipeline_v20260515需拆分展示，否则影响窄栏说明。",
  },
  {
    id: "round8_hard_break_kpi_12_w5_8",
    label: "第8轮 12pt硬换行KPI",
    fontSize: 12,
    width: 5.8,
    text: "KPI：SLA 99.95%\n进展：灰度20%流量\n阻塞：客户侧审批未完成",
  },
  {
    id: "round8_table_cell_formula_10_w2_6",
    label: "第8轮 10pt表格单元公式",
    fontSize: 10,
    width: 2.6,
    text: "成本/万次\n¥3.42 → ¥2.91\n降幅14.9%",
  },
  {
    id: "round8_title_mixed_code_24_w5_8",
    label: "第8轮 24pt标题代码混排",
    fontSize: 24,
    width: 5.8,
    text: "P0-INC-0515复盘",
  },
  {
    id: "round8_hard_break_short_long_14_w5_8",
    label: "第8轮 14pt短长硬换行",
    fontSize: 14,
    width: 5.8,
    text: "先恢复。\n再解释客户影响、补偿口径、二次确认流程与内部责任边界。",
  },
  {
    id: "round9_short_wide_title_24_w7_2",
    label: "第9轮 24pt短宽标题",
    fontSize: 24,
    width: 7.2,
    text: "成本、体验、风险",
  },
  {
    id: "round9_multilingual_terms_12_w3_7",
    label: "第9轮 12pt多语言术语数字",
    fontSize: 12,
    width: 3.7,
    text: "中文标签、English summary、Tier-1/Tier-2客户与2026Q2指标需同页解释。",
  },
  {
    id: "round9_finance_recognition_10_w5_8",
    label: "第9轮 10pt财务口径",
    fontSize: 10,
    width: 5.8,
    text: "财务口径：含税收入¥1,280,000，递延确认¥320,000，坏账准备按1.5%计提。",
  },
  {
    id: "round9_scientific_decimals_12_w2_6",
    label: "第9轮 12pt科学计数小数",
    fontSize: 12,
    width: 2.6,
    text: "误差阈值1.2e-4，采样率0.03125，P99.9延迟为2.718s。",
  },
  {
    id: "round9_cn_enumeration_14_w3_7",
    label: "第9轮 14pt中文枚举",
    fontSize: 14,
    width: 3.7,
    text: "一是稳态扩容，二是异常降级，三是客户通知，四是复盘归档。",
  },
  {
    id: "round9_contract_numbers_12_w5_8",
    label: "第9轮 12pt合同编号",
    fontSize: 12,
    width: 5.8,
    text: "合同编号MSA-CN-2024-1188、SOW-OPS-2026-05与补充协议A-03需保持一致。",
  },
  {
    id: "round9_colon_hard_breaks_12_w3_7",
    label: "第9轮 12pt冒号多段硬换行",
    fontSize: 12,
    width: 3.7,
    text: "目标：恢复核心链路\n风险：客户侧审批延迟\n动作：同步TAM并更新FAQ",
  },
  {
    id: "round9_english_sentence_cn_tail_12_w7_2",
    label: "第9轮 12pt英文句中文收尾",
    fontSize: 12,
    width: 7.2,
    text: "The mitigation reduced retry storms across payment callbacks, but customer messaging still needs 中文口径统一。",
  },
  {
    id: "round9_legal_clause_10_w3_7",
    label: "第9轮 10pt法律条款编号",
    fontSize: 10,
    width: 3.7,
    text: "适用条款：第4.2.1条、第7.3(b)款及附件C-服务等级承诺，需法务复核。",
  },
  {
    id: "round9_revenue_mix_14_w5_8",
    label: "第9轮 14pt收入结构",
    fontSize: 14,
    width: 5.8,
    text: "订阅收入占72%，专业服务占18%，一次性硬件交付占10%；同比结构更健康。",
  },
  {
    id: "round10_one_line_boundary_12_w3_7",
    label: "第10轮 12pt一行边界",
    fontSize: 12,
    width: 3.7,
    text: "灰度20%流量稳定，准备进入全量审批。",
  },
  {
    id: "round10_two_line_boundary_12_w3_7",
    label: "第10轮 12pt两行边界",
    fontSize: 12,
    width: 3.7,
    text: "灰度20%流量稳定，准备进入全量审批；但VIP租户仍需单独确认。",
  },
  {
    id: "round10_three_line_boundary_10_w2_6",
    label: "第10轮 10pt三行边界",
    fontSize: 10,
    width: 2.6,
    text: "先恢复核心交易链路，再补齐客户通知、赔付口径与复盘材料。",
  },
  {
    id: "round10_halfwidth_longtoken_12_w2_6",
    label: "第10轮 12pt半角长token",
    fontSize: 12,
    width: 2.6,
    text: "traceid=9f4c2e8b7a6d5c3b1a0f仍需关联客户侧截图。",
  },
  {
    id: "round10_cjk_dense_10_w1_6",
    label: "第10轮 10pt CJK密集窄栏",
    fontSize: 10,
    width: 1.6,
    text: "关键链路恢复后立即补发客户说明并记录审批口径。",
  },
  {
    id: "round10_many_hard_breaks_12_w5_8",
    label: "第10轮 12pt多个硬换行",
    fontSize: 12,
    width: 5.8,
    text: "现象：支付回调延迟\n根因：队列堆积\n动作：扩容消费者\n结果：P99回落",
  },
  {
    id: "round10_title_width_boundary_18_w3_7",
    label: "第10轮 18pt标题临界宽",
    fontSize: 18,
    width: 3.7,
    text: "客户影响面收敛评估",
  },
  {
    id: "round10_title_wrap_boundary_24_w3_7",
    label: "第10轮 24pt标题换行边界",
    fontSize: 24,
    width: 3.7,
    text: "全量发布审批",
  },
  {
    id: "round10_wide_short_not_empty_14_w7_2",
    label: "第10轮 14pt宽栏短句不过空",
    fontSize: 14,
    width: 7.2,
    text: "结论明确：可以放量，但必须保留回滚窗口。",
  },
  {
    id: "round10_two_to_three_mixed_14_w3_7",
    label: "第10轮 14pt两三行混排边界",
    fontSize: 14,
    width: 3.7,
    text: "Go决策依赖SLA、客户确认、rollback窗口三项同时满足。",
  },
  {
    id: "round11_three_col_hyphen_punct_12_w3_7",
    label: "第11轮 12pt三分栏hyphen孤立标点",
    fontSize: 12,
    width: 3.7,
    text: "- 先确认客户影响面：VIP、政企、长尾租户分别统计。\n- 再补齐rollback窗口、审批链路、SLA解释。\n- 最后检查句末标点是否单独落行。",
  },
  {
    id: "round11_narrow_abbrev_percent_10_w2_6",
    label: "第11轮 10pt窄栏缩写百分比",
    fontSize: 10,
    width: 2.6,
    text: "SRE/NOC/CSM三方确认：P0占比0.8%，P1占比3.6%，MTTR下降18%。",
  },
  {
    id: "round11_long_trace_token_12_w2_6",
    label: "第11轮 12pt窄栏长trace token",
    fontSize: 12,
    width: 2.6,
    text: "trace_id=cn4vip20260516paymentcallbackretryloop000742需要完整保留。",
  },
  {
    id: "round11_full_half_punct_mix_14_w3_7",
    label: "第11轮 14pt全半角标点混排",
    fontSize: 14,
    width: 3.7,
    text: "状态：Go/No-Go；风险: 中；例外（VIP-A）需PMO、TAM、SRE联合确认。",
  },
  {
    id: "round11_hard_break_short_long_12_w3_7",
    label: "第11轮 12pt短长硬换行三分栏",
    fontSize: 12,
    width: 3.7,
    text: "先止血。\n再解释为什么队列堆积没有触发自动扩容、为什么客户侧感知晚于后台恢复。\n复盘归档。",
  },
  {
    id: "round11_slash_parentheses_12_w5_8",
    label: "第11轮 12pt二分栏斜杠括号",
    fontSize: 12,
    width: 5.8,
    text: "验收项包括容量/成本/体验/风险四类；其中体验指标(首屏、回调、工单)不得合并口径。",
  },
  {
    id: "round11_table_like_pipe_10_w3_7",
    label: "第11轮 10pt类表格pipe分隔",
    fontSize: 10,
    width: 3.7,
    text: "租户 | 等级 | 影响 | ETA\nvip-cn4 | P0 | 支付回调 | 18:30\ngov-bj | P1 | 查询慢 | 19:10",
  },
  {
    id: "round11_title_parenthetical_18_w3_7",
    label: "第11轮 18pt标题括号换行风险",
    fontSize: 18,
    width: 3.7,
    text: "客户承诺（待法务复核）",
  },
  {
    id: "round11_title_code_percent_24_w5_8",
    label: "第11轮 24pt标题代码百分比",
    fontSize: 24,
    width: 5.8,
    text: "P95下降27%",
  },
  {
    id: "round11_quote_tail_punct_12_w2_6",
    label: "第11轮 12pt窄栏引号尾标点",
    fontSize: 12,
    width: 2.6,
    text: "客户原话：“页面卡住了？”需区分前端转圈与后端队列等待。",
  },
  {
    id: "round12_two_col_finance_units_12_w5_8",
    label: "第12轮 12pt二分栏财务单位",
    fontSize: 12,
    width: 5.8,
    text: "成本拆分：GPU ¥42.8万/月、对象存储¥6.1万/月、出口带宽¥3.7万/月；ROI按季度复核。",
  },
  {
    id: "round12_three_col_nested_codes_12_w3_7",
    label: "第12轮 12pt三分栏嵌套编号",
    fontSize: 12,
    width: 3.7,
    text: "依据条款(4.2.1/a)、补充说明[Annex-C]与客户邮件#REQ-8842共同判定。",
  },
  {
    id: "round12_narrow_url_query_10_w2_6",
    label: "第12轮 10pt窄栏URL query",
    fontSize: 10,
    width: 2.6,
    text: "https://ops.example.com/replay?tenant=vip-cn4&from=20:00&sample=0.25",
  },
  {
    id: "round12_hyphen_bullets_mixed_lengths_14_w3_7",
    label: "第12轮 14pt长短hyphen bullets",
    fontSize: 14,
    width: 3.7,
    text: "- 先恢复。\n- 再向客户解释影响范围、补偿口径、二次确认流程。\n- 最后归档。",
  },
  {
    id: "round12_cjk_dense_narrow_10_w1_6",
    label: "第12轮 10pt超窄中文密集",
    fontSize: 10,
    width: 1.6,
    text: "故障恢复后仍需补齐客户说明、审批记录、赔付口径和二次确认。",
  },
  {
    id: "round12_operator_heavy_12_w3_7",
    label: "第12轮 12pt运算符孤立风险",
    fontSize: 12,
    width: 3.7,
    text: "规则：(impact>5000 && duration>=30) || (vip=true && retry>3)，否则观察。",
  },
  {
    id: "round12_mixed_language_sentence_12_w7_2",
    label: "第12轮 12pt宽栏中英句尾",
    fontSize: 12,
    width: 7.2,
    text: "The rollback plan is ready, but 客户侧审批、赔付口径、公告发布时间仍需统一。",
  },
  {
    id: "round12_metric_stack_14_w5_8",
    label: "第12轮 14pt指标堆叠二分栏",
    fontSize: 14,
    width: 5.8,
    text: "P50/P95/P99延迟、cache-hit、retry-rate、OOM次数和人工介入率必须同表呈现。",
  },
  {
    id: "round12_fullwidth_serials_12_w5_8",
    label: "第12轮 12pt全角序号混排",
    fontSize: 12,
    width: 5.8,
    text: "①恢复核心链路；②同步客户公告；③复核SLA；④归档RCA-2026-0516。",
  },
  {
    id: "round12_title_slash_18_w5_8",
    label: "第12轮 18pt标题斜杠",
    fontSize: 18,
    width: 5.8,
    text: "容量/成本/体验联合验收",
  },
  {
    id: "round13_three_col_long_model_names_12_w3_7",
    label: "第13轮 12pt三分栏长模型名",
    fontSize: 12,
    width: 3.7,
    text: "DeepSeek-R1-Distill-Qwen-32B与internal-router-guardrail-v2026共同参与回放。",
  },
  {
    id: "round13_narrow_parenthetical_percent_12_w2_6",
    label: "第13轮 12pt窄栏括号百分比",
    fontSize: 12,
    width: 2.6,
    text: "灰度(20%→50%→100%)每档至少观察4小时，异常率≤0.3%。",
  },
  {
    id: "round13_hard_break_many_segments_10_w3_7",
    label: "第13轮 10pt多段硬换行",
    fontSize: 10,
    width: 3.7,
    text: "现象：回调延迟\n影响：VIP租户\n动作：扩容消费者\n风险：重复扣款感知\n结论：继续观察",
  },
  {
    id: "round13_invoice_contract_ids_12_w5_8",
    label: "第13轮 12pt合同发票编号",
    fontSize: 12,
    width: 5.8,
    text: "发票INV-CN-2026-000481、合同SOW-OPS-0516与PO#CN4-VIP-778需一一对应。",
  },
  {
    id: "round13_isolated_comma_risk_14_w3_7",
    label: "第13轮 14pt逗号孤立风险",
    fontSize: 14,
    width: 3.7,
    text: "客户关注稳定性、赔付口径、公告窗口、二次确认，而不是内部模块归因。",
  },
  {
    id: "round13_english_hyphenated_12_w2_6",
    label: "第13轮 12pt英文hyphen长词窄栏",
    fontSize: 12,
    width: 2.6,
    text: "cross-tenant-failover-drill在pre-prod完成，但prod窗口待批。",
  },
  {
    id: "round13_math_units_10_w5_8",
    label: "第13轮 10pt数学单位混排",
    fontSize: 10,
    width: 5.8,
    text: "估算：Δcost=(baseline-new)/baseline=18.7%；吞吐从1.8k req/min到2.4k req/min。",
  },
  {
    id: "round13_json_nested_12_w3_7",
    label: "第13轮 12pt JSON嵌套片段",
    fontSize: 12,
    width: 3.7,
    text: "payload={tenant:\"vip-cn4\", flags:[\"rollback\",\"notice\"], ratio:0.2}。",
  },
  {
    id: "round13_title_mixed_status_24_w3_7",
    label: "第13轮 24pt窄标题状态码",
    fontSize: 24,
    width: 3.7,
    text: "Go/No-Go",
  },
  {
    id: "round13_wide_note_tail_symbol_12_w7_2",
    label: "第13轮 12pt宽栏句尾符号",
    fontSize: 12,
    width: 7.2,
    text: "说明：若客户公告发布时间晚于实际恢复时间，需在Q&A中解释“恢复”和“可感知恢复”的差异。",
  },
  {
    id: "round14_three_col_bilingual_bullets_12_w3_7",
    label: "第14轮 12pt三分栏双语bullets",
    fontSize: 12,
    width: 3.7,
    text: "- Root cause：队列消费者不足。\n- Customer impact：支付回调延迟。\n- Next：扩容、压测、公告复核。",
  },
  {
    id: "round14_narrow_sku_mix_10_w1_6",
    label: "第14轮 10pt超窄SKU混排",
    fontSize: 10,
    width: 1.6,
    text: "SKU c7.large.4、s6.xlarge.2、dss1.8xlarge均需回归压测。",
  },
  {
    id: "round14_two_col_path_space_12_w5_8",
    label: "第14轮 12pt二分栏路径空格",
    fontSize: 12,
    width: 5.8,
    text: "证据目录 D:/war room/2026-05-16/customer final/ 包含截图、日志、审批邮件。",
  },
  {
    id: "round14_fullwidth_brackets_14_w3_7",
    label: "第14轮 14pt全角括号书名号",
    fontSize: 14,
    width: 3.7,
    text: "《复盘报告》（客户版）只保留影响、动作、承诺，不展示内部工单噪声。",
  },
  {
    id: "round14_short_long_mix_12_w2_6",
    label: "第14轮 12pt窄栏短长句混合",
    fontSize: 12,
    width: 2.6,
    text: "已恢复。但payment-callback-retry-queue仍需观察到22:00。",
  },
  {
    id: "round14_decimals_ranges_12_w3_7",
    label: "第14轮 12pt小数区间",
    fontSize: 12,
    width: 3.7,
    text: "健康区间：CPU 45.5%-68.2%，内存61.0%-74.8%，错误率0.02%-0.06%。",
  },
  {
    id: "round14_semicolon_chains_10_w3_7",
    label: "第14轮 10pt分号链路",
    fontSize: 10,
    width: 3.7,
    text: "入口：告警；定位：日志；动作：扩容；验证：回放；归档：RCA；通知：客户成功。",
  },
  {
    id: "round14_title_long_cn_18_w3_7",
    label: "第14轮 18pt中文长标题三分栏",
    fontSize: 18,
    width: 3.7,
    text: "跨团队故障复盘闭环",
  },
  {
    id: "round14_title_long_code_24_w7_2",
    label: "第14轮 24pt宽标题代码",
    fontSize: 24,
    width: 7.2,
    text: "RCA-2026-0516",
  },
  {
    id: "round14_tail_parenthesis_12_w5_8",
    label: "第14轮 12pt句尾括号风险",
    fontSize: 12,
    width: 5.8,
    text: "最终结论可以对外同步，但需保留“赔付口径以后续商务确认为准”（法务意见）。",
  },
  {
    id: "round15_three_col_extreme_mix_12_w3_7",
    label: "第15轮 12pt三分栏极端混排",
    fontSize: 12,
    width: 3.7,
    text: "P0/INC-0516：VIP-A支付回调p99=2.84s，rollback@21:35，客户公告待CSM确认。",
  },
  {
    id: "round15_narrow_many_breaks_10_w2_6",
    label: "第15轮 10pt窄栏多硬换行",
    fontSize: 10,
    width: 2.6,
    text: "P0\n支付回调\nVIP-A\nETA 21:35\nOwner SRE",
  },
  {
    id: "round15_hyphen_long_token_14_w3_7",
    label: "第15轮 14pthyphen长token",
    fontSize: 14,
    width: 3.7,
    text: "- payment-callback-retry-queue-consumer扩容\n- customer-notification-template更新",
  },
  {
    id: "round15_wide_english_digits_cn_12_w7_2",
    label: "第15轮 12pt宽栏英文数字中文",
    fontSize: 12,
    width: 7.2,
    text: "Batch replay covered 128,000 requests across 6 tenants; 中文公告与英文support note需保持一致。",
  },
  {
    id: "round15_two_col_iso_dates_12_w5_8",
    label: "第15轮 12pt二分栏ISO日期",
    fontSize: 12,
    width: 5.8,
    text: "时间线：2026-05-16T20:03:24+08:00告警，20:18限流，21:07恢复，21:35公告。",
  },
  {
    id: "round15_fullwidth_halfwidth_tail_12_w2_6",
    label: "第15轮 12pt窄栏全半角尾标点",
    fontSize: 12,
    width: 2.6,
    text: "是否全量？先看SLA、客户确认、rollback plan。",
  },
  {
    id: "round15_markdown_like_10_w3_7",
    label: "第15轮 10pt Markdown-like",
    fontSize: 10,
    width: 3.7,
    text: "**结论**: 可放量；`rollback_plan.md`与`customer_notice.md`已更新。",
  },
  {
    id: "round15_formula_parentheses_14_w5_8",
    label: "第15轮 14pt公式括号二分栏",
    fontSize: 14,
    width: 5.8,
    text: "容量余量 = min(队列吞吐、DB连接、外部回调限额) - 峰值请求；低于15%即冻结。",
  },
  {
    id: "round15_title_question_18_w3_7",
    label: "第15轮 18pt标题问号风险",
    fontSize: 18,
    width: 3.7,
    text: "是否可以全量？",
  },
  {
    id: "round15_title_percent_slash_24_w5_8",
    label: "第15轮 24pt标题百分比斜杠",
    fontSize: 24,
    width: 5.8,
    text: "20%/50%/100%",
  },
];

const BODY_FONT_SIZES = [10, 12, 14];
const BODY_WIDTHS = [1.6, 2.6, 3.7, 5.8, 7.2];
const TITLE_FONT_SIZES = [18, 24];
const TITLE_WIDTHS = [3.7, 5.8, 7.2];

const BODY_TEXT_TYPES = [
  {
    type: "pure_cjk_short",
    label: "纯中文短段",
    text: "训练阶段先验证样本质量，推理阶段再评估吞吐收益，避免把实验结论直接外推到生产环境。",
  },
  {
    type: "pure_cjk_long",
    label: "纯中文长段",
    text: "核心业务连续性保障需要在跨部门协同、异常升级、数据回填和复盘归档之间形成闭环，避免关键节点遗漏造成后续判断失真。",
  },
  {
    type: "mixed_acronym_digit",
    label: "中英数字混排",
    text: "2026 Q2 SLA目标提升至99.95%，通过AI Copilot、API Gateway与NOC值班联动，压缩MTTR并保持ROI可解释。",
  },
  {
    type: "plain_hyphen_two",
    label: "普通hyphen两条",
    text: "- 第一条是普通文本中的连字符，不应按原生项目符号扣缩进。\n- 第二条继续验证中文、English token和数字128混排。",
  },
  {
    type: "plain_hyphen_three",
    label: "普通hyphen三条",
    text: "- 统一问题入口与责任人\n- 关键告警15分钟内确认\n- 外部承诺、内部SOP、复盘材料同步归档",
  },
  {
    type: "hard_breaks",
    label: "硬换行多段",
    text: "第一阶段：梳理现网问题。\n第二阶段：补齐监控通知。\n第三阶段：形成周度复盘。",
  },
  {
    type: "long_token",
    label: "长英文token",
    text: "平台兼容HuaweiCloudStack-OperationsTelemetryPipeline与edge-node-2026A批量日志，仍要保证回归测试可解释。",
  },
  {
    type: "symbols",
    label: "半角符号",
    text: "路径A/B/C -> owner=OPS; retry=3; error<0.15%; id=E-1007，需要同步回填。",
  },
  {
    type: "full_width_punctuation",
    label: "全角标点",
    text: "“高优先级”场景需覆盖：识别、派单、处置、复盘；灰度发布不能被拆散。",
  },
  {
    type: "many_spaces",
    label: "多空格",
    text: "状态  正常    待确认  已关闭  需复核；字段间保留多空格用于模拟人工录入。",
  },
];

const MULTILINE_BODY_TEXT_TYPES = [
  {
    type: "page2_method_exact",
    label: "Page2方法三条",
    text: "- 核心不是再做一个缓存调度器，而是让模型在训练中反复遇到本层KV可用和只能读取前层KV的情况。\n- 部署时固定为确定性分组策略，只缓存主导层的KV，其余层复用最近前层KV。\n- 管理判断：这是模型侧推理降本路线，收益需要训练预算购买。",
  },
  {
    type: "page2_benefit_exact",
    label: "Page2收益四条",
    text: "- 单张80GB GPU、8,192输入长度、批量1下，分组4约减少75% KV缓存并提升约22%吞吐。\n- 相同8K上下文下，批量16时基线分组1 OOM，而分组4可以完成运行。\n- 这说明收益同时体现为显存、带宽、吞吐和同卡并发容量。\n- 管理层可以把它视为容量弹性选项，而不只是单请求加速。",
  },
  {
    type: "page2_gate_exact",
    label: "Page2门槛四条",
    text: "- 论文验证依赖训练或微调，并非普通推理配置开关。\n- 当前未发现Apple官方代码，PoC不能假设可直接集成。\n- 落地要先做100%/50%/25%保留率A/B，再核算回本周期。\n- 先从50%保留率主档位开始，25%作为激进压缩档验证。",
  },
  {
    type: "ops_long_bullets",
    label: "运维长句三条",
    text: "- 告警进入统一队列后，需要同时记录客户影响面、责任团队、SLA窗口和回滚预案。\n- 如果处置动作跨越平台、网络和应用团队，复盘材料必须能追溯到每个时间点。\n- 管理层看的是是否可复制，而不是单次故障是否被快速关闭。",
  },
  {
    type: "budget_mixed_bullets",
    label: "预算混排四条",
    text: "- 预算粗算需要同时覆盖GPU小时、训练样本构建、评测集维护和灰度回放成本。\n- 8K输入长度下，batch size、cache策略和吞吐曲线会共同影响回本周期。\n- ROI不能只看峰值吞吐，还要看业务质量和失败样本修复成本。\n- 第一轮建议保守验证，第二轮再扩大到高并发场景。",
  },
  {
    type: "quality_gate_bullets",
    label: "质量门槛四条",
    text: "- 100%档保留对照组，避免把模型自然波动误判成压缩收益。\n- 50%档先测业务质量阈值，观察幻觉率、格式稳定性和关键字段召回。\n- 25%档只适合激进压缩验证，不能直接承诺生产无损。\n- 所有档位都要保留回滚窗口和人工复核样本。",
  },
  {
    type: "mixed_english_metric_bullets",
    label: "英文指标混排三条",
    text: "- p95 latency、cache-hit、OOM rate和rollback count必须放在同一张验收表里。\n- owner=平台团队时，SRE和业务方仍需共同确认SLA口径。\n- A/B实验结束后，异常样本要回填到下一轮训练清单。",
  },
  {
    type: "punctuation_bullets",
    label: "标点密集四条",
    text: "- “已验证”不等于“可上线”；需要补齐客户确认、审批链路、回滚窗口。\n- 若指标出现边界波动，应先暂停放量，再定位样本、模型、服务三类原因。\n- 结论页要写清楚：谁负责、何时复核、失败后如何恢复。\n- 标点不能单独落行，否则视觉上会暴露排版风险。",
  },
  {
    type: "short_long_mixed_bullets",
    label: "长短混合四条",
    text: "- 先小流量。\n- 再核验高价值客户路径是否稳定，尤其是跨Region链路、支付回调和工单派发。\n- 最后扩大到常规场景。\n- 复盘必须沉淀成可重复执行的检查表。",
  },
];

const MULTILINE_BODY_WIDTHS = [3.2, 3.7, 4.2];
const MULTILINE_BODY_FONT_SIZES = [12, 14];

const TITLE_TEXT_TYPES = [
  { type: "title_short_cjk", label: "标题短中文", text: "稳定、透明、可复盘。" },
  { type: "title_mixed", label: "标题混排", text: "Apple R-CLA推理降本 - 缓存弹性验证" },
  { type: "summary_sentence", label: "摘要句", text: "先验证训练回本，再扩大到高并发长上下文场景。" },
];

function buildCases() {
  const matrixCases = [];
  for (const fontSize of BODY_FONT_SIZES) {
    for (const width of BODY_WIDTHS) {
      for (const sample of BODY_TEXT_TYPES) {
        matrixCases.push({
          id: `${sample.type}_${fontSize}_w${String(width).replace(".", "_")}`,
          label: `${fontSize}pt ${width}in ${sample.label}`,
          fontSize,
          width,
          text: sample.text,
        });
      }
    }
  }
  for (const fontSize of MULTILINE_BODY_FONT_SIZES) {
    for (const width of MULTILINE_BODY_WIDTHS) {
      for (const sample of MULTILINE_BODY_TEXT_TYPES) {
        matrixCases.push({
          id: `${sample.type}_${fontSize}_w${String(width).replace(".", "_")}`,
          label: `${fontSize}pt ${width}in ${sample.label}`,
          fontSize,
          width,
          text: sample.text,
        });
      }
    }
  }
  for (const fontSize of TITLE_FONT_SIZES) {
    for (const width of TITLE_WIDTHS) {
      for (const sample of TITLE_TEXT_TYPES) {
        matrixCases.push({
          id: `${sample.type}_${fontSize}_w${String(width).replace(".", "_")}`,
          label: `${fontSize}pt ${width}in ${sample.label}`,
          fontSize,
          width,
          text: sample.text,
        });
      }
    }
  }
  const testCases = [...REGRESSION_CASES, ...matrixCases];
  validateSupportedFontSizes(testCases);
  return testCases;
}

function validateSupportedFontSizes(testCases) {
  const invalid = testCases
    .filter((testCase) => !ALLOWED_TEXT_FONT_SIZES.has(testCase.fontSize))
    .map((testCase) => ({ id: testCase.id, fontSize: testCase.fontSize }));
  assert.deepStrictEqual(invalid, [], "text-height smoke cases must use only approved Huawei font sizes");
}

const CASES = buildCases();

function estimateCase(testCase) {
  const margin = 0.06;
  const contentWidth = Math.max(0.1, testCase.width - Math.max(margin * 2, 0.16));
  const h = estimateTextBoxHeight(testCase.text, {
    w: testCase.width,
    fontSize: testCase.fontSize,
    margin,
    lineSpacingMultiple: 1.5,
  });
  const rounded = Math.ceil((h + 0.03) * 20) / 20;
  return {
    height: Number(testCase.heightOverride || rounded),
    estimatedLines: estimateWrappedLines(testCase.text, testCase.fontSize, contentWidth),
  };
}

function runNode(args) {
  const result = spawnSync("node", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
  });
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

async function generateDeck() {
  fs.mkdirSync(OUT, { recursive: true });
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Codex smoke";
  pptx.subject = "Text height estimation smoke";
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN" };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: SLIDE.w, height: SLIDE.h });

  const boxes = [];
  let slideNo = 0;
  let slide = null;
  let cursorY = 1.15;
  const startSlide = () => {
    slideNo += 1;
    slide = pptx.addSlide();
    cursorY = 1.15;
    slide.background = { color: "FFFFFF" };
    slide.addText(`Text height estimation smoke / set ${slideNo}`, {
      x: 0.45, y: 0.16, w: 12, h: 0.32,
      fontFace: "Microsoft YaHei", fontSize: 16, bold: true, color: "111111", margin: 0,
    });
  };
  for (const testCase of CASES) {
    const estimate = estimateCase(testCase);
    if (!slide || cursorY + estimate.height > 7.05) startSlide();
    const x = 0.7;
    const y = cursorY;
    const labelX = testCase.width + 1.0;
    slide.addText(`${testCase.id} / ${testCase.label}`, {
      x: labelX, y, w: 11.9 - labelX, h: 0.22,
      fontFace: "Microsoft YaHei", fontSize: 8, color: "666666", margin: 0,
    });
    slide.addText(`font=${testCase.fontSize} width=${testCase.width} estimatedLines=${estimate.estimatedLines} estimatedHeight=${estimate.height.toFixed(2)}in`, {
      x: labelX, y: y + 0.24, w: 11.9 - labelX, h: 0.22,
      fontFace: "Arial", fontSize: 7.5, color: "666666", margin: 0,
    });
    slide.addText(testCase.text, {
      x, y, w: testCase.width, h: estimate.height,
      fontFace: "Microsoft YaHei",
      fontSize: testCase.fontSize,
      color: "111111",
      margin: 0.06,
      valign: "top",
      breakLine: false,
      lineSpacingMultiple: 1.5,
      line: { color: "111111", width: 0, transparency: 100 },
      fill: { color: "FFFFFF", transparency: 100 },
    });
    boxes.push({ ...testCase, slide: slideNo, x, y, h: estimate.height, estimatedLines: estimate.estimatedLines });
    cursorY += estimate.height + 0.55;
  }

  const pptxPath = path.join(OUT, "text_height_estimation_smoke.pptx");
  const manifestPath = path.join(OUT, "text_height_estimation_smoke_manifest.json");
  await pptx.writeFile({ fileName: pptxPath });
  fs.writeFileSync(manifestPath, JSON.stringify({ pptxPath, boxes }, null, 2));
  return { pptxPath, manifestPath };
}

function cropBounds(box) {
  const borderPad = 0;
  return {
    left: Math.max(0, Math.floor(box.x * PX.perIn) + borderPad),
    top: Math.max(0, Math.floor(box.y * PX.perIn) + borderPad),
    width: Math.max(1, Math.ceil(box.width * PX.perIn) - borderPad * 2),
    height: Math.max(1, Math.ceil(box.h * PX.perIn) - borderPad * 2),
  };
}

function lineScanBounds(box, slideBoxes, rawInfo) {
  const crop = cropBounds(box);
  const cropBottom = crop.top + crop.height;
  const linePx = box.fontSize / 72 * 1.5 * PX.perIn;
  const nextTop = (slideBoxes || [])
    .filter((item) => item !== box && item.y > box.y)
    .map((item) => Math.floor(item.y * PX.perIn))
    .sort((a, b) => a - b)[0];
  const maxBottom = Number.isFinite(nextTop)
    ? Math.max(cropBottom, nextTop - 2)
    : rawInfo.height;
  const bottom = Math.min(rawInfo.height, maxBottom, Math.ceil(cropBottom + linePx * 0.55));
  return {
    ...crop,
    height: Math.max(crop.height, bottom - crop.top),
  };
}

async function analyze(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const pngDir = path.join(OUT, "png");
  runNode(["scripts/pptx/export_pptx_images.js", path.relative(ROOT, manifest.pptxPath), "--out", path.relative(ROOT, pngDir), "--renderer", "powerpoint"]);

  const rawBySlide = new Map();
  const boxesBySlide = new Map();
  for (const box of manifest.boxes) {
    const boxes = boxesBySlide.get(box.slide) || [];
    boxes.push(box);
    boxesBySlide.set(box.slide, boxes);
  }
  const results = [];
  for (const box of manifest.boxes) {
    if (!rawBySlide.has(box.slide)) {
      const png = path.join(pngDir, `slide_${String(box.slide).padStart(2, "0")}.png`);
      rawBySlide.set(box.slide, await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    }
    const raw = rawBySlide.get(box.slide);
    const crop = cropBounds(box);
    const inside = scanDarkPixels(raw, crop);
    const guard = guardBounds(box, boxesBySlide.get(box.slide) || [], raw.info);
    const below = guard ? scanDarkPixels(raw, guard) : { darkCount: 0, minY: 0, maxY: -1 };
    const lineScan = scanRenderedTextLines(raw, lineScanBounds(box, boxesBySlide.get(box.slide) || [], raw.info), box.fontSize);
    const maxY = inside.maxY;
    const darkCount = inside.darkCount;
    const bottomGapPx = maxY >= 0 ? crop.height - 1 - maxY : crop.height;
    const topGapPx = inside.minY < crop.height ? inside.minY : crop.height;
    const linePx = box.fontSize / 72 * 1.5 * PX.perIn;
    const frameFit = classifyFrameFit({
      support: supportLevel(box),
      lineDelta: box.estimatedLines - lineScan.actualLines,
      bottomGapPx,
      overflowBelowDarkCount: below.darkCount,
      linePx,
    });
    let verdict = classifyLineEstimate({
      darkCount,
      estimatedLines: box.estimatedLines,
      actualLines: lineScan.actualLines,
    });
    results.push({
      id: box.id,
      label: box.label,
      fontSize: box.fontSize,
      width: box.width,
      height: box.h,
      estimatedLines: box.estimatedLines,
      actualLines: lineScan.actualLines,
      lineDelta: box.estimatedLines - lineScan.actualLines,
      lineClusters: lineScan.clusters,
      topGapPx,
      bottomGapPx,
      bottomGapIn: Number((bottomGapPx / PX.perIn).toFixed(3)),
      darkCount,
      overflowBelowDarkCount: below.darkCount,
      overflowBelowMaxY: below.maxY,
      verdict,
      frameFit,
      support: supportLevel(box),
    });
  }
  const analysisPath = path.join(OUT, "text_height_estimation_smoke_analysis.json");
  fs.writeFileSync(analysisPath, JSON.stringify({ results }, null, 2));
  const passReviewPath = await generateReviewDeck(manifest, results, {
    fileName: "text_height_estimation_pass_review.pptx",
    title: "Text height estimation pass review",
    filter: (result) => result.verdict === "ok",
  });
  const failReviewPath = await generateReviewDeck(manifest, results, {
    fileName: "text_height_estimation_fail_review.pptx",
    title: "Text height estimation fail review",
    filter: (result) => result.verdict !== "ok",
  });
  const blackFrameReviewPath = await generateReviewDeck(manifest, results, {
    fileName: "text_height_estimation_pass_black_frame_review.pptx",
    title: "Text height pass black-frame review",
    filter: (result) => result.verdict === "ok",
    showFrame: true,
  });
  cleanupObsoleteReviewDecks(manifest.pptxPath);
  return { analysisPath, passReviewPath, failReviewPath, blackFrameReviewPath, results };
}

function cleanupObsoleteReviewDecks(sourcePptxPath) {
  [
    sourcePptxPath,
    path.join(OUT, "text_height_estimation_review.pptx"),
    path.join(OUT, "text_height_estimation_black_frame_review.pptx"),
  ].forEach((fileName) => {
    if (fileName && fs.existsSync(fileName)) fs.unlinkSync(fileName);
  });
}

function scanDarkPixels(raw, crop) {
  let minY = crop.height;
  let maxY = -1;
  let darkCount = 0;
  const left = Math.max(0, crop.left);
  const top = Math.max(0, crop.top);
  const right = Math.min(raw.info.width, crop.left + crop.width);
  const bottom = Math.min(raw.info.height, crop.top + crop.height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pos = (y * raw.info.width + x) * raw.info.channels;
      const r = raw.data[pos];
      const g = raw.data[pos + 1];
      const b = raw.data[pos + 2];
      if (r < 125 && g < 125 && b < 125) {
        minY = Math.min(minY, y - top);
        maxY = Math.max(maxY, y - top);
        darkCount += 1;
      }
    }
  }
  return { minY, maxY, darkCount };
}

function guardBounds(box, slideBoxes, rawInfo) {
  const guardPad = 7;
  const guardHeight = Math.round(0.72 * PX.perIn);
  const boxBottom = Math.floor((box.y + box.h) * PX.perIn);
  const nextTop = slideBoxes
    .filter((candidate) => candidate !== box && candidate.y > box.y)
    .map((candidate) => Math.floor(candidate.y * PX.perIn))
    .sort((a, b) => a - b)[0] || rawInfo.height;
  const top = boxBottom + guardPad;
  const bottom = Math.min(rawInfo.height, nextTop - guardPad, top + guardHeight);
  if (bottom <= top + 4) return null;
  return {
    left: Math.max(0, Math.floor(box.x * PX.perIn) + 8),
    top,
    width: Math.max(1, Math.ceil(box.width * PX.perIn) - 16),
    height: bottom - top,
  };
}

function textAndOverflowBounds(box, guard, rawInfo) {
  const borderPad = 0;
  const left = Math.max(0, Math.floor(box.x * PX.perIn) + borderPad);
  const top = Math.max(0, Math.floor(box.y * PX.perIn) + borderPad);
  const boxBottom = Math.floor((box.y + box.h) * PX.perIn) - borderPad;
  const guardBottom = guard ? guard.top + guard.height : boxBottom;
  const bottom = Math.min(rawInfo.height, Math.max(boxBottom, guardBottom));
  return {
    left,
    top,
    width: Math.max(1, Math.ceil(box.width * PX.perIn) - borderPad * 2),
    height: Math.max(1, bottom - top),
  };
}

function scanRenderedTextLines(raw, crop, fontSize) {
  const left = Math.max(0, crop.left);
  const top = Math.max(0, crop.top);
  const right = Math.min(raw.info.width, crop.left + crop.width);
  const bottom = Math.min(raw.info.height, crop.top + crop.height);
  const width = Math.max(1, right - left);
  const rowCounts = [];
  const faintRowCounts = [];
  const faintRowMinX = [];
  const faintRowMaxX = [];
  for (let y = top; y < bottom; y += 1) {
    let count = 0;
    let faintCount = 0;
    let faintMinX = width;
    let faintMaxX = -1;
    for (let x = left; x < right; x += 1) {
      const pos = (y * raw.info.width + x) * raw.info.channels;
      const r = raw.data[pos];
      const g = raw.data[pos + 1];
      const b = raw.data[pos + 2];
      if (r < 125 && g < 125 && b < 125) count += 1;
      if (r < 180 && g < 180 && b < 180) {
        faintCount += 1;
        faintMinX = Math.min(faintMinX, x - left);
        faintMaxX = Math.max(faintMaxX, x - left);
      }
    }
    rowCounts.push(count);
    faintRowCounts.push(faintCount);
    faintRowMinX.push(faintMinX);
    faintRowMaxX.push(faintMaxX);
  }
  const softInkPx = Math.max(6, Math.round(width * 0.006));
  const strongInkPx = Math.max(24, Math.round(width * 0.03));
  const clusters = [];
  let current = null;
  rowCounts.forEach((count, y) => {
    const isTextRow = count >= softInkPx && count <= width * 0.72;
    if (isTextRow) {
      if (!current) current = { start: y, end: y, maxInk: count };
      current.end = y;
      current.maxInk = Math.max(current.maxInk, count);
    } else if (current) {
      clusters.push(current);
      current = null;
    }
  });
  if (current) clusters.push(current);
  const punctuationClusters = [];
  current = null;
  faintRowCounts.forEach((count, y) => {
    const punctuationWidth = faintRowMaxX[y] - faintRowMinX[y] + 1;
    const isTinyPunctuationRow = count > 0 && count <= 12 && punctuationWidth <= 14;
    if (isTinyPunctuationRow) {
      if (!current) current = { start: y, end: y, maxInk: count, minX: faintRowMinX[y], maxX: faintRowMaxX[y] };
      current.end = y;
      current.maxInk = Math.max(current.maxInk, count);
      current.minX = Math.min(current.minX, faintRowMinX[y]);
      current.maxX = Math.max(current.maxX, faintRowMaxX[y]);
    } else if (current) {
      punctuationClusters.push(current);
      current = null;
    }
  });
  if (current) punctuationClusters.push(current);
  const minGlyphHeight = Math.max(4, Math.round((fontSize / 72) * PX.perIn * 0.34));
  const linePitch = (fontSize / 72) * 1.5 * PX.perIn;
  const rawClusters = [];
  for (const cluster of clusters.filter((item) => item.end - item.start + 1 >= 2 || item.maxInk >= softInkPx * 2)) {
    const prev = rawClusters[rawClusters.length - 1];
    if (prev && cluster.start - prev.end <= 2) {
      prev.end = cluster.end;
      prev.maxInk = Math.max(prev.maxInk, cluster.maxInk);
    } else {
      rawClusters.push({ ...cluster });
    }
  }
  const strong = rawClusters.filter((item) => {
    const h = item.end - item.start + 1;
    return h >= minGlyphHeight && item.maxInk >= strongInkPx;
  });
  const accepted = [];
  for (const cluster of rawClusters) {
    const h = cluster.end - cluster.start + 1;
    const center = (cluster.start + cluster.end) / 2;
    const nearestStrongDistance = strong.length
      ? Math.min(...strong.map((item) => Math.abs(center - ((item.start + item.end) / 2))))
      : Infinity;
    const strongEnough = h >= minGlyphHeight && cluster.maxInk >= strongInkPx;
    const likelyStandaloneGlyph = cluster.maxInk >= softInkPx * 1.5
      && nearestStrongDistance >= linePitch * 0.42
      && h >= Math.max(2, minGlyphHeight * 0.22);
    if (strongEnough || likelyStandaloneGlyph) accepted.push(cluster);
  }
  for (const cluster of punctuationClusters) {
    const h = cluster.end - cluster.start + 1;
    const center = (cluster.start + cluster.end) / 2;
    const nearestAcceptedDistance = accepted.length
      ? Math.min(...accepted.map((item) => Math.abs(center - ((item.start + item.end) / 2))))
      : Infinity;
    const punctuationWidth = cluster.maxX - cluster.minX + 1;
    const likelyStandalonePunctuation = h >= 3
      && punctuationWidth <= 14
      && nearestAcceptedDistance >= linePitch * 0.42;
    if (likelyStandalonePunctuation) accepted.push(cluster);
  }
  accepted.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const cluster of accepted) {
    const prev = merged[merged.length - 1];
    if (prev && cluster.start - prev.end <= linePitch * 0.38) {
      prev.end = Math.max(prev.end, cluster.end);
      prev.maxInk = Math.max(prev.maxInk, cluster.maxInk);
    } else {
      merged.push({ ...cluster });
    }
  }
  return {
    actualLines: merged.length,
    clusters: merged.map((item) => ({ start: item.start, end: item.end, maxInk: item.maxInk })),
  };
}

function classifyLineEstimate({ darkCount, estimatedLines, actualLines }) {
  if (darkCount === 0) return "no_text_detected";
  if (!Number.isFinite(actualLines) || actualLines <= 0) return "no_lines_detected";
  if (estimatedLines < actualLines) return "under_estimated_lines";
  if (estimatedLines > actualLines) return "over_estimated_lines";
  return "ok";
}

function classifyFrameFit({ support, lineDelta, bottomGapPx, overflowBelowDarkCount, linePx }) {
  if (support !== "supported" || lineDelta !== 0) return "not_applicable";
  if (bottomGapPx <= 2 && overflowBelowDarkCount > 0) return "overflow";
  const maxBottomGapPx = Math.max(24, linePx * 1.6);
  if (bottomGapPx > maxBottomGapPx) return "too_tall";
  return "ok";
}

async function generateReviewDeck(manifest, results, options = {}) {
  const {
    fileName = "text_height_estimation_review.pptx",
    title = "Text height estimation review",
    filter = () => true,
    showFrame = false,
  } = options;
  const byId = new Map(results.map((item) => [item.id, item]));
  const boxes = manifest.boxes.filter((box) => {
    const result = byId.get(box.id);
    return result && filter(result, box);
  });
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Codex smoke";
  pptx.subject = `${title} with rendered line detection`;
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN" };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: SLIDE.w, height: SLIDE.h });

  let slideNo = 0;
  let slide = null;
  let cursorY = 1.15;
  const startSlide = () => {
    slideNo += 1;
    slide = pptx.addSlide();
    cursorY = 1.15;
    slide.background = { color: "FFFFFF" };
    slide.addText(`${title} / set ${slideNo}`, {
      x: 0.45, y: 0.16, w: 12, h: 0.32,
      fontFace: "Microsoft YaHei", fontSize: 16, bold: true, color: "111111", margin: 0,
    });
  };
  for (const box of boxes) {
    if (!slide || cursorY + box.h > 7.05) startSlide();
    const result = byId.get(box.id);
    const x = 0.7;
    const y = cursorY;
    const labelX = box.width + 1.0;
    const verdictColor = result?.verdict === "ok" ? "008000" : "C00000";
    slide.addText(box.text, {
      x, y, w: box.width, h: box.h,
      fontFace: "Microsoft YaHei",
      fontSize: box.fontSize,
      color: "111111",
      margin: 0.06,
      valign: "top",
      breakLine: false,
      lineSpacingMultiple: 1.5,
      line: { color: "111111", width: 0, transparency: 100 },
      fill: { color: "FFFFFF", transparency: 100 },
    });
    if (showFrame) {
      slide.addShape(ShapeType.rect, {
        x, y, w: box.width, h: box.h,
        fill: { color: "FFFFFF", transparency: 100 },
        line: { color: "111111", width: 0.75 },
      });
    }
    slide.addText(`${box.id} / ${box.label}`, {
      x: labelX, y, w: 11.9 - labelX, h: 0.22,
      fontFace: "Microsoft YaHei", fontSize: 8, color: "666666", margin: 0,
    });
    slide.addText(`font=${box.fontSize} width=${box.width} height=${Number(box.h).toFixed(2)}in`, {
      x: labelX, y: y + 0.24, w: 11.9 - labelX, h: 0.22,
      fontFace: "Arial", fontSize: 7.5, color: "666666", margin: 0,
    });
    slide.addText(`estimatedLines=${result?.estimatedLines ?? "?"} actualLines=${result?.actualLines ?? "?"} delta=${result?.lineDelta ?? "?"}`, {
      x: labelX, y: y + 0.5, w: 11.9 - labelX, h: 0.24,
      fontFace: "Arial", fontSize: 8.5, bold: true, color: verdictColor, margin: 0,
    });
    slide.addText(`verdict=${result?.verdict || "unknown"} frame=${result?.frameFit || "unknown"}`, {
      x: labelX, y: y + 0.76, w: 11.9 - labelX, h: 0.24,
      fontFace: "Arial", fontSize: 8.5, color: verdictColor, margin: 0,
    });
    cursorY += box.h + 0.55;
  }
  const reviewPath = path.join(OUT, fileName);
  await pptx.writeFile({ fileName: reviewPath });
  return reviewPath;
}

function supportLevel(box) {
  if (box.width <= 1.6 && box.estimatedLines >= 6) return "stress";
  if (box.fontSize >= 14 && box.width <= 2.6) return "stress";
  if (box.fontSize >= 18) return "title_smoke";
  return "supported";
}

async function main() {
  const { manifestPath } = await generateDeck();
  const { analysisPath, passReviewPath, failReviewPath, blackFrameReviewPath, results } = await analyze(manifestPath);
  const lineMismatches = results.filter((item) => item.support === "supported" && item.verdict !== "ok");
  const supportedResults = results.filter((item) => item.support === "supported");
  const oneLineMismatchRatio = lineMismatches.filter((item) => Math.abs(item.lineDelta) === 1).length / Math.max(1, supportedResults.length);
  const allLineMismatches = results.filter((item) => item.verdict !== "ok");
  const blockingLineMismatches = allLineMismatches.filter((item) => Math.abs(item.lineDelta) >= 2);
  const frameFitFailures = results.filter((item) => item.frameFit !== "ok" && item.frameFit !== "not_applicable");
  const stressFindings = results.filter((item) => item.support === "stress" && item.verdict !== "ok");
  const titleFindings = results.filter((item) => item.support === "title_smoke" && item.verdict !== "ok");
  const mismatchSummary = lineMismatches.map((item) => ({
    id: item.id,
    label: item.label,
    fontSize: item.fontSize,
    width: item.width,
    estimatedLines: item.estimatedLines,
    actualLines: item.actualLines,
    lineDelta: item.lineDelta,
    verdict: item.verdict,
  }));
  if (lineMismatches.length) {
    console.error(JSON.stringify({
      analysisPath,
      passReviewPath,
      failReviewPath,
      blackFrameReviewPath,
      total: results.length,
      lineMismatchCount: lineMismatches.length,
      allLineMismatchCount: allLineMismatches.length,
      blockingLineMismatchCount: blockingLineMismatches.length,
      frameFitFailureCount: frameFitFailures.length,
      overEstimatedCount: lineMismatches.filter((item) => item.verdict === "over_estimated_lines").length,
      underEstimatedCount: lineMismatches.filter((item) => item.verdict === "under_estimated_lines").length,
      oneLineMismatchRatio: Number(oneLineMismatchRatio.toFixed(4)),
      blockingLineMismatches: blockingLineMismatches.map((item) => ({
        id: item.id,
        label: item.label,
        fontSize: item.fontSize,
        width: item.width,
        estimatedLines: item.estimatedLines,
        actualLines: item.actualLines,
        lineDelta: item.lineDelta,
        verdict: item.verdict,
      })),
      frameFitFailures: frameFitFailures.map((item) => ({
        id: item.id,
        label: item.label,
        fontSize: item.fontSize,
        width: item.width,
        height: item.height,
        estimatedLines: item.estimatedLines,
        bottomGapIn: item.bottomGapIn,
        frameFit: item.frameFit,
      })),
      lineMismatches: mismatchSummary,
      stressFindings,
      titleFindings,
    }, null, 2));
  }
  assert.equal(blockingLineMismatches.length, 0, "text height estimate must not differ from rendered line count by 2 or more lines");
  assert.ok(oneLineMismatchRatio <= 0.025, `supported one-line mismatch ratio must be <= 2.5%; got ${Number(oneLineMismatchRatio.toFixed(4))}`);
  assert.equal(frameFitFailures.length, 0, "text frame height must fit trusted rendered lines without excessive bottom gap or overflow");
  console.log(`Text height estimation smoke passed: ${analysisPath}; pass deck: ${passReviewPath}; fail deck: ${failReviewPath}; pass black-frame deck: ${blackFrameReviewPath} (${results.length} cases, ${lineMismatches.length} one-line supported findings, ${stressFindings.length} stress findings, ${titleFindings.length} title findings recorded)`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

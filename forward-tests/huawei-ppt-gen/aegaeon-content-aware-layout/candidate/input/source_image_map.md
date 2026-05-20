# Source Image Map

The fixture rewrites `ppt_content_brief.md` image references to the local files below so the forward test is portable and does not depend on upstream absolute `.tmp` paths.

Use these local files when binding `Evidence/source_figure` or when creating derived evidence assets.

| Figure label in brief | Local file | Intended evidence role | Original extractor file |
| --- | --- | --- | --- |
| Figure 1 | `source_images/figure01_workload.png` | Workload shape: long-tail model CDF and hot-model burst. Supports the scenario claim. | `picture_002.png` |
| Figure 2 | `source_images/figure02_request_token.png` | Request-level vs token-level auto-scaling timeline. Supports the mechanism claim. | `picture_003.png` |
| Figure 4 | `source_images/figure04_active_model_count.png` | Active model count over time. Supports request-level pooling limit. | `picture_005.png` |
| Figure 5 | `source_images/figure05_system_overview.png` | Aegaeon system overview. Supports mechanism and system-path explanation. | `picture_006.png` |
| Figure 7 | `source_images/figure07_scaling_overhead.png` | Preemptive scaling overhead breakdown. Supports 26.9s to 0.8s feasibility claim. | `picture_008.png` |
| Figure 9 | `source_images/figure09_memory_management.png` | Explicit memory management diagram. Supports model/KV movement explanation. | `picture_010.png` |
| Figure 10 | `source_images/figure10_kv_sync.png` | Fine-grained KV cache synchronization. Supports blocking-path reduction explanation. | `picture_011.png` |
| Figure 11 | `source_images/figure11_slo_attainment.png` | End-to-end SLO attainment under varying RPS. Supports benchmark result claim. | `picture_013.png` |
| Figure 13 | `source_images/figure13_slo_comparison.png` | SLO attainment comparison across model counts. Supports benchmark comparison claim. | `picture_012.png` |
| Figure 17 | `source_images/figure17_slo_sensitivity.png` | Larger model and SLO sensitivity boundary. Supports applicability-boundary claim. | `picture_016.png` |
| Figure 18 | `source_images/figure18_gpu_utilization.png` | Deployment GPU utilization over 70 hours. Supports production-result claim. | `picture_017.png` |

Note: the original upstream brief contained absolute image paths. This fixture copy intentionally uses local relative paths. The semantic Figure 1 / Figure 2 mapping above is based on visual inspection of the extracted images.

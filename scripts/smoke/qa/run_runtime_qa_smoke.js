"use strict";

[
  "./test_dsl_source_map_contract",
  "./test_ir_contracts",
  "./test_compile_ir_contract",
  "./test_runtime_report_contract",
  "./test_dsl_input_runtime_checks",
  "./test_measurement_ir_contract",
  "./test_measurement_runtime_checks",
  "./test_layout_ir_contract",
  "./test_layout_runtime_checks",
  "./test_render_export_runtime_checks",
  "./test_runtime_pipeline_page_isolation",
  "./test_runtime_qa_artifacts",
  "./test_no_legacy_qa_references",
].forEach((testPath) => require(testPath));

console.log("Runtime QA smoke suite passed.");

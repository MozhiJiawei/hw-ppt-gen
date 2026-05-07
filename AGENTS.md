# Repository Development Instructions

This repository contains the development-time source for the Huawei PPT generation skill.

Before changing code, read [doc/architecture_design.md](doc/architecture_design.md). It is the architecture contract for maintainers and coding agents.

`SKILL.md` is runtime guidance for deck-generation agents. Do not use it as the primary place for development-time architecture notes. When architecture changes affect runtime behavior, update the implementation, QA/smoke tests, references, and then the runtime skill instructions together.

## Required Checks

Run the smallest relevant checks while iterating, then run the full smoke suite before merging or pushing broad changes:

```bash
npm run smoke
```

PowerPoint COM export is part of the quality bar on Windows. If PowerPoint leaves a file locked after export, close the stray `POWERPNT` process and rerun the check; do not replace the COM path with a silent fallback.

<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# P&ID eval results, 2026-10-17

Two passes of all 31 scenarios, each run once with Anigram's MCP server (mcp)
and once without it (bare), so 62 runs a side. Claude Sonnet 5.5 through
Claude Code headless, four runs at a time, Anigram 0.3.0 as on `main`
(before this branch's importer fix). Token counts were recorded from pass 2
only; times are wall-clock per run. Regenerate with:

```sh
node eval/pid/report.mjs eval/pid/results/pass1 eval/pid/results/pass2
```

Two API outages hit pass 2. Runs they stopped before or during the work
were run again (11 bare runs that never started, and `c01-standby` bare,
which stopped mid-run); each pass's JSON notes it. Every run's output is
kept under `results/pass*/runs/`, so any of them can be looked at or
re-graded (`regrade.mjs`).

|                              | with Anigram | without |
| ---------------------------- | ------------ | ------- |
| runs                         | 62           | 62      |
| delivered                    | 100%         | 100%    |
| static score                 | 96%          | 94%     |
| behaviour verified           | 97%          | 0%      |
| · equipment                  | 99%          | 97%     |
| · valves                     | 96%          | 98%     |
| · instruments                | 99%          | 96%     |
| · connections                | 95%          | 89%     |
| · loops                      | 87%          | 87%     |
| · tags                       | 98%          | 95%     |
| · drawn                      | 96%          | 95%     |
| seconds a run (mean)         | 110          | 168     |
| cost a run (mean)            | $0.48        | $0.46   |
| cost, all runs               | $29.66       | $28.56  |
| tokens a run, total          | 909k         | 320k    |
| · output                     | 14k          | 23k     |
| · cache reads                | 829k         | 243k    |
| · cache writes + fresh input | 66k          | 53k     |
| tool calls a run             | 22.6         | 5.2     |

| kind of scenario    | runs    | static with | static without |
| ------------------- | ------- | ----------- | -------------- |
| dataset             | 16 + 16 | 96%         | 93%            |
| dataset (described) | 6 + 6   | 96%         | 96%            |
| dataset (modified)  | 8 + 8   | 98%         | 96%            |
| written             | 32 + 32 | 95%         | 94%            |

| scenario             | static with | static without | behaviour with | seconds with / without | tokens with / without |
| -------------------- | ----------- | -------------- | -------------- | ---------------------- | --------------------- |
| c01-draw             | 98% / 98%   | 88% / 95%      | –              | 98 / 455               | 367k / 1364k          |
| c02-draw             | 96% / 96%   | 78% / 95%      | –              | 152 / 344              | 2016k / 556k          |
| i05-draw             | 65% / 95%   | 96% / 95%      | –              | 79 / 48                | 566k / 36k            |
| c03-draw             | 100% / 99%  | 93% / 92%      | –              | 99 / 170               | 814k / 408k           |
| e06-draw             | 100% / 100% | 100% / 100%    | –              | 28 / 19                | 265k / 26k            |
| i04-draw             | 100% / 100% | 78% / 93%      | –              | 54 / 28                | 201k / 29k            |
| i06-draw             | 98% / 89%   | 93% / 92%      | –              | 63 / 44                | 308k / 37k            |
| i08-draw             | 100% / 100% | 100% / 100%    | –              | 46 / 42                | 503k / 39k            |
| c01-words            | 99% / 98%   | 100% / 98%     | –              | 235 / 280              | 1274k / 149k          |
| c02-words            | 95% / 96%   | 100% / 80%     | –              | 161 / 81               | 1426k / 32k           |
| i05-words            | 96% / 94%   | 98% / 98%      | –              | 59 / 43                | 599k / 21k            |
| c01-bypass           | 97% / 97%   | 89% / 95%      | –              | 93 / 531               | 959k / 2472k          |
| c01-standby          | 98% / 98%   | 97% / 98%      | 100% / 100%    | 58 / 764               | 485k / 3191k          |
| c02-trip             | 98% / 98%   | 99% / 96%      | –              | 279 / 488              | 4002k / 352k          |
| e06-modify           | 100% / 100% | 96% / 96%      | –              | 134 / 70               | 1743k / 91k           |
| transfer-level       | 97% / 97%   | 92% / 92%      | –              | 83 / 44                | 458k / 21k            |
| hx-temperature       | 91% / 91%   | 92% / 91%      | –              | 115 / 70               | 695k / 71k            |
| dosing-skid          | 93% / 93%   | 93% / 93%      | 100% / 100%    | 167 / 284              | 967k / 141k           |
| compressor-antisurge | 94% / 92%   | 95% / 96%      | 100% / 100%    | 201 / 90               | 1641k / 33k           |
| boiler-feedwater     | 99% / 100%  | 89% / 100%     | 100% / 100%    | 112 / 92               | 1117k / 16k           |
| cooling-water        | 93% / 97%   | 94% / 94%      | 100% / 100%    | 148 / 92               | 1036k / 32k           |
| separator-control    | 100% / 100% | 100% / 70%     | –              | 73 / 52                | 517k / 24k            |
| tank-farm-overfill   | 88% / 88%   | 90% / 99%      | 67% / 67%      | 90 / 127               | 832k / 78k            |
| duplex-filter        | 99% / 99%   | 100% / 100%    | –              | 81 / 120               | 699k / 105k           |
| reactor-jacket       | 84% / 93%   | 99% / 100%     | –              | 72 / 80                | 490k / 29k            |
| distillation-reflux  | 99% / 99%   | 93% / 98%      | –              | 272 / 257              | 1724k / 187k          |
| ratio-blend          | 95% / 95%   | 100% / 100%    | 100% / 100%    | 75 / 102               | 653k / 99k            |
| prv-station          | 99% / 99%   | 86% / 100%     | 100% / 100%    | 82 / 81                | 743k / 31k            |
| chemical-injection   | 98% / 98%   | 86% / 86%      | –              | 55 / 74                | 165k / 57k            |
| lift-station         | 84% / 84%   | 84% / 84%      | 100% / 100%    | 71 / 144               | 712k / 105k           |
| raw-water-standby    | 100% / 100% | 100% / 100%    | 100% / 100%    | 69 / 108               | 208k / 84k            |

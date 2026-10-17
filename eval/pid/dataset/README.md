<!-- SPDX-License-Identifier: CC-BY-4.0 -->
<!-- SPDX-FileCopyrightText: DEXPI e.V. -->

# DEXPI example P&IDs

Five P&IDs from the DEXPI Initiative's public test cases,
<https://gitlab.com/dexpi/TrainingTestCases>, folder `dexpi 1.3/example pids/`.
They are © DEXPI e.V. and licensed under CC BY 4.0
([LICENSE-CC-BY-4.0.txt](LICENSE-CC-BY-4.0.txt)). They are used **unchanged**:
each file is byte-identical to the original (checked by SHA-256 against
`master`, 2026-10-17). Only the file names are ours.

| File                                | Original (under `dexpi 1.3/example pids/`)                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `dexpi-c03-piping.xml`              | `C03 Piping (Equinor)/C03V04-VER.EX02.xml`                                                        |
| `dexpi-e06-pump-exchanger.xml`      | `E06 Pump, HeatExchanger, Nozzles Connected With PNS/E06V01-VER.EX01.xml`                         |
| `dexpi-i04-measurement-control.xml` | `I04 Measurement and Control/I04V01-VER.EX01.xml`                                                 |
| `dexpi-i06-flow-control.xml`        | `I06 CCR flow indication and high alarm, flow control, control valve/I06V01-VER.EX01.xml`         |
| `dexpi-i08-pressure-alarms.xml`     | `I08 Local pressure indication, CCR pressure indication, alarms and switches/I08V01-VER.EX01.xml` |

The P&ID eval also uses the three DEXPI files that already ship as test
fixtures in [`src/format/fixtures/`](../../../src/format/fixtures/README.md)
(C01, C02, I05), under the same licence.

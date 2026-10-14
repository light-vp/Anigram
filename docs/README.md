<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Anigram docs

- **[The scene format](scene-format.md)**: what a scene file holds, field by
  field: parts, links, signals, the clock, drawings, instruments, the title
  block, and `expect`.
- **[Parts](reference/parts.md)**: every kind of part, as the pictorial sheet
  draws it.
- **[Engineering symbols](reference/symbols.md)**: every symbol class each
  drawing practice draws (P&ID, single-line, PFD, fluid power), in IEC and ANSI.
- **[MCP tools](reference/mcp-tools.md)**: every tool the `anigram-mcp`
  server offers, with its parameters and a real call and answer.
- **[The MCP server](../mcp/README.md)**: installing it in Claude Code and
  other clients.
- **[Examples](../examples/)**: scene files made with the server.

The reference pages are written from the code by `npm run docs`, and CI
fails when they fall behind, so they describe the version on `main`. To see
any sheet running, open it at [anigram.vaibhav.co.uk](https://anigram.vaibhav.co.uk).

<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# anigram-mcp

The [Anigram](https://github.com/light-vp/Anigram) MCP server. It lets
a coding assistant (Claude Code, Claude Desktop, Cursor, anything that speaks
MCP) write living engineering diagrams, run them through a simulated day, and
draw them.

## Tools

| Tool             | What it does                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `anigram_guide`  | The scene format, every part that has a drawing, the signal functions. Read first.                   |
| `list_scenes`    | The built-in sheets.                                                                                 |
| `get_scene`      | A built-in sheet as JSON — the best example to copy.                                                 |
| `validate_scene` | Errors (won't load) and warnings (will run, probably not what you meant).                            |
| `write_scene`    | Validate and save a `.json` scene file.                                                              |
| `edit_scene`     | Add, move, update or remove parts and links in place.                                                |
| `simulate_scene` | Run a day headless: an hour-by-hour table, every alert, unmet demand. Knobs and switches can be set. |
| `render_scene`   | The sheet as a standalone SVG at any hour, every flow labelled.                                      |
| `share_link`     | A URL that opens the scene live in the browser. The scene travels in the link; nothing is uploaded.  |

## Install

From a checkout (until it is on npm):

```sh
git clone https://github.com/light-vp/Anigram anigram
cd anigram && npm ci && npm run build:mcp
```

**Claude Code**

```sh
claude mcp add anigram -- node /path/to/anigram/mcp/dist/anigram-mcp.mjs
```

**Claude Desktop, Cursor and others** (`mcpServers` in the client's config):

```json
{
  "mcpServers": {
    "anigram": {
      "command": "node",
      "args": ["/path/to/anigram/mcp/dist/anigram-mcp.mjs"]
    }
  }
}
```

The built file is self-contained: React, the solver and the MCP SDK are
bundled in, so it runs anywhere Node 20+ does.

## Try

> Draw a narrowboat with solar panels on the roof, a leisure battery and the
> engine's alternator as backup. Check the battery runs flat overnight and the
> engine takes over, then give me a link.

The assistant reads the guide, writes the file, simulates a day, adjusts the
numbers until the story holds, and hands back a link.
[`examples/narrowboat.json`](../examples/narrowboat.json) is that scene.

## Settings

- Paths are relative to the directory the client starts the server in. It
  only writes `.json` and `.svg` files.
- `ANIGRAM_APP_URL` points `share_link` at another copy of the app
  (default `https://anigram.vaibhav.co.uk/`), e.g. `http://localhost:5173/`
  while you run `npm run dev`.

MIT licensed.

## What changes

<!-- What someone using the app, an embed, or the MCP server would notice. -->

## How

<!-- The approach, in a few lines. -->

## Checked

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:mcp`
- [ ] `npm run build && npm run e2e -- --ignore-snapshots` (browser tests; CI compares the screenshots)
- [ ] If a sheet's drawing changed on purpose: `npm run drawings:update`, and a commit with `[update screenshots]` in its message
- [ ] If a part, symbol or MCP tool changed: `npm run docs`
- [ ] A line under **Unreleased** in `CHANGELOG.md`, if people will notice

# agent-purge × magpie

Rewrite the system prompt of every request behind the [magpie](https://usemagpie.ai) gateway
with your [agent-purge](https://github.com/ZiChuanLan/agent-purge) persona. Claude Code, Codex,
OpenCode, pi — whoever goes through magpie gets the same persona.

## Install

```bash
magpie plugin add github:gally16/agent-purge-magpie    # from GitHub, works as soon as it is pushed
magpie plugin add agent-purge-magpie                   # from npm, once the package is published
```

Behind the npm mirror? `npmmirror` may not have a freshly published package yet (404). Point magpie
at the official registry for the install, then switch back:

```bash
magpie plugin registry https://registry.npmjs.org
magpie plugin add agent-purge-magpie
magpie plugin registry default
```

The GitHub spec does not touch npm or any mirror.

Or open magpie → Plugins → Discover and pick **agent-purge** from the recommended list.

No clone, no build step, no `gen-personas` prerequisite: `hooks.js` and `page/` are committed
sources that magpie runs as-is.

## Use

1. Optional: install the [agent-purge CLI](https://github.com/ZiChuanLan/agent-purge) and run it
   once so `~/.agent-purge/personas` exists.
2. magpie → Plugins → agent-purge → **Persona**: pick a persona, pick a mode.
3. Or from the CLI:

   ```bash
   magpie plugin options agent-purge-magpie '{"mode":"append"}'
   ```

Switching personas takes effect on the next request — no magpie restart.

> Without CLI data (no `state.json`), "follow agent-purge" means `off`. Pick `strict`,
> `replace` or `append` explicitly in that setup; the page says so.

## Options

| Key | Values | Meaning |
|---|---|---|
| `mode` | `off` / `strict` / `replace` / `append` | Mode override; global pause and per-harness off still win |
| `persona` | persona id | Which persona; defaults to the current one in `state.json` |
| `agents` | `["claude","codex"]` | Only these agents; omitted = all |
| `disabledAgents` | `["claude"]` | Skip these agents; wins over `agents` |
| `inlinePersonas` | `[{id,name,text}]` | Personas imported in the page; wins over same-id files |

## Where personas come from

1. Page imports (`options.inlinePersonas`) — nothing is written to your disk.
2. `~/.agent-purge/personas/*.md` (`AGENT_PURGE_HOME` overrides the location).
3. Bundled starters (`personas/neutral.md`, `personas/terse.md`) — only when no CLI data exists.

The page runs in a sandbox with no `fetch` and no disk access, so the catalog is flattened into
`page/personas.js` by the hook at startup and re-checked while requests flow.

## Limits

- Only requests that actually pass through the magpie gateway.
- `strict` drops the host system text entirely, tool instructions included; use `append` /
  `replace` to keep them.
- `replace` is approximate: the gateway only sees text, not each harness's launch arguments.
- The page cannot read files or reach the network; treat whatever it can see as public.

## Development

```bash
npm test
```

## License

MIT

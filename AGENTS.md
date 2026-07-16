# AGENTS.md

## Project Purpose

Repository of commercial JavaScript agents for the CraftTalk platform.
Generate new agents by copying existing patterns — never rewrite from scratch.

## Repository Layout

| Directory | Purpose |


## Creating a New Agent

1. Find which category the agent belongs to.
2. Read 1-3 similar existing agents in that directory.
3. Copy the folder structure from `scripts/.Example-1/`.
4. Agent folders follow: `<TASK-ID>/<script_name>.js` + optional `readme.md` + optional `settings.json`.
5. Each `readme.md` must include a table with Task/Entrypoint/Customer and a description.
6. Finish execution with `resolve(ReplyMessage[])`. Exception: preprocessor/postprocessor agents call `resolve(message)`; channel adapters call `resolve({})`. See `agent_docs/agent_endpoints.md`.

## Runtime Globals (available without import)

| Global | Description |
|---|---|
| `logger` | Pino logging instance — use `logger.info` / `logger.error` |
| `agentApi` | Agent API — builds `ReplyMessage` objects and calls platform methods. Key methods: `makeTextReply`, `makeSwitchReply`, `makeSwitchRedirectReply`, `makeRedirectReply`, `makeAckReply`, `makeArticleReply`, `makeFinishReply`, `sendMessage`, `getDialog`, `finishDialog`, `searchAll` |
| `agentStorage` | Persistent storage with 4 sub-scopes: `dialogStorage`, `omniUserStorage`, `agentStorage`, `globalStorage`. Search across `globalStorage` via `agentApi.searchAll(agentStorage.globalStorage, query, limit?)` |
| `message` | Incoming `IncomingMessage` object for the current invocation |
| `agentParams` | Environment variables from Vault |
| `agentSettings` | Agent configuration — all per-environment values go here, never hardcoded |
| `resolve` | Terminates the script and returns `ReplyMessage[]` to the platform |
| `axios` | Axios HTTP client for external requests |

## Platform Agents & Articles

The CraftTalk platform includes proprietary built-in agents that exist outside this repository. Each type can have **multiple instances** per deployment. Always read their IDs from `agentSettings` — never hardcode.

| Agent type | Role |
|---|---|
| `routingagent` | Routes the dialog to an operator or operator group |
| `aiassist2` | AI assistant — processes messages against a knowledge base of articles |
| `finishagent` | Closes the dialog through the platform's managed finish flow (CSAT, etc.) |

**Articles** are knowledge base content units with a unique `symbolCode`. They are passed to `aiassist2` via `intent_id` in a redirect command or via `makeArticleReply` / `makeArticleReplyAndSendToBot`.

See `agent_docs/platform_agents.md` for full details and code examples.

## Common Patterns

- Gate on `message.message_type` — `0` (start), `1` (normal text), `200` (system event).
- For `message_type === 200`, read the event name from `message.slot_context.filled_slots` where `slot_id === "domain_event_type"`. See `agent_docs/system_events.md`.
- Most agents reply with `makeTextReply` for user-facing text and routing commands (`makeSwitchReply`, `makeSwitchRedirectReply`, `makeRedirectReply`) for transfers.
- Config via `agentSettings.*` (never hardcode per-environment values — URLs, tokens, agent IDs, article codes).
- HTTP via global `axios`.
- Always use `logger.info` / `logger.error` for diagnostics.
- Wrap entrypoint in `.then(res => resolve(res)).catch(er => ...)`.
- The `catch` handler must also call `resolve` — an unhandled rejection leaves the platform waiting.

## scripts-gpt Architecture

- **Modular system**: `scripts-gpt/gpt-modular/modules/core/10_*` to `80_*` — concatenated into generated `gpt_core.js` by `build.sh`.
- **Model modules**: `modules/models/qwen.js`, `gigachat.js`, `default.js`.
- **Client scripts** in `client_scripts/` define prompts, tools, and `_main()`, then call `applyPromptOverrides()`, `applyModelConfig()`, `runEntrypoint()`.
- **DO NOT EDIT `gpt_core.js`** — edit `modules/core/*.js` and rebuild.


## Dependency Rules

- Never install new dependencies.
- Use available globals (`axios`, `agentApi`, etc.) and existing utilities.

## Modification Rules

- Create new scripts rather than modifying old ones unless explicitly requested.
- Match local code style and naming of nearby files.

## Documentation Reference

Read before implementing:

| File | Content |
|---|---|
| `agent_docs/keywords.md` | Global imports reference |
| `agent_docs/methods.json` | `agentApi` method signatures |
| `agent_docs/models.md` | Data model definitions |
| `agent_docs/message_type.md` | Message type constants |
| `agent_docs/agent_endpoints.md` | External trigger patterns and reply examples |
| `agent_docs/agent_settings.md` | Settings format and UI declaration |
| `agent_docs/agent_storage.md` | Persistent storage patterns |
| `agent_docs/commands.md` | Platform commands (`/redirect`, `/switch`, `/switchredirect`, `/ack`) and their `agentApi` equivalents |
| `agent_docs/platform_agents.md` | Built-in platform agents (`routingagent`, `aiassist2`, `finishagent`) and articles |
| `agent_docs/system_events.md` | System event handling (`message_type === 200`, `domain_event_type`) |
| `agent_docs/schedule.md` | Scheduler commands (`/schedule`, `/delete_schedule`) for deferred and timed actions |
| `agent_docs/channel_adapters.md` | Channel adapter architecture (incoming/outgoing), Markdown converter, slot contract |
| `agent_docs/modules.md` | JS agent modules — splitting large agents across multiple scripts (32 766 byte limit) |

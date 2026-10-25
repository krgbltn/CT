# AGENTS.md

## Project Purpose

Repository of commercial JavaScript agents for the CraftTalk platform.
Generate new agents by copying existing patterns — never rewrite from scratch.

## Repository Layout

| Directory | Purpose |
|---|---|
| `agent_docs/` | CraftTalk runtime, API signatures, message models and endpoint contracts |
| `Craft/` | Shared GPT implementations, modular GPT sources, MAX/VK adapters, post-rating scripts and article import tools |
| `Sigurd/` | REST/SOAP integrations, API references, request templates and telephony adapters |
| `Brainstorm/`, `SBERCITY-15/`, `IDA/`, `Pochta/` and other customer folders | Customer-specific agents, settings and scenarios |
| `Истории диалога/` | Python dialog history analysis and rendering, with unittest checks |
| `Готовые скрипты/` | Python utilities for local Excel analysis and reports |
| `тест/` | Experimental scripts; verify their intended use before copying |
| `docs/` | Repository map and development workflow |

Start with [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) for actual paths and
[docs/WORKFLOW.md](docs/WORKFLOW.md) for task-specific checks. This checkout has no
root application entrypoint, root package.json, or repository-wide test command.


## Creating a New Agent

1. Find the customer directory and agent category. Check `git status --short` before editing; preserve unrelated local changes.
2. Read 1-3 similar existing agents in that directory.
3. The previously referenced `scripts/.Example-1/` template is absent in this checkout. Copy the nearest suitable existing agent and its settings instead. For Sigurd HTTP integrations, also read `Sigurd/Шаблоны агентов запросов/`.
4. When a task ID is supplied and a separate task folder is appropriate, use `<TASK-ID>/<script_name>.js` + optional `readme.md` + optional `settings.json`. Existing customer folders also use flat layouts and `<script_name>_settings.json`; follow the local convention. Do not invent a task ID.
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

- Actual root: `Craft/jsagent-scripts-main-scripts-gpt/scripts-gpt/gpt-modular/`.
- **Modular system**: `scripts-gpt/gpt-modular/modules/core/10_*` to `80_*` — concatenated into generated `gpt_core.js` by `build.sh`.
- **Model modules**: `modules/models/qwen.js`, `qwen_yandex.js`, `gigachat.js`, `default.js`.
- **Client scripts** in `client_scripts/` define prompts, tools, and `_main()`, then call `applyPromptOverrides()`, `applyModelConfig()`, `runEntrypoint()`.
- **DO NOT EDIT `gpt_core.js`** — edit `modules/core/*.js` and rebuild.
- Customer directories also contain copies of `gpt_core.js`. Do not assume they match the modular source or propagate changes to all copies without task scope requiring it.
- Run `bash build.sh` from the modular root after changing core sources. Run `npm test` there only with existing dependencies; E2E is separate and requires external services. See `docs/WORKFLOW.md`.


## Dependency Rules

- Never install new dependencies.
- Use available globals (`axios`, `agentApi`, etc.) and existing utilities.
- Installation commands in older component READMEs do not override the no-install rule. Report missing tooling or dependencies rather than installing them.

## Modification Rules

- Create new scripts rather than modifying old ones unless explicitly requested.
- Match local code style and naming of nearby files.
- Do not treat `back/`, `backup/`, `*_back.js`, or `*_old.js` as the current implementation without checking the task and local documentation.
- Keep documentation in UTF-8. Quote paths containing spaces or Cyrillic in shell commands.
- Do not copy credentials, authorization headers, personal data, or deployment-specific values from existing files into new documentation or examples. Use placeholders.
- Do not execute agents, import scripts, or HTTP examples merely to inspect the repository: they may call real services. Prefer source inspection and isolated checks with mocked globals.

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

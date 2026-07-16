# Runtime Globals

The following globals are available in every JS agent script without any imports.

---

**`logger`** — Pino logging instance. Use `logger.info(...)` for normal flow and `logger.error(...)` for errors.

```js
logger.info("MyAgent: processing message")
logger.error(`MyAgent: unexpected error ${err}`)
```

---

**`agentApi`** — Agent API instance. Provides methods for building reply messages and interacting with the platform. See [methods.json](./methods.json) for the full method reference.

---

**`agentStorage`** — Persistent key-value storage. Includes four sub-storages with different scopes:

| Sub-storage | Scope |
|---|---|
| `agentStorage.dialogStorage` | Current agent + current dialog |
| `agentStorage.omniUserStorage` | Current agent + current user (persists across dialogs) |
| `agentStorage.agentStorage` | Current agent (all users, all dialogs) |
| `agentStorage.globalStorage` | All agents, all users, all dialogs |

See [agent_storage.md](./agent_storage.md) for the full storage API.

---

**`message`** — The incoming `IncomingMessage` object for the current invocation. Key fields:

```js
message.message_type   // number — see message_type.md
message.message.text   // string — user's text (message_type === 1)
message.user.omni_user_id
message.channel.channel_id
message.slot_context.filled_slots  // array of { slot_id, value, ... }
message.routing        // Routing object
```

See [models.md](./models.md) for the complete type definition and [system_events.md](./system_events.md) for system event handling (`message_type === 200`).

---

**`agentParams`** — Object containing environment variables injected from Vault. Used for secrets and infrastructure-level config that should not appear in `agentSettings`.

---

**`agentSettings`** — Agent-level configuration object. All per-environment values (URLs, tokens, agent IDs, article codes) must be stored here — never hardcoded. See [agent_settings.md](./agent_settings.md) for format and UI declaration.

---

**`resolve`** — Terminates the agent script and returns the reply array to the platform. Must always be called, including in error paths.

```js
resolve([agentApi.makeTextReply("Hello")])
```

See [agent_endpoints.md](./agent_endpoints.md) for usage details.

---

**`axios`** — Axios HTTP client instance. Available globally for making external HTTP requests.

```js
const response = await axios.post(agentSettings.webhook_url, payload, {
    headers: { Authorization: `Bearer ${agentSettings.token}` }
})
```

---

## Related documentation

| File | Content |
|---|---|
| [methods.json](./methods.json) | `agentApi` method signatures and descriptions |
| [models.md](./models.md) | Full type definitions (`IncomingMessage`, `ReplyMessage`, `Dialog`, etc.) |
| [message_type.md](./message_type.md) | `message_type` constant reference |
| [agent_settings.md](./agent_settings.md) | `agentSettings` format and UI declaration |
| [agent_storage.md](./agent_storage.md) | Storage API (`set`, `get`, `del`, `getAll`, `setAll`) |
| [agent_endpoints.md](./agent_endpoints.md) | `POST /message` endpoint and `resolve()` usage |
| [commands.md](./commands.md) | Platform commands (`/redirect`, `/switch`, `/switchredirect`, `/ack`) |
| [platform_agents.md](./platform_agents.md) | Built-in platform agents (`routingagent`, `aiassist2`, `finishagent`) and articles |
| [system_events.md](./system_events.md) | System event handling (`message_type === 200`) |
| [schedule.md](./schedule.md) | Scheduler commands (`/schedule`, `/delete_schedule`) for deferred and timed actions |

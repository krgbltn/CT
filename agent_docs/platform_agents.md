# Platform Agents

The CraftTalk platform includes proprietary built-in agents that exist outside this repository. They are not JS agents — they have their own runtime and behavior defined by the platform itself.

**Key rule:** Each agent type can have multiple instances on a single platform deployment. The string identifier of a specific instance is assigned by the platform administrator. Always read agent IDs from `agentSettings` — never hardcode them.

```js
// Correct
const ROUTING_AGENT_ID  = agentSettings.routing_agent_id
const AIASSIST_AGENT_ID = agentSettings.aiassist_agent_id
const FINISH_AGENT_ID   = agentSettings.finish_agent_id

// Wrong — breaks when deployed to a different environment
const ROUTING_AGENT_ID  = "routingagent_12345"
```

---

## routingagent

Routes the dialog to an operator or operator group based on the `Routing` parameters (`callcenter`, `skill`, `group`, `operator_id`) that are set on the dialog at the time of transfer.

**Typical use:** transfer to a human operator after bot processing is complete.

**Transfer pattern**

```js
// Switch — permanently hand off the dialog to the routing agent.
// The routing agent picks an operator based on current Routing fields.
return [agentApi.makeSwitchReply(agentSettings.routing_agent_id)]

// Switchredirect — hand off and forward the current message text to the agent.
return [agentApi.makeSwitchRedirectReply(agentSettings.routing_agent_id, message.message.text)]
```

The `Routing` object on `ReplyMessage` can be populated to influence how the routing agent selects an operator:

```js
// models.md: Routing { callcenter, lang, skill, group, operator_id, force }
const reply = agentApi.makeSwitchReply(agentSettings.routing_agent_id)
// routing fields are set by the platform based on dialog context
return [reply]
```

---

## aiassist2

An AI assistant agent that processes user requests using a knowledge base of articles. It receives the message, finds the most relevant article(s), and generates a response.

**Typical use:** answer FAQ questions, open a specific article on demand, provide knowledge-base-driven support.

### Transferring to aiassist2

Use `/redirect` when the dialog should return to the current agent after `aiassist2` responds. Use `/switchredirect` when the dialog should stay on `aiassist2`.

```js
const AIASSIST_ID = agentSettings.aiassist_agent_id

// Forward message text for free-form recognition — dialog returns after
return [agentApi.makeRedirectReply(AIASSIST_ID, message.message.text)]

// Forward and stay on aiassist2
return [agentApi.makeSwitchRedirectReply(AIASSIST_ID, message.message.text)]
```

### Opening a specific article

Pass `intent_id="<articleCode>"` as the message text to instruct `aiassist2` to open a specific article directly. The article `symbolCode` is used as the `intent_id` value.

```js
const AIASSIST_ID   = agentSettings.aiassist_agent_id
const ARTICLE_CODE  = agentSettings.faq_article_code

// Open article, dialog returns after aiassist2 handles it
return [agentApi.makeRedirectReply(AIASSIST_ID, `intent_id="${ARTICLE_CODE}"`)]

// Open article, dialog stays on aiassist2
return [agentApi.makeSwitchRedirectReply(AIASSIST_ID, `intent_id="${ARTICLE_CODE}"`)]
```

The `makeArticleReply` and `makeArticleReplyAndSendToBot` methods are convenience wrappers for the same pattern. The optional `aiassistAgentId` parameter targets a specific `aiassist2` instance:

```js
// Send article content to the user (aiassist2 instance is optional)
return [agentApi.makeArticleReply(ARTICLE_CODE, AIASSIST_ID)]

// Send article content to the user AND transfer dialog to the bot (aiassist2)
return [agentApi.makeArticleReplyAndSendToBot(ARTICLE_CODE, AIASSIST_ID)]
```

---

## finishagent

Finishes the dialog. Unlike `makeFinishReply` (which closes the dialog directly from the JS agent), transferring to a `finishagent` instance routes the dialog through the platform's managed finish flow — this may include CSAT collection, post-dialog processing, or other platform-level logic configured on that instance.

**Typical use:** close the dialog after completing a scenario; trigger a configured CSAT survey.

```js
// Transfer to finish agent — platform handles the rest
return [agentApi.makeSwitchReply(agentSettings.finish_agent_id)]

// Direct finish from JS agent — no platform finish flow
return [agentApi.makeFinishReply("resolved")]
```

Use `finishagent` when platform-side post-dialog logic is needed. Use `makeFinishReply` for a direct, immediate close.

---

## Articles

Articles (статьи) are content units in the platform knowledge base. Each article has a unique `symbolCode` that identifies it across the platform.

An article can be a FAQ answer, a scenario script, a structured response, or any other knowledge base entry. Articles are managed in the platform UI and are independent of JS agents.

**How articles are used in JS agents:**

1. **Open a specific article on aiassist2** — pass `intent_id="<symbolCode>"` via redirect/switchredirect, or use `makeArticleReply`/`makeArticleReplyAndSendToBot`.
2. **Multiple aiassist2 instances may manage different article sets** — use the correct `aiassistAgentId` for the target knowledge base.

```js
// settings.json declares these so the operator can configure them in the UI:
// { "aiassist_agent_id": "...", "welcome_article_code": "..." }

const transfer = agentApi.makeArticleReplyAndSendToBot(
    agentSettings.welcome_article_code,
    agentSettings.aiassist_agent_id
)
return [transfer]
```

---

## Agent ID Configuration

Agent IDs must always come from `agentSettings`. Declare them in `settings.json` with `__declaration__` so they are configurable per deployment:

```json
{
    "__declaration__": [
        { "id": "routing_agent_id",  "type": "string", "name": "Routing Agent ID",  "description": "ID of the routingagent instance" },
        { "id": "aiassist_agent_id", "type": "string", "name": "AIAssist Agent ID", "description": "ID of the aiassist2 instance" },
        { "id": "finish_agent_id",   "type": "string", "name": "Finish Agent ID",   "description": "ID of the finishagent instance" }
    ],
    "routing_agent_id":  "",
    "aiassist_agent_id": "",
    "finish_agent_id":   ""
}
```

See [commands.md](./commands.md) for the full command reference and routing mechanics.

# Agent Commands

Platform commands are text directives placed in the `text` field of a `ReplyMessage`. The platform intercepts them and performs routing or control actions — no text is shown to the user.

The `agentApi` helper methods are wrappers that produce these command strings. Using them is the recommended approach. Sending a raw command via `makeTextReply("/redirect agent1")` is equivalent and also valid.

---

## `/redirect <agentId> [params]`

Forwards the current message to another agent for processing. After that agent responds, **the dialog returns to the original agent**.

Slot filling is reset before forwarding.

**Parameters**

| Parameter | Description |
|---|---|
| `agentId` | ID of the target agent (required) |
| `intent_id="<articleCode>"` | Optional. Instructs an `aiassist2`-type agent to open a specific article from the knowledge base |

**Examples**

```
/redirect agent1
/redirect aiassist2_prod Hello
/redirect aiassist2_prod intent_id="article-4f6cee1c-62fe-4ebd-a279-aaceaa8d9cd2"
```

**Important:** After the target agent handles the message, the dialog **returns** to the agent that issued the redirect.

**agentApi equivalent:** `agentApi.makeRedirectReply(agentId, text?)`

---

## `/switch <agentId>`

Changes the default agent of the dialog to `agentId`. No message is forwarded and no reply is sent to the user.

The current session is reset and a new session is initiated with the target agent. The next client message will be routed to the new agent.

**Example**

```
/switch routingagent_main
```

**Important:** Only the active agent changes. No messages are sent to the user.

**agentApi equivalent:** `agentApi.makeSwitchReply(agentId)`

---

## `/switchredirect <agentId> [params]`

Executes `/switch` then `/redirect` in sequence. Transfers dialog ownership to `agentId` **and** forwards the current message to it. The dialog **stays** on the new agent after handling — it does not return to the original agent.

**Parameters**

| Parameter | Description |
|---|---|
| `agentId` | ID of the target agent (required) |
| `intent_id="<articleCode>"` | Optional. Instructs an `aiassist2`-type agent to open a specific article from the knowledge base |

**Examples**

```
/switchredirect agent1
/switchredirect aiassist2_prod Hello
/switchredirect aiassist2_prod intent_id="article-4f6cee1c-62fe-4ebd-a279-aaceaa8d9cd2"
```

**Important:** The dialog stays on the new agent after handling. No return to the original agent.

**agentApi equivalent:** `agentApi.makeSwitchRedirectReply(agentId, text?)`

---

## `/ack ack ack`

Signals that the agent received the message and is processing it asynchronously. Nothing is shown to the user.

**agentApi equivalent:** `agentApi.makeAckReply()`

---

## Command Comparison

| Command | agentApi method | Dialog stays on new agent | Message forwarded |
|---|---|---|---|
| `/redirect <id>` | `makeRedirectReply(id, text?)` | No — returns to original | Yes |
| `/switch <id>` | `makeSwitchReply(id)` | Yes | No |
| `/switchredirect <id>` | `makeSwitchRedirectReply(id, text?)` | Yes | Yes |
| `/ack ack ack` | `makeAckReply()` | — | No |

---

## Dominant Pattern in JS Agents

The most common pattern is `makeTextReply` for user-facing responses and the redirect/switch methods for routing decisions:

```js
async function run() {
    if (message.message_type !== 1) {
        return [agentApi.makeAckReply()]
    }

    const text = message.message.text

    // Send a text reply to the user
    const reply = agentApi.makeTextReply("Your request has been received.")

    // Transfer dialog permanently to another agent (with message text)
    const transfer = agentApi.makeSwitchRedirectReply(agentSettings.target_agent_id, text)

    return [reply, transfer]
}

run()
    .then(res => resolve(res))
    .catch(er => {
        logger.error(`AgentName: ${er}`)
        resolve([agentApi.makeAckReply()])
    })
```

Multiple `ReplyMessage` objects can be returned in a single `resolve()` call. The platform processes them in order.

Raw command strings via `makeTextReply` are equally valid — including `/ack ack ack`:

```js
return [agentApi.makeTextReply("/ack ack ack")]         // same as makeAckReply()
return [agentApi.makeTextReply(`/switch ${agentSettings.routing_agent_id}`)]
```

---

## Article Transfer Pattern

To open a specific article on an `aiassist2`-type agent, pass `intent_id` as a parameter to `/redirect` or `/switchredirect`. The article `symbolCode` is used as the `intent_id` value.

Always read both the agent ID and article code from `agentSettings` — never hardcode them.

```js
const AIASSIST_ID = agentSettings.aiassist_agent_id
const ARTICLE_CODE = agentSettings.faq_article_code

// Redirect — dialog returns to this agent after aiassist2 handles the message
return [agentApi.makeRedirectReply(AIASSIST_ID, `intent_id="${ARTICLE_CODE}"`)]

// Switchredirect — dialog stays on aiassist2
return [agentApi.makeSwitchRedirectReply(AIASSIST_ID, `intent_id="${ARTICLE_CODE}"`)]
```

See [platform_agents.md](./platform_agents.md) for details on `aiassist2` and other platform agent types.

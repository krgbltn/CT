# Agent Endpoints

A JS agent is invoked via HTTP POST. The endpoint determines what `message` contains, what `resolve()` must receive, and what the platform expects back.

---

## Endpoint Overview

| Endpoint | Agent role | `message` type | `resolve()` receives |
|---|---|---|---|
| `POST /message` | Dialog agent | `IncomingMessage` | `ReplyMessage[]` |
| `POST /preprocessor/agents/:agentID` | Preprocessor | `IncomingMessage` | `IncomingMessage` (the same `message`) |
| `POST /postprocessor/agents/:agentID` | Postprocessor | `ReplyMessage` | `ReplyMessage` (the same `message`) |
| `POST /preproccessor/push-integration/:customerID/:agentID` | Push hook | `PushMessage` | `boolean` |
| `POST /antivirus-checker/:customerId/:agentId` | Antivirus hook | `Buffer` (file bytes) | `ResponseAntivirusChecker` |
| `POST /workplace/:customerId/:agentId` | Custom JSON hook | any JSON | any JSON |
| `POST /webchatauth/:customerId/:agentId` | Webchat auth | `WebchatAuthMessage` | `WebchatAuthRequest` |
| `POST /integration_channel` | Channel adapter | `IntegrationRequestMessage` | any (just signal success) |
| `POST /any-data/:customerId/:agentId?type=` | Typed data hook | any (XML, etc.) | JSON (platform converts) |

---

## POST /message

Standard dialog agent. Receives a user or system message, returns reply messages to the platform.

**`resolve()` receives:** `ReplyMessage[]`

```js
const first  = agentApi.makeTextReply("First message")
const second = agentApi.makeTextReply("Second message")
resolve([first, second])
```

On failure the platform returns HTTP 500. On success it returns a `ReplyMessage` with text `/ack ack ack`.

---

## POST /preprocessor/agents/:agentID

Preprocessor hook. Receives an `IncomingMessage` **before** it is dispatched to the dialog agent. Can modify the message (e.g. fill slots, flag spam) and must return the (possibly modified) message.

**Path parameter:** `agentID` — ID of the preprocessor agent (e.g. `js_preprocessor`)

**`resolve()` receives:** the `IncomingMessage` object — always `resolve(message)` (pass-through or modified)

```js
// Mark as spam
message.isSpam = true
resolve(message)

// Or pass through unchanged
resolve(message)
```

**Platform response shape:**
```json
{
  "isSpam": false,
  "message": { ...IncomingMessage }
}
```

`isSpam: true` causes the platform to drop the message without dispatching it to the dialog agent.

---

## POST /postprocessor/agents/:agentID

Postprocessor hook. Receives a `ReplyMessage` **after** the dialog agent produces it, before it is sent to the user. Can modify the reply and must return it.

**Path parameter:** `agentID` — ID of the postprocessor agent (e.g. `js_postprocessor`)

**`resolve()` receives:** the `ReplyMessage` object — always `resolve(message)`

```js
// Modify reply text before sending to user
message.message.text = message.message.text.toUpperCase()
resolve(message)
```

**Platform response shape:** same `{isSpam, message}` structure as preprocessor.

---

## POST /preproccessor/push-integration/:customerID/:agentID

Push notification hook. Processes push notification events.

**Path parameters:** `customerID` (project ID), `agentID` (e.g. `js_push`)

**`resolve()` receives:** `boolean` — `true` for success, `false` to return HTTP 500

```js
resolve(true)
```

---

## POST /antivirus-checker/:customerId/:agentId

Antivirus hook. Receives a file as a `Buffer` (byte sequence) and must return a scan result.

**Path parameters:** `customerId` (project ID), `agentId` (e.g. `js_antivirus`)

**`resolve()` receives:** `ResponseAntivirusChecker`

```js
resolve({ "Ok": true })
```

---

## POST /workplace/:customerId/:agentId

General-purpose JSON hook. Receives any JSON, returns any JSON. Used for channel adapters (incoming side) and custom integrations.

**Path parameters:** `customerId` (project ID), `agentId`

**`resolve()` receives:** any JSON

```js
resolve({
    test: "test_value",
    data: { user: "test", status: "ok" }
})

// Channel adapters always resolve with an empty object:
resolve({})
```

### Authorization

`workplace` and `any-data` endpoints support request authorization. Configure via platform UI: **Settings → Project → Agents → JS agent → Authorization settings**.

The setting accepts a JSON string:

```json
{
  "type": "body",
  "value": "my-secret-token",
  "path": "data.auth.token"
}
```

| Field | Values | Description |
|---|---|---|
| `type` | `"body"` \| `"headers"` | Where to look for the auth field |
| `value` | string | The expected secret value |
| `path` | string | Dot-notation path to the field. For headers, use lowercase (Express normalises them). Example: `"data.anyBody.auth.secret"` |

---

## POST /webchatauth/:customerId/:agentId

Webchat authentication hook. Validates or enriches a webchat auth request.

**Path parameters:** `customerId` (project ID), `agentId` (e.g. `js_auth_webchat`)

**`resolve()` receives:** `WebchatAuthRequest` (also referred to as `Visitor`)

```js
resolve({ user: { uuid: "123456-123456-werq-sdfg-1234" } })
```

---

## POST /integration_channel

Channel adapter hook. Used by incoming channel adapters to receive webhook events from external channels and forward them to the platform. `message` contains the raw webhook payload from the external channel.

**`resolve()` receives:** any value — the platform only checks for HTTP 200, not the body

```js
resolve({})
```

See [channel_adapters.md](./channel_adapters.md) for full incoming/outgoing adapter documentation.

---

## POST /any-data/:customerId/:agentId?type=

Typed data hook. Accepts non-JSON formats (e.g. XML). The `type` query parameter specifies the input format. The platform converts the agent's JSON response back to the requested type.

**Path parameters:** `customerId`, `agentId`
**Query parameter:** `type` — format string, e.g. `xml`

Returns HTTP 400 if `type` is unknown or body does not match the declared type.

**`resolve()` receives:** JSON (platform serialises to `type` format)

```js
resolve({
    test: "test_value",
    data: { user: "test", status: "ok" }
})
```

---

## Standard entrypoint pattern

```js
async function run() {
    // ... agent logic ...
    return [agentApi.makeTextReply("Hello")]
}

run()
    .then(res => resolve(res))
    .catch(er => {
        logger.error(`MyAgent: ${er}`)
        resolve([agentApi.makeAckReply()])
    })
```

The `catch` handler must also call `resolve` — an unhandled rejection leaves the platform waiting indefinitely.

**Exception:** preprocessor and postprocessor agents call `resolve(message)` rather than `resolve(ReplyMessage[])`. Channel adapters call `resolve({})`.

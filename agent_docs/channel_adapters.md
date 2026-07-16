# Channel Adapters

A channel adapter integrates an external messaging channel (Telegram, VK, WhatsApp, etc.) with the CraftTalk platform. Each channel requires two JS agents:

| Agent | Endpoint | Role |
|---|---|---|
| `incoming_*` | `POST /workplace/:customerId/:agentId` | Receives webhook from external channel → normalises → POSTs to CraftTalk |
| `outgoing_*` | `POST /integration_channel` | Receives send-message event from CraftTalk → calls external channel API |

Telephony channels may add a third agent (`system_*` or `event_handler`) for call events.

Scripts live in `scripts_channels/<ChannelName>/<TASK-ID>/`.

---

## Incoming Adapter

### What `message` contains

In an incoming adapter, `message` is the **raw webhook payload sent by the external channel** — not a `IncomingMessage`. Each channel has its own payload shape. The adapter is responsible for normalising it.

```js
// Telegram: message is a raw Telegram Update object
const incomingMessage = message.business_message || message.message

// VK: message is a VK Callback API event
const type   = message.type           // "message_new", "confirmation", etc.
const object = message?.object

// Wildberries: message is an array of events
for (const event of message) { ... }
```

### Required agentSettings

```json
{
    "incoming_api": "http://<HOST>/webhooks/integration_channel/<CHANNEL_ID>",
    "authorization_token_incoming": "<INCOMING_TOKEN>"
}
```

These two fields are present in **every** incoming adapter without exception.

### Normalised message body

All incoming adapters transform the raw payload into this universal schema before posting to CraftTalk:

```js
const data = {
    id: `${externalMessageId}`,          // string — unique message ID from channel
    content: {
        text: "user message text",
        attachments: [
            { url: "https://...", name: "file.jpg", type: "IMAGE" }
            // type: "IMAGE" | "FILE" | "VIDEO" | "VOICE"
        ],
        // For button clicks — one of:
        action: "button_payload",         // non-score button click
        score: 3,                         // rating 1–5
        sticker: { sticker_id: "...", sticker_url: "..." }
    },
    message_type: 1,     // 1 = normal message, 4 = read confirm, 15 = score update
    user: {
        id: `${channelUserId}`,           // always stringify
        first_name: "Ivan",
        last_name:  "Petrov",
        username:   "ivan_p",
        phone:      "+79001234567",
        pic:        "https://..."
    },
    timestamp: Date.now(),
    slots: [
        { id: "telegram_chat_id", value: `${chatId}` }
        // channel-specific slots — see Slots section below
    ]
}
```

**Score vs action detection** (consistent across all adapters):

```js
const isScore = action?.includes("__#score__")
const content = isScore
    ? { score: +action.replace("__#score__", "") }
    : { action: action }
const messageType = isScore ? 15 : 1
```

### Posting to CraftTalk

Canonical axios call (used verbatim across all adapters):

```js
const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: INCOMING_API,                          // agentSettings.incoming_api
    headers: {
        'Authorization': AUTHORIZATION_TOKEN_INCOMING,
        'Content-Type': 'application/json'
    },
    data: data                                  // plain object — axios serialises automatically
}

try {
    const response = await axios(config)
    logger.info(`Send status: ${response.status}`)
} catch (error) {
    logger.error(`Error sending to CT: ${error}`)
}
```

Key details:
- `maxBodyLength: Infinity` — prevents axios body size limits for large attachments
- `Authorization` header uses a bare token (no `Bearer` prefix)
- Fire-and-forget — errors are logged, execution continues

### resolve in incoming adapters

```js
run()
    .then(res => resolve(res))   // res = {}
    .catch(er => {
        logger.error(er)
        // many incoming adapters do NOT call resolve in catch — this is common practice
    })
```

The platform does not use the return value of incoming adapters. Always `resolve({})` in the normal path.

**Exceptions requiring a specific return value:**

| Channel | Reason | resolve value |
|---|---|---|
| VK | Callback API server verification | `resolve(confirmationToken)` for `"confirmation"` type, `resolve("ok")` for all others |
| OZON | Health-check ping | `resolve({ version: "1.0", name: "jsagent", time: new Date().toISOString() })` for `TYPE_PING` |
| Mattermost | Button interaction response | `resolve({ ephemeral_text: "...", skip_slack_parsing: false })` |

---

## Outgoing Adapter

### What `message` contains

In an outgoing adapter, `message` is a CraftTalk outgoing event. Key fields:

```js
message.content.text         // Reply text from operator or bot (may contain Markdown)
message.content.attachments  // Array of Attachment objects
message.data.slots           // Array of { id, value } — dialog slots (modern pattern)
message.slots                // Array of { id, value } — dialog slots (older pattern)
message.settings             // Array of { name, value } — per-channel runtime config (Wazzup, RocketChat, Avito)
message.type                 // "send_message" | "start" | other event types
```

### Reading the channel user ID

The outgoing adapter must know the user's ID in the external channel. This was stored as a slot by the incoming adapter when the dialog was created.

**Modern pattern (most channels):**
```js
const getSlotValue = (slotId) =>
    message.data.slots.find(slot => slot.id === slotId)?.value

const chatId = getSlotValue("telegram_chat_id")
```

**Older pattern:**
```js
const chatId = message.slots.find(slot => slot.id === "chat_id_wappi_wa")?.value
```

**Settings pattern (Wazzup, RocketChat, Avito):**
```js
const token   = message.settings.find(s => s.name === "autorization_token")?.value
const webhook = message.settings.find(s => s.name === "incoming_webhook")?.value
```

### Markdown conversion

Outgoing adapters must convert CraftTalk's internal Markdown format to channel-specific format using the built-in converter:

```js
// Declared at top level, before run()
const markdownConverter = agentApi.createConverterMarkdown(
    agentApi.getPredefinedMarkdownRules().Empty    // choose rule set — see table below
)
```

**Rule sets:**

| Rule set | Use for |
|---|---|
| `.Empty` | Telegram, WeChat, Max/TamTam |
| `.Common` | Wappi (WA+TG), OZON, Wildberries, YandexMarket, Avito, CustomTelegram |
| `.WhatsApp` | Wazzup (with optional rule overrides) |
| `.RocketChat` | RocketChat |

Rules can be overridden before passing to `createConverterMarkdown`:
```js
const rules = agentApi.getPredefinedMarkdownRules().WhatsApp
rules.FileUrl = function FileUrl() { return [" ", " "] }
const markdownConverter = agentApi.createConverterMarkdown(rules)
```

**Parsing the text:**
```js
const answers = markdownConverter.Parse(message.content.text)

for (const answer of answers) {
    switch (answer.type) {
        case "TextAnswer":
            // answer.textAnswer — plain text block
            break
        case "ComplexAnswer":
            // answer.textAnswer — text part
            // answer.buttonsAnswer.buttons — inline buttons
            break
        case "ButtonsAnswer":
            // answer.buttonsAnswer.buttons — standalone buttons block
            break
        case "FileAnswer":
            // answer.url — file URL
            // answer.description — filename / caption
            break
        case "StickerAnswer":
            // answer.stickerUrl
            break
        case "WidgetAnswer":
            // rich widget — skip in most channels
            break
    }
}
```

### Handling the "start" event

The `"start"` event is fired when the outgoing adapter is first activated. Use it to **register the incoming webhook URL** with the external channel:

```js
const INCOMING_WEBHOOK = `${agentSettings.host}/workplace/${agentSettings.customerId}/${agentSettings.incomingAgent}`

if (message.type === "start") {
    // Telegram example:
    await axios({
        method: 'get',
        url: `${TELEGRAM_BOT_HOST}/setWebhook`,
        params: { url: INCOMING_WEBHOOK }
    })
    return {}
}
```

The `INCOMING_WEBHOOK` URL pattern is always:
```
http://<HOST>/workplace/<CUSTOMER_ID>/<INCOMING_AGENT_ID>
```

Channels that require manual webhook registration in their own portal (Wappi, Wildberries) have no `"start"` handler.

### resolve in outgoing adapters

```js
run()
    .then(res => resolve(res))   // res = {}
    .catch(er => {
        logger.error(er)
        resolve({})
    })
```

Always `resolve({})` — the platform does not use the return value.

---

## Slots contract: incoming ↔ outgoing

The incoming adapter stores channel-specific data as slots. The outgoing adapter reads those same slots to route the reply back to the correct user.

| Channel | Slots written by incoming | Read by outgoing |
|---|---|---|
| Telegram | `telegram_chat_id`, `telegram_business_connection_id` | `telegram_chat_id` |
| VK | `vk_user_id`, `vk_post_id`, `vk_group_id`, `vk_ski_id` | `vk_user_id` |
| Wazzup | `channel_id_wazzup` | `channel_id_wazzup` |
| Wappi WhatsApp | `chat_id_wappi_wa`, `seller_id_wappi_wa` | both |
| Wappi Telegram | `chat_id_wappi_tg`, `seller_id_wappi_tg` | both |
| OZON | `chat_id_ozon`, `seller_id_ozon`, `store_name_ozon`, `order_id_ozon` | `chat_id_ozon`, `seller_id_ozon` |
| Wildberries | `chat_id_wb`, `market_name_wb` | `chat_id_wb` |
| YandexMarket | `chat_id_ym`, `order_id_ym`, `market_id_ym`, `campaign_id_ym` | `chat_id_ym`, `order_id_ym` |
| Avito | `chat_id`, `user_id` | both |
| Max/TamTam | `maxChatId`, `maxUserId`, `maxUserName` | `maxChatId` |
| Mattermost | `tag_chat_id`, `tag_user_id`, `ADFS_login` | `tag_chat_id` |
| WeChat | `wechatOpenId`, `wechatToUserName` | both |

Always declare slot IDs in `agentSettings.slots` so they are configurable without code changes:

```json
{
    "slots": {
        "telegramChatId": "telegram_chat_id",
        "telegramBusinessConnectionId": "telegram_business_connection_id"
    }
}
```

---

## agentSettings structure

### Required (all adapters)

```json
{
    "incoming_api": "http://<HOST>/webhooks/integration_channel/<CHANNEL_ID>",
    "authorization_token_incoming": "<TOKEN>"
}
```

### Common optional fields

| Field | Type | Purpose |
|---|---|---|
| `slots` | object | Slot ID mapping: `{ logicalName: "platform_slot_id" }` |
| `proxy` | object | `{ host, port, username?, password? }` — for channels requiring proxy |
| `filestorage_url` | string | Base URL for re-hosting file attachments |
| `has_score` | boolean | Whether to handle score button clicks |
| `host` | string | CraftTalk host URL — used to build `INCOMING_WEBHOOK` |
| `customerId` | string | Project ID — used to build `INCOMING_WEBHOOK` |
| `incomingAgent` | string | Incoming agent ID — used to build `INCOMING_WEBHOOK` |

---

## Minimal skeletons

### Incoming adapter

```js
const INCOMING_API   = agentSettings.incoming_api
const AUTH_TOKEN     = agentSettings.authorization_token_incoming
const CHANNEL_SLOT   = agentSettings.slots?.channelUserId || "channel_user_id"

async function run() {
    // 1. Parse raw channel webhook
    const channelUserId = message.user_id              // channel-specific field
    const text          = message.text                 // channel-specific field
    const messageId     = message.message_id           // channel-specific field

    // 2. Build normalised CraftTalk payload
    const data = {
        id: `${messageId}`,
        content: { text },
        message_type: 1,
        user: { id: `${channelUserId}` },
        timestamp: Date.now(),
        slots: [{ id: CHANNEL_SLOT, value: `${channelUserId}` }]
    }

    // 3. Forward to CraftTalk
    await axios({
        method: 'post',
        maxBodyLength: Infinity,
        url: INCOMING_API,
        headers: { 'Authorization': AUTH_TOKEN, 'Content-Type': 'application/json' },
        data
    })

    return {}
}

run()
    .then(res => resolve(res))
    .catch(er => { logger.error(`IncomingAdapter: ${er}`) })
```

### Outgoing adapter

```js
const CHANNEL_API  = agentSettings.channel_api_url
const BOT_TOKEN    = agentSettings.bot_token
const CHANNEL_SLOT = agentSettings.slots?.channelUserId || "channel_user_id"

const markdownConverter = agentApi.createConverterMarkdown(
    agentApi.getPredefinedMarkdownRules().Common
)

async function run() {
    // Register webhook on first activation
    if (message.type === "start") {
        const webhookUrl = `${agentSettings.host}/workplace/${agentSettings.customerId}/${agentSettings.incomingAgent}`
        await axios.post(`${CHANNEL_API}/setWebhook`, { url: webhookUrl })
        return {}
    }

    // Get target user ID from dialog slots
    const getSlot = (id) => message.data.slots.find(s => s.id === id)?.value
    const chatId  = getSlot(CHANNEL_SLOT)
    if (!chatId) {
        logger.error("OutgoingAdapter: chatId slot not found")
        return {}
    }

    // Parse Markdown content
    const answers = markdownConverter.Parse(message.content.text)
    for (const answer of answers) {
        if (answer.type === "TextAnswer" || answer.type === "ComplexAnswer") {
            await axios.post(`${CHANNEL_API}/sendMessage`, {
                chat_id: chatId,
                text: answer.textAnswer,
                parse_mode: "HTML"
            })
        }
        // handle FileAnswer, ButtonsAnswer, etc. as needed
    }

    return {}
}

run()
    .then(res => resolve(res))
    .catch(er => {
        logger.error(`OutgoingAdapter: ${er}`)
        resolve({})
    })
```

# Message Types

The `message.message_type` field indicates the type of event that triggered the agent.

## Incoming messages

| Value | Name | Description |
|---|---|---|
| `0` | Incoming Start | Start message sent by a channel when a dialog opens |
| `1` | Normal Message | Regular user text message — main processing path |
| `9` | Contact Data | Phone number received from the channel |
| `10` | Geolocation | Location data received from the channel |
| `17` | Close Intent | The client intends to close the dialog |
| `20` | Auto-greeting | Auto-greeting triggered |
| `28` | Typing (Client) | Client started typing |
| `29` | Stop Typing (Client) | Client stopped typing |

## Outgoing status

| Value | Name | Description |
|---|---|---|
| `2` | Outgoing: Success | Outgoing message was successfully delivered to the channel |
| `4` | Outgoing: Read | Outgoing message was read in the channel |
| `5` | Outgoing: Error | Outgoing message failed to deliver |

## Operator & dialog state

| Value | Name | Description |
|---|---|---|
| `11` | Backend Ack | Backend confirmed receipt of the incoming message |
| `12` | Read (Operator) | Operator read the incoming message |
| `13` | Typing (Operator) | Operator started typing |
| `14` | Stop Typing (Operator) | Operator stopped typing |
| `15` | CSAT Change | Dialog score was updated |
| `16` | Close Command | Backend command to close the dialog |
| `18` | Operator Joined | Operator connected to the dialog |
| `19` | Dialog Closed | Dialog was finished |
| `21` | Sentiment Change | Client dissatisfaction level changed |
| `22` | Force Update | Client data was force-updated |
| `23` | Hold Notification | Web chat hold notification |
| `24` | Utility Update | Dialog utility (was-there-an-interaction) updated |
| `25` | User Merge | User was merged with another user |
| `26` | Auth Success | User was successfully authenticated |
| `27` | Deauth Success | User was successfully deauthenticated |
| `8` | Parent Deleted | The parent message was deleted in the channel |

## Cobrowsing

| Value | Name | Description |
|---|---|---|
| `100` | Cobrowsing Request | Cobrowsing session requested |
| `101` | Cobrowsing Start | Cobrowsing session started |
| `102` | Cobrowsing Reject | Cobrowsing request rejected |
| `103` | Cobrowsing State | Cobrowsing state changed |
| `104` | Cobrowsing End | Cobrowsing session ended |

## System

| Value | Name | Description |
|---|---|---|
| `200` | System Event | Internal platform event (dialog lifecycle, operator assignment, scoring, etc.). The specific event is identified via `message.slot_context.filled_slots` — see [system_events.md](./system_events.md). |
| `201` | Internal Note | Operator-only message, not visible to the client |

---

## Common gating pattern

```js
async function run() {
    if (message.message_type === 200) {
        // system event — see system_events.md
        return [agentApi.makeAckReply()]
    }

    if (message.message_type !== 1) {
        // skip all non-text messages
        return [agentApi.makeAckReply()]
    }

    // handle normal user message (message_type === 1)
    const text = message.message.text
    return [agentApi.makeTextReply(`You said: ${text}`)]
}
```

# Scheduler Commands

The platform scheduler allows a JS agent to schedule a future action for the current user — either a short pause between messages or a task planned for a future date. Scheduled tasks are scoped to the current `omni_user_id`.

Commands are issued as the `text` of a `ReplyMessage`, the same way routing commands work. Use `makeTextReply` to send them.

---

## `/schedule` — Add a task

```
/schedule name=<task_id> time=<time_ms> <message text or command>
```

**Parameters**

| Parameter | Required | Description |
|---|---|---|
| `name=<task_id>` | No | Name for this task. If a task with the same name already exists for the current `omni_user_id`, the old task is deleted and replaced with the new one. |
| `time=<time_ms>` | Yes | Delay in milliseconds from now. When this time elapses, the platform delivers `<message text or command>` to the current user. The value can be a computed expression (e.g. a calculated timestamp difference). |
| `<message text or command>` | Yes | What to deliver when the timer fires. Can be plain text shown to the user, or a platform command (e.g. `/switch`, `/redirect`). |

**Examples**

```js
// Send a text message to the user after 10 minutes
return [agentApi.makeTextReply("/schedule name=followup time=600000 How can I help you further?")]

// Switch to another agent after a 5-second pause (e.g. between message blocks)
return [agentApi.makeTextReply("/schedule name=pause time=5000 /switch " + agentSettings.next_agent_id)]

// Schedule a reminder for tomorrow (86400000 ms = 24 hours)
return [agentApi.makeTextReply("/schedule name=reminder time=86400000 Don't forget to complete your application.")]
```

**Behaviour**

- If `name` is omitted, the task has no identifier and cannot be deleted by name later.
- If a task with the same `name` already exists for this user, it is replaced.
- The scheduled action runs in the context of the current user (`omni_user_id`), and can start a new dialog if needed.

---

## `/delete_schedule` — Remove a named task

```
/delete_schedule name=<task_id>
```

Removes a previously scheduled task by name. Has no effect if no task with that name exists.

**Example**

```js
// Schedule a task
return [agentApi.makeTextReply("/schedule name=d2 time=600000 Thank you for contacting us.")]

// Later — cancel it before it fires
return [agentApi.makeTextReply("/delete_schedule name=d2")]
```

---

## Usage pattern in JS agents

```js
const FOLLOWUP_DELAY_MS = agentSettings.followup_delay_ms || 86400000

async function run() {
    if (message.message_type !== 1) {
        return [agentApi.makeAckReply()]
    }

    const reply   = agentApi.makeTextReply("Your request has been received. We will follow up tomorrow.")
    const schedule = agentApi.makeTextReply(
        `/schedule name=followup time=${FOLLOWUP_DELAY_MS} Did you get everything you needed?`
    )

    return [reply, schedule]
}

run()
    .then(res => resolve(res))
    .catch(er => {
        logger.error(`MyAgent: ${er}`)
        resolve([agentApi.makeAckReply()])
    })
```

---

## Scheduling via agentApi.sendMessage

`/schedule` commands can also be delivered as the `MessageMarkdown` field of `agentApi.sendMessage()`. This is useful for scheduling tasks for a different user or from an asynchronous context:

```js
await agentApi.sendMessage({
    MessageMarkdown: `/schedule name=reminder time=${delayMs} Your appointment is tomorrow.`,
    SendMessageParams: {
        ProjectId:   message.user.customer_id,
        OmniUserId:  targetOmniUserId,
        Sender:      { operator_id: "bot" }
    }
}, logger)
```

---

**Notes**

- Scheduler commands are text commands, not `agentApi` methods — always wrap in `makeTextReply` or pass as `MessageMarkdown`.
- Keep delay values in `agentSettings` so they can be adjusted per deployment without code changes.
- Use `name` whenever you may need to cancel the task later.

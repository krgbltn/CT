# Agent Settings

Use `agentSettings` to store constant configuration values for a JS agent.

---

# Settings Format

Settings use a simple `key → value` object format.

```json
{
  "url": "https://ya.ru",
  "test_values": [1, 10, 100]
}
```
# Usage in Script
```js
const url = agentSettings.url
const value = agentSettings.test_values[1]
```
# Settings UI Declaration
Use the __declaration__ key.
```json
{
  "__declaration__": [
    {
      "id": "text",
      "type": "string",
      "name": "Greeting Text"
    }
  ],
  "text": "Hello"
}
```
## Declaration Fields
| Field         | Description                  |
| ------------- | ---------------------------- |
| `id`          | Setting key name             |
| `type`        | Value type                   |
| `name`        | Display name                 |
| `description` | Optional tooltip description |
| `options`     | Enum values list             |

Supported Types:
- string
- number
- boolean
- enum
- string[]
- number[]
- object

Enum Example:
```json
{
  "__declaration__": [
    {
      "id": "channelType",
      "type": "enum",
      "name": "Channel Type",
      "options": [
        {
          "id": "webchat",
          "title": "Web Chat"
        },
        {
          "id": "vk",
          "title": "VK"
        }
      ]
    }
  ],
  "channelType": "webchat"
}
```
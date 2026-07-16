# Agent Storage

If a JS agent script is triggered multiple times and there is a need to accumulate or persist information between executions, you can use `agentStorage`.

The storage system follows a standard JavaScript-like `key → value` model.

---

# Storage Types

`agentStorage` includes 4 sub-storages:

| Storage | Scope |
|---|---|
| `dialogStorage` | Available within a single agent and dialog |
| `omniUserStorage` | Available within a single agent and user |
| `agentStorage` | Available within a single agent |
| `globalStorage` | Accessible from any agent at any time |

---

# Storage Methods

The following methods are available for interacting with storage.

---

## set

Saves data by key.

Any type of data can be stored.

### Parameters

- `key` — key used for storing the value. Required.
- `value` — value to store. Required.
- `tags` — metadata tags object associated with the stored data. Optional.

Tags are useful when storing large amounts of categorized data, for example data associated with different users.

### Return Value

- `true` if successful
- `false` if failed

### Example

```js
await agentStorage.dialogStorage.set("test_key", "Test value")
const tags = {
    keyword_fields: [
        { key: "type", value: "test_type" },
        { key: "omni_user_id", value: "111222333" },
        { key: "id", value: 0 }
    ]
}

await agentStorage.globalStorage.set("test_key", data, tags)
```
## get
Retrieves data by key.
Example
```js
const storValue = await agentStorage.dialogStorage.get("test_key")
```
## del
Deletes data by key.
```js
await agentStorage.dialogStorage.del("test_key")
```
## getAll
Returns the entire storage state.
```js
const state = await agentStorage.dialogStorage.getAll()
```
## setAll
Stores multiple values at once.
```js
await agentStorage.dialogStorage.setAll(
    {
        test_key_1: "Value 1",
        test_key_2: 1000,
        test_key_3: [0, 1, 2]
    }
)
```

---

# agentApi.searchAll — Querying Storage

`agentApi.searchAll` provides search across `globalStorage` using an Elasticsearch-like DSL. It is the standard way to retrieve multiple records stored with tags.

```js
const results = await agentApi.searchAll(agentStorage.globalStorage, query, limit?, null)
```

Returns `StorageSearchResult[]`. Each element has:
- `.data` — the value originally passed to `storage.set()`
- `.keyword_fields`, `.text_fields`, `.timestamp_fields`, `.number_fields` — the tags arrays

---

## Query DSL

### Exact match on a keyword field

```js
const query = {
    "keyword_fields.type": {
        "term": { "value": "appointment" }
    }
}
```

### AND — multiple conditions with bool.must

```js
const query = {
    bool: {
        must: [
            { "keyword_fields.type":         { "term":  { "value": "appointment" } } },
            { "keyword_fields.omni_user_id":  { "term":  { "value": message.user.omni_user_id } } }
        ]
    }
}
const results = await agentApi.searchAll(agentStorage.globalStorage, query, 100, null)
```

### Date range on a timestamp field

```js
const query = {
    bool: {
        must: [
            { "timestamp_fields.start_date": { "range": { "value": { lte: Date.now() } } } },
            { "timestamp_fields.end_date":   { "range": { "value": { gte: startOfDay } } } },
            { "keyword_fields.omni_user_id": { "term":  { "value": omni_user_id } } }
        ]
    }
}
```

### Full-text match on a text field

```js
const query = {
    bool: {
        must: [
            { "text_fields.patient_name": { "match": { "value": searchString } } }
        ]
    }
}
```

### OR — bool.should

```js
const query = {
    bool: {
        should: [
            { "text_fields.pid":           { "match": { "value": searchTerm } } },
            { "text_fields.customer_name": { "match": { "value": searchTerm } } }
        ]
    }
}
```

### Numeric range

```js
const query = {
    bool: {
        must: [
            { "number_fields.priority": { "range": { "value": { gte: 1, lte: 3 } } } }
        ]
    }
}
```

---

## Field namespaces

| Namespace | Operator | Value type | Purpose |
|---|---|---|---|
| `keyword_fields.<name>` | `term` | string (exact) | Categorical tags: `type`, `omni_user_id`, `id`, etc. |
| `text_fields.<name>` | `match` | string (full-text) | Free-text search fields |
| `timestamp_fields.<name>` | `range` (`lte`, `gte`) | number (epoch ms) | Date/time ranges |
| `number_fields.<name>` | `range` (`gte`, `lte`) | number | Numeric filters |

---

## Storing data with searchable tags

To make data searchable via `searchAll`, pass tags when calling `set`:

```js
await agentStorage.globalStorage.set(`appointment:${id}`, appointmentData, {
    keyword_fields: [
        { key: "type",        value: "appointment" },
        { key: "omni_user_id", value: message.user.omni_user_id }
    ],
    timestamp_fields: [
        { key: "start_date", value: appointmentData.startTime }
    ],
    text_fields: [
        { key: "patient_name", value: appointmentData.patientName }
    ]
})
```

## Consuming results

```js
const results = await agentApi.searchAll(agentStorage.globalStorage, query, 1000, null)

for (const record of results) {
    const item = record.data                    // original stored object
    const type = record.keyword_fields.find(f => f.key === "type")?.value
}
```

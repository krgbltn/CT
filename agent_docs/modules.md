# JS Agent Modules

A JS agent script is limited to **32 766 bytes** (database field size). For complex agents that exceed this limit, the platform supports splitting the code across multiple JS agents acting as **modules**.

Available since: platform release `2025.February`, JS agent version `jsagent.2024.December.1-Stable`.

---

## How it works

The platform concatenates the code of all declared modules with the main agent's code at execution time, in the order they are listed:

```
module_1 code + module_2 code + ... + module_N code + main_agent code
```

The resulting combined script is executed as a single unit. Variables, functions, and constants declared in earlier modules are available in later modules and in the main agent.

---

## Setup

**Step 1 — Create module agents**

Create separate JS agents for each code chunk. In platform UI:
**Settings → Project → Agents → JS agent → enable "Является ли данный script модулем"** (Is this script a module)

Module agents cannot be invoked directly — calling one returns the error `Can not be execute, cause is the module`.

**Step 2 — Register modules in the main agent**

In the main agent's settings:
**Settings → Project → Agents → JS agent → "Подключаемые js-script модули"** (Attached JS script modules)

Enter module IDs as a comma-separated list, **no spaces**:
```
js_part_1,js_part_2,js_part_3
```

---

## Example

A monolithic agent `js_full`:

```js
const FIRSTNAME = "js_firstname"
const LASTNAME  = "js_lastname"
const MIDDLENAME = "js_middlename"

async function run() {
    const slotsToFill = {
        sys_firstname:  FIRSTNAME,
        sys_lastname:   LASTNAME,
        sys_middlename: MIDDLENAME,
    }
    return [agentApi.makeTextReply(`/switch routingagent`, undefined, undefined, slotsToFill)]
}

logger.info("TEST MESSAGE")
run()
    .then(res => resolve(res))
    .catch(er => logger.error(JSON.stringify(er)))
```

Split into modules:

**`js_part_1`** (marked as module):
```js
const FIRSTNAME  = "js_firstname"
const LASTNAME   = "js_lastname"
const MIDDLENAME = "js_middlename"
```

**`js_part_2`** (marked as module):
```js
async function run() {
    const slotsToFill = {
        sys_firstname:  FIRSTNAME,
        sys_lastname:   LASTNAME,
        sys_middlename: MIDDLENAME,
    }
    return [agentApi.makeTextReply(`/switch routingagent`, undefined, undefined, slotsToFill)]
}
```

**`js_part_3`** (marked as module):
```js
logger.info("TEST MESSAGE")
```

**`js_complex`** (main agent, modules: `js_part_1,js_part_2,js_part_3`):
```js
run()
    .then(res => resolve(res))
    .catch(er => logger.error(JSON.stringify(er)))
```

At runtime, the platform builds: `js_part_1 + js_part_2 + js_part_3 + js_complex`, which is equivalent to `js_full`.

---

## Rules and constraints

| Rule | Detail |
|---|---|
| Max modules per agent | 10 |
| Module cannot be empty | A module agent must contain at least one character of code |
| Execution order | Modules concatenated in the order listed, main agent code appended last |
| Self-reference ignored | If the main agent lists itself as a module, it is ignored — no duplication |
| Modules are not standalone | Cannot be invoked directly; returns `Can not be execute, cause is the module` |
| Module count limit excludes self | If the main agent is included in its own module list, it does not count toward the limit of 10 |

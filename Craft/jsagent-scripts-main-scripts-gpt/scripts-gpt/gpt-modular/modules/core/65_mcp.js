// @module core/mcp
// @requires modules/core/globals.js   (translit)
// Превращает MCP-серверы из agentSettings.mcp_servers в стандартные тулзы.
// TOOLS и availableFunctions объявляются клиентским скриптом ниже по цепочке
// конкатенации; здесь только мутируем их.

// Конфиг MCP-серверов: [{ alias, transport: "http"|"sse", url, headers?,
// enabled?, tool_filter? }]
let MCP_SERVERS = agentSettings.mcp_servers ?? []

// Имя тулзы: <alias>__<tool>. Префикс alias — конвенция, не гарантия;
// уникальность проверяется в registerMcpTools().
const _mcpToolName = (alias, name) => `${translit(String(alias))}__${translit(String(name))}`

// MCP inputSchema — это JSON Schema, кладём её напрямую в parameters.
const _mcpToOpenAITool = (toolName, mcpTool) => ({
    type: "function",
    function: {
        name: toolName,
        description: mcpTool.description ?? "",
        parameters: mcpTool.inputSchema ?? { type: "object", properties: {} },
    },
})

// Сплющивает сырой результат MCP { content: [...], isError } в строку для LLM.
const _mcpResultToString = (res) => {
    const content = res?.content
    let text
    if (Array.isArray(content)) {
        text = content
            .map(p => (p && p.type === "text" && typeof p.text === "string") ? p.text : JSON.stringify(p))
            .join("\n")
    } else if (typeof content === "string") {
        text = content
    } else {
        text = JSON.stringify(res ?? "")
    }
    return res?.isError ? `ERROR: ${text}` : text
}

// Обычная (несценарная) async-тулза: вызывает MCP-инструмент и возвращает строку.
// Маршрутизация (на какой сервер/инструмент) зашита в замыкании.
const _makeMcpToolFn = (server, originalName) => async (args) => {
    try {
        const res = await mcp.callTool(server, originalName, args)
        return _mcpResultToString(res)
    } catch (e) {
        logger.error(`MCP tool ${originalName} failed: ${e}`)
        return `ERROR: не удалось выполнить инструмент ${originalName}: ${e}`
    }
}

// Регистрирует тулзы всех включённых MCP-серверов в TOOLS и availableFunctions.
// Недоступный сервер пропускается; конфликт имён — бросает ошибку.
async function registerMcpTools() {
    if (typeof mcp === "undefined" || !mcp) {
        logger.warn("MCP helper `mcp` недоступен в песочнице — пропускаю MCP-тулзы")
        return
    }
    // Занятые имена — ключи availableFunctions, чтобы не перетереть штатную тулзу.
    const usedNames = new Set(
        availableFunctions && typeof availableFunctions === "object"
            ? Object.keys(availableFunctions)
            : []
    )
    for (const server of MCP_SERVERS) {
        if (!server || server.enabled === false) continue
        const alias = server.alias || "mcp"
        if (!server.alias) logger.warn(`MCP-сервер без alias — использую "mcp": ${server.url}`)
        if (!server.url) {
            logger.warn(`MCP server "${alias}" без url — пропускаю`)
            continue
        }
        // Сетевые ошибки listTools — пропускаем сервер.
        let tools
        try {
            tools = await mcp.listTools(server)
        } catch (e) {
            logger.error(`Не удалось получить инструменты MCP server "${alias}" (${server.url}): ${e}`)
            continue
        }
        const filter = Array.isArray(server.tool_filter) && server.tool_filter.length
            ? new Set(server.tool_filter)
            : null
        const registered = []
        for (const t of tools) {
            if (!t || !t.name) continue
            if (filter && !filter.has(t.name)) continue
            const toolName = _mcpToolName(alias, t.name)
            if (usedNames.has(toolName)) {
                throw new Error(
                    `MCP: конфликт имён тулз — "${toolName}" (сервер "${alias}", инструмент "${t.name}") ` +
                    `уже занят. Проверьте уникальность alias серверов и имён инструментов ` +
                    `(в т.ч. после translit: дефисы/точки вырезаются, пробелы → "_").`
                )
            }
            usedNames.add(toolName)
            TOOLS.push(_mcpToOpenAITool(toolName, t))
            availableFunctions[toolName] = _makeMcpToolFn(server, t.name)
            registered.push(toolName)
        }
        logger.info(`MCP "${alias}" (${server.url}): зарегистрировано тулз ${registered.length} [${registered.join(", ")}]`)
    }
}

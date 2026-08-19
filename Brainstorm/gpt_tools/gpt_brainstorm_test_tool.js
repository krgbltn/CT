// @requires modules/models/qwen.js
// @requires gpt_core.js

// Минимальный тестовый агент для проверки tool calling на craftgpt.
// Без кастомной логики — только стандартный _mainBody с одним tool.

let LLM_SYSTEM_TEMPLATE = `Ты — тестовый ассистент. Отвечай кратко.`
LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE
let SMALLTALK_TEMPLATE = `{question}`

let RAG_TEMPLATE = `{question}

# Найденная информация:

{context}`

const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`
const RAG_JOIN_SEP = "\n\n...\n\n"


applyPromptOverrides()
applyModelConfig()


const transfer_to_operator = scenario(null)(function () {
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})

const availableFunctions = {
    transfer_to_operator,
}

let TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "transfer_to_operator",
            "description": "Переводит диалог на живого оператора. Вызывай когда пользователь просит оператора.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


async function _main(replies) {
    return _mainBody(replies, {
        use_rag: true,
        use_rephrase: false,
        use_smalltalk: true,
    })
}


runEntrypoint()

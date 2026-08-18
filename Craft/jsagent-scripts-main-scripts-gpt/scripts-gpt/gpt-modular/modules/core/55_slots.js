// @module core/slots
// Управление слотами: конфиг, чтение, инъекция в промпты, хранение для ответа

class SlotManager {
    /**
     * @param {object} settings - agentSettings из платформы
     * @param {object} message - объект входящего сообщения с slot_context
     */
    constructor(settings, message) {
        const cfg = settings.slots ?? {}
        this.agentSlots = cfg.agent_slots ?? {SCENARIO_RESULT: "scenario_result"}
        this.useSlots = cfg.use_slots ?? false
        this.placeholder = cfg.user_slots_placeholder ?? "## Слоты:"
        this.userSlots = cfg.user_slots ?? []
        this.replySlots = {}
        this._message = message
    }

    /**
     * Возвращает значение слота из входящего сообщения по его id.
     * @param {string} slotId
     * @returns {string|undefined}
     */
    getSlotValue(slotId) {
        return this._message.slot_context.filled_slots
            .find(slot => slot.slot_id === slotId)?.value
    }

    /**
     * Преобразует массив определений слотов в структурированный список
     * с текущими значениями из входящего сообщения.
     * Если значение содержит ";", берётся последний элемент.
     * @param {Array<{id: string, description: string}>} slots
     * @returns {Array<{slotId: string, slotDescription: string, slotValue: string|null}>}
     */
    getSlots(slots) {
        if (!slots || !Array.isArray(slots)) return []
        const filledSlots = this._message.slot_context.filled_slots
        return slots.map(slot => {
            const filledSlot = filledSlots.find(f => f.slot_id === slot.id)
            let slotValue = null
            if (filledSlot?.value) {
                const values = filledSlot.value.split(';')
                slotValue = values.length > 0 ? values[values.length - 1] : null
            }
            return { slotId: slot.id, slotDescription: slot.description, slotValue }
        })
    }

    /**
     * Устанавливает значение слота в исходящем ответе.
     * Для удаления слота передайте value = null.
     * @param {string} slotId
     * @param {string|null} value
     */
    setSlot(slotId, value) {
        this.replySlots[slotId] = value
    }

    /**
     * Объединяет переданные слоты с уже накопленными в replySlots.
     * @param {object|undefined} slots - объект {slotId: value}
     */
    mergeSlots(slots) {
        if (slots) Object.assign(this.replySlots, slots)
    }

    /**
     * Подставляет текущие значения пользовательских слотов в шаблон промпта.
     * Если useSlots=false, возвращает шаблон без изменений.
     * @param {string} template - шаблон промпта с placeholder (напр. "## Слоты:")
     * @returns {string}
     */
    injectSlotsIntoPrompt(template) {
        if (!this.useSlots) return template
        const userSlots = this.getSlots(this.userSlots)
        const slotsBlock = userSlots.length > 0
            ? userSlots.map(s =>
                `- ${s.slotId}. - ${s.slotDescription}: **${s.slotValue ?? 'не заполнено'}**`
              ).join('\n')
            : '- Нет заполненных слотов'
        return template.replace(
            this.placeholder,
            `${this.placeholder}\n${slotsBlock}`
        )
    }
}

let slotManager = new SlotManager(agentSettings, message)

// Обратная совместимость — глобальные алиасы
let AGENT_SLOTS = slotManager.agentSlots
let USE_SLOTS = slotManager.useSlots

// Обратная совместимость — свободные функции-обёртки
function getSlotValue(slotId) {
    return slotManager.getSlotValue(slotId)
}

function getSlots(slots) {
    return slotManager.getSlots(slots)
}

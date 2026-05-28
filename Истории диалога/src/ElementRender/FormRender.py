class FormRender:
    """Рендер блоков с формой и условиями, с детализированными условиями"""

    def render(self, block: dict) -> str:
        block_id = block.get("Id", "")
        block_type = block.get("Type", "")
        block_data = block.get("BlockData", {})

        output = [f"--- {block_id} [{block_type}] ---"]

        # Рендер слотов
        form_data = block_data.get("Form", {})
        slots = form_data.get("FormSlots", {}).get("Slots", [])
        if slots:
            output.append("Form block with slots:")
            for slot in slots:
                mandatory = "mandatory" if str(slot.get("IsMandatory")).lower() == "true" else "optional"
                output.append(f" - {slot.get('SlotId', '')} ({mandatory})")

        # Рендер условий перехода
        output_conditions = form_data.get("OutputConditions", {}).get("Conditions", [])
        if output_conditions:
            output.append("Output conditions:")
            for cond in output_conditions:
                cond_id = cond.get("Id", "")
                rules = cond.get("And", [])
                rule_desc = []
                for r in rules:
                    slot_name = r.get("Slot", "")
                    condition = r.get("Condition", "")
                    value = r.get("Value")
                    desc = ""
                    if condition == "__FILLED__":
                        desc = f"{slot_name} is filled"
                    elif condition == "ATTEMPTS" and value:
                        desc = f"{slot_name} attempts {value}"
                    elif value is not None:
                        desc = f"{slot_name} = {value}"
                    else:
                        desc = slot_name
                    rule_desc.append(desc)
                output.append(f" - Условие перехода на {cond_id}: {' AND '.join(rule_desc)}")

        return "\n".join(output)

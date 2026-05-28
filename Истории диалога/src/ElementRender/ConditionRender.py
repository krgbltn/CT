class ConditionRender:

    def render(self, block: dict) -> str:
        """
        Рендер блока Condition в читаемый вид.
        """
        block_id = block.get("Id", "")
        block_type = block.get("Type", "")

        block_data = block.get("BlockData", {})
        condition_data = block_data.get("Condition", {})
        conditions = condition_data.get("Conditions", [])

        outputs = block.get("Outputs", [])
        output_map = {o.get("Id"): o.get("To") for o in outputs}

        result = []

        result.append(f"--- {block_id} [{block_type}] ---")

        for cond in conditions:
            cond_id = cond.get("Id")
            rules = cond.get("And", [])

            target = output_map.get(cond_id, "UNKNOWN")

            if not rules:
                result.append("ELSE")
                result.append(f"    → {target}")
                continue

            parts = []

            for rule in rules:
                slot = rule.get("Slot")
                value = rule.get("Value")

                if slot == "__ARBITRARY_EXPRESSION__":
                    parts.append(value)

                elif slot == "__ALL_MANDATORY_FILLED_IN__":
                    parts.append("All mandatory slots filled")

                else:
                    parts.append(f"{slot} == '{value}'")

            condition_string = " AND ".join(parts)

            result.append(f"IF {condition_string}")
            result.append(f"    → {target}")

        return "\n".join(result)
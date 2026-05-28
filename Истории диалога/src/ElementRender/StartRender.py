class StartRender:
    """
    Простой рендер блока Start:
    показывает тип, id и направление перехода
    """

    def render(self, block: dict) -> str:
        if not isinstance(block, dict):
            return "Invalid block format"

        block_id = block.get("Id", "")
        block_type = block.get("Type", "")

        output = []
        output.append(f"{block_type} [{block_id}]")

        outputs = block.get("Outputs", [])

        if outputs:
            for out in outputs:
                to_block = out.get("To", "")
                output.append(f"  → {to_block}")
        else:
            output.append("  → (no connections)")

        return "\n".join(output)
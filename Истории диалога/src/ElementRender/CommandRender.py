class CommandRender:
    def render(self, block):
        block_id = block.get("Id", "")
        block_type = block.get("Type", "")
        
        output = []
        
        # Заголовок блока
        output.append(f"--- {block_id} [{block_type}] ---")
        
        # Текст команды
        command_text = block.get("BlockData", {}).get("Command", {}).get("Text", "")
        if command_text:
            output.append(f"Command: {command_text}")
        
        # Вывод подключений (Outputs)
        for out in block.get("Outputs", []):
            to = out.get("To", "")
            output.append(f"Output -> {to}")
        
        return "\n".join(output) + "\n"
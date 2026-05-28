class MessageRender:
    """Рендер для сообщений с текстом и кнопками"""
    
    def render(self, block: dict) -> str:
        """
        Рендер сообщения с текстом и кнопками
        """
        block_id = block.get("Id", "")
        block_type = block.get("Type", "")
        
        message_data = block.get("BlockData", {}).get("Message", {})
        text = message_data.get("Text", "")
        buttons = message_data.get("Buttons", [])
        
        output = []
        
        # Заголовок блока
        output.append(f"--- {block_id} [{block_type}] ---")
        
        # Текст сообщения
        if text:
            output.append(text.strip())
        
        # Кнопки
        for btn in buttons:
            btn_title = btn.get("Title", "")
            btn_payload = btn.get("Payload", "")
            output.append(f"[BUTTON] {btn_title} → {btn_payload}")
        
        return "\n".join(output)
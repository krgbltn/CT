class ArticleRender:
    """Рендер для сообщений со статьями"""

    def __init__(self):
        pass

    def render(self, article_content: dict) -> str:
        """
        Рендер статьи с точной передачей текста и условий

        Args:
            article_content: JSON статьи с ключом "Article"

        Returns:
            Строка с полным выводом текста и условий срабатывания
        """

        article = article_content.get("Article", {})
        if not article:
            return ""

        title = article.get("Title", "unknown")
        symbol_code = article.get("SymbolCode", "")
        article_id = article.get("Id", "")

        output = []
        output.append(f"\n========== ARTICLE ==========")
        output.append(f"Title: {title}")
        output.append(f"SymbolCode: {symbol_code}")
        output.append(f"Id: {article_id}")
        output.append("")

        # --- Рендер всех Answers ---
        answers = article.get("Answers", [])
        for answer in answers:
            answer_id = answer.get("Id")
            text = answer.get("Text", "")
            slots = answer.get("Slots", [])

            output.append(f"[Answer Id: {answer_id}]")
            output.append("Cообщение:")
            output.append(text)

            output.append("Условие:")
            if slots:
                for slot in slots:
                    slot_id = slot.get("SlotId")
                    values = slot.get("Values", [])
                    output.append(f"  - {slot_id} == {values}")
            else:
                output.append("  - None")

            output.append("")  # пустая строка между ответами

        return "\n".join(output)

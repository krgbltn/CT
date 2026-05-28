import unittest
from src.ElementRender.MessageRender import MessageRender

class TestMessageRender(unittest.TestCase):

    def setUp(self):
        self.renderer = MessageRender()
        self.valid_block = {
                    "Id": "block_fe6c68",
                    "Type": "Message",
                    "Position": {
                        "Left": 849,
                        "Top": 404
                    },
                    "Inputs": [
                        {
                            "From": "block_36d3f1d",
                            "FromOutput": {
                                "Id": "condition_c932a9",
                                "Type": "Article"
                            }
                        },
                        {
                            "From": "block_4a11091",
                            "FromOutput": {
                                "Id": "block_4a11091",
                                "Type": "Article"
                            }
                        },
                        {
                            "From": "block_36d3f1d",
                            "FromOutput": {
                                "Id": "condition_23d132f",
                                "Type": "Article"
                            }
                        },
                        {
                            "From": "block_36d3f1d",
                            "FromOutput": {
                                "Id": "condition_1bdf005",
                                "Type": "Article"
                            }
                        },
                        {
                            "From": "block_36d3f1d",
                            "FromOutput": {
                                "Id": "condition_50a49b8",
                                "Type": "Article"
                            }
                        },
                        {
                            "From": "block_36d3f1d",
                            "FromOutput": {
                                "Id": "condition_312bf84",
                                "Type": "Article"
                            }
                        }
                    ],
                    "Outputs": [
                        {
                            "Id": "block_fe6c68_btn_dd3130",
                            "Type": "Article",
                            "To": "block_c2b56f"
                        },
                        {
                            "Id": "block_fe6c68_btn_2fe879c",
                            "Type": "Article",
                            "To": "block_fb56ad"
                        },
                        {
                            "Id": "block_fe6c68_btn_46062cb",
                            "Type": "Article",
                            "To": "block_9009c3"
                        }
                    ],
                    "BlockData": {
                        "Message": {
                            "Text": "Вас приветствует виртуальный помощник Почты России.\n\nЧаще всего меня спрашивают про отслеживание и переадресацию отправлений.\nВыберите, пожалуйста, что Вас интересует?\n\nВыберите интересующий раздел, нажав на кнопку, или задайте вопрос в чате.",
                            "Buttons": [
                                {
                                    "Id": "block_fe6c68_btn_dd3130",
                                    "Title": "Отследить",
                                    "Type": "Article",
                                    "Payload": "block_c2b56f"
                                },
                                {
                                    "Id": "block_fe6c68_btn_2fe879c",
                                    "Title": "Продлить срок хранения",
                                    "Type": "Article",
                                    "Payload": "block_fb56ad"
                                },
                                {
                                    "Id": "block_fe6c68_btn_46062cb",
                                    "Title": "Отправка и получение по QR",
                                    "Type": "Article",
                                    "Payload": "block_9009c3"
                                }
                            ]
                        }
                    }
    }

    # Возвращается строка
    def test_render_returns_string(self):
        result = self.renderer.render(self.valid_block)
        self.assertIsInstance(result, str)

    # Проверка заголовка
    def test_render_contains_header(self):
        result = self.renderer.render(self.valid_block)
        self.assertTrue(result.startswith("--- block_fe6c68 [Message] ---"))

    # Проверка текста
    def test_render_contains_text(self):
        result = self.renderer.render(self.valid_block)
        self.assertIn(
            "Вас приветствует виртуальный помощник Почты России.",
            result
        )

    # Проверка количества кнопок
    def test_render_buttons_count(self):
        result = self.renderer.render(self.valid_block)
        buttons = [line for line in result.split("\n") if line.startswith("[BUTTON]")]
        self.assertEqual(len(buttons), 3)

    # Проверка конкретных кнопок
    def test_render_buttons_content(self):
        result = self.renderer.render(self.valid_block)
        self.assertIn("[BUTTON] Отследить → block_c2b56f", result)
        self.assertIn("[BUTTON] Продлить срок хранения → block_fb56ad", result)
        self.assertIn("[BUTTON] Отправка и получение по QR → block_9009c3", result)

    # Без кнопок
    def test_render_without_buttons(self):
        block = self.valid_block.copy()
        block["BlockData"]["Message"]["Buttons"] = []

        result = self.renderer.render(block)
        self.assertNotIn("[BUTTON]", result)

    # Без текста
    def test_render_without_text(self):
        block = self.valid_block.copy()
        block["BlockData"]["Message"]["Text"] = ""

        result = self.renderer.render(block)

        self.assertTrue(result.startswith("--- block_fe6c68 [Message] ---"))
        self.assertIn("[BUTTON]", result)

    # Без BlockData
    def test_render_without_blockdata(self):
        block = self.valid_block.copy()
        block["BlockData"] = {}

        result = self.renderer.render(block)
        self.assertEqual(result, "--- block_fe6c68 [Message] ---")

    # Без Id
    def test_render_without_id(self):
        block = self.valid_block.copy()
        block.pop("Id")

        result = self.renderer.render(block)
        self.assertTrue(result.startswith("---  [Message] ---"))


    # Итоговый тест на полное совпадение
    def test_render_full_output_exact_match(self):
        result = self.renderer.render(self.valid_block)

        expected = (
            "--- block_fe6c68 [Message] ---\n"
            "Вас приветствует виртуальный помощник Почты России.\n\n"
            "Чаще всего меня спрашивают про отслеживание и переадресацию отправлений.\n"
            "Выберите, пожалуйста, что Вас интересует?\n\n"
            "Выберите интересующий раздел, нажав на кнопку, или задайте вопрос в чате.\n"
            "[BUTTON] Отследить → block_c2b56f\n"
            "[BUTTON] Продлить срок хранения → block_fb56ad\n"
            "[BUTTON] Отправка и получение по QR → block_9009c3"
        )

        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
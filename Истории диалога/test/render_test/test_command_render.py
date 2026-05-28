import unittest
from src.ElementRender.CommandRender import CommandRender

class TestCommandRender(unittest.TestCase):

    def setUp(self):
        self.renderer = CommandRender()
        self.block = {
            "Id": "block_392f87a",
            "Type": "Command",
            "Position": {
                "Left": 1344.0,
                "Top": -536
            },
            "Inputs": [],
            "Outputs": [
                {
                    "Id": "block_392f87a",
                    "Type": "Article",
                    "To": "block_ac9b51"
                }
            ],
            "BlockData": {
                "Command": {
                    "Text": "SET_SLOT_VALUE_WITH_EXPRESSION_rupost_track_input {{rupost_number_for_classif}}"
                }
            }
        }

    def test_render_returns_string(self):
        result = self.renderer.render(self.block)
        self.assertIsInstance(result, str)

    def test_render_contains_block_id_and_type(self):
        result = self.renderer.render(self.block)
        self.assertIn("block_392f87a", result)
        self.assertIn("Command", result)

    def test_render_contains_command_text(self):
        result = self.renderer.render(self.block)
        self.assertIn(
            "SET_SLOT_VALUE_WITH_EXPRESSION_rupost_track_input {{rupost_number_for_classif}}",
            result
        )

    def test_render_contains_outputs(self):
        result = self.renderer.render(self.block)
        self.assertIn("Output -> block_ac9b51", result)


if __name__ == "__main__":
    unittest.main()
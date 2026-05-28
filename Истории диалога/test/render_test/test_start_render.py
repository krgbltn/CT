import unittest
from src.ElementRender.StartRender import StartRender

class TestStartRender(unittest.TestCase):
    def test_start_render_simple(self):
        block = {
            "Id": "block_254bb2e",
            "Type": "Start",
            "Position": {"Left": 0, "Top": 0},
            "Inputs": [],
            "Outputs": [
                {"Id": "block_254bb2e", "Type": "Article", "To": "block_cb75b2"}
            ]
        }

        renderer = StartRender()
        result = renderer.render(block)
        expected = "Start [block_254bb2e]\n  → block_cb75b2"

        self.assertEqual(result, expected)

if __name__ == "__main__":
    unittest.main()
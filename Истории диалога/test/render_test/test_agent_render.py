import unittest
from src.ElementRender.AgentRender import AgentRender

class TestAgentRender(unittest.TestCase):

    def setUp(self):
        self.block = {
            "Id": "block_57bd9f9",
            "Type": "Agent",
            "Position": {"Left": 147, "Top": 276},
            "Inputs": [
                {"From": "block_77c4da", "FromOutput": {"Id": "block_77c4da", "Type": "Article"}}
            ],
            "Outputs": [],
            "BlockData": {
                "Agent": {
                    "AgentId": "track_data_js",
                    "AgentType": "jsagent",
                    "OwnedByThisScenario": "false"
                }
            }
        }
        self.renderer = AgentRender()
        self.output = self.renderer.render(self.block)

    def test_render_returns_string(self):
        self.assertIsInstance(self.output, str)

    def test_render_contains_block_id_and_type(self):
        self.assertIn("--- block_57bd9f9 [Agent] ---", self.output)

    def test_render_contains_agent_info(self):
        self.assertIn("Agent block: track_data_js (jsagent)", self.output)

    def test_render_has_no_outputs(self):
        # Поскольку Outputs пуст, строка не должна содержать "Output ->"
        self.assertNotIn("Output ->", self.output)


if __name__ == "__main__":
    unittest.main()

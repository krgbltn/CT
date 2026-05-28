import unittest
from src.ElementRender.FormRender import FormRender

class TestFormRender(unittest.TestCase):

    def setUp(self):
        self.renderer = FormRender()
        self.block = {
                    "Id": "block_2ad8cde",
                    "Type": "Form",
                    "Position": {
                        "Left": 189,
                        "Top": 38
                    },
                    "Inputs": [
                        {
                            "From": "block_23236c5",
                            "FromOutput": {
                                "Id": "block_23236c5",
                                "Type": "Article"
                            }
                        }
                    ],
                    "Outputs": [
                        {
                            "Id": "condition_2a0c7a",
                            "Type": "Article",
                            "To": "block_af5587"
                        },
                        {
                            "Id": "condition_5d4c9de",
                            "Type": "Article",
                            "To": "block_174c396"
                        },
                        {
                            "Id": "condition_18c61fe",
                            "Type": "Article",
                            "To": "block_10b1229"
                        },
                        {
                            "Id": "condition_2a319a1",
                            "Type": "Article",
                            "To": "block_149d083"
                        },
                        {
                            "Id": "condition_5c85361",
                            "Type": "Article",
                            "To": "block_19f2577"
                        },
                        {
                            "Id": "condition_2ca26ae",
                            "Type": "Article",
                            "To": "block_14065c7"
                        },
                        {
                            "Id": "condition_549fda1",
                            "Type": "Article",
                            "To": "block_25d6e4c"
                        },
                        {
                            "Id": "condition_b453c7",
                            "Type": "Article",
                            "To": "block_21671b2"
                        },
                        {
                            "Id": "condition_4a076e8",
                            "Type": "Article",
                            "To": "block_5ea89b4"
                        }
                    ],
                    "BlockData": {
                        "Form": {
                            "FormSlots": {
                                "Slots": [
                                    {
                                        "SlotId": "rupost_track_input",
                                        "IsMandatory": "true"
                                    },
                                    {
                                        "SlotId": "rupost_track_2",
                                        "IsMandatory": "true"
                                    },
                                    {
                                        "SlotId": "rupost_track_input_back",
                                        "IsMandatory": "false"
                                    },
                                    {
                                        "SlotId": "how_finding_track_regex",
                                        "IsMandatory": "false"
                                    }
                                ]
                            },
                            "OutputConditions": {
                                "Conditions": [
                                    {
                                        "Id": "condition_18c61fe",
                                        "And": [
                                            {
                                                "Slot": "rupost_track_input_back",
                                                "Condition": "__FILLED__"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_4a076e8",
                                        "And": [
                                            {
                                                "Slot": "how_finding_track_regex",
                                                "Condition": "__FILLED__"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_2a0c7a",
                                        "And": [
                                            {
                                                "Slot": "rupost_track_input",
                                                "Condition": "ATTEMPTS",
                                                "Value": "\u003E= 1"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_5d4c9de",
                                        "And": [
                                            {
                                                "Slot": "rupost_track_input",
                                                "Condition": "__FILLED__"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_549fda1",
                                        "And": [
                                            {
                                                "Slot": "rupost_track_2",
                                                "Condition": "__FILLED__"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_2a319a1",
                                        "And": [
                                            {
                                                "Slot": "rupost_track_input",
                                                "Condition": "ATTEMPTS",
                                                "Value": "\u003E= 1"
                                            },
                                            {
                                                "Slot": "flagTracking",
                                                "Value": "1"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_5c85361",
                                        "And": [
                                            {
                                                "Slot": "rupost_track_input",
                                                "Condition": "__FILLED__"
                                            },
                                            {
                                                "Slot": "flagTracking",
                                                "Value": "1"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_2ca26ae",
                                        "And": [
                                            {
                                                "Slot": "rupost_track_input_back",
                                                "Condition": "__FILLED__"
                                            },
                                            {
                                                "Slot": "flagTracking",
                                                "Value": "1"
                                            }
                                        ]
                                    },
                                    {
                                        "Id": "condition_b453c7",
                                        "And": [
                                            {
                                                "Slot": "flagTracking",
                                                "Value": "2"
                                            },
                                            {
                                                "Slot": "channel_id",
                                                "Condition": "__FILLED__"
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }

    def test_slots_rendering(self):
        output = self.renderer.render(self.block)
        self.assertIn("rupost_track_input (mandatory)", output)
        self.assertIn("rupost_track_2 (mandatory)", output)
        self.assertIn("rupost_track_input_back (optional)", output)
        self.assertIn("how_finding_track_regex (optional)", output)

    def test_conditions_rendering(self):
        output = self.renderer.render(self.block)
        self.assertIn("Условие перехода на condition_18c61fe: rupost_track_input_back is filled", output)
        self.assertIn("Условие перехода на condition_4a076e8: how_finding_track_regex is filled", output)
        self.assertIn("Условие перехода на condition_2a0c7a: rupost_track_input attempts >= 1", output)

    def test_full_output(self):
        expected_output = """--- block_2ad8cde [Form] ---
Form block with slots:
 - rupost_track_input (mandatory)
 - rupost_track_2 (mandatory)
 - rupost_track_input_back (optional)
 - how_finding_track_regex (optional)
Output conditions:
 - Условие перехода на condition_18c61fe: rupost_track_input_back is filled
 - Условие перехода на condition_4a076e8: how_finding_track_regex is filled
 - Условие перехода на condition_2a0c7a: rupost_track_input attempts >= 1
 - Условие перехода на condition_5d4c9de: rupost_track_input is filled
 - Условие перехода на condition_549fda1: rupost_track_2 is filled
 - Условие перехода на condition_2a319a1: rupost_track_input attempts >= 1 AND flagTracking = 1
 - Условие перехода на condition_5c85361: rupost_track_input is filled AND flagTracking = 1
 - Условие перехода на condition_2ca26ae: rupost_track_input_back is filled AND flagTracking = 1
 - Условие перехода на condition_b453c7: flagTracking = 2 AND channel_id is filled"""

        self.assertEqual(self.renderer.render(self.block), expected_output)


if __name__ == "__main__":
    unittest.main()

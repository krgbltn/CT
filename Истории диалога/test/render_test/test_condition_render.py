import unittest
from src.ElementRender.ConditionRender import ConditionRender

class TestConditionRender(unittest.TestCase):

    def setUp(self):
        # Исходный JSON
        self.json = {
                    "Id": "block_36d3f1d",
                    "Type": "Condition",
                    "Position": {
                        "Left": 37,
                        "Top": 109
                    },
                    "Inputs": [
                        {
                            "From": "block_cb75b2",
                            "FromOutput": {
                                "Id": "block_cb75b2",
                                "Type": "Article"
                            }
                        }
                    ],
                    "Outputs": [
                        {
                            "Id": "condition_c932a9",
                            "Type": "Article",
                            "To": "block_fe6c68"
                        },
                        {
                            "Id": "condition_23d132f",
                            "Type": "Article",
                            "To": "block_fe6c68"
                        },
                        {
                            "Id": "condition_1bdf005",
                            "Type": "Article",
                            "To": "block_fe6c68"
                        },
                        {
                            "Id": "condition_50a49b8",
                            "Type": "Article",
                            "To": "block_fe6c68"
                        },
                        {
                            "Id": "condition_312bf84",
                            "Type": "Article",
                            "To": "block_fe6c68"
                        },
                        {
                            "Id": "condition_c7d5dd",
                            "Type": "Article",
                            "To": "block_201a4c5"
                        },
                        {
                            "Id": "condition_4918a5a",
                            "Type": "Article",
                            "To": "block_415dcc8"
                        },
                        {
                            "Id": "condition_373e78c",
                            "Type": "Article",
                            "To": "block_415dcc8"
                        },
                        {
                            "Id": "condition_2c83246",
                            "Type": "Article",
                            "To": "block_1e1d24c"
                        },
                        {
                            "Id": "condition_20018cc",
                            "Type": "Article",
                            "To": "block_3472ec0"
                        },
                        {
                            "Id": "condition_15c7a7d",
                            "Type": "Article",
                            "To": "block_b336f2"
                        }
                    ],
                    "BlockData": {
                        "Condition": {
                            "Conditions": [
                                {
                                    "Id": "condition_2c83246",
                                    "And": [
                                        {
                                            "Slot": "__ARBITRARY_EXPRESSION__",
                                            "Value": "{{sys_omniuserid}} = \u002294487a83-c834-4741-afa9-dbf373ace846\u0022  or {{sys_omniuserid}} = \u0022befe42b0-c386-46cc-bd47-50683baf3fe6\u0022  or {{sys_omniuserid}} = \u002250ff9ba6-02a5-4292-9a43-ee24ab544a39\u0022  or {{sys_omniusedrid}} = \u00229ab54fbb-584b-43d5-8ae3-a0f94eedea22\u0022  or {{sys_omniuserid}} = \u00227fa6d467-7205-4b29-963d-2e03a0d8c88f\u0022  or {{sys_omniuserid}} = \u00221fec6add-2f51-4dc6-aa57-1110a8f64c38\u0022  or {{sys_omniuserid}} = \u0022df195477-b806-46f0-be07-d31a01cecf9e\u0022  or {{sys_omniuserid}} = \u002201d4c52a-cf51-4038-a462-b087ebec3f86\u0022  or {{sys_omniuserid}} = \u0022edb6cfca-fad9-4bca-9276-dd7b9a1481ba\u0022  or {{sys_omniuserid}} = \u0022424a2c54-c8e8-4143-83ca-76f8c1e5fddf\u0022  or {{sys_omniuserid}} = \u00226dd68967-131d-4274-b25a-bae9d9518dbb\u0022"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_4918a5a",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "webchat_rupost"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_c7d5dd",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "mobile_mprupost"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_23d132f",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "channel_5218637"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_c932a9",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "vk"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_1bdf005",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "channel_23d6c2c"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_50a49b8",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "channel_482c71d"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_312bf84",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "channel_08tg27v"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_20018cc",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "channel_35f378e"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_15c7a7d",
                                    "And": [
                                        {
                                            "Slot": "channel_id",
                                            "Value": "channel_133540d"
                                        }
                                    ]
                                },
                                {
                                    "Id": "condition_373e78c",
                                    "And": []
                                }
                            ]
                        }
                    }
        }
        self.renderer = ConditionRender()
        self.output = self.renderer.render(self.json)

    def test_render_is_string(self):
        self.assertIsInstance(self.output, str)

    def test_contains_all_branches(self):
        expected_branches = [
            ("IF {{sys_omniuserid}}", "→ block_1e1d24c"),
            ("IF channel_id == 'webchat_rupost'", "→ block_415dcc8"),
            ("IF channel_id == 'mobile_mprupost'", "→ block_201a4c5"),
            ("IF channel_id == 'channel_5218637'", "→ block_fe6c68"),
            ("IF channel_id == 'vk'", "→ block_fe6c68"),
            ("IF channel_id == 'channel_23d6c2c'", "→ block_fe6c68"),
            ("IF channel_id == 'channel_482c71d'", "→ block_fe6c68"),
            ("IF channel_id == 'channel_08tg27v'", "→ block_fe6c68"),
            ("IF channel_id == 'channel_35f378e'", "→ block_3472ec0"),
            ("IF channel_id == 'channel_133540d'", "→ block_b336f2"),
            ("ELSE", "→ block_415dcc8")
        ]
        for condition, target in expected_branches:
            with self.subTest(condition=condition):
                self.assertIn(condition, self.output)
                self.assertIn(target, self.output)

    def test_contains_arbitrary_expression(self):
        self.assertIn("IF {{sys_omniuserid}}", self.output)
        self.assertIn("or {{sys_omniuserid}}", self.output)

if __name__ == "__main__":
    unittest.main()
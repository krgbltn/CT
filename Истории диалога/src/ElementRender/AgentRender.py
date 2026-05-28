class AgentRender:
    def render(self, block):
        block_id = block.get("Id", "")
        block_type = block.get("Type", "")
        block_data = block.get("BlockData", {})

        output = []
        output.append(f"--- {block_id} [{block_type}] ---")
        agent_info =  block_data.get("Agent", {})
        output.append(f"Agent block: {agent_info.get('AgentId')} ({agent_info.get('AgentType')})")

        return "\n".join(output)
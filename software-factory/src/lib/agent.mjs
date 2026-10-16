// Tool-use loop over the Bedrock Converse API.
//   converse: async (input) => response, e.g. (i) => bedrock.send(new ConverseCommand(i))
//   toolbox: { specs, run(name, input) } from tools.mjs

export async function runAgent({ converse, modelId, systemPrompt, userText, toolbox, maxTurns }) {
  const messages = [{ role: 'user', content: [{ text: userText }] }];
  const toolUses = [];

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const response = await converse({
      modelId,
      system: [{ text: systemPrompt }],
      messages,
      toolConfig: { tools: toolbox.specs },
      inferenceConfig: { maxTokens: 4096, temperature: 0 },
    });

    const assistant = response.output?.message;
    if (!assistant) throw new Error('Bedrock returned no message');
    messages.push(assistant);

    if (response.stopReason !== 'tool_use') {
      const text = (assistant.content ?? []).filter((block) => block.text).map((block) => block.text).join('\n');
      return { text, turns: turn, toolUses };
    }

    const results = [];
    for (const block of assistant.content ?? []) {
      if (!block.toolUse) continue;
      const { toolUseId, name, input } = block.toolUse;
      toolUses.push(name);
      try {
        const output = await toolbox.run(name, input);
        results.push({ toolResult: { toolUseId, content: [{ text: JSON.stringify(output) }] } });
      } catch (error) {
        // Errors go back to the model so it can correct its input, rather than ending the run.
        results.push({
          toolResult: { toolUseId, content: [{ text: error.message }], status: 'error' },
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  throw new Error(`agent did not finish within ${maxTurns} turns`);
}

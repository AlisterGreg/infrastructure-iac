import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/lib/agent.mjs';

function fakeToolbox(handler) {
  return { specs: [], run: async (name, input) => handler(name, input) };
}

test('runAgent feeds tool results back until the model stops calling tools', async () => {
  const replies = [
    {
      stopReason: 'tool_use',
      output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: 'read_repo_file', input: { path: 'package.json' } } }] } },
    },
    { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: 'done' }] } } },
  ];
  const sent = [];
  const converse = async (input) => {
    sent.push(structuredClone(input.messages));
    return replies.shift();
  };
  const toolbox = fakeToolbox(async (name, input) => ({ name, input, ok: true }));

  const result = await runAgent({ converse, modelId: 'm', systemPrompt: 's', userText: 'go', toolbox, maxTurns: 5 });

  assert.equal(result.text, 'done');
  assert.equal(result.turns, 2);
  assert.deepEqual(result.toolUses, ['read_repo_file']);
  const second = sent[1];
  const toolResult = second[second.length - 1].content[0].toolResult;
  assert.equal(toolResult.toolUseId, 't1');
  assert.match(toolResult.content[0].text, /"ok":true/);
});

test('runAgent returns tool errors to the model instead of failing the run', async () => {
  const replies = [
    {
      stopReason: 'tool_use',
      output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't2', name: 'create_issue', input: {} } }] } },
    },
    { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: 'gave up' }] } } },
  ];
  const sent = [];
  const converse = async (input) => {
    sent.push(structuredClone(input.messages));
    return replies.shift();
  };
  const toolbox = fakeToolbox(async () => {
    throw new Error('create_issue: priority must be one of Urgent, High, Medium, Low');
  });

  const result = await runAgent({ converse, modelId: 'm', systemPrompt: 's', userText: 'go', toolbox, maxTurns: 5 });

  const errorResult = sent[1][sent[1].length - 1].content[0].toolResult;
  assert.equal(errorResult.status, 'error');
  assert.match(errorResult.content[0].text, /priority must be one of/);
  assert.equal(result.text, 'gave up');
});

test('runAgent stops after maxTurns', async () => {
  const converse = async () => ({
    stopReason: 'tool_use',
    output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 'x', name: 'read_repo_file', input: {} } }] } },
  });
  await assert.rejects(
    runAgent({ converse, modelId: 'm', systemPrompt: 's', userText: 'go', toolbox: fakeToolbox(async () => ({})), maxTurns: 2 }),
    /did not finish within 2 turns/,
  );
});

import { parseAgentResponse, detectWorkCompleted } from './parse-agent-response.js';
import { test } from 'node:test';
import assert from 'node:assert';

test('parseAgentResponse - valid completion', () => {
  const output = `Some agent output
\`\`\`json
{
  "status": "completed",
  "summary": "Implemented feature X",
  "details": "Added 3 functions",
  "followUps": [
    {"title": "Write tests", "role": "test", "priority": 2}
  ]
}
\`\`\`
More output`;

  const result = parseAgentResponse(output);
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.summary, 'Implemented feature X');
  assert.strictEqual(result.followUps?.length, 1);
});

test('parseAgentResponse - no JSON block', () => {
  const output = 'Just some text without JSON';
  
  assert.throws(() => parseAgentResponse(output), /No JSON completion block/);
});

test('parseAgentResponse - invalid JSON', () => {
  const output = `\`\`\`json
{ invalid json }
\`\`\``;
  
  assert.throws(() => parseAgentResponse(output), /Failed to parse JSON/);
});

test('detectWorkCompleted - true cases', () => {
  assert.strictEqual(detectWorkCompleted('I committed the changes'), true);
  assert.strictEqual(detectWorkCompleted('✅ Done'), true);
  assert.strictEqual(detectWorkCompleted('Created PR #123'), true);
});

test('detectWorkCompleted - false cases', () => {
  assert.strictEqual(detectWorkCompleted('Still working on it'), false);
});

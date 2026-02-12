import { loadWorkflowContext, loadWorkflowFile } from './workflow.js';
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const testWorkflowDir = join(process.cwd(), 'workflows', 'test-workflow');

test('loadWorkflowFile - existing file', () => {
  // Setup
  mkdirSync(testWorkflowDir, { recursive: true });
  writeFileSync(join(testWorkflowDir, 'test.md'), 'Test content', 'utf-8');
  
  const content = loadWorkflowFile('test-workflow', 'test.md');
  assert.strictEqual(content, 'Test content');
  
  // Cleanup
  rmSync(testWorkflowDir, { recursive: true });
});

test('loadWorkflowFile - missing file', () => {
  const content = loadWorkflowFile('nonexistent', 'missing.md');
  assert.strictEqual(content, undefined);
});

test('loadWorkflowContext - full context', () => {
  // Setup
  mkdirSync(testWorkflowDir, { recursive: true });
  writeFileSync(join(testWorkflowDir, '_preamble.md'), 'Project context', 'utf-8');
  writeFileSync(join(testWorkflowDir, 'code.md'), 'Code agent instructions', 'utf-8');
  
  const context = loadWorkflowContext('test-workflow', 'code');
  
  assert.strictEqual(context.preamble, 'Project context');
  assert.strictEqual(context.rolePrompt, 'Code agent instructions');
  assert.ok(context.fullContext.includes('Project context'));
  assert.ok(context.fullContext.includes('Code agent instructions'));
  assert.ok(context.fullContext.includes('---')); // Separator
  
  // Cleanup
  rmSync(testWorkflowDir, { recursive: true });
});

test('loadWorkflowContext - no preamble', () => {
  // Setup
  mkdirSync(testWorkflowDir, { recursive: true });
  writeFileSync(join(testWorkflowDir, 'code.md'), 'Code agent instructions', 'utf-8');
  
  const context = loadWorkflowContext('test-workflow', 'code');
  
  assert.strictEqual(context.preamble, undefined);
  assert.strictEqual(context.rolePrompt, 'Code agent instructions');
  assert.strictEqual(context.fullContext, 'Code agent instructions');
  
  // Cleanup
  rmSync(testWorkflowDir, { recursive: true });
});

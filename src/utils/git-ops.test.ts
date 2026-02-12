import { test } from 'node:test';
import assert from 'node:assert';
import { hasChanges, getGitStatus } from './git-ops.js';

// Note: These are integration tests that require git to be configured
// They may fail in CI environments without git setup

test('hasChanges - should detect changes', async () => {
  // This test assumes we're in a git repo
  // In a clean repo, this should be false
  const changes = await hasChanges();
  assert.strictEqual(typeof changes, 'boolean');
});

test('getGitStatus - should return status object', async () => {
  const status = await getGitStatus();
  assert.ok(Array.isArray(status.modified));
  assert.ok(Array.isArray(status.added));
  assert.ok(Array.isArray(status.deleted));
});

// Note: We don't test commit/push/PR creation in unit tests
// Those would require mocking or integration test environment

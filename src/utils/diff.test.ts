import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLineDiff, filterProjectFiles, parseRefactorOutput } from './diff';
import { INITIAL_MOBILE_FILES } from '../data/mobilePresets';

test('computeLineDiff calculates exact additions, removals, and line numbers', () => {
  const original = ['let a = 1', 'let b = 2', 'let c = 3'].join('\n');
  const modified = ['let a = 1', 'let b = 20', 'let c = 3', 'let d = 4'].join('\n');

  const { lines, stats } = computeLineDiff(original, modified);

  assert.equal(stats.unchanged, 2);
  assert.equal(stats.removed, 1);
  assert.equal(stats.added, 2);
  assert.equal(lines.find((l) => l.type === 'removed')?.content, 'let b = 2');
  assert.equal(lines.find((l) => l.type === 'added' && l.content === 'let d = 4')?.newLineNumber, 4);
});

test('parseRefactorOutput parses completed JSON and strips markdown fences', () => {
  const payload = '```json\n{"summary":"Fixed retain cycle","refactoredCode":"final class A {}","findings":[{"title":"Leak","severity":"critical","lineRange":"1-3","ecosystemImpact":"ARC","explanation":"Weak self"}],"verificationChecklist":["Run Instruments"]}\n```';
  const parsed = parseRefactorOutput(payload);

  assert.equal(parsed.isCompleteJson, true);
  assert.equal(parsed.summary, 'Fixed retain cycle');
  assert.equal(parsed.refactoredCode, 'final class A {}');
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.verificationChecklist[0], 'Run Instruments');
});

test('parseRefactorOutput extracts partial refactoredCode while JSON is still streaming', () => {
  const partial = '{"summary":"Removing force unwrap","refactoredCode":"func safe() {\\n  return\\n';
  const parsed = parseRefactorOutput(partial);

  assert.equal(parsed.isCompleteJson, false);
  assert.equal(parsed.summary, 'Removing force unwrap');
  assert.match(parsed.refactoredCode, /func safe\(\) \{\n  return/);
});

test('filterProjectFiles filters by platform and search query', () => {
  const iosFiles = filterProjectFiles(INITIAL_MOBILE_FILES, 'ios', '');
  assert.ok(iosFiles.every((f) => f.platform === 'ios'));
  assert.ok(iosFiles.some((f) => f.language === 'objc'));

  const objcMatches = filterProjectFiles(INITIAL_MOBILE_FILES, 'all', 'location');
  assert.equal(objcMatches.length, 1);
  assert.equal(objcMatches[0].name, 'LocationSyncManager.m');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatGuideTitleFromFilename,
  formatStyleGuidesForPrompt,
  getApplicableStyleGuides,
  inferScopeFromStyleGuideFile,
} from './styleGuides';
import { INITIAL_STYLE_GUIDES } from '../data/styleGuidePresets';

test('getApplicableStyleGuides matches active guides by platform, language, or all', () => {
  const activeSwift = getApplicableStyleGuides(INITIAL_STYLE_GUIDES, 'ios', 'swift');
  assert.equal(activeSwift.length, 1);
  assert.equal(activeSwift[0].id, 'guide-ios-strict-arc');

  const disabledAll = INITIAL_STYLE_GUIDES.map((g) => ({ ...g, isActive: false }));
  assert.equal(getApplicableStyleGuides(disabledAll, 'ios', 'objc').length, 0);
});

test('inferScopeFromStyleGuideFile detects Swift, Obj-C, and Kotlin style guides', () => {
  assert.equal(inferScopeFromStyleGuideFile('.swiftlint.yml', 'opt_in_rules: force_try'), 'swift');
  assert.equal(inferScopeFromStyleGuideFile('.clang-format', 'NS_ASSUME_NONNULL_BEGIN'), 'objc');
  assert.equal(inferScopeFromStyleGuideFile('detekt.yml', 'GlobalScope forbidden'), 'kotlin');
  assert.equal(inferScopeFromFilenameHelper('team-conventions.md'), 'all');
});

function inferScopeFromFilenameHelper(name: string) {
  return inferScopeFromStyleGuideFile(name, 'Always keep functions concise');
}

test('formatGuideTitleFromFilename and formatStyleGuidesForPrompt format cleanly', () => {
  assert.equal(formatGuideTitleFromFilename('.swiftlint-mobile.yml'), 'Swiftlint Mobile Style Guide');
  const promptText = formatStyleGuidesForPrompt(INITIAL_STYLE_GUIDES);
  assert.match(promptText, /iOS Strict Concurrency & ARC Guide/);
  assert.match(promptText, /Android Compose & Coroutines Standard/);
});

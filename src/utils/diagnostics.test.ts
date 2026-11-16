import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCrashLogMetadata } from './diagnostics';
import { CRASH_LOG_PRESETS } from '../data/mobilePresets';

test('parseCrashLogMetadata detects iOS EXC_BAD_ACCESS and app stack frames', () => {
  const iosPreset = CRASH_LOG_PRESETS.find((p) => p.id === 'ios-coredata-crash')!;
  const meta = parseCrashLogMetadata(iosPreset.rawLog);

  assert.equal(meta.platform, 'ios');
  assert.match(meta.signalOrException, /EXC_BAD_ACCESS/);
  assert.ok(meta.frames.length > 0);
  assert.ok(meta.frames.some((f) => f.isAppFrame && f.module === 'BridgeShop'));
  assert.ok(meta.frames.filter((f) => f.module === 'CoreData' || f.module === 'Combine').every((f) => !f.isAppFrame));
});

test('parseCrashLogMetadata detects Android ANR and main thread lock', () => {
  const androidAnr = CRASH_LOG_PRESETS.find((p) => p.id === 'android-main-thread-anr')!;
  const meta = parseCrashLogMetadata(androidAnr.rawLog);

  assert.equal(meta.platform, 'android');
  assert.equal(meta.isMainThreadIssue, true);
  assert.match(meta.signalOrException, /ANR in com\.bridgelab\.app/);
  assert.ok(meta.frames.some((f) => f.isAppFrame && f.location.includes('FeedRepository.kt')));
});

test('parseCrashLogMetadata detects Objective-C NSGenericException crash', () => {
  const objcPreset = CRASH_LOG_PRESETS.find((p) => p.id === 'ios-objc-crash')!;
  const meta = parseCrashLogMetadata(objcPreset.rawLog);

  assert.equal(meta.platform, 'ios');
  assert.ok(meta.frames.some((f) => f.isAppFrame && f.location.includes('LocationSyncManager.m')));
});

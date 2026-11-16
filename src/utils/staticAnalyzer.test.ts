import test from 'node:test';
import assert from 'node:assert/strict';
import { runInstantStaticAnalysis } from './staticAnalyzer';

test('runInstantStaticAnalysis flags Objective-C strong NSString, NSURLConnection, synchronize, and retain cycles', () => {
  const objcCode = `@interface Mgr ()
@property (nonatomic, strong) NSString *token;
@end
@implementation Mgr
- (void)run {
  [NSURLConnection sendAsynchronousRequest:req queue:q completionHandler:^(NSURLResponse *r, NSData *d, NSError *e) {
    [self finish];
    [[NSUserDefaults standardUserDefaults] synchronize];
  }];
}
@end`;

  const issues = runInstantStaticAnalysis(objcCode, 'objc');

  assert.ok(issues.some((i) => i.id.startsWith('objc-copy-')));
  assert.ok(issues.some((i) => i.id.startsWith('objc-urlconn-')));
  assert.ok(issues.some((i) => i.id.startsWith('objc-ud-sync-')));
  assert.ok(issues.some((i) => i.id.startsWith('objc-retain-cycle-')));
});

test('runInstantStaticAnalysis flags Swift try!, Combine strong self sink, and sequential await in loop', () => {
  const swiftCode = `func load() async {
  pub.sink { val in
    self.value = val
  }.store(in: &cancellables)
  try! ctx.save()
  for url in urls {
    _ = await fetch(url)
  }
}`;

  const issues = runInstantStaticAnalysis(swiftCode, 'swift');

  assert.ok(issues.some((i) => i.id.startsWith('swift-combine-weak-')));
  assert.ok(issues.some((i) => i.id.startsWith('swift-force-try-')));
  assert.ok(issues.some((i) => i.id.startsWith('swift-serial-await-')));
});

import type { LiveDiagnosticIssue, MobileLanguage } from '../types/mobile';

/**
 * Performs instant, deterministic static analysis on Objective-C, Swift, and Kotlin codebases
 * to provide zero-latency diagnostics while the developer types, before/alongside Gemini 4 analysis.
 */
export function runInstantStaticAnalysis(
  code: string,
  language: MobileLanguage
): LiveDiagnosticIssue[] {
  const issues: LiveDiagnosticIssue[] = [];
  const lines = code.replace(/\r\n/g, '\n').split('\n');

  if (language === 'objc') {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Strong NSString / NSArray / NSDictionary / block property check
      if (/@property\s*\([^)]*\bstrong\b[^)]*\)\s*(NSString|NSArray|NSDictionary|NSSet)\s*\*/.test(trimmed)) {
        issues.push({
          id: `objc-copy-${lineNum}`,
          line: lineNum,
          category: 'best-practice',
          severity: 'warning',
          title: 'Use copy instead of strong for immutable Foundation value types',
          explanation:
            'Properties typed as NSString, NSArray, or NSDictionary can be assigned mutable subclasses (e.g. NSMutableString), risking unexpected external mutation.',
          suggestion: 'Replace `strong` with `copy` in the @property attribute list.',
          source: 'static',
        });
      }

      // Deprecated NSURLConnection
      if (/\bNSURLConnection\b/.test(trimmed)) {
        issues.push({
          id: `objc-urlconn-${lineNum}`,
          line: lineNum,
          category: 'best-practice',
          severity: 'warning',
          title: 'Deprecated NSURLConnection API detected',
          explanation:
            'NSURLConnection was deprecated in iOS 9 and lacks HTTP/2 multiplexing, modern TLS controls, and background session support.',
          suggestion: 'Migrate to NSURLSession (`[[NSURLSession sharedSession] dataTaskWithRequest:...]`).',
          source: 'static',
        });
      }

      // Deprecated NSUserDefaults synchronize
      if (/\[\s*\[NSUserDefaults\s+standardUserDefaults\]\s+synchronize\s*\]/.test(trimmed)) {
        issues.push({
          id: `objc-ud-sync-${lineNum}`,
          line: lineNum,
          category: 'optimization',
          severity: 'info',
          title: 'Redundant synchronous NSUserDefaults disk flush',
          explanation:
            'Calling -synchronize is deprecated and blocks the calling thread while flushing plist preferences to disk.',
          suggestion: 'Remove -synchronize; iOS persists NSUserDefaults updates asynchronously.',
          source: 'static',
        });
      }

      // Unchecked error:nil on JSON serialization
      if (/NSJSONSerialization\b[^\n]*error:\s*(nil|NULL)/.test(trimmed)) {
        issues.push({
          id: `objc-json-err-${lineNum}`,
          line: lineNum,
          category: 'error',
          severity: 'warning',
          title: 'Swallowed NSError in NSJSONSerialization',
          explanation:
            'Passing nil for the error parameter hides malformed payload failures and can pass nil NSData downstream.',
          suggestion: 'Pass `&error` and guard `if (!payload || error)` before dispatching the request.',
          source: 'static',
        });
      }

      // Strong self inside block literal
      if (/\^\s*(\([^)]*\))?\s*\{/.test(trimmed)) {
        const blockWindow = lines.slice(idx, Math.min(lines.length, idx + 8)).join('\n');
        if (/\bself\b/.test(blockWindow) && !/weakSelf/.test(lines.slice(Math.max(0, idx - 5), idx + 1).join('\n'))) {
          issues.push({
            id: `objc-retain-cycle-${lineNum}`,
            line: lineNum,
            category: 'error',
            severity: 'critical',
            title: 'Potential ARC retain cycle: strong `self` captured in Objective-C block',
            explanation:
              'Capturing `self` strongly inside a stored or escaping block prevents deallocation when `self` also owns the block or operation.',
            suggestion: 'Declare `__weak typeof(self) weakSelf = self;` before the block and promote with `__strong typeof(weakSelf) strongSelf = weakSelf;` inside.',
            source: 'static',
          });
        }
      }
    });
  } else if (language === 'swift') {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Force try!
      if (/\btry!/.test(trimmed)) {
        issues.push({
          id: `swift-force-try-${lineNum}`,
          line: lineNum,
          category: 'error',
          severity: 'critical',
          title: 'Unsafe `try!` force-try will crash app on runtime error',
          explanation:
            'Any CoreData validation, disk space, or merge conflict error thrown here terminates the process immediately with SIGTRAP.',
          suggestion: 'Replace `try!` with a `do { try ... } catch { ... }` block and surface or log the error.',
          source: 'static',
        });
      }

      // Force unwrap ! (avoiding != or !bool)
      if (/[a-zA-Z0-9_)\]]!\s*($|[.?),\]])/.test(trimmed) && !/!=\s*/.test(trimmed) && !/^\s*!\w/.test(trimmed)) {
        issues.push({
          id: `swift-force-unwrap-${lineNum}`,
          line: lineNum,
          category: 'error',
          severity: 'warning',
          title: 'Force-unwrapped optional (`!`) risks fatal nil crash',
          explanation: 'Unwrapping an optional with `!` bypasses Swift compile-time null safety.',
          suggestion: 'Use `guard let` or `if let` optional binding.',
          source: 'static',
        });
      }

      // Combine sink / closure missing [weak self]
      if (/\.sink\s*\{/.test(trimmed) && !/\[weak self\]/.test(trimmed)) {
        const windowText = lines.slice(idx, Math.min(lines.length, idx + 6)).join('\n');
        if (/\bself\./.test(windowText)) {
          issues.push({
            id: `swift-combine-weak-${lineNum}`,
            line: lineNum,
            category: 'error',
            severity: 'critical',
            title: 'Combine `.sink` captures `self` strongly (retain cycle)',
            explanation:
              'Storing the AnyCancellable in `self.cancellables` while strongly referencing `self` inside `.sink` creates a permanent memory leak.',
            suggestion: 'Add `[weak self]` to the capture list and unwrap `guard let self else { return }`.',
            source: 'static',
          });
        }
      }

      // DispatchQueue.global() used with UI / CoreData
      if (/DispatchQueue\.global\(/.test(trimmed)) {
        issues.push({
          id: `swift-global-queue-${lineNum}`,
          line: lineNum,
          category: 'optimization',
          severity: 'warning',
          title: 'Unbounded `DispatchQueue.global()` risks thread explosion & queue mismatch',
          explanation:
            'Publishing `@Published` properties or touching main-queue `NSManagedObjectContext` from a global concurrent queue causes undefined behavior.',
          suggestion: 'Use `.receive(on: DispatchQueue.main)` for UI state updates or Swift Concurrency `@MainActor` / `perform`.',
          source: 'static',
        });
      }

      // Synchronous sequential await inside loop
      if (/\bfor\s+\w+\s+in\b/.test(trimmed)) {
        const loopBody = lines.slice(idx, Math.min(lines.length, idx + 5)).join('\n');
        if (/\bawait\b/.test(loopBody)) {
          issues.push({
            id: `swift-serial-await-${lineNum}`,
            line: lineNum,
            category: 'optimization',
            severity: 'info',
            title: 'Sequential `await` inside loop serializes async work',
            explanation: 'Each iteration waits for the previous network or I/O call to complete before starting the next.',
            suggestion: 'Use `await withTaskGroup(of: ...)` to run independent tasks concurrently.',
            source: 'static',
          });
        }
      }
    });
  } else if (language === 'kotlin') {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      if (/\bGlobalScope\.launch\b/.test(trimmed)) {
        issues.push({
          id: `kt-globalscope-${lineNum}`,
          line: lineNum,
          category: 'error',
          severity: 'critical',
          title: 'Unstructured `GlobalScope.launch` leaks coroutines past lifecycle',
          explanation: 'Coroutines launched in GlobalScope are not cancelled when a ViewModel or screen is destroyed.',
          suggestion: 'Inject a lifecycle-aware `CoroutineScope` or use `suspend` functions within `viewModelScope`.',
          source: 'static',
        });
      }

      if (/!!\s*/.test(trimmed)) {
        issues.push({
          id: `kt-not-null-${lineNum}`,
          line: lineNum,
          category: 'error',
          severity: 'warning',
          title: 'Not-null assertion (`!!`) risks NullPointerException',
          explanation: 'Using `!!` defeats Kotlin null-safety guarantees at runtime.',
          suggestion: 'Use safe call `?.let { ... }` or smart-cast with an explicit null check.',
          source: 'static',
        });
      }

      if (/\bas\s+FragmentActivity\b/.test(trimmed)) {
        issues.push({
          id: `kt-unsafe-cast-${lineNum}`,
          line: lineNum,
          category: 'error',
          severity: 'critical',
          title: 'Unsafe `Context as FragmentActivity` cast crashes under Hilt/ContextWrapper',
          explanation: 'Compose `LocalContext.current` is frequently wrapped by Hilt or theming wrappers.',
          suggestion: 'Unwrap `ContextWrapper` recursively with `as? FragmentActivity` before calling BiometricPrompt.',
          source: 'static',
        });
      }

      if (/\bSideEffect\s*\{/.test(trimmed)) {
        issues.push({
          id: `kt-sideeffect-${lineNum}`,
          line: lineNum,
          category: 'best-practice',
          severity: 'warning',
          title: '`SideEffect` executes on every successful Compose recomposition',
          explanation: 'Launching dialogs, biometric prompts, or state mutations inside SideEffect causes infinite recomposition loops.',
          suggestion: 'Use `LaunchedEffect(Unit)` for one-time side effects scoped to composition entry.',
          source: 'static',
        });
      }
    });
  }

  return issues;
}

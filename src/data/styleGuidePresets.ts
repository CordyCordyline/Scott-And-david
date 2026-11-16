import type { StyleGuide } from '../types/mobile';

export const INITIAL_STYLE_GUIDES: StyleGuide[] = [
  {
    id: 'guide-ios-strict-arc',
    name: 'iOS Strict Concurrency & ARC Guide',
    scope: 'ios',
    isActive: true,
    sourceType: 'preset',
    fileName: '.swiftlint-ios.yml',
    updatedAt: '2026-11-10T09:00:00Z',
    rulesMarkdown: `# iOS Engineering Style Guide (Swift 6 & Objective-C)
1. Memory Safety & ARC:
   - Never capture strong \`self\` inside escaping closures, Combine \`.sink\`, or stored Objective-C blocks. Always use \`[weak self]\` (Swift) or \`__weak typeof(self) weakSelf\` + \`__strong\` promotion (Obj-C).
   - Declare immutable value-type Objective-C properties (\`NSString\`, \`NSArray\`, \`NSDictionary\`, blocks) with \`copy\`, never \`strong\`.
2. Concurrency & Main Thread Isolation:
   - Annotate ViewModels and UI state publishers with \`@MainActor\`. Never mutate \`@Published\` or \`NSManagedObjectContext\` (mainQueueConcurrencyType) on \`DispatchQueue.global()\`.
   - Prefer structured concurrency (\`async/await\`, \`TaskGroup\`) over raw GCD queues and deprecated \`NSURLConnection\`.
3. Error Handling & Nullability:
   - Zero \`try!\` or force-unwraps (\`!\`) in production paths; use typed \`throws\` or explicit \`do/catch\`.
   - Always pass an explicit \`NSError **\` pointer to Foundation serialization APIs.`,
  },
  {
    id: 'guide-android-compose-coroutines',
    name: 'Android Compose & Coroutines Standard',
    scope: 'android',
    isActive: true,
    sourceType: 'preset',
    fileName: 'detekt-android.yml',
    updatedAt: '2026-11-10T09:00:00Z',
    rulesMarkdown: `# Android Engineering Style Guide (Kotlin 2.1 & Jetpack Compose)
1. Structured Coroutines:
   - \`GlobalScope\` is strictly prohibited. Inject a lifecycle-bound \`CoroutineScope\` or expose \`suspend\` functions executed inside \`viewModelScope\`.
   - Protect shared mutable pagination state and \`MutableStateFlow\` updates with \`Mutex\` or atomic \`update { ... }\`.
   - Perform all Room/SQLite DAO transactions on \`Dispatchers.IO\`.
2. Jetpack Compose Hygiene:
   - Never trigger navigation, permissions, or \`BiometricPrompt\` inside \`SideEffect\`. Use \`LaunchedEffect\` with explicit keys or event callbacks.
   - Never force-cast \`LocalContext.current as FragmentActivity\`; traverse \`ContextWrapper\` safely with \`tailrec\` helper.
3. Null Safety:
   - Prohibit \`!!\` non-null assertions outside unit tests.`,
  },
];

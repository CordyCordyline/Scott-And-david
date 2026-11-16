import type { MobileProjectFile } from '../types/mobile';

export const INITIAL_MOBILE_FILES: MobileProjectFile[] = [
  {
    id: 'ios-checkout-vm',
    name: 'CheckoutViewModel.swift',
    path: 'ios/Sources/Features/Checkout/CheckoutViewModel.swift',
    platform: 'ios',
    language: 'swift',
    framework: 'Swift 6 · Combine · CoreData',
    targetSdk: 'iOS 18.2',
    issueHint: 'Retain cycle in Combine sink + CoreData context accessed off-queue',
    code: `import Foundation
import Combine
import CoreData

final class CheckoutViewModel: ObservableObject {
    @Published var orderTotal: Decimal = 0
    @Published var isSubmitting: Bool = false
    @Published var errorMessage: String?

    private let paymentService: PaymentService
    private let viewContext: NSManagedObjectContext
    private var cancellables = Set<AnyCancellable>()

    init(paymentService: PaymentService, viewContext: NSManagedObjectContext) {
        self.paymentService = paymentService
        self.viewContext = viewContext
    }

    func observeCartUpdates(cartPublisher: AnyPublisher<[CartItem], Never>) {
        cartPublisher
            .debounce(for: .milliseconds(250), scheduler: DispatchQueue.global())
            .sink { items in
                self.orderTotal = items.reduce(0) { $0 + $1.price * Decimal($1.quantity) }
                self.persistDraftOrder(items: items)
            }
            .store(in: &cancellables)
    }

    func submitOrder(cardToken: String) {
        isSubmitting = true
        paymentService.charge(amount: orderTotal, token: cardToken) { result in
            switch result {
            case .success(let receipt):
                self.isSubmitting = false
                self.saveReceipt(receipt)
            case .failure(let error):
                self.isSubmitting = false
                self.errorMessage = error.localizedDescription
            }
        }
    }

    private func persistDraftOrder(items: [CartItem]) {
        let draft = DraftOrderEntity(context: viewContext)
        draft.updatedAt = Date()
        draft.itemCount = Int32(items.count)
        try! viewContext.save()
    }

    private func saveReceipt(_ receipt: PaymentReceipt) {
        let entity = ReceiptEntity(context: viewContext)
        entity.transactionId = receipt.id
        try? viewContext.save()
    }
}`,
  },
  {
    id: 'ios-objc-location',
    name: 'LocationSyncManager.m',
    path: 'ios/Legacy/Location/LocationSyncManager.m',
    platform: 'ios',
    language: 'objc',
    framework: 'Objective-C · CoreLocation · Foundation',
    targetSdk: 'iOS 18.2',
    issueHint: 'Block retain cycle, strong NSString property, main-thread sync & unsafe NSMutableArray mutation',
    code: `#import "LocationSyncManager.h"

@interface LocationSyncManager ()
@property (nonatomic, strong) NSString *sessionToken;
@property (nonatomic, strong) NSMutableArray *pendingBreadcrumbs;
@property (nonatomic, copy) void (^completionBlock)(BOOL success);
@end

@implementation LocationSyncManager

- (instancetype)initWithToken:(NSString *)token {
    self = [super init];
    if (self) {
        _sessionToken = token;
        _pendingBreadcrumbs = [NSMutableArray array];
    }
    return self;
}

- (void)recordBreadcrumb:(CLLocation *)location completion:(void (^)(BOOL))completion {
    self.completionBlock = completion;
    [self.pendingBreadcrumbs addObject:location];

    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSData *payload = [NSJSONSerialization dataWithJSONObject:@{@"lat": @(location.coordinate.latitude)} options:0 error:nil];
        NSURLRequest *request = [NSURLRequest requestWithURL:[NSURL URLWithString:@"https://api.bridgelab.dev/v1/loc"]];
        [NSURLConnection sendAsynchronousRequest:request
                                           queue:[NSOperationQueue mainQueue]
                               completionHandler:^(NSURLResponse *res, NSData *data, NSError *err) {
            if (self.completionBlock) {
                self.completionBlock(err == nil);
            }
            [[NSUserDefaults standardUserDefaults] synchronize];
        }];
    });
}

@end`,
  },
  {
    id: 'ios-image-pipeline',
    name: 'MediaAssetCache.swift',
    path: 'ios/Sources/Core/Media/MediaAssetCache.swift',
    platform: 'ios',
    language: 'swift',
    framework: 'Swift Concurrency · UIKit',
    targetSdk: 'iOS 18.2',
    issueHint: 'Actor reentrancy duplicate downloads + unbounded UIImage decode on main thread',
    code: `import UIKit

actor MediaAssetCache {
    private var memoryCache: [URL: UIImage] = [:]
    private let session: URLSession = .shared

    func loadThumbnail(for url: URL) async throws -> UIImage {
        if let cached = memoryCache[url] {
            return cached
        }

        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        guard let image = UIImage(data: data) else {
            throw URLError(.cannotDecodeContentData)
        }

        memoryCache[url] = image
        return image
    }

    func prefetch(urls: [URL]) async {
        for url in urls {
            _ = try? await loadThumbnail(for: url)
        }
    }
}`,
  },
  {
    id: 'android-feed-repo',
    name: 'FeedRepository.kt',
    path: 'android/app/src/main/java/com/bridgelab/feed/FeedRepository.kt',
    platform: 'android',
    language: 'kotlin',
    framework: 'Kotlin 2.1 · Coroutines · Room',
    targetSdk: 'Android API 35',
    issueHint: 'GlobalScope coroutine leak + shared MutableStateFlow race without Mutex',
    code: `package com.bridgelab.feed

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class FeedRepository(
    private val api: FeedRemoteApi,
    private val dao: FeedDao
) {
    private val _articles = MutableStateFlow<List<Article>>(emptyList())
    val articles: StateFlow<List<Article>> = _articles

    private var currentPage = 0
    private var isLoading = false

    fun refreshFeed(userId: String) {
        if (isLoading) return
        isLoading = true

        GlobalScope.launch(Dispatchers.Main) {
            try {
                val remote = api.fetchFeed(userId = userId, page = 0)
                dao.replaceAll(remote)
                currentPage = 1
                _articles.value = remote
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoading = false
            }
        }
    }

    suspend fun loadNextPage(userId: String) {
        val next = api.fetchFeed(userId = userId, page = currentPage)
        currentPage += 1
        _articles.value = _articles.value + next
    }
}`,
  },
  {
    id: 'android-biometric-gate',
    name: 'BiometricGateScreen.kt',
    path: 'android/app/src/main/java/com/bridgelab/security/BiometricGateScreen.kt',
    platform: 'android',
    language: 'kotlin',
    framework: 'Jetpack Compose · BiometricPrompt',
    targetSdk: 'Android API 35',
    issueHint: 'Unsafe Context cast + SideEffect triggers prompt on every recomposition',
    code: `package com.bridgelab.security

import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

@Composable
fun BiometricGateScreen(
    onAuthenticated: () -> Unit,
    onFallbackPin: () -> Unit
) {
    val context = LocalContext.current
    var authError by remember { mutableStateOf<String?>(null) }
    var promptCount by remember { mutableIntStateOf(0) }

    SideEffect {
        val activity = context as FragmentActivity
        val executor = ContextCompat.getMainExecutor(context)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onAuthenticated()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    authError = errString.toString()
                }
            }
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Verify Identity")
            .setNegativeButtonText("Use PIN")
            .build()
        prompt.authenticate(info)
        promptCount++
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Text("Security Verification ($promptCount)")
        if (authError != null) {
            Text(authError!!)
        }
        Button(onClick = onFallbackPin) {
            Text("Switch to PIN")
        }
    }
}`,
  },
];

export interface CrashLogPreset {
  id: string;
  label: string;
  platform: 'ios' | 'android';
  summary: string;
  linkedFileId: string;
  rawLog: string;
}

export const CRASH_LOG_PRESETS: CrashLogPreset[] = [
  {
    id: 'ios-coredata-crash',
    label: 'iOS · EXC_BAD_ACCESS (CoreData Main-Thread Violation)',
    platform: 'ios',
    summary: 'NSManagedObjectContext mutated on background DispatchQueue causing SIGSEGV in CheckoutViewModel',
    linkedFileId: 'ios-checkout-vm',
    rawLog: `Incident Identifier: 8A3F21C0-9D4B-4E12-B8C1-0F93A124E771
Hardware Model:      iPhone16,2
Process:             BridgeShop [4812]
OS Version:          iPhone OS 18.2 (22C152)

Exception Type:  EXC_BAD_ACCESS (SIGSEGV)
Exception Subtype: KERN_INVALID_ADDRESS at 0x0000000000000018
Triggered by Thread:  4

Thread 4 Crashed:
0   CoreData                        0x000000019b2a4188 -[NSManagedObjectContext(_NSInternalAdditions) _thereIsNoRoyaltyForYou] + 64
1   CoreData                        0x000000019b288f10 -[NSManagedObjectContext save:] + 284
2   BridgeShop                      0x0000000104a2b1c0 CheckoutViewModel.persistDraftOrder(items:) + 148 (CheckoutViewModel.swift:43)
3   BridgeShop                      0x0000000104a2aa44 closure #1 in CheckoutViewModel.observeCartUpdates(cartPublisher:) + 212 (CheckoutViewModel.swift:24)
4   Combine                         0x000000019c8122b8 Subscribers.Sink.receive(_:) + 92
5   libdispatch.dylib               0x00000001901b4300 _dispatch_call_block_and_release + 32

Thread 0:
0   libsystem_kernel.dylib          0x00000001c1a04a10 mach_msg2_trap + 8
1   UIKitCore                       0x000000018f4019a0 UIApplicationMain + 340`,
  },
  {
    id: 'ios-objc-crash',
    label: 'iOS · NSGenericException (Objective-C Mutated Collection)',
    platform: 'ios',
    summary: 'NSMutableArray mutated across threads while enumerated in LocationSyncManager',
    linkedFileId: 'ios-objc-location',
    rawLog: `Incident Identifier: 3C11D9E2-55B1-4402-A82C-22F9119E001A
Hardware Model:      iPhone15,3
Process:             BridgeShop [5104]
OS Version:          iPhone OS 18.2 (22C152)

Exception Type:  EXC_CRASH (SIGABRT)
Triggered by Thread:  2
Last Exception Backtrace:
0   CoreFoundation                  0x000000018e019c14 __exceptionPreprocess + 164
1   libobjc.A.dylib                 0x0000000185f22ee0 objc_exception_throw + 60
2   CoreFoundation                  0x000000018e0d82c4 -[__NSArrayM enumerateObjectsWithOptions:usingBlock:] + 244
3   BridgeShop                      0x0000000102819f40 -[LocationSyncManager recordBreadcrumb:completion:] + 192 (LocationSyncManager.m:22)
4   libdispatch.dylib               0x00000001901b4300 _dispatch_call_block_and_release + 32`,
  },
  {
    id: 'android-compose-crash',
    label: 'Android · ClassCastException + IllegalStateException (BiometricPrompt)',
    platform: 'android',
    summary: 'ContextWrapper cast failure & repeated prompt launch during Compose recomposition',
    linkedFileId: 'android-biometric-gate',
    rawLog: `FATAL EXCEPTION: main
Process: com.bridgelab.app, PID: 19402
java.lang.ClassCastException: dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper cannot be cast to androidx.fragment.app.FragmentActivity
    at com.bridgelab.security.BiometricGateScreenKt$BiometricGateScreen$1.invoke(BiometricGateScreen.kt:21)
    at com.bridgelab.security.BiometricGateScreenKt$BiometricGateScreen$1.invoke(BiometricGateScreen.kt:20)
    at androidx.compose.runtime.EffectsKt$SideEffect$1.invoke(Effects.kt:48)
    at androidx.compose.runtime.ComposerImpl.doCompose(Composer.kt:3412)
    at androidx.compose.ui.platform.AndroidComposeView.dispatchDraw(AndroidComposeView.android.kt:1291)
    at android.view.View.draw(View.java:24418)`,
  },
  {
    id: 'android-main-thread-anr',
    label: 'Android · ANR & NetworkOnMainThreadException (FeedRepository)',
    platform: 'android',
    summary: 'GlobalScope launched on Dispatchers.Main triggers synchronous DAO write & UI freeze',
    linkedFileId: 'android-feed-repo',
    rawLog: `ANR in com.bridgelab.app (com.bridgelab.app/.MainActivity)
Reason: Input dispatching timed out (Waiting because no window has focus but there is a focused application that may eventually add a window)
"main" prio=5 tid=1 Runnable
  | group="main" sCount=0 ucsCount=0 flags=0 obj=0x72c18a10 self=0xb400007891a02c00
  at android.database.sqlite.SQLiteConnection.nativeExecuteForChangedRowCount(Native method)
  at androidx.room.RoomDatabase.internalBeginTransaction(RoomDatabase.kt:521)
  at com.bridgelab.feed.FeedDao_Impl.replaceAll(FeedDao_Impl.java:104)
  at com.bridgelab.feed.FeedRepository$refreshFeed$1.invokeSuspend(FeedRepository.kt:26)
  at kotlinx.coroutines.DispatchedTask.run(DispatchedTask.kt:108)`,
  },
];

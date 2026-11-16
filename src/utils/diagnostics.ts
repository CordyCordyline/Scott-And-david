import type { CrashFrame, CrashMetadata, MobilePlatform } from '../types/mobile';

/**
 * Deterministically parses iOS (.crash / MetricKit) and Android (logcat / ANR) logs
 * to extract platform, exception/signal type, thread state, and top stack frames.
 */
export function parseCrashLogMetadata(rawLog: string): CrashMetadata {
  const text = rawLog.trim();
  if (!text) {
    return {
      platform: 'unknown',
      signalOrException: 'No crash trace provided',
      threadSummary: 'Unknown thread',
      isMainThreadIssue: false,
      frames: [],
    };
  }

  const lower = text.toLowerCase();
  const isIos =
    /exception type:\s*exc_/i.test(text) ||
    /triggered by thread:/i.test(text) ||
    /\.swift:\d+/i.test(text) ||
    /uikit|swiftui|libswift|corefoundation/i.test(lower);

  const isAndroid =
    /fatal exception:/i.test(text) ||
    /anr in /i.test(text) ||
    /at [a-z0-9_$.]+\([a-z0-9_]+\.(kt|java):\d+\)/i.test(text) ||
    /android\.os\.|androidx\.|kotlinx\.coroutines/i.test(lower);

  const platform: MobilePlatform | 'unknown' = isIos && !isAndroid ? 'ios' : isAndroid ? 'android' : 'unknown';

  // Extract primary signal or exception
  let signalOrException = 'Unclassified Runtime Exception';
  const iosExcMatch = text.match(/Exception Type:\s*([^\n\r]+)/i);
  const androidFatalMatch = text.match(/(?:Caused by:|FATAL EXCEPTION:[^\n]*\n[^\n]*?:\s*)?([a-zA-Z0-9_$.]*(?:Exception|Error|ANR)[^\n\r]*)/);
  const anrMatch = text.match(/(ANR in [^\n\r]+)/i);

  if (iosExcMatch?.[1]) {
    signalOrException = iosExcMatch[1].trim();
  } else if (anrMatch?.[1]) {
    signalOrException = anrMatch[1].trim();
  } else if (androidFatalMatch?.[1]) {
    signalOrException = androidFatalMatch[1].trim();
  }

  // Extract thread summary & main thread detection
  const threadMatch =
    text.match(/Triggered by Thread:\s*([^\n\r]+)/i) ||
    text.match(/Process:\s*[^,]+,\s*PID:\s*\d+/i) ||
    text.match(/Thread\s+\d+\s+(?:Crashed|name="([^"]+)")/i);

  const isMainThreadIssue =
    /thread 0 crashed|com\.apple\.main-thread|process:\s*[^,]+.*main|main" prio=|networkonmainthreadexception|anr in /i.test(
      lower
    );

  const threadSummary = threadMatch
    ? threadMatch[0].trim()
    : isMainThreadIssue
      ? 'Main / UI Thread'
      : 'Background Worker Thread';

  const frames: CrashFrame[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    // iOS backtrace line: "0   CheckoutApp   0x0000000104a2b1c0 CheckoutViewModel.submitOrder() + 148 (CheckoutViewModel.swift:42)"
    const iosFrame = line.match(
      /^\s*(\d+)\s+([^\s]+)\s+0x[0-9a-f]+\s+(.+?)(?:\s+\(([^)]+)\))?\s*$/i
    );
    if (iosFrame) {
      const moduleName = iosFrame[2];
      const isAppFrame =
        !/(libsystem|libobjc|UIKitCore|UIKit|SwiftUI|CoreFoundation|Foundation|CoreData|Combine|CoreLocation|CoreGraphics|QuartzCore|AVFoundation|CFNetwork|Network|Security|Metal|dyld|libdispatch|libswift)/i.test(
          moduleName
        );
      frames.push({
        index: Number(iosFrame[1]),
        module: moduleName,
        symbol: iosFrame[3].trim(),
        location: iosFrame[4]?.trim() || 'system binary',
        isAppFrame,
      });
      continue;
    }

    // Android stack line: "at com.bridgelab.feed.FeedRepository.sync(FeedRepository.kt:54)"
    const androidFrame = line.match(/^\s*at\s+([a-zA-Z0-9_$.<>-]+)\(([^)]+)\)\s*$/);
    if (androidFrame) {
      const fullSymbol = androidFrame[1];
      const parts = fullSymbol.split('.');
      const moduleName = parts.slice(0, Math.min(3, parts.length - 1)).join('.') || 'app';
      const isAppFrame =
        !/(^(android\.|androidx\.|java\.|javax\.|kotlin\.|kotlinx\.|dalvik\.|com\.android\.))/.test(
          fullSymbol
        );
      frames.push({
        index: frames.length,
        module: moduleName,
        symbol: parts.slice(-2).join('.'),
        location: androidFrame[2],
        isAppFrame,
      });
    }
  }

  return {
    platform,
    signalOrException,
    threadSummary,
    isMainThreadIssue,
    frames: frames.slice(0, 14),
  };
}

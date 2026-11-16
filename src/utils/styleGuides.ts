import type { MobileLanguage, MobilePlatform, StyleGuide, StyleGuideScope } from '../types/mobile';

export function getApplicableStyleGuides(
  guides: StyleGuide[],
  platform: MobilePlatform,
  language: MobileLanguage
): StyleGuide[] {
  return guides.filter((guide) => {
    if (!guide.isActive) return false;
    return (
      guide.scope === 'all' ||
      guide.scope === platform ||
      guide.scope === language
    );
  });
}

export function formatStyleGuidesForPrompt(guides: StyleGuide[]): string {
  if (guides.length === 0) return '';

  return guides
    .map((guide, index) => {
      const truncated = guide.rulesMarkdown.trim().slice(0, 4000);
      return `### Style Guide ${index + 1}: ${guide.name} (Scope: ${guide.scope})\n${truncated}`;
    })
    .join('\n\n');
}

export function inferScopeFromStyleGuideFile(
  fileName: string,
  content: string
): StyleGuideScope {
  const lowerName = fileName.toLowerCase();
  const lowerContent = content.toLowerCase();

  if (lowerName.includes('swift') || /\bswiftlint\b|guard let|@mainactor/i.test(lowerContent)) {
    return 'swift';
  }
  if (
    lowerName.includes('clang') ||
    lowerName.includes('objc') ||
    /ns_assume_nonnull|@property\s*\(|__weak/i.test(lowerContent)
  ) {
    return 'objc';
  }
  if (
    lowerName.includes('detekt') ||
    lowerName.includes('ktlint') ||
    lowerName.includes('kotlin') ||
    /\bviewModelScope\b|\bcomposable\b|\bcoroutine\b/i.test(lowerContent)
  ) {
    return 'kotlin';
  }
  if (lowerName.includes('ios') || lowerName.includes('xcode')) {
    return 'ios';
  }
  if (lowerName.includes('android') || lowerName.includes('gradle')) {
    return 'android';
  }
  return 'all';
}

export function formatGuideTitleFromFilename(fileName: string): string {
  const base = fileName.replace(/^\.+/, '').replace(/\.[^.]+$/, '');
  const words = base
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? `${words.join(' ')} Style Guide` : 'Uploaded Style Guide';
}

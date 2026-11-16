import { useState } from 'react';
import { ArrowLeftRight, Check, Copy } from 'lucide-react';
import type { MobilePlatform, MobileProjectFile, ParityTranslation, StyleGuide } from '../types/mobile';
import { formatStyleGuidesForPrompt, getApplicableStyleGuides } from '../utils/styleGuides';

interface ParityTranslatorViewProps {
  activeFile: MobileProjectFile;
  styleGuides: StyleGuide[];
}

export function ParityTranslatorView({ activeFile, styleGuides }: ParityTranslatorViewProps) {
  const [sourceCode, setSourceCode] = useState(activeFile.code);
  const [sourcePlatform, setSourcePlatform] = useState<MobilePlatform>(activeFile.platform);
  const [sourceLanguage, setSourceLanguage] = useState(activeFile.language);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParityTranslation | null>(null);
  const [copied, setCopied] = useState(false);

  const targetPlatform: MobilePlatform = sourcePlatform === 'ios' ? 'android' : 'ios';

  const handleLoadActiveFile = () => {
    setSourceCode(activeFile.code);
    setSourcePlatform(activeFile.platform);
    setSourceLanguage(activeFile.language);
    setResult(null);
  };

  const handleTranslate = async () => {
    if (!sourceCode.trim()) return;
    setIsTranslating(true);
    setError(null);

    try {
      const targetLang = targetPlatform === 'ios' ? 'swift' : 'kotlin';
      const targetGuides = getApplicableStyleGuides(styleGuides, targetPlatform, targetLang);
      const styleGuidesText = formatStyleGuidesForPrompt(targetGuides);

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode,
          sourcePlatform,
          sourceLanguage,
          targetPlatform,
          styleGuidesText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Cross-platform translation failed.');
      }

      setResult(data as ParityTranslation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to translate code.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.translatedCode) return;
    await navigator.clipboard.writeText(result.translatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
            iOS &harr; Android Feature Parity Translator
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Convert Swift or Objective-C modules to idiomatic Kotlin/Jetpack Compose (or Android to Swift 6) while preserving concurrency and lifecycle guarantees.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleLoadActiveFile}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Load {activeFile.name}
          </button>
          <button
            type="button"
            onClick={handleTranslate}
            disabled={isTranslating || !sourceCode.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {isTranslating
                ? 'Translating…'
                : `Convert to ${targetPlatform === 'ios' ? 'Swift 6 (iOS)' : 'Kotlin (Android)'}`}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 text-xs text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Pane */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Source ({sourcePlatform === 'ios' ? 'iOS' : 'Android'})
            </span>
            <select
              aria-label="Source platform and language"
              value={`${sourcePlatform}:${sourceLanguage}`}
              onChange={(e) => {
                const [plat, lang] = e.target.value.split(':') as [
                  MobilePlatform,
                  'swift' | 'objc' | 'kotlin',
                ];
                setSourcePlatform(plat);
                setSourceLanguage(lang);
              }}
              className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
            >
              <option value="ios:swift">iOS · Swift</option>
              <option value="ios:objc">iOS · Objective-C</option>
              <option value="android:kotlin">Android · Kotlin</option>
            </select>
          </div>
          <textarea
            aria-label="Source code to translate"
            rows={18}
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
            spellCheck={false}
            className="w-full p-4 font-mono text-xs leading-5 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 resize-none focus:outline-none"
          />
        </div>

        {/* Target Pane */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Idiomatic {targetPlatform === 'ios' ? 'Swift 6 / SwiftUI (iOS)' : 'Kotlin 2.1 / Compose (Android)'}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!result?.translatedCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy Output</span>
                </>
              )}
            </button>
          </div>
          <pre className="flex-1 p-4 font-mono text-xs leading-5 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 overflow-auto min-h-[360px] whitespace-pre-wrap">
            {isTranslating
              ? 'Mapping lifecycle, state management, and concurrency primitives with Gemini 4…'
              : result?.translatedCode || 'Converted code will appear here.'}
          </pre>
        </div>
      </div>

      {/* State Mapping & Edge Cases */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Architectural State & Concurrency Mapping
              </h2>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {result.stateMappingNotes.map((note, idx) => (
                <div key={idx} className="p-4 space-y-1">
                  <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {note.sourcePattern} &rarr; {note.targetPattern}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {note.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Platform Edge-Case Warnings
            </h2>
            <ul className="list-disc pl-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {result.edgeCaseWarnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

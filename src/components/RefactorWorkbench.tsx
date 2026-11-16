import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Info,
  Play,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type {
  LiveDiagnosticIssue,
  LiveIssueCategory,
  MobileProjectFile,
  ReasoningDepth,
  RefactorResult,
  StyleGuide,
} from '../types/mobile';
import { computeLineDiff } from '../utils/diff';
import { runInstantStaticAnalysis } from '../utils/staticAnalyzer';
import { formatStyleGuidesForPrompt } from '../utils/styleGuides';

interface RefactorWorkbenchProps {
  file: MobileProjectFile;
  onUpdateCode: (fileId: string, newCode: string) => void;
  activeGuides: StyleGuide[];
  onOpenStyleGuides: () => void;
  // Streaming refactor state managed by parent so TopBar CTA can trigger it too
  instruction: string;
  onChangeInstruction: (value: string) => void;
  reasoningDepth: ReasoningDepth;
  onChangeReasoningDepth: (depth: ReasoningDepth) => void;
  isStreaming: boolean;
  streamError: string | null;
  refactorOutput: RefactorResult | null;
  streamingPartialCode: string;
  streamingSummary: string;
  onRunRefactor: (overrideInstruction?: string) => void;
  onApplyRefactor: () => void;
}

const QUICK_PRESETS = [
  {
    label: 'Fix Memory & ARC Leaks',
    prompt:
      'Eliminate all retain cycles, strong self captures in blocks/closures, and unstructured coroutine leaks.',
  },
  {
    label: 'Main-Thread & Concurrency',
    prompt:
      'Isolate UI/CoreData/Room mutations to safe actors or dispatchers and modernize to structured concurrency.',
  },
  {
    label: 'Enforce Style Guides',
    prompt:
      'Audit and refactor this file to strictly comply with all active team code style guides and best practices.',
  },
];

function renderInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function RefactorWorkbench({
  file,
  onUpdateCode,
  activeGuides,
  onOpenStyleGuides,
  instruction,
  onChangeInstruction,
  reasoningDepth,
  onChangeReasoningDepth,
  isStreaming,
  streamError,
  refactorOutput,
  streamingPartialCode,
  streamingSummary,
  onRunRefactor,
  onApplyRefactor,
}: RefactorWorkbenchProps) {
  const [rightTab, setRightTab] = useState<'diff' | 'code' | 'findings'>('diff');
  const [liveScanEnabled, setLiveScanEnabled] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | LiveIssueCategory>('all');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [aiIssues, setAiIssues] = useState<LiveDiagnosticIssue[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [appliedFlash, setAppliedFlash] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  // Instant 0ms deterministic static scan on every keystroke
  const staticIssues = useMemo(
    () => runInstantStaticAnalysis(file.code, file.language),
    [file.code, file.language]
  );

  // Debounced real-time Gemini 4 AI analysis as the developer types
  const styleGuidesPromptText = useMemo(
    () => formatStyleGuidesForPrompt(activeGuides),
    [activeGuides]
  );

  const triggerAiAnalysis = async (signal?: AbortSignal) => {
    if (!file.code.trim()) {
      setAiIssues([]);
      setAiSummary('');
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          code: file.code,
          language: file.language,
          platform: file.platform,
          fileName: file.name,
          styleGuidesText: styleGuidesPromptText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Real-time AI analysis failed.');
      }

      const incoming: LiveDiagnosticIssue[] = Array.isArray(data.issues)
        ? data.issues.map((item: Partial<LiveDiagnosticIssue>, idx: number) => ({
            id: `g4-${file.id}-${idx}-${item.line ?? 1}`,
            line: Number(item.line) || 1,
            category: (item.category as LiveIssueCategory) || 'best-practice',
            severity: item.severity || 'warning',
            title: item.title || 'Gemini 4 Diagnostic',
            explanation: item.explanation || '',
            suggestion: item.suggestion || '',
            ruleRef: item.ruleRef,
            source: 'gemini-4',
          }))
        : [];

      setAiIssues(incoming);
      setAiSummary(data.summary || '');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setAnalyzeError(err instanceof Error ? err.message : 'Unable to run Gemini 4 scan.');
    } finally {
      if (!signal?.aborted) {
        setIsAnalyzing(false);
      }
    }
  };

  useEffect(() => {
    // Clear stale AI issues immediately when switching files
    setAiIssues([]);
    setAiSummary('');
    setAnalyzeError(null);
    setHighlightedLine(null);
  }, [file.id]);

  useEffect(() => {
    if (!liveScanEnabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void triggerAiAnalysis(controller.signal);
    }, 1000);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, file.code, file.language, styleGuidesPromptText, liveScanEnabled]);

  const combinedDiagnostics = useMemo(() => {
    const merged: LiveDiagnosticIssue[] = [...staticIssues];
    for (const aiItem of aiIssues) {
      const overlaps = merged.some(
        (existing) =>
          Math.abs(existing.line - aiItem.line) <= 1 &&
          existing.category === aiItem.category
      );
      if (!overlaps) {
        merged.push(aiItem);
      }
    }
    return merged.sort((a, b) => a.line - b.line);
  }, [staticIssues, aiIssues]);

  const filteredDiagnostics = useMemo(() => {
    if (categoryFilter === 'all') return combinedDiagnostics;
    return combinedDiagnostics.filter((d) => d.category === categoryFilter);
  }, [combinedDiagnostics, categoryFilter]);

  const candidateRefactoredCode = refactorOutput?.refactoredCode || streamingPartialCode;

  const diffData = useMemo(() => {
    if (!candidateRefactoredCode) return null;
    return computeLineDiff(file.code, candidateRefactoredCode);
  }, [file.code, candidateRefactoredCode]);

  const lineCount = useMemo(
    () => Math.max(1, file.code.replace(/\r\n/g, '\n').split('\n').length),
    [file.code]
  );

  const handleJumpToLine = (lineNumber: number) => {
    setHighlightedLine(lineNumber);
    const textarea = editorRef.current;
    if (!textarea) return;
    const lines = file.code.split('\n');
    const targetIdx = Math.max(0, Math.min(lineNumber - 1, lines.length - 1));
    let charPos = 0;
    for (let i = 0; i < targetIdx; i++) {
      charPos += lines[i].length + 1;
    }
    textarea.focus();
    textarea.setSelectionRange(charPos, charPos + (lines[targetIdx]?.length ?? 0));
    const approxLineHeight = 20;
    textarea.scrollTop = Math.max(0, targetIdx * approxLineHeight - 80);
  };

  const handleCopyRefactored = async () => {
    if (!candidateRefactoredCode) return;
    await navigator.clipboard.writeText(candidateRefactoredCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleApplyClick = () => {
    onApplyRefactor();
    setAppliedFlash(true);
    setTimeout(() => setAppliedFlash(false), 2000);
  };

  const renderSeverityIcon = (severity: LiveDiagnosticIssue['severity']) => {
    if (severity === 'critical') {
      return <ShieldAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />;
    }
    if (severity === 'warning') {
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />;
    }
    return <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />;
  };

  const formatCategoryLabel = (cat: LiveIssueCategory) => {
    if (cat === 'best-practice') return 'Best Practice';
    if (cat === 'style-guide') return 'Style Guide';
    if (cat === 'optimization') return 'Optimization';
    return 'Error';
  };

  return (
    <div className="flex-1 flex flex-col xl:flex-row min-h-0 overflow-hidden">
      {/* LEFT PANE: Editor + Real-Time As-You-Type Analyzer */}
      <section
        aria-label="Source code editor and real-time analysis"
        className="flex-1 flex flex-col min-w-0 min-h-0 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-800"
      >
        {/* File Context Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold truncate">
                {file.path}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{file.framework}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onOpenStyleGuides}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                {activeGuides.length} active style {activeGuides.length === 1 ? 'guide' : 'guides'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={liveScanEnabled}
                onChange={(e) => setLiveScanEnabled(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <span>Live AI Scan</span>
            </label>
            <button
              type="button"
              onClick={() => void triggerAiAnalysis()}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isAnalyzing ? 'Scanning…' : 'Scan Now'}</span>
            </button>
          </div>
        </div>

        {/* Line-Numbered Code Editor */}
        <div className="flex-1 min-h-[260px] flex bg-slate-50 dark:bg-[#0B0F17] overflow-hidden relative">
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="w-12 py-3 px-2 text-right font-mono text-xs leading-5 text-slate-400 dark:text-slate-600 select-none overflow-hidden border-r border-slate-200 dark:border-slate-800/80 bg-slate-100/60 dark:bg-[#0E131D]"
          >
            {Array.from({ length: lineCount }, (_, idx) => {
              const lineNum = idx + 1;
              const hasIssue = combinedDiagnostics.some((d) => d.line === lineNum);
              const isHighlighted = highlightedLine === lineNum;
              return (
                <div
                  key={lineNum}
                  className={`pr-1 tabular-nums ${
                    isHighlighted
                      ? 'text-blue-600 dark:text-blue-400 font-semibold'
                      : hasIssue
                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                        : ''
                  }`}
                >
                  {lineNum}
                </div>
              );
            })}
          </div>
          <textarea
            ref={editorRef}
            aria-label={`Source code editor for ${file.name}`}
            value={file.code}
            spellCheck={false}
            onScroll={(e) => {
              if (gutterRef.current) {
                gutterRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
            onChange={(e) => onUpdateCode(file.id, e.target.value)}
            className="flex-1 w-full h-full p-3 font-mono text-xs leading-5 bg-transparent text-slate-900 dark:text-slate-100 resize-none focus:outline-none overflow-auto whitespace-pre"
          />
        </div>

        {/* Real-Time Code Analysis Panel */}
        <div className="h-[240px] shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <h3 className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                Real-Time Analysis ({combinedDiagnostics.length})
              </h3>
              {isAnalyzing && (
                <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  Gemini 4 scanning…
                </span>
              )}
              {!isAnalyzing && aiSummary && (
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                  {aiSummary}
                </span>
              )}
            </div>

            {/* Category filter segmented control */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'error', label: 'Errors' },
                  { id: 'optimization', label: 'Optimizations' },
                  { id: 'best-practice', label: 'Best Practices' },
                  { id: 'style-guide', label: 'Style Guide' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    categoryFilter === cat.id
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800/80">
            {analyzeError && (
              <div className="px-4 py-2.5 text-xs text-red-600 dark:text-red-400 bg-red-500/5">
                {analyzeError}
              </div>
            )}
            {filteredDiagnostics.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {isAnalyzing
                  ? 'Scanning Objective-C / Swift / Kotlin patterns with Gemini 4…'
                  : 'No issues matched this filter. Edit code above to trigger real-time diagnostics.'}
              </div>
            ) : (
              filteredDiagnostics.map((issue) => (
                <div
                  key={issue.id}
                  className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex items-start justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => handleJumpToLine(issue.line)}
                    className="text-left flex-1 min-w-0 focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {renderSeverityIcon(issue.severity)}
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {renderInlineCode(issue.title)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        Line {issue.line} · {formatCategoryLabel(issue.category)} ·{' '}
                        {issue.source === 'gemini-4' ? 'Gemini 4' : 'Instant Check'}
                        {issue.ruleRef ? ` · ${issue.ruleRef}` : ''}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {renderInlineCode(issue.explanation)}{' '}
                      <span className="text-slate-800 dark:text-slate-200 font-medium">
                        Fix: {renderInlineCode(issue.suggestion)}
                      </span>
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const prompt = `Fix line ${issue.line}: ${issue.title}. ${issue.suggestion}`;
                      onChangeInstruction(prompt);
                      onRunRefactor(prompt);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-600/10 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Wrench className="w-3 h-3" aria-hidden="true" />
                    <span>Fix</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* RIGHT PANE: Refactoring Controls & Streaming Unified Diff */}
      <section
        aria-label="Gemini 4 refactoring and diff output"
        className="w-full xl:w-[48%] flex flex-col min-w-0 min-h-0 bg-white dark:bg-[#0E131D]"
      >
        {/* Refactor Instruction Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChangeInstruction(preset.prompt);
                    onRunRefactor(preset.prompt);
                  }}
                  disabled={isStreaming}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Reasoning Depth Selector */}
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <label htmlFor="reasoning-depth-select" className="sr-only">
                Gemini 4 reasoning depth
              </label>
              <select
                id="reasoning-depth-select"
                value={reasoningDepth}
                onChange={(e) => onChangeReasoningDepth(e.target.value as ReasoningDepth)}
                className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
              >
                <option value="low">Depth: Fast (Low)</option>
                <option value="medium">Depth: Balanced</option>
                <option value="high">Depth: Deep (High)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={instruction}
              onChange={(e) => onChangeInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isStreaming) {
                  onRunRefactor();
                }
              }}
              aria-label="Custom refactoring instruction"
              placeholder="Describe refactoring goal (e.g. Migrate Combine to async/await @MainActor)…"
              className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => onRunRefactor()}
              disabled={isStreaming}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isStreaming ? 'Streaming…' : 'Refactor'}</span>
            </button>
          </div>
        </div>

        {/* Output Header Bar */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-[#111827]">
          <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-900 rounded-lg">
            {(
              [
                { id: 'diff', label: 'Unified Diff' },
                { id: 'code', label: 'Refactored Code' },
                {
                  id: 'findings',
                  label: `Findings (${refactorOutput?.findings.length ?? 0})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  rightTab === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {diffData && (
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{diffData.stats.added}
                </span>{' '}
                /{' '}
                <span className="text-red-600 dark:text-red-400">
                  -{diffData.stats.removed}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={handleCopyRefactored}
              disabled={!candidateRefactoredCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleApplyClick}
              disabled={!refactorOutput?.refactoredCode || isStreaming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{appliedFlash ? 'Applied!' : 'Apply Refactor'}</span>
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {streamError && (
          <div
            role="alert"
            className="mx-4 mt-3 px-4 py-3 text-xs text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg"
          >
            {streamError}
          </div>
        )}

        {/* Executive Summary Strip */}
        {(refactorOutput?.summary || streamingSummary) && (
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-blue-600/5 text-xs text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">Summary: </span>
            {refactorOutput?.summary || streamingSummary}
          </div>
        )}

        {/* Output Viewport */}
        <div className="flex-1 overflow-auto">
          {isStreaming && !candidateRefactoredCode ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>
                  Gemini 4 is analyzing {file.name} and streaming refactored output…
                </span>
              </div>
              <div className="space-y-2.5 animate-pulse">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                <div className="h-32 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg mt-4" />
                <div className="h-24 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg" />
              </div>
            </div>
          ) : !candidateRefactoredCode && !isStreaming ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-3" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Ready for Gemini 4 Mobile Refactoring
              </h3>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                Select a quick preset above or click <strong className="text-slate-800 dark:text-slate-200">Run Gemini 4</strong> to stream a safe, style-guide compliant refactor with a line-by-line unified diff.
              </p>
              <button
                type="button"
                onClick={() => onRunRefactor()}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <span>Analyze & Refactor {file.name}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : rightTab === 'diff' && diffData ? (
            <div className="font-mono text-xs leading-5">
              {diffData.lines.map((line, index) => {
                const bgClass =
                  line.type === 'added'
                    ? 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                    : line.type === 'removed'
                      ? 'bg-red-500/10 text-red-900 dark:text-red-200'
                      : 'text-slate-700 dark:text-slate-300';
                const marker =
                  line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
                return (
                  <div
                    key={`${index}-${line.oldLineNumber}-${line.newLineNumber}`}
                    className={`flex items-stretch px-2 border-b border-slate-100/60 dark:border-slate-800/30 ${bgClass}`}
                  >
                    <span className="w-10 shrink-0 text-right pr-2 text-slate-400 dark:text-slate-600 select-none tabular-nums">
                      {line.oldLineNumber ?? ''}
                    </span>
                    <span className="w-10 shrink-0 text-right pr-2 text-slate-400 dark:text-slate-600 select-none tabular-nums">
                      {line.newLineNumber ?? ''}
                    </span>
                    <span className="w-5 shrink-0 text-center select-none font-bold">
                      {marker}
                    </span>
                    <pre className="flex-1 whitespace-pre-wrap break-all py-0.5">
                      {line.content || ' '}
                    </pre>
                  </div>
                );
              })}
            </div>
          ) : rightTab === 'code' ? (
            <pre className="p-4 font-mono text-xs leading-5 text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
              {candidateRefactoredCode || 'Streaming refactored output…'}
            </pre>
          ) : (
            <div className="p-4 space-y-3">
              {refactorOutput?.findings.map((finding, idx) => (
                <div
                  key={`${finding.title}-${idx}`}
                  className="p-4 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {finding.title}
                    </span>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        finding.severity === 'critical'
                          ? 'text-red-600 dark:text-red-400'
                          : finding.severity === 'warning'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {finding.severity.toUpperCase()} · Lines {finding.lineRange}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Impact: {finding.ecosystemImpact}
                    {finding.styleRuleApplied ? ` · Style Rule: ${finding.styleRuleApplied}` : ''}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {finding.explanation}
                  </p>
                </div>
              ))}

              {refactorOutput?.verificationChecklist &&
                refactorOutput.verificationChecklist.length > 0 && (
                  <div className="p-4 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl">
                    <h4 className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                      Verification Checklist
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                      {refactorOutput.verificationChecklist.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

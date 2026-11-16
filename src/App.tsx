import { useEffect, useMemo, useRef, useState } from 'react';
import { CrashDebuggerView } from './components/CrashDebuggerView';
import { HistoryView } from './components/HistoryView';
import { ParityTranslatorView } from './components/ParityTranslatorView';
import { ProjectSidebar } from './components/ProjectSidebar';
import { RefactorWorkbench } from './components/RefactorWorkbench';
import { StyleGuidesView } from './components/StyleGuidesView';
import { TopBar } from './components/TopBar';
import { INITIAL_MOBILE_FILES } from './data/mobilePresets';
import { INITIAL_STYLE_GUIDES } from './data/styleGuidePresets';
import type {
  HistoryEntry,
  MobileProjectFile,
  ReasoningDepth,
  RefactorResult,
  StyleGuide,
  WorkspaceTab,
} from './types/mobile';
import { computeLineDiff, parseRefactorOutput } from './utils/diff';
import { formatStyleGuidesForPrompt, getApplicableStyleGuides } from './utils/styleGuides';

const STYLE_GUIDES_STORAGE_KEY = 'bridgelab_style_guides_v1';
const HISTORY_STORAGE_KEY = 'bridgelab_history_v1';
const THEME_STORAGE_KEY = 'bridgelab_theme_v1';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [files, setFiles] = useState<MobileProjectFile[]>(INITIAL_MOBILE_FILES);
  const [activeFileId, setActiveFileId] = useState<string>(INITIAL_MOBILE_FILES[0].id);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('refactor');

  const [styleGuides, setStyleGuides] = useState<StyleGuide[]>(() => {
    try {
      const raw = localStorage.getItem(STYLE_GUIDES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback to starter presets
    }
    return INITIAL_STYLE_GUIDES;
  });

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Empty history
    }
    return [];
  });

  // Streaming refactor state
  const [instruction, setInstruction] = useState('');
  const [reasoningDepth, setReasoningDepth] = useState<ReasoningDepth>('medium');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [refactorOutput, setRefactorOutput] = useState<RefactorResult | null>(null);
  const [streamingPartialCode, setStreamingPartialCode] = useState('');
  const [streamingSummary, setStreamingSummary] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? files[0],
    [files, activeFileId]
  );

  const activeGuidesForFile = useMemo(
    () => getApplicableStyleGuides(styleGuides, activeFile.platform, activeFile.language),
    [styleGuides, activeFile.platform, activeFile.language]
  );

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STYLE_GUIDES_STORAGE_KEY, JSON.stringify(styleGuides));
    } catch {
      // Ignore storage quota errors
    }
  }, [styleGuides]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  const handleSelectFile = (fileId: string) => {
    setActiveFileId(fileId);
    setRefactorOutput(null);
    setStreamingPartialCode('');
    setStreamingSummary('');
    setStreamError(null);
  };

  const handleUpdateFileCode = (fileId: string, newCode: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, code: newCode } : f))
    );
  };

  const handleAddFile = (newFile: MobileProjectFile) => {
    setFiles((prev) => [newFile, ...prev]);
  };

  const runStreamingRefactor = async (overrideInstruction?: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setActiveTab('refactor');
    setIsStreaming(true);
    setStreamError(null);
    setRefactorOutput(null);
    setStreamingPartialCode('');
    setStreamingSummary('');

    const styleGuidesText = formatStyleGuidesForPrompt(activeGuidesForFile);

    try {
      const response = await fetch('/api/refactor/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          code: activeFile.code,
          language: activeFile.language,
          platform: activeFile.platform,
          framework: activeFile.framework,
          fileName: activeFile.name,
          instruction: (overrideInstruction ?? instruction).trim(),
          reasoningDepth,
          styleGuidesText,
        }),
      });

      if (!response.ok || !response.body) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || 'Failed to start Gemini 4 stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() ?? '';

        for (const evt of events) {
          const line = evt
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!line) continue;

          const payload = JSON.parse(line.slice(6)) as {
            type: 'chunk' | 'done' | 'error';
            text?: string;
            message?: string;
          };

          if (payload.type === 'error') {
            throw new Error(payload.message || 'Streaming error from Gemini 4.');
          }

          if (payload.type === 'chunk' && payload.text) {
            accumulatedText += payload.text;
            const parsed = parseRefactorOutput(accumulatedText);
            if (parsed.summary) setStreamingSummary(parsed.summary);
            if (parsed.refactoredCode) setStreamingPartialCode(parsed.refactoredCode);
            if (parsed.isCompleteJson) {
              setRefactorOutput({
                summary: parsed.summary,
                refactoredCode: parsed.refactoredCode,
                findings: parsed.findings,
                verificationChecklist: parsed.verificationChecklist,
              });
            }
          }
        }
      }

      const finalParsed = parseRefactorOutput(accumulatedText);
      if (finalParsed.refactoredCode) {
        setRefactorOutput({
          summary: finalParsed.summary || 'Refactoring completed.',
          refactoredCode: finalParsed.refactoredCode,
          findings: finalParsed.findings,
          verificationChecklist: finalParsed.verificationChecklist,
        });
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setStreamError(err instanceof Error ? err.message : 'Unable to complete refactoring.');
    } finally {
      if (!controller.signal.aborted) {
        setIsStreaming(false);
      }
    }
  };

  const handleApplyRefactor = () => {
    if (!refactorOutput?.refactoredCode) return;
    const previousCode = activeFile.code;
    const appliedCode = refactorOutput.refactoredCode;
    const { stats } = computeLineDiff(previousCode, appliedCode);

    handleUpdateFileCode(activeFile.id, appliedCode);

    const entry: HistoryEntry = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'refactor',
      fileName: activeFile.name,
      platform: activeFile.platform,
      summary: refactorOutput.summary || 'Applied Gemini 4 refactoring',
      addedLines: stats.added,
      removedLines: stats.removed,
      previousCode,
      appliedCode,
      reverted: false,
    };
    setHistory((prev) => [entry, ...prev]);
  };

  const handleApplyCrashPatch = (fileId: string, patchedCode: string, summary: string) => {
    const target = files.find((f) => f.id === fileId);
    if (!target) return;
    const previousCode = target.code;
    const { stats } = computeLineDiff(previousCode, patchedCode);

    handleUpdateFileCode(fileId, patchedCode);

    const entry: HistoryEntry = {
      id: `patch-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'debug_patch',
      fileName: target.name,
      platform: target.platform,
      summary: `Crash Patch: ${summary}`,
      addedLines: stats.added,
      removedLines: stats.removed,
      previousCode,
      appliedCode: patchedCode,
      reverted: false,
    };
    setHistory((prev) => [entry, ...prev]);
  };

  const handleRevertHistoryEntry = (entryId: string) => {
    const entry = history.find((h) => h.id === entryId);
    if (!entry || entry.reverted) return;

    const target = files.find((f) => f.name === entry.fileName && f.platform === entry.platform);
    if (target) {
      handleUpdateFileCode(target.id, entry.previousCode);
      setActiveFileId(target.id);
    }

    setHistory((prev) =>
      prev.map((h) => (h.id === entryId ? { ...h, reverted: true } : h))
    );
  };

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPrimaryAction={() => void runStreamingRefactor()}
        isBusy={isStreaming}
        historyCount={history.length}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <ProjectSidebar
          files={files}
          activeFileId={activeFile.id}
          onSelectFile={(id) => {
            handleSelectFile(id);
            if (activeTab === 'history' || activeTab === 'style-guides') {
              setActiveTab('refactor');
            }
          }}
          onAddFile={handleAddFile}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {activeTab === 'refactor' && (
            <RefactorWorkbench
              file={activeFile}
              onUpdateCode={handleUpdateFileCode}
              activeGuides={activeGuidesForFile}
              onOpenStyleGuides={() => setActiveTab('style-guides')}
              instruction={instruction}
              onChangeInstruction={setInstruction}
              reasoningDepth={reasoningDepth}
              onChangeReasoningDepth={setReasoningDepth}
              isStreaming={isStreaming}
              streamError={streamError}
              refactorOutput={refactorOutput}
              streamingPartialCode={streamingPartialCode}
              streamingSummary={streamingSummary}
              onRunRefactor={(override) => void runStreamingRefactor(override)}
              onApplyRefactor={handleApplyRefactor}
            />
          )}

          {activeTab === 'debugger' && (
            <CrashDebuggerView
              files={files}
              activeGuides={activeGuidesForFile}
              onApplyPatchToFile={handleApplyCrashPatch}
            />
          )}

          {activeTab === 'parity' && (
            <ParityTranslatorView activeFile={activeFile} styleGuides={styleGuides} />
          )}

          {activeTab === 'style-guides' && (
            <StyleGuidesView
              guides={styleGuides}
              onToggleActive={(id) =>
                setStyleGuides((prev) =>
                  prev.map((g) => (g.id === id ? { ...g, isActive: !g.isActive } : g))
                )
              }
              onAddGuide={(guide) => setStyleGuides((prev) => [guide, ...prev])}
              onUpdateGuide={(id, updates) =>
                setStyleGuides((prev) =>
                  prev.map((g) => (g.id === id ? { ...g, ...updates } : g))
                )
              }
              onDeleteGuide={(id) =>
                setStyleGuides((prev) => prev.filter((g) => g.id !== id))
              }
            />
          )}

          {activeTab === 'history' && (
            <HistoryView entries={history} onRevertEntry={handleRevertHistoryEntry} />
          )}
        </main>
      </div>
    </div>
  );
}

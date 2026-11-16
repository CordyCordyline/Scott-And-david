import { useMemo, useState } from 'react';
import { Bug, Check, MessageSquare, Send, ShieldAlert } from 'lucide-react';
import { CRASH_LOG_PRESETS } from '../data/mobilePresets';
import type {
  CrashDiagnosis,
  DebugChatMessage,
  MobileProjectFile,
  StyleGuide,
} from '../types/mobile';
import { parseCrashLogMetadata } from '../utils/diagnostics';
import { formatStyleGuidesForPrompt } from '../utils/styleGuides';

interface CrashDebuggerViewProps {
  files: MobileProjectFile[];
  activeGuides: StyleGuide[];
  onApplyPatchToFile: (fileId: string, patchedCode: string, summary: string) => void;
}

export function CrashDebuggerView({
  files,
  activeGuides,
  onApplyPatchToFile,
}: CrashDebuggerViewProps) {
  const [selectedPresetId, setSelectedPresetId] = useState(CRASH_LOG_PRESETS[0].id);
  const [crashLog, setCrashLog] = useState(CRASH_LOG_PRESETS[0].rawLog);
  const [linkedFileId, setLinkedFileId] = useState<string>(CRASH_LOG_PRESETS[0].linkedFileId);

  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<CrashDiagnosis | null>(null);
  const [patchApplied, setPatchApplied] = useState(false);

  const [chatMessages, setChatMessages] = useState<DebugChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  const crashMeta = useMemo(() => parseCrashLogMetadata(crashLog), [crashLog]);
  const linkedFile = files.find((f) => f.id === linkedFileId) ?? null;

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = CRASH_LOG_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setCrashLog(preset.rawLog);
      setLinkedFileId(preset.linkedFileId);
      setDiagnosis(null);
      setChatMessages([]);
      setDiagnosisError(null);
    }
  };

  const handleDiagnose = async () => {
    if (!crashLog.trim()) return;
    setIsDiagnosing(true);
    setDiagnosisError(null);
    setPatchApplied(false);

    try {
      const styleGuidesText = formatStyleGuidesForPrompt(activeGuides);
      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crashLog,
          sourceCode: linkedFile?.code ?? '',
          language: linkedFile?.language ?? (crashMeta.platform === 'android' ? 'kotlin' : 'swift'),
          platform: linkedFile?.platform ?? (crashMeta.platform === 'unknown' ? 'ios' : crashMeta.platform),
          fileName: linkedFile?.name ?? 'CrashContext',
          styleGuidesText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Crash diagnosis failed.');
      }

      setDiagnosis(data as CrashDiagnosis);
      setChatMessages([]);
    } catch (err) {
      setDiagnosisError(err instanceof Error ? err.message : 'Unable to diagnose crash log.');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleAskFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isSendingChat) return;

    const userMsg: DebugChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString(),
    };
    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const res = await fetch('/api/debug/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crashLog,
          sourceCode: linkedFile?.code ?? '',
          diagnosisSummary: diagnosis?.rootCause ?? crashMeta.signalOrException,
          history: updatedHistory,
          question: trimmed,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Follow-up query failed.');
      }

      const aiMsg: DebugChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.answer || '',
        timestamp: new Date().toLocaleTimeString(),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: DebugChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Unable to answer follow-up question.',
        timestamp: new Date().toLocaleTimeString(),
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSendingChat(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col xl:flex-row min-h-0 overflow-hidden">
      {/* Left: Crash Log Input & Parsed Stack Frames */}
      <section
        aria-label="Crash trace input and parsed frames"
        className="w-full xl:w-[46%] border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131D] flex flex-col min-h-0"
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-base font-bold text-slate-900 dark:text-slate-50">
              Mobile Crash & Logcat Debugger
            </h1>
            <button
              type="button"
              onClick={handleDiagnose}
              disabled={isDiagnosing || !crashLog.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Bug className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isDiagnosing ? 'Diagnosing…' : 'Diagnose Crash'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="crash-preset-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Sample Crash Report
              </label>
              <select
                id="crash-preset-select"
                value={selectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                {CRASH_LOG_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="crash-file-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Linked Source File
              </label>
              <select
                id="crash-file-select"
                value={linkedFileId}
                onChange={(e) => setLinkedFileId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="">None (Trace Only)</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.platform})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Editable Crash Log */}
        <div className="p-4 flex-1 flex flex-col min-h-[200px] overflow-hidden space-y-3">
          <label htmlFor="crash-log-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Xcode .crash / MetricKit / Android Logcat Trace
          </label>
          <textarea
            id="crash-log-input"
            value={crashLog}
            onChange={(e) => setCrashLog(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-3 font-mono text-xs leading-5 bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Instant Parsed Metadata + Stack Frames */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-[#111827] p-3 space-y-2 max-h-48 overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {crashMeta.signalOrException}
              </span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-slate-600 dark:text-slate-400">
                {crashMeta.platform.toUpperCase()} · {crashMeta.threadSummary}
              </span>
            </div>
            {crashMeta.frames.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                {crashMeta.frames.map((frame, i) => (
                  <div
                    key={`${frame.index}-${i}`}
                    className={`flex items-center justify-between gap-2 text-[11px] font-mono px-2 py-1 rounded ${
                      frame.isAppFrame
                        ? 'bg-red-500/10 text-red-700 dark:text-red-300 font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className="truncate">
                      #{frame.index} {frame.module} — {frame.symbol}
                    </span>
                    <span className="shrink-0 text-[10px]">{frame.location}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Right: Gemini 4 Root Cause Diagnosis, Patch & Interactive Chat */}
      <section
        aria-label="Crash root cause diagnosis and follow-up chat"
        className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-50/50 dark:bg-[#0B0F17] overflow-y-auto p-5 space-y-5"
      >
        {diagnosisError && (
          <div
            role="alert"
            className="px-4 py-3 text-xs text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg"
          >
            {diagnosisError}
          </div>
        )}

        {!diagnosis && !isDiagnosing && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <ShieldAlert className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-3" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              AI-Powered Stack Trace & ANR Diagnostics
            </h2>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
              Click <strong className="text-slate-800 dark:text-slate-200">Diagnose Crash</strong> to trace thread violations, ARC faults, or lifecycle exceptions back to the linked source file and generate a verified patch.
            </p>
          </div>
        )}

        {isDiagnosing && (
          <div className="p-6 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 animate-pulse">
            <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
          </div>
        )}

        {diagnosis && (
          <>
            {/* Root Cause Card */}
            <div className="p-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50">
                  {diagnosis.rootCause}
                </h2>
                <span className="text-xs font-semibold uppercase text-red-600 dark:text-red-400">
                  {diagnosis.severity} · {diagnosis.affectedComponent}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Lifecycle Trigger: <span className="text-slate-800 dark:text-slate-200">{diagnosis.lifecycleTrigger}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {diagnosis.explanation}
              </p>

              {diagnosis.verificationSteps.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                    Verification & Profiling Steps
                  </h3>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {diagnosis.verificationSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Generated Patch */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <span className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Recommended Fix {linkedFile ? `for ${linkedFile.name}` : ''}
                </span>
                {linkedFile && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyPatchToFile(linkedFile.id, diagnosis.patchedCode, diagnosis.rootCause);
                      setPatchApplied(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{patchApplied ? 'Patch Applied' : 'Apply Patch to File'}</span>
                  </button>
                )}
              </div>
              <pre className="p-4 font-mono text-xs leading-5 text-slate-900 dark:text-slate-100 overflow-x-auto max-h-72">
                {diagnosis.patchedCode}
              </pre>
            </div>

            {/* Interactive Debug Follow-up Q&A */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Ask Gemini 4 Follow-Up Questions</span>
              </div>

              {chatMessages.length > 0 && (
                <div className="space-y-2.5 max-h-56 overflow-y-auto">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600/10 text-slate-900 dark:text-slate-100 ml-8'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 mr-8'
                      }`}
                    >
                      <div className="text-[11px] font-semibold mb-1 text-slate-500 dark:text-slate-400">
                        {msg.role === 'user' ? 'You' : 'Gemini 4'} · {msg.timestamp}
                      </div>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAskFollowUp} className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  aria-label="Follow-up crash debugging question"
                  placeholder="Ask about Instruments profiling, OS versions, or thread locks…"
                  className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isSendingChat || !chatInput.trim()}
                  aria-label="Send follow-up question"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isSendingChat ? 'Sending…' : 'Ask'}</span>
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

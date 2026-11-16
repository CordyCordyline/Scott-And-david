import { Fragment, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { HistoryEntry } from '../types/mobile';

interface HistoryViewProps {
  entries: HistoryEntry[];
  onRevertEntry: (entryId: string) => void;
}

export function HistoryView({ entries, onRevertEntry }: HistoryViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
          Refactoring & Patch History
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Audit applied Gemini 4 refactors and crash patches across your iOS and Android files, or revert any change cleanly.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            No changes applied yet
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Run a refactor or diagnose a crash and click Apply to record an auditable change here.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">File</th>
                  <th className="py-2.5 px-4">Summary</th>
                  <th className="py-2.5 px-4 text-right">Delta</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        className="h-10 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                      >
                        <td className="py-2 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-4 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {entry.fileName} · {entry.platform.toUpperCase()}
                        </td>
                        <td className="py-2 px-4 text-slate-700 dark:text-slate-300 max-w-md truncate">
                          {entry.reverted ? `[Reverted] ${entry.summary}` : entry.summary}
                        </td>
                        <td className="py-2 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{entry.addedLines}
                          </span>{' '}
                          <span className="text-red-600 dark:text-red-400">
                            -{entry.removedLines}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              {isExpanded ? 'Hide Code' : 'Inspect'}
                            </button>
                            <button
                              type="button"
                              disabled={entry.reverted}
                              onClick={() => onRevertEntry(entry.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" aria-hidden="true" />
                              <span>{entry.reverted ? 'Reverted' : 'Revert'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${entry.id}-detail`}>
                          <td colSpan={5} className="p-4 bg-slate-50 dark:bg-[#0B0F17]">
                            <pre className="font-mono text-xs leading-5 text-slate-800 dark:text-slate-200 overflow-x-auto max-h-60 whitespace-pre-wrap">
                              {entry.appliedCode}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

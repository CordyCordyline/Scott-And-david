import { Sparkles } from 'lucide-react';
import type { WorkspaceTab } from '../types/mobile';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onPrimaryAction: () => void;
  isBusy: boolean;
  historyCount: number;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'refactor', label: 'Refactor' },
  { id: 'debugger', label: 'Debugger' },
  { id: 'parity', label: 'Parity' },
  { id: 'style-guides', label: 'Style Guides' },
  { id: 'history', label: 'History' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onPrimaryAction,
  isBusy,
  historyCount,
}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131D] px-4 lg:px-6 flex items-center justify-between gap-8">
      {/* Zone 1: Single-line Brand Wordmark */}
      <div className="flex items-center shrink-0">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0">
          BridgeLab
        </span>
      </div>

      {/* Zone 2: 5 concise single-line nav links */}
      <nav
        aria-label="Primary workspace navigation"
        className="flex items-center gap-1 sm:gap-5 overflow-x-auto"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const displayLabel =
            item.id === 'history' && historyCount > 0
              ? `${item.label} (${historyCount})`
              : item.label;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-2 px-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md ${
                isActive
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {displayLabel}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1 -bottom-[9px] h-0.5 bg-blue-600 dark:bg-blue-500"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={isBusy}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0E131D]"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isBusy ? 'Running Gemini 4…' : 'Run Gemini 4'}</span>
        </button>
      </div>
    </header>
  );
}

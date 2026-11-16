import { useRef, useState } from 'react';
import { Check, Plus, Trash2, Upload } from 'lucide-react';
import type { StyleGuide, StyleGuideScope } from '../types/mobile';
import {
  formatGuideTitleFromFilename,
  inferScopeFromStyleGuideFile,
} from '../utils/styleGuides';

interface StyleGuidesViewProps {
  guides: StyleGuide[];
  onToggleActive: (id: string) => void;
  onAddGuide: (guide: StyleGuide) => void;
  onUpdateGuide: (id: string, updates: Partial<StyleGuide>) => void;
  onDeleteGuide: (id: string) => void;
}

const SCOPE_OPTIONS: Array<{ value: StyleGuideScope; label: string }> = [
  { value: 'all', label: 'All Mobile (iOS & Android)' },
  { value: 'ios', label: 'iOS (Swift & Objective-C)' },
  { value: 'swift', label: 'Swift Only' },
  { value: 'objc', label: 'Objective-C Only' },
  { value: 'android', label: 'Android (Kotlin)' },
  { value: 'kotlin', label: 'Kotlin Only' },
];

export function StyleGuidesView({
  guides,
  onToggleActive,
  onAddGuide,
  onUpdateGuide,
  onDeleteGuide,
}: StyleGuidesViewProps) {
  const [selectedId, setSelectedId] = useState<string>(guides[0]?.id ?? '');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<StyleGuideScope>('ios');
  const [newRules, setNewRules] = useState('');
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedGuide = guides.find((g) => g.id === selectedId) ?? guides[0] ?? null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const inferredScope = inferScopeFromStyleGuideFile(file.name, content);
      const created: StyleGuide = {
        id: `guide-upload-${Date.now()}`,
        name: formatGuideTitleFromFilename(file.name),
        scope: inferredScope,
        rulesMarkdown: content,
        isActive: true,
        sourceType: 'uploaded',
        fileName: file.name,
        updatedAt: new Date().toISOString(),
      };
      onAddGuide(created);
      setSelectedId(created.id);
      setIsCreating(false);
      setUploadFeedback(`Uploaded "${file.name}" and activated for ${inferredScope} projects.`);
    } catch {
      setUploadFeedback('Could not read the selected file. Please upload UTF-8 text, Markdown, or YAML.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRules.trim()) return;

    const created: StyleGuide = {
      id: `guide-custom-${Date.now()}`,
      name: newName.trim(),
      scope: newScope,
      rulesMarkdown: newRules.trim(),
      isActive: true,
      sourceType: 'custom',
      updatedAt: new Date().toISOString(),
    };

    onAddGuide(created);
    setSelectedId(created.id);
    setNewName('');
    setNewRules('');
    setIsCreating(false);
    setUploadFeedback(`Saved custom style guide "${created.name}".`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
            Custom Code Style Guides
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Define or upload team conventions (.swiftlint.yml, .clang-format, detekt.yml, or Markdown) that Gemini 4 enforces during real-time analysis and refactoring.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.yml,.yaml,.json,.clang-format,.swiftlint,.editorconfig"
            onChange={handleFileUpload}
            className="hidden"
            id="style-guide-upload"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload Guide File</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreating((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isCreating ? 'Close Form' : 'New Style Guide'}</span>
          </button>
        </div>
      </div>

      {uploadFeedback && (
        <div
          role="status"
          className="flex items-center justify-between gap-4 px-4 py-3 text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 rounded-lg"
        >
          <span>{uploadFeedback}</span>
          <button
            type="button"
            onClick={() => setUploadFeedback(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {isCreating && (
        <form
          onSubmit={handleCreateCustom}
          className="p-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Create Custom Style Guide
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="guide-name-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Guide Name
              </label>
              <input
                id="guide-name-input"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. CorePayments Swift & Obj-C Convention"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="guide-scope-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Target Scope
              </label>
              <select
                id="guide-scope-select"
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as StyleGuideScope)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="guide-rules-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Style Rules & Conventions (Markdown, YAML, or plain text)
            </label>
            <textarea
              id="guide-rules-input"
              required
              rows={7}
              value={newRules}
              onChange={(e) => setNewRules(e.target.value)}
              placeholder="- Always mark SwiftUI ViewModels @MainActor&#10;- Prefer NS_ASSUME_NONNULL_BEGIN in Objective-C headers&#10;- Require explicit CancellationException rethrow in Kotlin coroutines"
              className="w-full px-3 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Save & Activate Guide
            </button>
          </div>
        </form>
      )}

      {/* Two-column Guide List + Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-2">
          {guides.length === 0 ? (
            <div className="p-6 text-center bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No style guides configured
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Upload a linter config or create a custom guide to enforce consistency.
              </p>
            </div>
          ) : (
            guides.map((guide) => {
              const isSelected = selectedGuide?.id === guide.id;
              return (
                <div
                  key={guide.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    isSelected
                      ? 'bg-white dark:bg-[#111827] border-blue-600/50 dark:border-blue-500/50'
                      : 'bg-white/60 dark:bg-[#111827]/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(guide.id)}
                      className="text-left flex-1 min-w-0 focus-visible:outline-none"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {guide.name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>Scope: {guide.scope}</span>
                        <span aria-hidden="true">·</span>
                        <span>{guide.sourceType}</span>
                        {guide.fileName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono truncate">{guide.fileName}</span>
                          </>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleActive(guide.id)}
                      aria-pressed={guide.isActive}
                      aria-label={`${guide.isActive ? 'Deactivate' : 'Activate'} ${guide.name}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        guide.isActive
                          ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {guide.isActive && <Check className="w-3 h-3" aria-hidden="true" />}
                      <span>{guide.isActive ? 'Active' : 'Inactive'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7">
          {selectedGuide ? (
            <div className="p-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {selectedGuide.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedGuide.isActive
                      ? 'Automatically injected into Gemini 4 analysis and refactoring prompts'
                      : 'Paused — activate to enforce in Gemini 4 prompts'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    aria-label="Style guide target scope"
                    value={selectedGuide.scope}
                    onChange={(e) =>
                      onUpdateGuide(selectedGuide.id, {
                        scope: e.target.value as StyleGuideScope,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    {SCOPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onDeleteGuide(selectedGuide.id)}
                    aria-label={`Delete ${selectedGuide.name}`}
                    className="p-1.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="selected-guide-rules"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Rules Definition (Edits save automatically)
                </label>
                <textarea
                  id="selected-guide-rules"
                  rows={16}
                  value={selectedGuide.rulesMarkdown}
                  onChange={(e) =>
                    onUpdateGuide(selectedGuide.id, {
                      rulesMarkdown: e.target.value,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-full px-3.5 py-3 text-xs leading-relaxed font-mono bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

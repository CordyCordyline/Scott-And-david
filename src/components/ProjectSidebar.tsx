import { useState } from 'react';
import { FileCode2, Moon, Plus, Search, Sun, X } from 'lucide-react';
import type { MobileLanguage, MobilePlatform, MobileProjectFile } from '../types/mobile';
import { filterProjectFiles } from '../utils/diff';

interface ProjectSidebarProps {
  files: MobileProjectFile[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onAddFile: (file: MobileProjectFile) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function ProjectSidebar({
  files,
  activeFileId,
  onSelectFile,
  onAddFile,
  theme,
  onToggleTheme,
}: ProjectSidebarProps) {
  const [platformFilter, setPlatformFilter] = useState<'all' | MobilePlatform>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [newFileName, setNewFileName] = useState('');
  const [newPlatform, setNewPlatform] = useState<MobilePlatform>('ios');
  const [newLanguage, setNewLanguage] = useState<MobileLanguage>('swift');
  const [newFramework, setNewFramework] = useState('Swift 6 · SwiftUI');
  const [newCode, setNewCode] = useState('');

  const visibleFiles = filterProjectFiles(files, platformFilter, searchQuery);

  const handlePlatformSelect = (plat: MobilePlatform) => {
    setNewPlatform(plat);
    if (plat === 'android') {
      setNewLanguage('kotlin');
      setNewFramework('Kotlin 2.1 · Jetpack Compose');
    } else {
      setNewLanguage('swift');
      setNewFramework('Swift 6 · SwiftUI');
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newFileName.trim();
    if (!trimmedName) return;

    const ext = newLanguage === 'kotlin' ? '.kt' : newLanguage === 'objc' ? '.m' : '.swift';
    const finalName = trimmedName.includes('.') ? trimmedName : `${trimmedName}${ext}`;
    const folderPrefix =
      newPlatform === 'ios'
        ? newLanguage === 'objc'
          ? 'ios/Legacy/'
          : 'ios/Sources/'
        : 'android/app/src/main/java/com/bridgelab/';

    const starterCode =
      newCode.trim() ||
      (newLanguage === 'kotlin'
        ? `package com.bridgelab.feature\n\nclass CustomFeature {\n    fun execute() {\n        // Paste Kotlin / Compose code here\n    }\n}`
        : newLanguage === 'objc'
          ? `#import <Foundation/Foundation.h>\n\n@interface CustomHelper : NSObject\n@property (nonatomic, copy) NSString *identifier;\n@end\n\n@implementation CustomHelper\n@end`
          : `import Foundation\n\nfinal class CustomService {\n    func run() async {\n        // Paste Swift code here\n    }\n}`);

    const created: MobileProjectFile = {
      id: `custom-${Date.now()}`,
      name: finalName,
      path: `${folderPrefix}${finalName}`,
      platform: newPlatform,
      language: newLanguage,
      framework: newFramework.trim() || 'Mobile',
      targetSdk: newPlatform === 'ios' ? 'iOS 18.2' : 'Android API 35',
      issueHint: 'Custom mobile source file',
      code: starterCode,
    };

    onAddFile(created);
    onSelectFile(created.id);
    setNewFileName('');
    setNewCode('');
    setIsCreating(false);
  };

  const formatLangLabel = (lang: MobileLanguage) => {
    if (lang === 'objc') return 'Obj-C';
    if (lang === 'swift') return 'Swift';
    return 'Kotlin';
  };

  return (
    <aside className="w-full lg:w-[270px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] flex flex-col">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Mobile Workspace
          </h2>
          <button
            type="button"
            onClick={() => setIsCreating((prev) => !prev)}
            aria-expanded={isCreating}
            aria-label={isCreating ? 'Close new file form' : 'Add mobile source file'}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {isCreating ? (
              <>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Cancel</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New File</span>
              </>
            )}
          </button>
        </div>

        {/* Platform segmented filter */}
        <div
          role="group"
          aria-label="Filter files by platform"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg"
        >
          {(['all', 'ios', 'android'] as const).map((plat) => {
            const active = platformFilter === plat;
            const label = plat === 'all' ? 'All' : plat === 'ios' ? 'iOS' : 'Android';
            return (
              <button
                key={plat}
                type="button"
                onClick={() => setPlatformFilter(plat)}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter files or frameworks…"
            aria-label="Filter project files"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Inline New File Creator */}
      {isCreating && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2.5"
        >
          <div>
            <label htmlFor="new-file-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              File Name
            </label>
            <input
              id="new-file-name"
              type="text"
              required
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="e.g. ProfileCache.m"
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="new-file-platform" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Platform
              </label>
              <select
                id="new-file-platform"
                value={newPlatform}
                onChange={(e) => handlePlatformSelect(e.target.value as MobilePlatform)}
                className="w-full px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
              >
                <option value="ios">iOS</option>
                <option value="android">Android</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-file-lang" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Language
              </label>
              <select
                id="new-file-lang"
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value as MobileLanguage)}
                className="w-full px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
              >
                {newPlatform === 'ios' ? (
                  <>
                    <option value="swift">Swift</option>
                    <option value="objc">Objective-C</option>
                  </>
                ) : (
                  <option value="kotlin">Kotlin</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="new-file-code" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Initial Code (Optional)
            </label>
            <textarea
              id="new-file-code"
              rows={3}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Paste Swift, Objective-C, or Kotlin code…"
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="w-full py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Add to Project
          </button>
        </form>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-60 lg:max-h-none">
        {visibleFiles.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No mobile files match your filter.
          </div>
        ) : (
          visibleFiles.map((file) => {
            const isSelected = file.id === activeFileId;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelectFile(file.id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isSelected
                    ? 'bg-blue-600/10 dark:bg-blue-500/15 text-slate-900 dark:text-white border border-blue-600/30 dark:border-blue-500/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode2
                    className={`w-4 h-4 shrink-0 ${
                      isSelected
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold truncate">{file.name}</span>
                </div>
                {/* Unboxed metadata with typographic separator */}
                <div className="mt-1 pl-6 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  <span>{file.platform === 'ios' ? 'iOS' : 'Android'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatLangLabel(file.language)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{file.targetSdk}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Sidebar Footer: Theme Switch */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {files.length} workspace files
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

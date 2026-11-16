export type MobilePlatform = 'ios' | 'android';

export type MobileLanguage = 'swift' | 'objc' | 'kotlin';

export type WorkspaceTab = 'refactor' | 'debugger' | 'parity' | 'style-guides' | 'history';

export type ReasoningDepth = 'low' | 'medium' | 'high';

export type StyleGuideScope = 'all' | 'ios' | 'android' | 'swift' | 'objc' | 'kotlin';

export interface StyleGuide {
  id: string;
  name: string;
  scope: StyleGuideScope;
  rulesMarkdown: string;
  isActive: boolean;
  sourceType: 'preset' | 'custom' | 'uploaded';
  fileName?: string;
  updatedAt: string;
}

export interface MobileProjectFile {
  id: string;
  name: string;
  path: string;
  platform: MobilePlatform;
  language: MobileLanguage;
  framework: string;
  targetSdk: string;
  issueHint: string;
  code: string;
}

export type LiveIssueCategory = 'error' | 'optimization' | 'best-practice' | 'style-guide';
export type LiveIssueSeverity = 'critical' | 'warning' | 'info';

export interface LiveDiagnosticIssue {
  id: string;
  line: number;
  category: LiveIssueCategory;
  severity: LiveIssueSeverity;
  title: string;
  explanation: string;
  suggestion: string;
  source: 'static' | 'gemini-4';
  ruleRef?: string;
  replacementSnippet?: string;
}

export interface LiveAnalysisResult {
  language: MobileLanguage;
  summary: string;
  issues: LiveDiagnosticIssue[];
  analyzedAt: string;
}

export interface RefactorFinding {
  title: string;
  severity: 'critical' | 'warning' | 'improvement';
  lineRange: string;
  ecosystemImpact: string;
  explanation: string;
  styleRuleApplied?: string;
}

export interface RefactorResult {
  summary: string;
  refactoredCode: string;
  findings: RefactorFinding[];
  verificationChecklist: string[];
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export interface CrashFrame {
  index: number;
  module: string;
  symbol: string;
  location: string;
  isAppFrame: boolean;
}

export interface CrashMetadata {
  platform: MobilePlatform | 'unknown';
  signalOrException: string;
  threadSummary: string;
  isMainThreadIssue: boolean;
  frames: CrashFrame[];
}

export interface CrashDiagnosis {
  rootCause: string;
  severity: 'fatal' | 'anr' | 'memory' | 'concurrency';
  affectedComponent: string;
  lifecycleTrigger: string;
  explanation: string;
  patchedCode: string;
  verificationSteps: string[];
}

export interface DebugChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ParityTranslation {
  sourcePlatform: MobilePlatform;
  targetPlatform: MobilePlatform;
  translatedCode: string;
  stateMappingNotes: Array<{
    sourcePattern: string;
    targetPattern: string;
    rationale: string;
  }>;
  edgeCaseWarnings: string[];
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  actionType: 'refactor' | 'debug_patch' | 'parity';
  fileName: string;
  platform: MobilePlatform;
  summary: string;
  addedLines: number;
  removedLines: number;
  previousCode: string;
  appliedCode: string;
  reverted: boolean;
}

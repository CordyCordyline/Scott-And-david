import type { DiffLine, DiffStats, MobilePlatform, MobileProjectFile, RefactorFinding } from '../types/mobile';

/**
 * Computes a deterministic line-by-line unified diff using Longest Common Subsequence (LCS).
 */
export function computeLineDiff(original: string, modified: string): {
  lines: DiffLine[];
  stats: DiffStats;
} {
  const oldLines = original === '' ? [] : original.replace(/\r\n/g, '\n').split('\n');
  const newLines = modified === '' ? [] : modified.replace(/\r\n/g, '\n').split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // Build DP table for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLineNum = 1;
  let newLineNum = 1;
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      lines.push({
        type: 'unchanged',
        content: oldLines[i],
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
      unchanged++;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({
        type: 'removed',
        content: oldLines[i],
        oldLineNumber: oldLineNum++,
        newLineNumber: null,
      });
      removed++;
      i++;
    } else {
      lines.push({
        type: 'added',
        content: newLines[j],
        oldLineNumber: null,
        newLineNumber: newLineNum++,
      });
      added++;
      j++;
    }
  }

  while (i < m) {
    lines.push({
      type: 'removed',
      content: oldLines[i],
      oldLineNumber: oldLineNum++,
      newLineNumber: null,
    });
    removed++;
    i++;
  }

  while (j < n) {
    lines.push({
      type: 'added',
      content: newLines[j],
      oldLineNumber: null,
      newLineNumber: newLineNum++,
    });
    added++;
    j++;
  }

  return {
    lines,
    stats: { added, removed, unchanged },
  };
}

export interface ParsedStreamRefactor {
  summary: string;
  refactoredCode: string;
  findings: RefactorFinding[];
  verificationChecklist: string[];
  isCompleteJson: boolean;
}

/**
 * Extracts structured refactoring data from either completed JSON or in-progress streamed text.
 */
export function parseRefactorOutput(rawText: string): ParsedStreamRefactor {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      summary: '',
      refactoredCode: '',
      findings: [],
      verificationChecklist: [],
      isCompleteJson: false,
    };
  }

  // Strip optional markdown JSON fences if model includes them
  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<{
      summary: string;
      refactoredCode: string;
      findings: RefactorFinding[];
      verificationChecklist: string[];
    }>;

    if (typeof parsed.refactoredCode === 'string') {
      return {
        summary: parsed.summary ?? '',
        refactoredCode: parsed.refactoredCode,
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        verificationChecklist: Array.isArray(parsed.verificationChecklist)
          ? parsed.verificationChecklist
          : [],
        isCompleteJson: true,
      };
    }
  } catch {
    // Still streaming partial JSON or fenced sections
  }

  // Best-effort live extraction of refactoredCode while JSON is streaming
  const codeMatch = cleaned.match(/"refactoredCode"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*}|$)/);
  let liveCode = '';
  if (codeMatch && codeMatch[1]) {
    liveCode = codeMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  const summaryMatch = cleaned.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)/);
  const liveSummary = summaryMatch?.[1]
    ? summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
    : '';

  return {
    summary: liveSummary,
    refactoredCode: liveCode,
    findings: [],
    verificationChecklist: [],
    isCompleteJson: false,
  };
}

export function filterProjectFiles(
  files: MobileProjectFile[],
  platformFilter: 'all' | MobilePlatform,
  query: string
): MobileProjectFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  return files.filter((file) => {
    const matchesPlatform = platformFilter === 'all' || file.platform === platformFilter;
    if (!matchesPlatform) return false;
    if (!normalizedQuery) return true;
    return (
      file.name.toLowerCase().includes(normalizedQuery) ||
      file.path.toLowerCase().includes(normalizedQuery) ||
      file.framework.toLowerCase().includes(normalizedQuery) ||
      file.issueHint.toLowerCase().includes(normalizedQuery)
    );
  });
}

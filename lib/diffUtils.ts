/**
 * Pure TypeScript Zero-Dependency Diff Engine
 * Provides Myers/LCS line diffing, side-by-side row pairing, unified diffing,
 * character highlighting, and file type classification.
 */

export type DiffType = 'equal' | 'delete' | 'insert' | 'modify' | 'empty';

export interface DiffLine {
  lineNum: number | null;
  text: string;
  type: DiffType;
  /** Character ranges changed for inline highlighting in modified lines */
  charDiffs?: { text: string; changed: boolean }[];
}

export interface SideBySideRow {
  id: string;
  left: DiffLine;
  right: DiffLine;
}

export interface UnifiedRow {
  id: string;
  type: 'equal' | 'delete' | 'insert';
  oldLineNum: number | null;
  newLineNum: number | null;
  text: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  modifications: number;
  totalOldLines: number;
  totalNewLines: number;
  isIdentical: boolean;
}

export interface DiffResult {
  sideBySide: SideBySideRow[];
  unified: UnifiedRow[];
  stats: DiffStats;
}

// ─── File Type Detection ──────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'js', 'jsx', 'ts', 'tsx', 'json', 'html', 'htm',
  'css', 'scss', 'sass', 'less', 'yaml', 'yml', 'xml', 'svg', 'sh', 'bash',
  'bat', 'cmd', 'ps1', 'py', 'java', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs',
  'go', 'rs', 'rb', 'php', 'sql', 'env', 'gitignore', 'syncignore', 'ini',
  'toml', 'conf', 'cfg', 'properties', 'lock', 'csv', 'tsv', 'log', 'patch',
  'diff', 'graphql', 'prisma', 'proto', 'dockerfile', 'makefile'
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'
]);

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function isDiffableText(filename: string, mimeType?: string): boolean {
  const lowerName = filename.toLowerCase();
  if (lowerName === '.gitignore' || lowerName === '.syncignore' || lowerName.startsWith('.env')) {
    return true;
  }
  const ext = getFileExtension(filename);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (mimeType) {
    if (mimeType.startsWith('text/')) return true;
    if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('xml')) {
      return true;
    }
  }
  return false;
}

export function isImageFile(filename: string, mimeType?: string): boolean {
  const ext = getFileExtension(filename);
  if (IMAGE_EXTENSIONS.has(ext)) return true;
  if (mimeType && mimeType.startsWith('image/')) return true;
  return false;
}

// ─── Longest Common Subsequence (LCS) Diff Algorithm ──────────────────────────

/**
 * Computes the Longest Common Subsequence matrix between two arrays of lines.
 */
function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  // Use typed arrays or 2D array
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  return dp;
}

interface RawDiffOp {
  type: 'equal' | 'delete' | 'insert';
  text: string;
  oldIndex?: number;
  newIndex?: number;
}

/**
 * Traces back through the LCS table to build the raw sequence of edit operations.
 */
function backtrackLCS(dp: number[][], a: string[], b: string[]): RawDiffOp[] {
  let i = a.length;
  let j = b.length;
  const ops: RawDiffOp[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', text: a[i - 1], oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'insert', text: b[j - 1], newIndex: j - 1 });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      ops.push({ type: 'delete', text: a[i - 1], oldIndex: i - 1 });
      i--;
    }
  }

  return ops.reverse();
}

/**
 * Character-level diff between two lines to highlight modified tokens.
 */
export function computeCharDiff(oldStr: string, newStr: string): {
  oldChunks: { text: string; changed: boolean }[];
  newChunks: { text: string; changed: boolean }[];
} {
  // Simple word/token split
  if (oldStr === newStr) {
    return {
      oldChunks: [{ text: oldStr, changed: false }],
      newChunks: [{ text: newStr, changed: false }]
    };
  }

  // Find common prefix
  let start = 0;
  while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) {
    start++;
  }

  // Find common suffix
  let oldEnd = oldStr.length - 1;
  let newEnd = newStr.length - 1;
  while (oldEnd >= start && newEnd >= start && oldStr[oldEnd] === newStr[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const prefix = oldStr.slice(0, start);
  const suffix = oldStr.slice(oldEnd + 1);

  const oldMiddle = oldStr.slice(start, oldEnd + 1);
  const newMiddle = newStr.slice(start, newEnd + 1);

  const oldChunks: { text: string; changed: boolean }[] = [];
  const newChunks: { text: string; changed: boolean }[] = [];

  if (prefix) {
    oldChunks.push({ text: prefix, changed: false });
    newChunks.push({ text: prefix, changed: false });
  }

  if (oldMiddle) oldChunks.push({ text: oldMiddle, changed: true });
  if (newMiddle) newChunks.push({ text: newMiddle, changed: true });

  if (suffix) {
    oldChunks.push({ text: suffix, changed: false });
    newChunks.push({ text: suffix, changed: false });
  }

  return { oldChunks, newChunks };
}

// ─── Main Compute Diff Function ───────────────────────────────────────────────

/**
 * Computes side-by-side and unified diffs between oldText (Local) and newText (Drive).
 */
export function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  const dp = computeLCS(oldLines, newLines);
  const rawOps = backtrackLCS(dp, oldLines, newLines);

  const sideBySide: SideBySideRow[] = [];
  const unified: UnifiedRow[] = [];

  let oldLineNum = 1;
  let newLineNum = 1;
  let additions = 0;
  let deletions = 0;
  let modifications = 0;

  // Group raw ops into blocks of deletes and inserts for side-by-side alignment
  let i = 0;
  let rowId = 0;

  while (i < rawOps.length) {
    const op = rawOps[i];

    if (op.type === 'equal') {
      sideBySide.push({
        id: `row-${rowId++}`,
        left: { lineNum: oldLineNum, text: op.text, type: 'equal' },
        right: { lineNum: newLineNum, text: op.text, type: 'equal' },
      });
      unified.push({
        id: `uni-${rowId}`,
        type: 'equal',
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
        text: op.text,
      });
      i++;
    } else {
      // Collect contiguous deletes and inserts
      const deleted: string[] = [];
      const inserted: string[] = [];

      while (i < rawOps.length && rawOps[i].type !== 'equal') {
        if (rawOps[i].type === 'delete') {
          deleted.push(rawOps[i].text);
          unified.push({
            id: `uni-${rowId++}`,
            type: 'delete',
            oldLineNum: oldLineNum++,
            newLineNum: null,
            text: rawOps[i].text,
          });
          deletions++;
        } else if (rawOps[i].type === 'insert') {
          inserted.push(rawOps[i].text);
          unified.push({
            id: `uni-${rowId++}`,
            type: 'insert',
            oldLineNum: null,
            newLineNum: newLineNum++,
            text: rawOps[i].text,
          });
          additions++;
        }
        i++;
      }

      // Pair deleted and inserted lines side-by-side
      const maxLen = Math.max(deleted.length, inserted.length);
      const startOld = oldLineNum - deleted.length;
      const startNew = newLineNum - inserted.length;

      for (let k = 0; k < maxLen; k++) {
        const hasLeft = k < deleted.length;
        const hasRight = k < inserted.length;

        if (hasLeft && hasRight) {
          // Modified pair
          modifications++;
          const charDiff = computeCharDiff(deleted[k], inserted[k]);
          sideBySide.push({
            id: `row-${rowId++}`,
            left: {
              lineNum: startOld + k,
              text: deleted[k],
              type: 'modify',
              charDiffs: charDiff.oldChunks,
            },
            right: {
              lineNum: startNew + k,
              text: inserted[k],
              type: 'modify',
              charDiffs: charDiff.newChunks,
            },
          });
        } else if (hasLeft) {
          sideBySide.push({
            id: `row-${rowId++}`,
            left: { lineNum: startOld + k, text: deleted[k], type: 'delete' },
            right: { lineNum: null, text: '', type: 'empty' },
          });
        } else if (hasRight) {
          sideBySide.push({
            id: `row-${rowId++}`,
            left: { lineNum: null, text: '', type: 'empty' },
            right: { lineNum: startNew + k, text: inserted[k], type: 'insert' },
          });
        }
      }
    }
  }

  const isIdentical = additions === 0 && deletions === 0 && modifications === 0;

  return {
    sideBySide,
    unified,
    stats: {
      additions,
      deletions,
      modifications,
      totalOldLines: oldLines.length,
      totalNewLines: newLines.length,
      isIdentical,
    },
  };
}

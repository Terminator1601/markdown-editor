import { diffLines, Change } from 'diff';

export interface DiffLine {
  content: string;
  type: 'added' | 'removed' | 'unchanged';
  oldLineNumber?: number;
  newLineNumber?: number;
}

export const generateDiff = (original: string, modified: string): DiffLine[] => {
  const changes = diffLines(original, modified);
  const result: DiffLine[] = [];
  
  let oldLineNumber = 1;
  let newLineNumber = 1;
  
  changes.forEach((change: Change) => {
    const lines = change.value.split('\n');
    // Remove empty last line if it exists
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    lines.forEach((line) => {
      if (change.added) {
        result.push({
          content: line,
          type: 'added',
          newLineNumber: newLineNumber++
        });
      } else if (change.removed) {
        result.push({
          content: line,
          type: 'removed',
          oldLineNumber: oldLineNumber++
        });
      } else {
        result.push({
          content: line,
          type: 'unchanged',
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++
        });
      }
    });
  });
  
  return result;
};

export const formatDiffForDisplay = (diffLines: DiffLine[]): string => {
  return diffLines
    .map(line => {
      const prefix = line.type === 'added' ? '+ ' : 
                   line.type === 'removed' ? '- ' : '  ';
      return prefix + line.content;
    })
    .join('\n');
};

// Generate a contextual diff that shows only changed sections with minimal context
export const generateContextualDiff = (original: string, modified: string, contextLines: number = 3): DiffLine[] => {
  const allDiffLines = generateDiff(original, modified);
  
  // Find all changed lines (added or removed)
  const changedLineIndices = allDiffLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.type === 'added' || line.type === 'removed')
    .map(({ index }) => index);
  
  if (changedLineIndices.length === 0) {
    return allDiffLines;
  }
  
  // Create ranges of lines to include (changed lines + context)
  const ranges: Array<{ start: number; end: number }> = [];
  
  for (const changeIndex of changedLineIndices) {
    const start = Math.max(0, changeIndex - contextLines);
    const end = Math.min(allDiffLines.length - 1, changeIndex + contextLines);
    ranges.push({ start, end });
  }
  
  // Merge overlapping ranges
  const mergedRanges: Array<{ start: number; end: number }> = [];
  ranges.sort((a, b) => a.start - b.start);
  
  for (const range of ranges) {
    if (mergedRanges.length === 0) {
      mergedRanges.push(range);
    } else {
      const lastRange = mergedRanges[mergedRanges.length - 1];
      if (range.start <= lastRange.end + 1) {
        // Overlapping or adjacent ranges, merge them
        lastRange.end = Math.max(lastRange.end, range.end);
      } else {
        mergedRanges.push(range);
      }
    }
  }
  
  // Extract lines for merged ranges
  const contextualDiffLines: DiffLine[] = [];
  
  for (let i = 0; i < mergedRanges.length; i++) {
    const range = mergedRanges[i];
    
    // Add separator between ranges (except for first range)
    if (i > 0) {
      contextualDiffLines.push({
        content: '...',
        type: 'unchanged'
      });
    }
    
    // Add lines in this range
    for (let lineIndex = range.start; lineIndex <= range.end; lineIndex++) {
      contextualDiffLines.push(allDiffLines[lineIndex]);
    }
  }
  
  return contextualDiffLines;
};
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
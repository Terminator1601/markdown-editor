/**
 * Utilities for preserving document formatting during edits
 */

export interface FormatPreservationOptions {
  preserveLatexCommands?: boolean;
  preserveIndentation?: boolean;
  preserveLineBreaks?: boolean;
  preserveSpecialChars?: boolean;
}

/**
 * Analyzes the formatting characteristics of content
 */
export function analyzeFormatting(content: string) {
  const analysis = {
    hasLatexCommands: /\\[a-zA-Z]+\*?\{/.test(content),
    indentationType: detectIndentation(content),
    lineEndingType: detectLineEndings(content),
    hasSpecialChars: /[\\{}$%&~#^_]/.test(content),
    hasMathExpressions: /\$.*?\$|\\\(.*?\\\)|\\\[.*?\\\]/.test(content),
    hasCodeBlocks: /```.*?```|`[^`]+`/.test(content),
    structure: {
      sections: (content.match(/\\(section|subsection|subsubsection)\*?\{/g) || []).length,
      chapters: (content.match(/\\chapter\*?\{/g) || []).length,
      titles: (content.match(/\\title\*?\{/g) || []).length,
    }
  };

  return analysis;
}

/**
 * Detects the indentation pattern used in content
 */
function detectIndentation(content: string): 'tabs' | 'spaces' | 'mixed' | 'none' {
  const lines = content.split('\n');
  const indentedLines = lines.filter(line => /^\s/.test(line));
  
  if (indentedLines.length === 0) return 'none';
  
  const hasSpaces = indentedLines.some(line => /^ /.test(line));
  const hasTabs = indentedLines.some(line => /^\t/.test(line));
  
  if (hasSpaces && hasTabs) return 'mixed';
  if (hasTabs) return 'tabs';
  if (hasSpaces) return 'spaces';
  
  return 'none';
}

/**
 * Detects line ending type
 */
function detectLineEndings(content: string): 'unix' | 'windows' | 'mixed' {
  const hasWindows = content.includes('\r\n');
  const hasUnix = content.includes('\n') && !content.includes('\r\n');
  
  if (hasWindows && hasUnix) return 'mixed';
  if (hasWindows) return 'windows';
  return 'unix';
}

/**
 * Creates formatting-aware instructions for AI models
 */
export function createFormattingInstructions(
  content: string, 
  isSelection: boolean = false,
  options: FormatPreservationOptions = {}
): string {
  const analysis = analyzeFormatting(content);
  
  const instructions = [
    'CRITICAL FORMATTING REQUIREMENTS:',
  ];

  if (analysis.hasLatexCommands && options.preserveLatexCommands !== false) {
    instructions.push('- NEVER modify LaTeX command syntax: \\section{}, \\title{}, \\chapter{}, \\begin{}, \\end{}');
    instructions.push('- NEVER add or remove backslashes, braces, or special characters');
    instructions.push('- Only modify content INSIDE braces {} when specifically requested');
    instructions.push('- Keep command structure identical: \\title{CONTENT} stays \\title{MODIFIED_CONTENT}');
  }

  if (analysis.indentationType !== 'none' && options.preserveIndentation !== false) {
    instructions.push(`- Maintain ${analysis.indentationType === 'tabs' ? 'tab' : 'space'} indentation exactly`);
  }

  if (options.preserveLineBreaks !== false) {
    instructions.push('- Preserve all line breaks and paragraph spacing');
    instructions.push('- Keep empty lines exactly as they appear');
  }

  if (analysis.hasSpecialChars && options.preserveSpecialChars !== false) {
    instructions.push('- NEVER add characters like ~, +, &, %, #, ^, _ unless in original text');
    instructions.push('- Preserve ALL special characters (\\, {}, $, %, &, ~, #, ^, _) exactly');
  }

  if (analysis.hasMathExpressions) {
    instructions.push('- Keep mathematical expressions and their delimiters unchanged');
  }

  if (analysis.hasCodeBlocks) {
    instructions.push('- Preserve code blocks and inline code formatting');
  }

  instructions.push('- Make MINIMAL changes - only edit what was specifically requested');
  instructions.push('- Do NOT "improve" or "fix" formatting unless asked');

  if (isSelection) {
    instructions.push('- Return ONLY the modified selected text, maintaining its exact format');
  } else {
    instructions.push('- Return the complete edited content with preserved structure');
  }

  return instructions.join('\n');
}

/**
 * Validates that formatting is preserved between original and modified content
 */
export function validateFormatPreservation(
  original: string, 
  modified: string
): {
  valid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const originalAnalysis = analyzeFormatting(original);
  const modifiedAnalysis = analyzeFormatting(modified);

  // Check LaTeX commands
  if (originalAnalysis.hasLatexCommands) {
    const originalCommands = extractLatexCommands(original);
    const modifiedCommands = extractLatexCommands(modified);
    
    if (originalCommands.length !== modifiedCommands.length) {
      issues.push('LaTeX command count mismatch');
      suggestions.push('Ensure all original LaTeX commands are preserved');
    }
  }

  // Check indentation consistency
  if (originalAnalysis.indentationType !== 'none' && 
      originalAnalysis.indentationType !== modifiedAnalysis.indentationType) {
    issues.push('Indentation pattern changed');
    suggestions.push(`Maintain ${originalAnalysis.indentationType} indentation`);
  }

  // Check special character preservation
  const originalSpecialChars = (original.match(/[\\{}$%&~#^_]/g) || []).length;
  const modifiedSpecialChars = (modified.match(/[\\{}$%&~#^_]/g) || []).length;
  
  if (Math.abs(originalSpecialChars - modifiedSpecialChars) > 2) {
    issues.push('Significant change in special characters');
    suggestions.push('Preserve special characters unless specifically editing them');
  }

  return {
    valid: issues.length === 0,
    issues,
    suggestions
  };
}

/**
 * Extracts LaTeX commands from content
 */
function extractLatexCommands(content: string): string[] {
  const commandRegex = /\\([a-zA-Z]+\*?)\{[^}]*\}/g;
  const commands: string[] = [];
  let match;
  
  while ((match = commandRegex.exec(content)) !== null) {
    commands.push(match[1]);
  }
  
  return commands;
}

/**
 * Smart content replacement that tries to preserve formatting
 */
export function smartReplace(
  fullContent: string,
  targetStart: number,
  targetEnd: number,
  newContent: string
): string {
  const before = fullContent.substring(0, targetStart);
  const after = fullContent.substring(targetEnd);
  
  // Analyze surrounding context for better formatting preservation
  const beforeLastLine = before.split('\n').pop() || '';
  
  // Preserve leading whitespace patterns
  const leadingWhitespace = beforeLastLine.match(/^\s*/)?.[0] || '';
  
  // Apply intelligent spacing
  let processedNewContent = newContent;
  
  // Add leading whitespace if the new content should be indented
  if (leadingWhitespace && !processedNewContent.startsWith(leadingWhitespace)) {
    const lines = processedNewContent.split('\n');
    processedNewContent = lines.map((line, index) => {
      if (index === 0) return line; // First line keeps original position
      return leadingWhitespace + line;
    }).join('\n');
  }
  
  return before + processedNewContent + after;
}
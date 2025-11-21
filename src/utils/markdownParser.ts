export interface MarkdownSection {
    title: string;
    command: string; // e.g., 'section', 'chapter', 'title'
    start: number;
    end: number;
    content: string;
    level: number; // hierarchy level for better targeting
    lineStart: number;
    lineEnd: number;
}

export interface SectionSummary {
    index: number;
    command: string;
    title: string;
    displayText: string; // formatted as \command{title}
}

export function parseMarkdownStructure(content: string): MarkdownSection[] {
    const sections: MarkdownSection[] = [];
    const lines = content.split('\n');
    let currentSection: MarkdownSection | null = null;
    let charCount = 0;

    // Regex to match \command{...} or \command*{...}
    // Matches: \section*{Title}, \title{Title}, etc.
    const commandRegex = /^\\([a-zA-Z]+)(\*?)\{(.+)\}$/;

    // Define command hierarchy levels
    const commandLevels: Record<string, number> = {
        'title': 0,
        'chapter': 1,
        'section': 2,
        'subsection': 3,
        'subsubsection': 4,
        'paragraph': 5,
        'subparagraph': 6
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(commandRegex);

        if (match) {
            // Found a new section command
            // match[1] is command name (e.g., 'section')
            // match[2] is asterisk (if present)
            // match[3] is content (title)

            // Close previous section
            if (currentSection) {
                currentSection.end = charCount - 1;
                currentSection.lineEnd = i - 1;
                sections.push(currentSection);
            }

            const commandName = match[1];
            const fullCommand = match[1] + match[2];
            const level = commandLevels[commandName] ?? 99;

            // Start new section
            currentSection = {
                title: match[3],
                command: fullCommand,
                start: charCount,
                end: content.length, // Default to end
                content: line + '\n',
                level: level,
                lineStart: i,
                lineEnd: lines.length - 1
            };
        } else if (currentSection) {
            currentSection.content += line + '\n';
        } else {
            // Content before first command (Preamble)
            if (sections.length === 0 && !currentSection) {
                currentSection = {
                    title: 'Preamble',
                    command: 'preamble',
                    start: charCount,
                    end: content.length,
                    content: line + '\n',
                    level: -1,
                    lineStart: i,
                    lineEnd: lines.length - 1
                };
            } else if (currentSection) {
                (currentSection as MarkdownSection).content += line + '\n';
            }
        }

        charCount += line.length + 1; // +1 for newline
    }

    // Push the last section
    if (currentSection) {
        currentSection.end = content.length;
        currentSection.lineEnd = lines.length - 1;
        sections.push(currentSection);
    }

    return sections;
}

export function getSectionSummaries(sections: MarkdownSection[]): SectionSummary[] {
    return sections.map((section, index) => ({
        index,
        command: section.command,
        title: section.title,
        displayText: section.command === 'preamble' 
            ? '[Preamble]' 
            : `\\${section.command}{${section.title}}`
    }));
}

export function extractSectionContent(content: string, targetSections: number[]): {
    extractedContent: string;
    startChar: number;
    endChar: number;
    sections: MarkdownSection[];
} {
    const sections = parseMarkdownStructure(content);
    
    if (targetSections.length === 0 || targetSections.some(i => i < 0 || i >= sections.length)) {
        return {
            extractedContent: content,
            startChar: 0,
            endChar: content.length,
            sections: sections
        };
    }

    // Sort section indices to get continuous range if possible
    const sortedIndices = [...targetSections].sort((a, b) => a - b);
    const targetedSections = sortedIndices.map(i => sections[i]);
    
    const startChar = Math.min(...targetedSections.map(s => s.start));
    const endChar = Math.max(...targetedSections.map(s => s.end));
    
    const extractedContent = content.substring(startChar, endChar);

    return {
        extractedContent,
        startChar,
        endChar,
        sections: targetedSections
    };
}

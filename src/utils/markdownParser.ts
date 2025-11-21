export interface MarkdownSection {
    title: string;
    command: string; // e.g., 'section', 'chapter', 'title'
    start: number;
    end: number;
    content: string;
}

export function parseMarkdownStructure(content: string): MarkdownSection[] {
    const sections: MarkdownSection[] = [];
    const lines = content.split('\n');
    let currentSection: MarkdownSection | null = null;
    let charCount = 0;

    // Regex to match \command{...} or \command*{...}
    // Matches: \section*{Title}, \title{Title}, etc.
    const commandRegex = /^\\([a-zA-Z]+)(\*?)\{(.+)\}$/;

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
                sections.push(currentSection);
            }

            // Start new section
            currentSection = {
                title: match[3],
                command: match[1] + match[2], // e.g., 'section*'
                start: charCount,
                end: content.length, // Default to end
                content: line + '\n'
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
                    content: line + '\n'
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
        sections.push(currentSection);
    }

    return sections;
}

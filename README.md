# Markdown Editor with AI Assistant

A split-pane web application that allows users to edit Markdown documents using natural language commands. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Split-pane interface**: Markdown renderer on the left, chat panel on the right
- **Natural language editing**: Type requests like "turn section 2 into a checklist" or "fix typos"
- **Live diff preview**: See before/after changes before applying
- **Accept/Discard edits**: Review and approve or reject proposed changes
- **Undo/Redo functionality**: Full history management with easy navigation
- **Local persistence**: Automatically saves your work to localStorage
- **Text selection**: Edit specific sections by selecting text first

## Demo Commands

Try these natural language commands in the chat panel:

- "Turn this into a checklist"
- "Make this text bold"
- "Convert to bullet points"
- "Fix typos in this section"
- "Make this a heading"
- "Make the text more formal"
- "Expand this section"

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Clone or download the project
2. Navigate to the project directory:
   ```bash
   cd markdown-editor
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser to `http://localhost:3000`

## Project Structure

```
src/
├── app/
│   ├── api/edit/route.ts      # LLM proxy backend
│   └── page.tsx               # Main page
├── components/
│   ├── ChatPanel.tsx          # Chat interface
│   ├── DiffViewer.tsx         # Diff preview component
│   ├── MarkdownEditor.tsx     # Main application
│   └── MarkdownRenderer.tsx   # Markdown display
├── types/
│   └── index.ts               # TypeScript definitions
└── utils/
    ├── diff.ts                # Diff generation utilities
    └── storage.ts             # localStorage management
```

## How It Works

### Text Selection and Editing

1. **Select text** in the markdown renderer (left panel)
2. **Type a command** in the chat panel (right panel) describing what you want to change
3. **Review the proposed edit** in the diff viewer that appears
4. **Accept or discard** the changes using the buttons

### Full Document Editing

- If no text is selected, commands will apply to the entire document
- Use commands like "make all headings bold" or "convert the whole document to a checklist"

### History Management

- **Undo/Redo buttons** in the toolbar let you navigate through edit history
- **Auto-save** preserves your work between sessions
- **Reload button** restores the original document

## LLM Integration

The current implementation uses a **rule-based text processing system** for demonstration purposes. In a production environment, you would integrate with:

- **OpenAI GPT-4** for advanced text understanding and generation
- **Anthropic Claude** for safe and helpful text editing
- **Local LLM** like Llama for privacy-focused deployments

### Current Selection Model

The demo uses simple pattern matching and text transformations:

- **Keyword detection**: Looks for words like "checklist", "bold", "heading"
- **Text transformations**: Applies markdown formatting based on detected intent
- **Typo correction**: Fixes common spelling mistakes
- **Format conversion**: Converts between different markdown structures

## Limitations

### Current Demo Limitations

- **No actual LLM**: Uses simple rule-based transformations
- **Limited command understanding**: Only recognizes basic patterns
- **No complex reasoning**: Cannot handle complex multi-step edits
- **English only**: No support for other languages

### Technical Limitations

- **Client-side processing**: Text selection may not work perfectly in all browsers
- **Memory usage**: Large documents may impact performance
- **No collaboration**: Single-user editing only

### Security Considerations

- **Input validation**: Always validate user input before processing
- **Rate limiting**: Implement API rate limits for production use
- **Sanitization**: Ensure markdown content is properly sanitized

## Future Enhancements

### LLM Integration

- [ ] OpenAI GPT integration with streaming responses
- [ ] Custom prompts for different editing styles
- [ ] Context-aware suggestions based on document type
- [ ] Multi-language support

### User Experience

- [ ] Keyboard shortcuts for common actions
- [ ] Customizable themes and layouts
- [ ] Export to various formats (PDF, HTML, etc.)
- [ ] Collaborative editing with real-time sync

### Advanced Features

- [ ] Plugin system for custom transformations
- [ ] Document templates and boilerplates
- [ ] Version control integration
- [ ] Advanced diff visualization

## Contributing

This is a demonstration project. To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for educational and demonstration purposes.

---

**Note**: This application processes the provided `manual.mmd` file containing control valve documentation. The AI assistant can help you reorganize, format, and edit this technical content using natural language commands.

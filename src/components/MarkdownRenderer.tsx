'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Selection } from '@/types';

interface MarkdownRendererProps {
  content: string;
  onSelection?: (selection: Selection) => void;
}

export default function MarkdownRenderer({
  content,
  onSelection
}: MarkdownRendererProps) {
  const [selectedText, setSelectedText] = useState<Selection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectedText(null);
        return;
      }

      const selectedContent = selection.toString();
      if (selectedContent.trim()) {
        const range = selection.getRangeAt(0);
        const container = containerRef.current;

        if (container && container.contains(range.commonAncestorContainer)) {
          // Calculate character positions in the content
          const preSelectionRange = range.cloneRange();
          preSelectionRange.selectNodeContents(container);
          preSelectionRange.setEnd(range.startContainer, range.startOffset);

          const start = preSelectionRange.toString().length;
          const end = start + selectedContent.length;

          const newSelection: Selection = {
            start,
            end,
            text: selectedContent
          };

          setSelectedText(newSelection);
          onSelection?.(newSelection);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, [onSelection]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto relative bg-background"
    >
      {/* Content */}
      <div className="relative z-10 p-12 min-h-full">
        <div className="max-w-4xl mx-auto prose prose-slate dark:prose-invert prose-lg max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const { className, children } = props;
                const match = /language-(\w+)/.exec(className || '');
                return match ? (
                  <div className="rounded-xl overflow-hidden shadow-lg my-6 border border-border">
                    <div className="bg-muted px-4 py-2 flex items-center space-x-2 border-b border-border">
                      <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{match[1]}</span>
                    </div>
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{ margin: 0, borderRadius: 0 }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className="bg-muted text-primary px-1.5 py-0.5 rounded-md font-mono text-sm border border-border">
                    {children}
                  </code>
                );
              },
              h1: ({ children, ...props }) => (
                <h1 {...props} className="text-4xl font-bold tracking-tight text-foreground mb-8 pb-4 border-b border-border">
                  {children}
                </h1>
              ),
              h2: ({ children, ...props }) => (
                <h2 {...props} className="text-3xl font-semibold tracking-tight text-foreground mb-6 mt-10 flex items-center">
                  <span className="w-1 h-8 bg-primary rounded-full mr-3"></span>
                  {children}
                </h2>
              ),
              h3: ({ children, ...props }) => (
                <h3 {...props} className="text-2xl font-semibold text-foreground mb-4 mt-8">
                  {children}
                </h3>
              ),
              p: ({ children, ...props }) => (
                <p {...props} className="text-muted-foreground leading-7 mb-6">
                  {children}
                </p>
              ),
              ul: ({ children, ...props }) => (
                <ul {...props} className="my-6 ml-6 list-disc marker:text-primary space-y-2 text-muted-foreground">
                  {children}
                </ul>
              ),
              ol: ({ children, ...props }) => (
                <ol {...props} className="my-6 ml-6 list-decimal marker:text-primary space-y-2 text-muted-foreground">
                  {children}
                </ol>
              ),
              li: ({ children, ...props }) => (
                <li {...props} className="pl-2">
                  {children}
                </li>
              ),
              blockquote: ({ children, ...props }) => (
                <blockquote {...props} className="border-l-4 border-primary/50 pl-6 italic text-muted-foreground my-8 bg-muted/30 py-4 rounded-r-lg">
                  {children}
                </blockquote>
              ),
              a: ({ children, ...props }) => (
                <a {...props} className="text-primary hover:text-primary/80 underline decoration-primary/30 underline-offset-4 transition-colors">
                  {children}
                </a>
              ),
              table: ({ children, ...props }) => (
                <div className="overflow-x-auto my-8 rounded-lg border border-border">
                  <table {...props} className="w-full text-sm text-left">
                    {children}
                  </table>
                </div>
              ),
              th: ({ children, ...props }) => (
                <th {...props} className="bg-muted px-6 py-3 text-foreground font-semibold border-b border-border">
                  {children}
                </th>
              ),
              td: ({ children, ...props }) => (
                <td {...props} className="px-6 py-3 border-b border-border/50 text-muted-foreground">
                  {children}
                </td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {selectedText && (
        <div className="fixed bottom-8 right-[22%] z-50 animate-slide-up">
          <div className="bg-popover/90 backdrop-blur-md border border-border rounded-xl shadow-xl p-3 max-w-xs">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Selection</p>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-xs font-mono text-foreground bg-muted px-1.5 py-0.5 rounded">
                    {selectedText.text.length} chars
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
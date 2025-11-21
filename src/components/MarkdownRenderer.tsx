'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Selection, ViewportContent } from '@/types';

interface MarkdownRendererProps {
  content: string;
  onSelection?: (selection: Selection) => void;
  onViewportChange?: (viewport: ViewportContent) => void;
  fileName?: string;
}

export default function MarkdownRenderer({
  content,
  onSelection,
  onViewportChange,
  fileName
}: MarkdownRendererProps) {
  const [selectedText, setSelectedText] = useState<Selection | null>(null);
  const [viewportContent, setViewportContent] = useState<ViewportContent | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Detect if content should be rendered as raw text
  const isRawTextFile = () => {
    // Check file extension
    if (fileName && (fileName.endsWith('.mmd') || fileName.endsWith('.tex') || fileName.endsWith('.latex'))) {
      return true;
    }
    
    // Check content for LaTeX-style commands
    const latexPatterns = [
      /\\title\s*\{/,
      /\\section\s*\{/,
      /\\chapter\s*\{/,
      /\\begin\s*\{/,
      /\\end\s*\{/,
      /\\documentclass/,
      /\\usepackage/
    ];
    
    return latexPatterns.some(pattern => pattern.test(content));
  };

  // Extract visible text content from DOM elements
  const getTextFromElement = useCallback((element: Element): string => {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        text += getTextFromElement(node as Element);
      }
    }
    return text;
  }, []);

  // Calculate viewport content based on scroll position
  const updateViewportContent = useCallback(() => {
    const container = containerRef.current;
    const contentElement = contentRef.current;
    
    if (!container || !contentElement) return;

    const containerRect = container.getBoundingClientRect();
    const contentRect = contentElement.getBoundingClientRect();
    
    // Get all text elements within the content area
    const textElements = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote');
    let visibleText = '';
    let visibleStart = 0;
    let visibleEnd = 0;
    let totalChars = 0;
    let foundStart = false;

    for (const element of textElements) {
      const elementRect = element.getBoundingClientRect();
      const elementText = getTextFromElement(element);
      
      // Check if element is visible in viewport
      const isVisible = !(
        elementRect.bottom < containerRect.top ||
        elementRect.top > containerRect.bottom
      );

      if (isVisible && !foundStart) {
        visibleStart = totalChars;
        foundStart = true;
      }

      if (isVisible) {
        visibleText += elementText + '\\n';
        visibleEnd = totalChars + elementText.length;
      }

      totalChars += elementText.length + 1; // +1 for newline
    }

    const viewport: ViewportContent = {
      text: visibleText.trim(),
      start: visibleStart,
      end: visibleEnd,
      scrollTop: container.scrollTop,
      viewportHeight: containerRect.height
    };

    setViewportContent(viewport);
    onViewportChange?.(viewport);
  }, [content, onViewportChange, getTextFromElement]);

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

  // Update viewport content on scroll and resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateViewportContent();
    };

    const handleResize = () => {
      setTimeout(updateViewportContent, 100); // Debounce resize
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    
    // Initial viewport update
    setTimeout(updateViewportContent, 500); // Allow content to render first

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateViewportContent]);

  // Update viewport when content changes
  useEffect(() => {
    const timer = setTimeout(updateViewportContent, 300);
    return () => clearTimeout(timer);
  }, [content, updateViewportContent]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto relative bg-background"
    >
      {/* Content */}
      <div ref={contentRef} className="relative z-10 p-12 min-h-full">
        {isRawTextFile() ? (
          // Raw text rendering for .mmd, .tex, .latex files
          <div className="max-w-4xl mx-auto">
            <div className="bg-muted/30 rounded-lg border border-border p-6">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {fileName ? fileName.split('/').pop() : 'Raw Text Document'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  {content.split('\\n').length} lines
                </span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed overflow-x-auto">
                {content}
              </pre>
            </div>
          </div>
        ) : (
          // Markdown rendering
          <div className="max-w-4xl mx-auto prose prose-slate dark:prose-invert prose-lg">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
                  const { className, children } = props;
                  const match = /language-(\\w+)/.exec(className || '');
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
                        {String(children).replace(/\\n$/, '')}
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
        )}
      </div>      {selectedText && (
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
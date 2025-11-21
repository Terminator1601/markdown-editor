'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Selection, ViewportContent } from '@/types';
import { ChevronUp, ChevronDown, Search, X, ArrowUp, ArrowDown } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onSelection?: (selection: Selection) => void;
  onViewportChange?: (viewport: ViewportContent) => void;
  fileName?: string;
}

// Virtual window configuration
const WINDOW_SIZE = 20; // Number of lines to show
const SCROLL_BUFFER = 2; // Extra lines to keep for smooth scrolling

export default function MarkdownRenderer({
  content,
  onSelection,
  onViewportChange,
  fileName
}: MarkdownRendererProps) {
  const [selectedText, setSelectedText] = useState<Selection | null>(null);
  const [currentWindowStart, setCurrentWindowStart] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{lineIndex: number, charIndex: number, line: string}>>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [showSearch, setShowSearch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Split content into lines for windowed view
  const contentLines = useMemo(() => {
    return content.split('\n');
  }, [content]);

  // Calculate visible lines window
  const visibleLines = useMemo(() => {
    const endIndex = Math.min(currentWindowStart + WINDOW_SIZE, contentLines.length);
    return contentLines.slice(currentWindowStart, endIndex);
  }, [contentLines, currentWindowStart]);

  // Calculate window metrics
  const windowMetrics = useMemo(() => {
    const totalLines = contentLines.length;
    const windowEnd = Math.min(currentWindowStart + WINDOW_SIZE, totalLines);
    const hasMore = windowEnd < totalLines;
    const hasPrevious = currentWindowStart > 0;
    const progress = totalLines > 0 ? (windowEnd / totalLines) * 100 : 0;
    
    return {
      totalLines,
      windowStart: currentWindowStart,
      windowEnd,
      hasMore,
      hasPrevious,
      progress: Math.round(progress)
    };
  }, [contentLines.length, currentWindowStart]);

  // Handle window scrolling
  const scrollWindow = useCallback((direction: 'up' | 'down') => {
    setCurrentWindowStart(prev => {
      if (direction === 'up') {
        return Math.max(0, prev - SCROLL_BUFFER);
      } else {
        return Math.min(contentLines.length - WINDOW_SIZE, prev + SCROLL_BUFFER);
      }
    });
  }, [contentLines.length]);

  // Handle wheel scrolling
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const isScrollingDown = e.deltaY > 0;
    
    if (isScrollingDown && windowMetrics.hasMore) {
      scrollWindow('down');
    } else if (!isScrollingDown && windowMetrics.hasPrevious) {
      scrollWindow('up');
    }
  }, [windowMetrics.hasMore, windowMetrics.hasPrevious, scrollWindow]);

  // Detect if content should be rendered as raw text
  const isRawTextFile = useCallback(() => {
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
  }, [fileName, content]);

  const isWindowed = useCallback(() => {
    return isRawTextFile() && content.length > 500; // Simple windowing logic
  }, [isRawTextFile, content]);

  // Clean selected text by removing line numbers
  const cleanSelectedText = useCallback((rawText: string): string => {
    if (!isRawTextFile()) {
      return rawText; // No line numbers in markdown mode
    }

    // Remove line numbers from the beginning of each line
    // Pattern: remove digits followed by optional spaces at the start of lines
    return rawText
      .split('\n')
      .map(line => {
        // Remove line numbers (digits + spaces) from the beginning of the line
        return line.replace(/^\s*\d+\s*/, '');
      })
      .join('\n')
      .trim();
  }, [isRawTextFile]);

  // Search functionality
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    const results: Array<{lineIndex: number, charIndex: number, line: string}> = [];
    const searchTerm = query.toLowerCase();
    
    contentLines.forEach((line, lineIndex) => {
      const lowerLine = line.toLowerCase();
      let charIndex = 0;
      
      while ((charIndex = lowerLine.indexOf(searchTerm, charIndex)) !== -1) {
        results.push({
          lineIndex,
          charIndex,
          line: line
        });
        charIndex += searchTerm.length;
      }
    });
    
    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
    
    // Navigate to first result if found
    if (results.length > 0 && isRawTextFile()) {
      const firstResult = results[0];
      const targetWindowStart = Math.max(0, firstResult.lineIndex - Math.floor(WINDOW_SIZE / 2));
      setCurrentWindowStart(targetWindowStart);
    }
  }, [contentLines, isRawTextFile]);

  const navigateSearch = useCallback((direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    
    let newIndex;
    if (direction === 'next') {
      newIndex = currentSearchIndex + 1;
      if (newIndex >= searchResults.length) newIndex = 0;
    } else {
      newIndex = currentSearchIndex - 1;
      if (newIndex < 0) newIndex = searchResults.length - 1;
    }
    
    setCurrentSearchIndex(newIndex);
    
    // Navigate to the result in windowed view
    if (isRawTextFile()) {
      const result = searchResults[newIndex];
      const targetWindowStart = Math.max(0, result.lineIndex - Math.floor(WINDOW_SIZE / 2));
      setCurrentWindowStart(targetWindowStart);
    }
  }, [searchResults, currentSearchIndex, isRawTextFile]);

  const highlightSearchTerm = useCallback((text: string, isCurrentResult: boolean = false) => {
    if (!searchQuery.trim()) return text;
    
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, (match) => {
      const bgClass = isCurrentResult ? 'bg-yellow-400 text-black' : 'bg-yellow-200 text-black';
      return `<mark class="${bgClass} px-1 rounded">${match}</mark>`;
    });
  }, [searchQuery]);

  // Update viewport content for windowed view
  const updateWindowedViewportContent = useCallback(() => {
    const visibleText = visibleLines.join('\n');
    // Calculate the character position in the full document
    let startChar = 0;
    if (currentWindowStart > 0) {
      const beforeLines = contentLines.slice(0, currentWindowStart);
      startChar = beforeLines.join('\n').length + (beforeLines.length > 0 ? 1 : 0); // +1 for the newline after previous content
    }
    const endChar = startChar + visibleText.length;

    const viewport: ViewportContent = {
      text: visibleText,
      start: startChar,
      end: endChar,
      scrollTop: currentWindowStart,
      viewportHeight: WINDOW_SIZE
    };

    console.log(`Windowed viewport updated:`, {
      windowStart: currentWindowStart,
      textLength: visibleText.length,
      startChar,
      endChar,
      preview: visibleText.substring(0, 100) + '...'
    });

    onViewportChange?.(viewport);
  }, [visibleLines, contentLines, currentWindowStart, onViewportChange]);

  // Extract visible text content from DOM elements (for markdown mode)
  const getTextFromElement = useCallback((element: Element): string => {
    let text = '';
    const processNode = (node: ChildNode): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        let nodeText = '';
        for (const child of (node as Element).childNodes) {
          nodeText += processNode(child);
        }
        return nodeText;
      }
      return '';
    };
    
    for (const node of element.childNodes) {
      text += processNode(node);
    }
    return text;
  }, []);

  // Calculate viewport content based on scroll position (for markdown mode)
  const updateViewportContent = useCallback(() => {
    const container = containerRef.current;
    const contentElement = contentRef.current;
    
    if (!container || !contentElement) return;

    const containerRect = container.getBoundingClientRect();
    
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
        visibleText += elementText + '\n';
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

    onViewportChange?.(viewport);
  }, [onViewportChange, getTextFromElement]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search shortcuts
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        return;
      }
      
      if (e.key === 'Escape' && showSearch) {
        e.preventDefault();
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
        setCurrentSearchIndex(-1);
        return;
      }
      
      if (showSearch) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            navigateSearch('prev');
          } else {
            navigateSearch('next');
          }
          return;
        }
        if (e.key === 'F3') {
          e.preventDefault();
          if (e.shiftKey) {
            navigateSearch('prev');
          } else {
            navigateSearch('next');
          }
          return;
        }
      }
      
      if (!isRawTextFile()) return;
      
      if (e.key === 'ArrowUp' && e.ctrlKey && windowMetrics.hasPrevious) {
        e.preventDefault();
        scrollWindow('up');
      } else if (e.key === 'ArrowDown' && e.ctrlKey && windowMetrics.hasMore) {
        e.preventDefault();
        scrollWindow('down');
      } else if (e.key === 'Home' && e.ctrlKey) {
        e.preventDefault();
        setCurrentWindowStart(0);
      } else if (e.key === 'End' && e.ctrlKey) {
        e.preventDefault();
        setCurrentWindowStart(Math.max(0, contentLines.length - WINDOW_SIZE));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [windowMetrics.hasPrevious, windowMetrics.hasMore, scrollWindow, contentLines.length, isRawTextFile, showSearch, navigateSearch, searchQuery]);

  // Handle search query changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 300); // Debounce search
    
    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch]);

  // Set up wheel event listener for windowed view
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isRawTextFile()) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel, isRawTextFile]);

  // Update viewport content when window changes
  useEffect(() => {
    // Use requestAnimationFrame to avoid synchronous setState warnings
    const updateViewport = () => {
      if (isRawTextFile()) {
        updateWindowedViewportContent();
      } else {
        updateViewportContent();
      }
    };
    
    requestAnimationFrame(updateViewport);
  }, [currentWindowStart, visibleLines, isRawTextFile, updateWindowedViewportContent, updateViewportContent]);

  // Force viewport update when content changes in windowed mode
  useEffect(() => {
    if (isRawTextFile() && content) {
      // Small delay to ensure DOM is updated and avoid synchronous setState
      const timer = setTimeout(() => {
        updateWindowedViewportContent();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [content, isRawTextFile, updateWindowedViewportContent]);

  // Selection handling
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
          // Clean the selected text of line numbers before processing
          const cleanText = cleanSelectedText(selectedContent);
          
          let start = 0;
          let end = cleanText.length;

          if (isRawTextFile()) {
            // For windowed raw text files, calculate positions based on actual document content
            // CRITICAL: The selectedContent includes line numbers, but cleanText removes them
            // We need to find the cleanText in the full document to get accurate positions
            const documentText = content;
            
            console.log('Raw text selection debugging:', {
              selectedContent: selectedContent.substring(0, 100) + '...',
              cleanText: cleanText.substring(0, 100) + '...',
              cleanTextLength: cleanText.length,
              selectedContentLength: selectedContent.length,
              currentWindowStart,
              documentTextLength: documentText.length,
              isWindowed: isWindowed()
            });
            
            // Try exact match first
            const exactMatch = documentText.indexOf(cleanText);
            if (exactMatch !== -1) {
              start = exactMatch;
              end = exactMatch + cleanText.length;
              console.log(`Exact match found: ${start}-${end}`);
            } else {
              // If no exact match, try to find by using first and last lines
              const cleanLines = cleanText.split('\n').filter(line => line.trim());
              if (cleanLines.length > 0) {
                const firstLine = cleanLines[0].trim();
                const lastLine = cleanLines[cleanLines.length - 1].trim();
                
                console.log('Line-based matching:', {
                  firstLine: firstLine.substring(0, 50) + '...',
                  lastLine: lastLine.substring(0, 50) + '...',
                  cleanLinesCount: cleanLines.length
                });
                
                // Find the first line in the document
                const firstLineIndex = documentText.indexOf(firstLine);
                if (firstLineIndex !== -1) {
                  start = firstLineIndex;
                  
                  // If we have multiple lines, try to find the end
                  if (cleanLines.length > 1 && lastLine !== firstLine) {
                    // Look for the last line starting from first line position
                    const lastLineIndex = documentText.indexOf(lastLine, firstLineIndex);
                    if (lastLineIndex !== -1) {
                      end = lastLineIndex + lastLine.length;
                    } else {
                      // Fallback: estimate end position
                      end = start + cleanText.length;
                    }
                  } else {
                    end = start + firstLine.length;
                  }
                  console.log(`Line-based match found: ${start}-${end}`);
                } else {
                  // Last resort: use a more flexible search
                  console.warn('Could not find exact lines, using flexible search');
                  const words = firstLine.split(/\s+/).filter(w => w.length > 2);
                  if (words.length > 0) {
                    const searchWord = words[0];
                    const wordIndex = documentText.indexOf(searchWord);
                    if (wordIndex !== -1) {
                      start = wordIndex;
                      end = start + cleanText.length;
                      console.log(`Word-based match found: ${start}-${end}`);
                    }
                  }
                }
              }
            }
          } else {
            // For markdown mode, use DOM-based calculation
            const preSelectionRange = range.cloneRange();
            preSelectionRange.selectNodeContents(container);
            preSelectionRange.setEnd(range.startContainer, range.startOffset);

            start = preSelectionRange.toString().length;
            end = start + selectedContent.length;
          }

          const newSelection: Selection = {
            start,
            end,
            text: cleanText // Use cleaned text for API calls
          };

          setSelectedText(newSelection);
          onSelection?.(newSelection);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, [onSelection, isRawTextFile, content, cleanSelectedText, currentWindowStart, isWindowed]);

  // Update viewport content on scroll and resize (for markdown mode)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isRawTextFile()) return;

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
  }, [updateViewportContent, isRawTextFile]);

  // Update viewport when content changes (for markdown mode)
  useEffect(() => {
    if (!isRawTextFile()) {
      const timer = setTimeout(updateViewportContent, 300);
      return () => clearTimeout(timer);
    }
  }, [content, updateViewportContent, isRawTextFile]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto relative bg-background"
    >
      {/* Content */}
      <div ref={contentRef} className="relative z-10 p-12 min-h-full">
        {isRawTextFile() ? (
          // Windowed raw text rendering for .mmd, .tex, .latex files
          <div className="max-w-4xl mx-auto">
            <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
              {/* Header with file info and progress */}
              <div className="flex items-center justify-between p-4 bg-background/50 backdrop-blur-sm border-b border-border">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {fileName ? fileName.split('/').pop() : 'Raw Text Document'}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    Lines {windowMetrics.windowStart + 1}-{windowMetrics.windowEnd} of {windowMetrics.totalLines}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setShowSearch(!showSearch);
                      if (!showSearch) {
                        setTimeout(() => searchInputRef.current?.focus(), 100);
                      }
                    }}
                    className={`p-2 rounded transition-colors ${
                      showSearch 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                    title="Search (Ctrl+F)"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <div className="flex items-center space-x-1">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${windowMetrics.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-muted-foreground">{windowMetrics.progress}%</span>
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              {showSearch && (
                <div className="px-4 py-3 bg-background/50 border-b border-border">
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 relative">
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search in document..."
                        className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            setSearchResults([]);
                            setCurrentSearchIndex(-1);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => navigateSearch('prev')}
                        disabled={searchResults.length === 0}
                        className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded"
                        title="Previous (Shift+Enter)"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => navigateSearch('next')}
                        disabled={searchResults.length === 0}
                        className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded"
                        title="Next (Enter)"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <span className="text-xs text-muted-foreground min-w-0 whitespace-nowrap px-2">
                        {searchResults.length > 0 ? (
                          `${currentSearchIndex + 1} of ${searchResults.length}`
                        ) : (
                          searchQuery ? 'No results' : ''
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                        setSearchResults([]);
                        setCurrentSearchIndex(-1);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                      title="Close (Esc)"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation controls */}
              <div className="flex items-center justify-between px-4 py-2 bg-background/30 border-b border-border">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => scrollWindow('up')}
                    disabled={!windowMetrics.hasPrevious}
                    className="p-1 rounded bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => scrollWindow('down')}
                    disabled={!windowMetrics.hasMore}
                    className="p-1 rounded bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Use mouse wheel, arrow keys (Ctrl+↑/↓), or buttons to navigate
                </div>
              </div>

              {/* Windowed content display */}
              <div className="relative">
                <pre className="whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed p-6 min-h-[600px] overflow-x-auto">
                  {visibleLines.map((line, index) => {
                    const globalLineIndex = currentWindowStart + index;
                    const currentResult = searchResults[currentSearchIndex];
                    const isCurrentResultLine = currentResult && currentResult.lineIndex === globalLineIndex;
                    
                    let displayLine = line;
                    if (searchQuery && line.toLowerCase().includes(searchQuery.toLowerCase())) {
                      displayLine = highlightSearchTerm(line, isCurrentResultLine);
                    }
                    
                    return (
                      <div 
                        key={currentWindowStart + index}
                        className={`${index === 0 || index === visibleLines.length - 1 ? 'opacity-60' : ''} transition-opacity duration-200 min-h-6 flex`}
                      >
                        <span className="inline-block w-8 text-right text-muted-foreground/50 mr-3 text-xs select-none pointer-events-none shrink-0">
                          {currentWindowStart + index + 1}
                        </span>
                        <span 
                          className="flex-1 whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: displayLine || ' ' }}
                        />
                      </div>
                    );
                  })}
                  
                  {/* Fade indicators */}
                  {windowMetrics.hasPrevious && (
                    <div className="absolute top-0 left-0 right-0 h-12 bg-linear-to-b from-muted/30 to-transparent pointer-events-none"></div>
                  )}
                  {windowMetrics.hasMore && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-linear-to-t from-muted/30 to-transparent pointer-events-none"></div>
                  )}
                </pre>
              </div>

              {/* Footer with window info */}
              <div className="flex items-center justify-between px-4 py-2 bg-background/30 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Window: {WINDOW_SIZE} lines | Buffer: {SCROLL_BUFFER} lines
                </span>
                <span className="text-xs text-muted-foreground">
                  Ctrl+F: Search | Ctrl+Home/End: Navigation
                </span>
              </div>
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
        )}
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
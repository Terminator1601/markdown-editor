'use client';

import { useState, useEffect, useRef } from 'react';
import { Undo, Redo, Save, RefreshCw, MessageSquare, FileText } from 'lucide-react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import ChatPanel from '@/components/ChatPanel';
import DiffViewer from '@/components/DiffViewer';
import { DocumentState, EditRequest, EditProposal, Selection, ViewportContent } from '@/types';
import { saveToLocalStorage, loadFromLocalStorage, debounce } from '@/utils/storage';

export default function MarkdownEditor() {
  const [documentState, setDocumentState] = useState<DocumentState>({
    content: '',
    history: [''],
    currentIndex: 0,
    lastSaved: new Date()
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<EditProposal | null>(null);
  const [selectedText, setSelectedText] = useState<Selection | null>(null);
  const [viewportContent, setViewportContent] = useState<ViewportContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'editor' | 'chat'>('editor');
  const addAssistantMessageRef = useRef<((content: string) => void) | null>(null);

  // Mobile detection and resize handler
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Reset to editor view when switching to desktop
      if (!mobile) {
        setMobileView('editor');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load initial content and saved state
  useEffect(() => {
    const loadInitialContent = async () => {
      try {
        // Try to load from localStorage first
        const savedState = loadFromLocalStorage();
        if (savedState && savedState.content) {
          setDocumentState(savedState);
          return;
        }

        // Load the manual.mmd file
        const response = await fetch('/manual.mmd');
        if (response.ok) {
          const content = await response.text();
          const newState: DocumentState = {
            content,
            history: [content],
            currentIndex: 0,
            lastSaved: new Date()
          };
          setDocumentState(newState);
        }
      } catch (error) {
        console.error('Error loading initial content:', error);
      }
    };

    loadInitialContent();
    
    // 4-second loading timer with progress
    const startTime = Date.now();
    const duration = 4000; // 4 seconds
    
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setLoadingProgress(progress);
      
      if (progress >= 100) {
        clearInterval(progressInterval);
        setTimeout(() => setIsLoading(false), 200); // Small delay for smooth transition
      }
    }, 50); // Update every 50ms for smooth progress
    
    return () => clearInterval(progressInterval);
  }, []);

  // Debounced save to localStorage
  const debouncedSave = debounce((state: DocumentState) => {
    saveToLocalStorage(state);
  }, 1000);

  useEffect(() => {
    if (documentState.content) {
      debouncedSave(documentState);
    }
  }, [documentState, debouncedSave]);

  const handleEditRequest = async (request: EditRequest) => {
    setIsProcessing(true);

    // Determine what content to send and prepare parameters
    let contentToSend = documentState.content;
    let isSelection = false;
    let selectedTextToSend = '';
    let selectionStart = 0;
    let selectionEnd = documentState.content.length;
    let useViewport = false;

    // Priority: 1. Selected text, 2. Viewport content, 3. Full document
    if (selectedText && selectedText.text.trim()) {
      isSelection = true;
      selectedTextToSend = selectedText.text;
      selectionStart = selectedText.start;
      selectionEnd = selectedText.end;
      contentToSend = documentState.content; // Keep full content for context but send selected text separately
      
      console.log(`Processing selected text: "${selectedText.text.substring(0, 50)}..." (${selectionStart}-${selectionEnd})`);
    } else if (viewportContent && viewportContent.text.trim()) {
      // Use viewport content when no text is selected
      useViewport = true;
      selectedTextToSend = viewportContent.text;
      selectionStart = viewportContent.start;
      selectionEnd = viewportContent.end;
      contentToSend = documentState.content;
      
      console.log(`Processing viewport content: "${viewportContent.text.substring(0, 50)}..." (${selectionStart}-${selectionEnd})`);
      console.log(`Viewport info - scrollTop: ${viewportContent.scrollTop}, height: ${viewportContent.viewportHeight}`);
    }

    try {
      const requestBody = {
        messages: [
          { role: 'user', content: request.text }
        ],
        currentContent: contentToSend,
        isSelection: isSelection || useViewport,
        selectedText: selectedTextToSend,
        selectionStart,
        selectionEnd,
        isViewport: useViewport,
        viewportInfo: useViewport ? {
          scrollTop: viewportContent?.scrollTop,
          viewportHeight: viewportContent?.viewportHeight
        } : undefined
      };

      console.log('Sending request:', { 
        isSelection: isSelection || useViewport, 
        selectedTextLength: selectedTextToSend.length,
        contentLength: contentToSend.length,
        useViewport
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }
      if (!response.body) throw new Error('No response body');

      // Read headers for context info
      const targetStartHeader = response.headers.get('X-Target-Start');
      const targetEndHeader = response.headers.get('X-Target-End');
      const isSelectionHeader = response.headers.get('X-Is-Selection') === 'true';
      const isViewportHeader = response.headers.get('X-Is-Viewport') === 'true';
      const originalSelectionStartHeader = response.headers.get('X-Original-Selection-Start');
      const originalSelectionEndHeader = response.headers.get('X-Original-Selection-End');

      let targetStart = 0;
      let targetEnd = documentState.content.length;

      // CRITICAL FIX: Always use the original selection positions for selected text
      // This ensures we replace exactly what was selected, not what headers suggest
      if (isSelection && selectedText) {
        // Use original selection positions first
        targetStart = selectedText.start;
        targetEnd = selectedText.end;
        
        console.log(`ORIGINAL selection data:`, {
          start: selectedText.start,
          end: selectedText.end,
          text: selectedText.text.substring(0, 100) + '...',
          textLength: selectedText.text.length
        });
        
        // Double-check with API headers if available
        if (originalSelectionStartHeader && originalSelectionEndHeader) {
          const apiStart = parseInt(originalSelectionStartHeader);
          const apiEnd = parseInt(originalSelectionEndHeader);
          console.log(`API header positions: ${apiStart}-${apiEnd}`);
          if (apiStart !== targetStart || apiEnd !== targetEnd) {
            console.warn(`Selection position mismatch: Frontend(${targetStart}-${targetEnd}) vs API(${apiStart}-${apiEnd})`);
          }
        }
        
        console.log(`Using ORIGINAL selection positions: ${targetStart}-${targetEnd}`);
      } else if (useViewport && viewportContent) {
        targetStart = viewportContent.start;
        targetEnd = viewportContent.end;
        console.log(`Using ORIGINAL viewport positions: ${targetStart}-${targetEnd}`);
      } else if (targetStartHeader && targetEndHeader) {
        targetStart = parseInt(targetStartHeader);
        targetEnd = parseInt(targetEndHeader);
        console.log(`Using API-determined positions: ${targetStart}-${targetEnd}`);
      }

      console.log(`Response targeting: ${targetStart}-${targetEnd}, isSelection: ${isSelectionHeader}, isViewport: ${isViewportHeader}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedContent += chunk;
      }

      // Extract markdown content from the response
      const markdownMatch = accumulatedContent.match(/```markdown\n([\s\S]*?)\n```/);

      if (markdownMatch) {
        const newContent = markdownMatch[1];

        // CRITICAL VALIDATION: For selected text, verify we're only replacing what was selected
        if (isSelection && selectedText) {
          const originalSelectedContent = documentState.content.substring(targetStart, targetEnd);
          console.log(`Original selected: "${originalSelectedContent}"`);
          console.log(`AI returned: "${newContent}"`);
          console.log(`Selection boundaries: ${targetStart}-${targetEnd}`);
          
          // Double-check that our selection boundaries are correct
          if (originalSelectedContent !== selectedText.text) {
            console.warn('Selection mismatch detected! Using original selection text for safety.');
            // Find the exact position of the selected text in the document
            const exactIndex = documentState.content.indexOf(selectedText.text);
            if (exactIndex !== -1) {
              targetStart = exactIndex;
              targetEnd = exactIndex + selectedText.text.length;
              console.log(`Corrected positions: ${targetStart}-${targetEnd}`);
            }
          }
        }

        // Reconstruct the full document with proper positioning
        const before = documentState.content.substring(0, targetStart);
        const after = documentState.content.substring(targetEnd);
        const fullModifiedContent = before + newContent + after;

        console.log(`Document reconstruction:
- Before: "${before.substring(Math.max(0, before.length - 50))}"
- New content: "${newContent}"  
- After: "${after.substring(0, 50)}"
- Total length: ${fullModifiedContent.length} (was ${documentState.content.length})`);

        const proposal: EditProposal = {
          id: Date.now().toString(),
          original: documentState.content,
          modified: fullModifiedContent,
          description: isSelectionHeader ? 'AI Edit (Selected Text)' : 'AI Edit (Smart Context)'
        };
        setCurrentProposal(proposal);

        // Add assistant message with the explanation (everything outside the code block)
        const explanation = accumulatedContent.replace(/```markdown\n[\s\S]*?\n```/, '').trim();
        if (explanation && addAssistantMessageRef.current) {
          addAssistantMessageRef.current(explanation);
        }
      } else {
        // Just a chat response without code block
        if (addAssistantMessageRef.current) {
          addAssistantMessageRef.current(accumulatedContent);
        }
      }

    } catch (error) {
      console.error('Edit request failed:', error);
      if (addAssistantMessageRef.current) {
        addAssistantMessageRef.current('Sorry, I encountered an error processing your request. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const acceptEdit = () => {
    if (!currentProposal) return;

    const newContent = currentProposal.modified;
    const newHistory = [...documentState.history.slice(0, documentState.currentIndex + 1), newContent];

    const newState: DocumentState = {
      content: newContent,
      history: newHistory,
      currentIndex: newHistory.length - 1,
      lastSaved: new Date()
    };

    setDocumentState(newState);
    setCurrentProposal(null);
    setSelectedText(null);
  };

  const discardEdit = () => {
    setCurrentProposal(null);
  };

  const undo = () => {
    if (documentState.currentIndex > 0) {
      const newIndex = documentState.currentIndex - 1;
      setDocumentState(prev => ({
        ...prev,
        content: prev.history[newIndex],
        currentIndex: newIndex
      }));
    }
  };

  const redo = () => {
    if (documentState.currentIndex < documentState.history.length - 1) {
      const newIndex = documentState.currentIndex + 1;
      setDocumentState(prev => ({
        ...prev,
        content: prev.history[newIndex],
        currentIndex: newIndex
      }));
    }
  };

  const saveDocument = () => {
    saveToLocalStorage(documentState);
    alert('Document saved locally!');
  };

  const reloadDocument = async () => {
    try {
      const response = await fetch('/manual.mmd');
      if (response.ok) {
        const content = await response.text();
        const newState: DocumentState = {
          content,
          history: [content],
          currentIndex: 0,
          lastSaved: new Date()
        };
        setDocumentState(newState);
        setCurrentProposal(null);
        setSelectedText(null);
      }
    } catch (error) {
      console.error('Failed to reload document:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="text-center p-6 md:p-10 bg-background border border-border rounded-2xl shadow-2xl shadow-primary/10 max-w-sm w-full">
          {/* Logo matching the toolbar */}
          <div className="flex justify-center mb-6 md:mb-8">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-linear-to-br from-primary to-violet-600 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl md:text-2xl">M</span>
            </div>
          </div>
          
          <h1 className="text-xl md:text-2xl font-bold bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent mb-3">
            Welcome to Markdown Editor
          </h1>
          <p className="text-muted-foreground mb-6 md:mb-8 text-base md:text-lg">Please wait while we load everything for you</p>
          
          {/* Progress Bar matching the design system */}
          <div className="w-full max-w-sm mx-auto mb-4 md:mb-6">
            <div className="h-2 md:h-3 bg-secondary rounded-full overflow-hidden border border-border">
              <div 
                className="h-full bg-linear-to-r from-primary to-violet-600 rounded-full transition-all duration-300 ease-out shadow-inner"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center mt-2 md:mt-3">
              <span className="text-sm text-muted-foreground font-medium">Loading...</span>
              <span className="text-sm font-medium text-primary">{Math.round(loadingProgress)}%</span>
            </div>
          </div>
          
          {/* Spinner matching the toolbar refresh icon */}
          <div className="flex justify-center mb-4 md:mb-6">
            <RefreshCw className="w-6 h-6 md:w-8 md:h-8 animate-spin text-primary" />
          </div>
          
          <div className="flex justify-center space-x-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans overflow-hidden">
      {/* Modern Toolbar */}
      <div className="h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6 z-50">
        <div className="flex items-center space-x-2 md:space-x-4">
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-linear-to-br from-primary to-violet-600 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
              <span className="text-white font-bold text-lg md:text-xl">M</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base md:text-lg font-bold bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Markdown Editor</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${documentState.content ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`}></div>
                <span className="text-xs text-muted-foreground font-medium">
                  {documentState.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
          
          {/* Mobile Navigation Toggle */}
          {isMobile && (
            <div className="flex items-center space-x-1 bg-secondary/50 p-1 rounded-lg border border-border/50">
              <button
                onClick={() => setMobileView('editor')}
                className={`p-2 rounded-md transition-all duration-200 ${
                  mobileView === 'editor'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background'
                }`}
                title="Editor View"
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMobileView('chat')}
                className={`p-2 rounded-md transition-all duration-200 ${
                  mobileView === 'chat'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background'
                }`}
                title="Chat View"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-1 bg-secondary/50 p-1 rounded-lg md:rounded-xl border border-border/50">
          <button
            onClick={undo}
            disabled={documentState.currentIndex === 0}
            className="p-2 md:p-2.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md md:rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-200"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={documentState.currentIndex >= documentState.history.length - 1}
            className="p-2 md:p-2.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md md:rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-200"
            title="Redo (Ctrl+Y)"
          >
            <Redo className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1"></div>
          <button
            onClick={saveDocument}
            className="p-2 md:p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md md:rounded-lg transition-all duration-200"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={reloadDocument}
            className="hidden sm:block p-2 md:p-2.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md md:rounded-lg transition-all duration-200"
            title="Reset to Original"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content - Responsive Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {!isMobile ? (
          // Desktop Layout - 80/20 Split
          <>
            {/* Left Panel - Markdown Viewer (80%) */}
            <div className="w-[80%] h-full flex flex-col relative border-r border-border bg-secondary/30">
              <div className="flex-1 overflow-hidden relative">
                <MarkdownRenderer
                  content={documentState.content}
                  onSelection={setSelectedText}
                  onViewportChange={setViewportContent}
                  fileName="manual.mmd"
                />

                {/* Floating Diff Viewer Overlay */}
                {currentProposal && (
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-background/95 backdrop-blur-xl border-t border-border shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] animate-slide-up z-20 max-h-[50vh] overflow-auto">
                    <DiffViewer
                      proposal={currentProposal}
                      onAccept={acceptEdit}
                      onDiscard={discardEdit}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Chat Interface (20%) */}
            <div className="w-[20%] h-full bg-background flex flex-col relative z-10 shadow-xl shadow-black/5">
              <ChatPanel
                onEditRequest={handleEditRequest}
                isProcessing={isProcessing}
                selectedText={selectedText?.text}
                onAddAssistantMessage={(fn) => { addAssistantMessageRef.current = fn; }}
              />
            </div>
          </>
        ) : (
          // Mobile Layout - Single Panel
          <div className="w-full h-full flex flex-col relative">
            {mobileView === 'editor' ? (
              <div className="w-full h-full flex flex-col relative bg-secondary/30">
                <div className="flex-1 overflow-hidden relative">
                  <MarkdownRenderer
                    content={documentState.content}
                    onSelection={setSelectedText}
                    onViewportChange={setViewportContent}
                    fileName="manual.mmd"
                  />

                  {/* Mobile Diff Viewer Overlay */}
                  {currentProposal && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-xl border-t border-border shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] animate-slide-up z-20 max-h-[60vh] overflow-auto">
                      <DiffViewer
                        proposal={currentProposal}
                        onAccept={acceptEdit}
                        onDiscard={discardEdit}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full h-full bg-background flex flex-col relative z-10">
                <ChatPanel
                  onEditRequest={handleEditRequest}
                  isProcessing={isProcessing}
                  selectedText={selectedText?.text}
                  onAddAssistantMessage={(fn) => { addAssistantMessageRef.current = fn; }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
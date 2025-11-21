'use client';

import { useState, useEffect, useRef } from 'react';
import { Undo, Redo, Save, RefreshCw } from 'lucide-react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import ChatPanel from '@/components/ChatPanel';
import DiffViewer from '@/components/DiffViewer';
import { DocumentState, EditRequest, EditProposal, Selection } from '@/types';
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
  const [isLoading, setIsLoading] = useState(true);
  const addAssistantMessageRef = useRef<((content: string) => void) | null>(null);

  // Load initial content and saved state
  useEffect(() => {
    const loadInitialContent = async () => {
      try {
        // Try to load from localStorage first
        const savedState = loadFromLocalStorage();
        if (savedState && savedState.content) {
          setDocumentState(savedState);
          setIsLoading(false);
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
        console.error('Failed to load content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialContent();
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

    // Determine what content to send
    let contentToSend = documentState.content;
    let isSelection = false;

    if (selectedText && selectedText.text.trim()) {
      contentToSend = selectedText.text;
      isSelection = true;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: request.text }
          ],
          currentContent: contentToSend,
          isSelection
        })
      });

      if (!response.ok) throw new Error('Failed to get response');
      if (!response.body) throw new Error('No response body');

      // Read headers for smart context info
      const targetStartHeader = response.headers.get('X-Target-Start');
      const targetEndHeader = response.headers.get('X-Target-End');

      let targetStart = 0;
      let targetEnd = documentState.content.length;

      if (isSelection && selectedText) {
        targetStart = selectedText.start;
        targetEnd = selectedText.end;
      } else if (targetStartHeader && targetEndHeader) {
        targetStart = parseInt(targetStartHeader);
        targetEnd = parseInt(targetEndHeader);
      }

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

        // Reconstruct the full document
        const before = documentState.content.substring(0, targetStart);
        const after = documentState.content.substring(targetEnd);
        const fullModifiedContent = before + newContent + after;

        const proposal: EditProposal = {
          id: Date.now().toString(),
          original: documentState.content,
          modified: fullModifiedContent,
          description: isSelection ? 'AI Edit (Selection)' : 'AI Edit (Smart Context)'
        };
        setCurrentProposal(proposal);

        // Add assistant message with the explanation (everything outside the code block)
        const explanation = accumulatedContent.replace(/```markdown\n[\s\S]*?\n```/, '').trim();
        if (explanation && addAssistantMessageRef.current) {
          addAssistantMessageRef.current(explanation);
        }
      } else {
        // Just a chat response
        if (addAssistantMessageRef.current) {
          addAssistantMessageRef.current(accumulatedContent);
        }
      }

    } catch (error) {
      console.error('Edit request failed:', error);
      if (addAssistantMessageRef.current) {
        addAssistantMessageRef.current('Sorry, I encountered an error processing your request.');
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
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100">
        <div className="text-center p-8 bg-white rounded-2xl shadow-2xl border border-gray-200">
          <div className="relative mb-6">
            <RefreshCw className="w-12 h-12 animate-spin mx-auto text-blue-500" />
            <div className="absolute inset-0 w-12 h-12 border-4 border-blue-200 rounded-full animate-ping mx-auto"></div>
          </div>
          <p className="text-lg font-semibold text-gray-800 mb-2">Loading document...</p>
          <p className="text-sm text-gray-600">Preparing your markdown editor</p>
          <div className="flex justify-center space-x-1 mt-4">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans overflow-hidden">
      {/* Modern Toolbar */}
      <div className="h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-6 z-50">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-violet-600 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Markdown Editor</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${documentState.content ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`}></div>
                <span className="text-xs text-muted-foreground font-medium">
                  {documentState.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1 bg-secondary/50 p-1 rounded-xl border border-border/50">
          <button
            onClick={undo}
            disabled={documentState.currentIndex === 0}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-200"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={documentState.currentIndex >= documentState.history.length - 1}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-200"
            title="Redo (Ctrl+Y)"
          >
            <Redo className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1"></div>
          <button
            onClick={saveDocument}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={reloadDocument}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg transition-all duration-200"
            title="Reset to Original"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content - 80/20 Split */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel - Markdown Viewer (80%) */}
        <div className="w-[80%] h-full flex flex-col relative border-r border-border bg-secondary/30">
          <div className="flex-1 overflow-hidden relative">
            <MarkdownRenderer
              content={documentState.content}
              onSelection={setSelectedText}
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
      </div>
    </div>
  );
}
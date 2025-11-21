'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, Bot, User } from 'lucide-react';
import { EditRequest } from '@/types';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  onEditRequest: (request: EditRequest) => void;
  isProcessing: boolean;
  selectedText?: string | null;
  onAddAssistantMessage?: (addFn: (content: string) => void) => void;
}

export default function ChatPanel({ onEditRequest, isProcessing, selectedText, onAddAssistantMessage }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'system',
      content: 'Hello! I\'m your AI writing assistant. I can help you edit, format, or improve your markdown document. Try selecting some text and asking me to change it!',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    // Create edit request
    const editRequest: EditRequest = {
      id: Date.now().toString(),
      text: inputValue,
      timestamp: new Date(),
      status: 'pending'
    };

    onEditRequest(editRequest);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const addAssistantMessage = useCallback((content: string) => {
    const assistantMessage: ChatMessage = {
      id: Date.now().toString() + '_assistant',
      type: 'assistant',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, assistantMessage]);
  }, []);

  // Expose method to add assistant messages via callback
  useEffect(() => {
    onAddAssistantMessage?.(addAssistantMessage);
  }, [onAddAssistantMessage, addAssistantMessage]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI Assistant</h2>
            <div className="flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
          </div>
        </div>

        {selectedText && (
          <div className="mt-3 p-2.5 bg-accent/50 rounded-lg border border-border/50 animate-fade-in">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xs font-medium text-primary">Selected Text</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 font-mono bg-background/50 p-1.5 rounded">
              {selectedText}
            </p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
          >
            <div className={`flex max-w-[85%] ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-2`}>
              {/* Avatar */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1 ${message.type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                {message.type === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
              </div>

              {/* Bubble */}
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${message.type === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : message.type === 'system'
                      ? 'bg-secondary/80 text-secondary-foreground border border-border/50 text-center w-full text-xs py-2'
                      : 'bg-card text-card-foreground border border-border rounded-tl-sm'
                  }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                {message.type !== 'system' && (
                  <div className={`text-[10px] mt-1 ${message.type === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start animate-fade-in">
            <div className="flex items-center space-x-2 bg-secondary/50 rounded-full px-4 py-2">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-border">
        <form onSubmit={handleSubmit} className="relative group">
          <div className="absolute inset-0 bg-linear-to-r from-primary/20 to-violet-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative flex items-end gap-2 bg-background rounded-xl border border-border shadow-sm p-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to edit..."
              className="flex-1 max-h-32 min-h-11 w-full resize-none bg-transparent border-0 focus:ring-0 p-2 text-sm placeholder:text-muted-foreground/70"
              rows={1}
              disabled={isProcessing}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isProcessing}
              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-2 opacity-0 group-focus-within:opacity-100 transition-opacity">
            Press Enter to send, Shift + Enter for new line
          </div>
        </form>
      </div>
    </div>
  );
}
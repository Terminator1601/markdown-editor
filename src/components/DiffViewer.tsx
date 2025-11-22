'use client';

import { useState } from 'react';
import { Check, X, Eye, EyeOff } from 'lucide-react';
import { generateDiff, generateContextualDiff } from '@/utils/diff';
import { EditProposal } from '@/types';

interface DiffViewerProps {
  proposal: EditProposal;
  onAccept: () => void;
  onDiscard: () => void;
}

export default function DiffViewer({ proposal, onAccept, onDiscard }: DiffViewerProps) {
  const [showDiff, setShowDiff] = useState(true);
  const [showFullDiff, setShowFullDiff] = useState(false);
  
  // Use contextual diff by default, full diff when toggled
  const diffLines = showFullDiff 
    ? generateDiff(proposal.original, proposal.modified)
    : generateContextualDiff(proposal.original, proposal.modified, 2);
  
  // Count changes for summary
  const changeStats = diffLines.reduce((acc, line) => {
    if (line.type === 'added') acc.additions++;
    else if (line.type === 'removed') acc.deletions++;
    return acc;
  }, { additions: 0, deletions: 0 });

  return (
    <div className="border border-border rounded-2xl bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-slide-up ring-1 ring-black/5">
      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-muted/30">
        <div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1">
          <div className="w-6 h-6 md:w-8 md:h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <span className="text-sm md:text-lg">✨</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs md:text-sm font-semibold text-foreground">AI Proposal</h3>
            <p className="text-xs text-muted-foreground">
              {changeStats.additions > 0 && (
                <span className="text-emerald-600">+{changeStats.additions}</span>
              )}
              {changeStats.additions > 0 && changeStats.deletions > 0 && <span className="mx-1">·</span>}
              {changeStats.deletions > 0 && (
                <span className="text-red-600">-{changeStats.deletions}</span>
              )}
              {changeStats.additions === 0 && changeStats.deletions === 0 && "No changes"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1 md:space-x-2">
          <button
            onClick={() => setShowDiff(!showDiff)}
            className="p-1.5 md:p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors touch-manipulation"
            title={showDiff ? 'Hide diff' : 'Show diff'}
          >
            {showDiff ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          {showDiff && (
            <button
              onClick={() => setShowFullDiff(!showFullDiff)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors touch-manipulation ${
                showFullDiff 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title={showFullDiff ? 'Show contextual diff' : 'Show full diff'}
            >
              {showFullDiff ? 'Context' : 'Full'}
            </button>
          )}
          <div className="h-4 w-px bg-border mx-1 md:mx-2"></div>
          <button
            onClick={onDiscard}
            className="flex items-center px-2 md:px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100 touch-manipulation"
          >
            <X className="w-3.5 h-3.5 mr-1 md:mr-1.5" />
            <span className="hidden sm:inline">Discard</span>
          </button>
          <button
            onClick={onAccept}
            className="flex items-center px-2 md:px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm touch-manipulation"
          >
            <Check className="w-3.5 h-3.5 mr-1 md:mr-1.5" />
            <span className="hidden sm:inline">Accept</span>
          </button>
        </div>
      </div>

      {/* Diff Content */}
      {showDiff && (
        <div className="p-0">
          {/* Unified diff view */}
          <div className="max-h-[300px] md:max-h-[400px] overflow-auto font-mono text-xs md:text-sm">
            {diffLines.map((line, index) => {
              // Handle separator lines
              if (line.content === '...' && line.type === 'unchanged' && !line.oldLineNumber && !line.newLineNumber) {
                return (
                  <div key={index} className="flex items-center justify-center py-2 text-muted-foreground/50 bg-muted/20 border-y border-border/30">
                    <span className="text-xs font-medium">···</span>
                  </div>
                );
              }
              
              return (
                <div
                  key={index}
                  className={`flex ${line.type === 'added'
                      ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                      : line.type === 'removed'
                        ? 'bg-red-500/10 border-l-2 border-red-500'
                        : 'hover:bg-muted/50 border-l-2 border-transparent'
                    }`}
                >
                  <div className="w-8 md:w-12 shrink-0 text-[10px] text-muted-foreground/50 select-none py-1 px-1 md:px-2 text-right border-r border-border/50 bg-muted/20">
                    {line.oldLineNumber || ''}
                  </div>
                  <div className="w-8 md:w-12 shrink-0 text-[10px] text-muted-foreground/50 select-none py-1 px-1 md:px-2 text-right border-r border-border/50 bg-muted/20">
                    {line.newLineNumber || ''}
                  </div>
                  <div className="w-4 md:w-6 shrink-0 select-none py-1 text-center text-muted-foreground/70">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ''}
                  </div>
                  <div className={`flex-1 py-1 px-1 md:px-2 whitespace-pre-wrap break-all ${line.type === 'added'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : line.type === 'removed'
                        ? 'text-red-700 dark:text-red-400 line-through opacity-70'
                        : 'text-foreground'
                    }`}>
                    {line.content}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
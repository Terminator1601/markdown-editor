export interface EditRequest {
  id: string;
  text: string;
  timestamp: Date;
  status: 'pending' | 'applied' | 'discarded';
}

export interface EditProposal {
  id: string;
  original: string;
  modified: string;
  description: string;
  startLine?: number;
  endLine?: number;
}

export interface DocumentState {
  content: string;
  history: string[];
  currentIndex: number;
  lastSaved: Date;
}

export interface Selection {
  start: number;
  end: number;
  text: string;
}

export interface ViewportContent {
  text: string;
  start: number;
  end: number;
  scrollTop: number;
  viewportHeight: number;
}

export type EditAction = 'accept' | 'discard' | 'undo' | 'redo';
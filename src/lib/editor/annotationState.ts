import type {
  AnnotationsMap,
  PageRotationsMap,
  PageCropsMap,
  EditorSnapshot,
} from './types';

export class AnnotationHistoryManager {
  private history: EditorSnapshot[] = [];
  private historyIndex: number = -1;
  private maxHistory: number;

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  /**
   * Deep clones the editor annotations, rotations, and crops into an immutable snapshot.
   */
  static createSnapshot(
    annotations: AnnotationsMap,
    rotations: PageRotationsMap,
    crops: PageCropsMap = {}
  ): EditorSnapshot {
    return {
      annotations: JSON.parse(JSON.stringify(annotations || {})),
      rotations: { ...rotations },
      crops: JSON.parse(JSON.stringify(crops || {})),
    };
  }

  /**
   * Pushes a new snapshot to the history stack, discarding any redos past historyIndex.
   */
  saveSnapshot(snapshot: EditorSnapshot): void {
    // Truncate redo future
    this.history = this.history.slice(0, this.historyIndex + 1);

    // Deep clone before storing to avoid external mutation
    const stored = {
      annotations: JSON.parse(JSON.stringify(snapshot.annotations || {})),
      rotations: { ...snapshot.rotations },
      crops: JSON.parse(JSON.stringify(snapshot.crops || {})),
    };

    this.history.push(stored);

    // Enforce history limit
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  /**
   * Returns whether undo is available.
   */
  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  /**
   * Returns whether redo is available.
   */
  canRedo(): boolean {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }

  /**
   * Moves back one step in history and returns the snapshot, or null if cannot undo.
   */
  undo(): EditorSnapshot | null {
    if (!this.canUndo()) return null;
    this.historyIndex--;
    return JSON.parse(JSON.stringify(this.history[this.historyIndex]));
  }

  /**
   * Moves forward one step in history and returns the snapshot, or null if cannot redo.
   */
  redo(): EditorSnapshot | null {
    if (!this.canRedo()) return null;
    this.historyIndex++;
    return JSON.parse(JSON.stringify(this.history[this.historyIndex]));
  }

  /**
   * Gets the current snapshot at the pointer.
   */
  getCurrent(): EditorSnapshot | null {
    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      return JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    }
    return null;
  }

  /**
   * Returns current history length and index.
   */
  getStatus(): { index: number; length: number; canUndo: boolean; canRedo: boolean } {
    return {
      index: this.historyIndex,
      length: this.history.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }

  /**
   * Clears the history stack.
   */
  reset(): void {
    this.history = [];
    this.historyIndex = -1;
  }
}

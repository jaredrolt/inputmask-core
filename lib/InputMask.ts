/* eslint-disable max-lines */
import { FormatCharacters, mergeFormatCharacters } from './FormatCharacters';
import { DEFAULT_PLACEHOLDER_CHAR, Pattern } from './Pattern';
import { copy } from './util';

export interface Selection {
  start: number;
  end: number;
}

export interface HistoryItem {
  value: string;
  selection: Selection;
  lastOp: string | null;
  startUndo?: boolean;
}

export interface InputMaskProps {
  formatCharacters: FormatCharacters | null;
  pattern: string | null;
  isRevealingMask?: boolean;
  placeholderChar?: string;
  selection?: Selection;
  value: string;
}

export class InputMask {
  placeholderChar: string;
  formatCharacters: FormatCharacters;
  selection: Selection = { start: 0, end: 0 };
  value: string[] = [];
  pattern?: Pattern;
  emptyValue = '';
  _historyIndex: number | null = null;
  _history: HistoryItem[] = [];
  _lastOp: string | null = null;
  _lastSelection: Selection | null = null;

  constructor(props: InputMaskProps) {
    const options: InputMaskProps = {
      formatCharacters: null,
      pattern: null,
      isRevealingMask: false,
      placeholderChar: DEFAULT_PLACEHOLDER_CHAR,
      selection: { start: 0, end: 0 },
      value: '',
      ...props,
    };

    if (options.pattern === null) {
      throw new Error('InputMask: you must provide a pattern.');
    }

    if (typeof options.placeholderChar !== 'string' || options.placeholderChar.length > 1) {
      throw new Error(
        'InputMask: placeholderChar should be a single character or an empty string.',
      );
    }

    this.placeholderChar = options.placeholderChar;
    this.formatCharacters = mergeFormatCharacters(options.formatCharacters);

    this.setPattern(options.pattern, {
      value: options.value,
      selection: options.selection,
      isRevealingMask: options.isRevealingMask,
    });
  }

  // Editing

  /**
   * Applies a single character of input based on the current selection.
   * Returns true if a change has been made to value or selection as a
   * result of the input, false otherwise.
   */
  input(char: string): boolean {
    // Ignore additional input if the cursor's at the end of the pattern
    if (
      this.selection.start === this.selection.end &&
      this.selection.start === this.pattern?.length
    ) {
      return false;
    }

    const selectionBefore = copy(this.selection);
    const valueBefore = this.getValue();

    let inputIndex = this.selection.start;

    // If the cursor or selection is prior to the first editable character, make
    // sure any input given is applied to it.
    if (inputIndex < Number(this.pattern?.firstEditableIndex)) {
      inputIndex = Number(this.pattern?.firstEditableIndex);
    }

    // Bail out or add the character to input
    if (this.pattern?.isEditableIndex(inputIndex)) {
      if (!this.pattern?.isValidAtIndex(char, inputIndex)) {
        return false;
      }

      this.value[inputIndex] = this.pattern?.transform(char, inputIndex);
    }

    // If multiple characters were selected, blank the remainder out based on the
    // pattern.
    let end = this.selection.end - 1;

    while (end > inputIndex) {
      if (this.pattern?.isEditableIndex(end)) {
        this.value[end] = this.placeholderChar;
      }

      end--;
    }

    // Advance the cursor to the next character
    this.selection.start = this.selection.end = inputIndex + 1;

    // Skip over any subsequent static characters
    while (
      Number(this.pattern?.length) > this.selection.start &&
      !this.pattern?.isEditableIndex(this.selection.start)
    ) {
      this.selection.start++;
      this.selection.end++;
    }

    // History
    if (this._historyIndex !== null) {
      // Took more input after undoing, so blow any subsequent history away
      this._history.splice(this._historyIndex, this._history.length - this._historyIndex);
      this._historyIndex = null;
    }

    if (
      this._lastOp !== 'input' ||
      selectionBefore.start !== selectionBefore.end ||
      (this._lastSelection !== null && selectionBefore.start !== this._lastSelection.start)
    ) {
      this._history.push({ value: valueBefore, selection: selectionBefore, lastOp: this._lastOp });
    }

    this._lastOp = 'input';
    this._lastSelection = copy(this.selection);

    return true;
  }

  /**
   * Attempts to delete from the value based on the current cursor position or
   * selection.
   * Returns true if the value or selection changed as the result of
   * backspacing, false otherwise.
   */
  backspace(): boolean {
    // If the cursor is at the start there's nothing to do
    if (this.selection.start === 0 && this.selection.end === 0) {
      return false;
    }

    const selectionBefore = copy(this.selection);
    const valueBefore = this.getValue();

    // No range selected - work on the character preceding the cursor
    if (this.selection.start === this.selection.end) {
      if (this.pattern?.isEditableIndex(this.selection.start - 1)) {
        if (this.pattern?.isRevealingMask) {
          this.value.splice(this.selection.start - 1);
        } else {
          this.value[this.selection.start - 1] = this.placeholderChar;
        }
      }

      this.selection.start--;
      this.selection.end--;
    }
    // Range selected - delete characters and leave the cursor at the start of the selection
    else {
      let end = this.selection.end - 1;

      while (end >= this.selection.start) {
        if (this.pattern?.isEditableIndex(end)) {
          this.value[end] = this.placeholderChar;
        }

        end--;
      }

      this.selection.end = this.selection.start;
    }

    // History
    if (this._historyIndex !== null) {
      // Took more input after undoing, so blow any subsequent history away
      this._history.splice(this._historyIndex, this._history.length - this._historyIndex);
    }

    if (
      this._lastOp !== 'backspace' ||
      selectionBefore.start !== selectionBefore.end ||
      (this._lastSelection !== null && selectionBefore.start !== this._lastSelection.start)
    ) {
      this._history.push({ value: valueBefore, selection: selectionBefore, lastOp: this._lastOp });
    }

    this._lastOp = 'backspace';
    this._lastSelection = copy(this.selection);

    return true;
  }

  /**
   * Attempts to paste a string of input at the current cursor position or over
   * the top of the current selection.
   * Invalid content at any position will cause the paste to be rejected, and it
   * may contain static parts of the mask's pattern.
   * Returns true if the paste was successful, false otherwise.
   */
  paste(input: string): boolean {
    // This is necessary because we're just calling input() with each character
    // and rolling back if any were invalid, rather than checking up-front.
    const initialState = {
      value: this.value.slice(),
      selection: copy(this.selection),
      _lastOp: this._lastOp,
      _history: this._history.slice(),
      _historyIndex: this._historyIndex,
      _lastSelection: this._lastSelection ? copy(this._lastSelection) : null,
    };

    let pastedInput = input;

    // If there are static characters at the start of the pattern and the cursor
    // or selection is within them, the static characters must match for a valid
    // paste.
    if (this.selection.start < Number(this.pattern?.firstEditableIndex)) {
      for (
        let i = 0, l = Number(this.pattern?.firstEditableIndex) - this.selection.start;
        i < l;
        i++
      ) {
        if (pastedInput.charAt(i) !== this.pattern?.pattern[i]) {
          return false;
        }
      }

      // Continue as if the selection and input started from the editable part of
      // the pattern.
      pastedInput = pastedInput.substring(
        Number(this.pattern?.firstEditableIndex) - this.selection.start,
      );

      this.selection.start = Number(this.pattern?.firstEditableIndex);
    }

    for (
      let i = 0, l = pastedInput.length;
      i < l && this.selection.start <= Number(this.pattern?.lastEditableIndex);
      i++
    ) {
      const valid = this.input(pastedInput.charAt(i));

      // Allow static parts of the pattern to appear in pasted input - they will
      // already have been stepped over by input(), so verify that the value
      // deemed invalid by input() was the expected static character.
      if (!valid) {
        if (this.selection.start > 0) {
          // XXX This only allows for one static character to be skipped
          const patternIndex = this.selection.start - 1;

          if (
            !this.pattern?.isEditableIndex(patternIndex) &&
            pastedInput.charAt(i) === this.pattern?.pattern[patternIndex]
          ) {
            continue;
          }
        }

        this.value = initialState.value;
        this.selection = initialState.selection;
        this._lastOp = initialState._lastOp;
        this._history = initialState._history;
        this._historyIndex = initialState._historyIndex;
        this._lastSelection = initialState._lastSelection;

        return false;
      }
    }

    return true;
  }

  // History

  undo(): boolean {
    // If there is no history, or nothing more on the history stack, we can't undo
    if (this._history.length === 0 || this._historyIndex === 0) {
      return false;
    }

    let historyItem;

    if (this._historyIndex === null) {
      // Not currently undoing, set up the initial history index
      this._historyIndex = this._history.length - 1;
      historyItem = this._history[this._historyIndex];
      // Add a new history entry if anything has changed since the last one, so we
      // can redo back to the initial state we started undoing from.
      const value = this.getValue();

      if (
        historyItem.value !== value ||
        historyItem.selection.start !== this.selection.start ||
        historyItem.selection.end !== this.selection.end
      ) {
        this._history.push({
          value: value,
          selection: copy(this.selection),
          lastOp: this._lastOp,
          startUndo: true,
        });
      }
    } else {
      historyItem = this._history[--this._historyIndex];
    }

    this.value = historyItem.value.split('');
    this.selection = historyItem.selection;
    this._lastOp = historyItem.lastOp;
    return true;
  }

  redo(): boolean {
    if (this._history.length === 0 || this._historyIndex === null) {
      return false;
    }

    const historyItem = this._history[++this._historyIndex];

    // If this is the last history item, we're done redoing
    if (this._historyIndex === this._history.length - 1) {
      this._historyIndex = null;

      // If the last history item was only added to start undoing, remove it
      if (historyItem.startUndo) {
        this._history.pop();
      }
    }

    this.value = historyItem.value.split('');
    this.selection = historyItem.selection;
    this._lastOp = historyItem.lastOp;
    return true;
  }

  // Getters & setters

  setPattern(
    pattern: string,
    options: { value?: string; isRevealingMask?: boolean; selection?: Selection },
  ): void {
    this.pattern = new Pattern(
      pattern,
      this.formatCharacters,
      this.placeholderChar,
      options.isRevealingMask,
    );

    this.setValue(options.value ?? '');
    this.emptyValue = this.pattern?.formatValue([]).join('');
    this.selection = options.selection ?? { start: 0, end: 0 };
    this._resetHistory();
  }

  setSelection(selection: Selection): boolean {
    this.selection = copy(selection);

    if (this.selection.start === this.selection.end) {
      if (this.selection.start < Number(this.pattern?.firstEditableIndex)) {
        this.selection.start = this.selection.end = Number(this.pattern?.firstEditableIndex);
        return true;
      }

      // Set selection to the first editable, non-placeholder character before the selection
      // OR to the beginning of the pattern
      let index = this.selection.start;

      while (index >= Number(this.pattern?.firstEditableIndex)) {
        if (
          (this.pattern?.isEditableIndex(index - 1) &&
            this.value[index - 1] !== this.placeholderChar) ||
          index === this.pattern?.firstEditableIndex
        ) {
          this.selection.start = this.selection.end = index;
          break;
        }

        index--;
      }

      return true;
    }

    return false;
  }

  setValue(value: string): void {
    this.value = this.pattern?.formatValue(value.split('')) || [];
  }

  getValue(): string {
    if (this.pattern?.isRevealingMask) {
      this.value = this.pattern?.formatValue(this.getRawValue().split(''));
    }

    return this.value.join('');
  }

  getRawValue(): string {
    const rawValue = [];

    for (let i = 0; i < this.value.length; i++) {
      if (this.pattern?._editableIndices[i] === true) {
        rawValue.push(this.value[i]);
      }
    }

    return rawValue.join('');
  }

  _resetHistory(): void {
    this._history = [];
    this._historyIndex = null;
    this._lastOp = null;
    this._lastSelection = copy(this.selection);
  }
}

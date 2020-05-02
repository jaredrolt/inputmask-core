import { FormatCharacters, DEFAULT_FORMAT_CHARACTERS } from './FormatCharacters';

export const ESCAPE_CHAR = '\\';

export const DEFAULT_PLACEHOLDER_CHAR = '_';

export class Pattern {
  placeholderChar: string;
  formatCharacters: FormatCharacters;
  source: string;
  pattern: string[];
  length: number;
  firstEditableIndex: number | null;
  lastEditableIndex: number | null;
  _editableIndices: {
    [index: number]: boolean;
  };
  isRevealingMask: boolean;

  constructor(
    source: string,
    formatCharacters?: FormatCharacters,
    placeholderChar?: string,
    isRevealingMask = false,
  ) {
    /** Placeholder character */
    this.placeholderChar = placeholderChar || DEFAULT_PLACEHOLDER_CHAR;
    /** Format character definitions. */
    this.formatCharacters = formatCharacters || DEFAULT_FORMAT_CHARACTERS;
    /** Pattern definition string with escape characters. */
    this.source = source;
    /** Pattern characters after escape characters have been processed. */
    this.pattern = [];
    /** Length of the pattern after escape characters have been processed. */
    this.length = 0;
    /** Index of the first editable character. */
    this.firstEditableIndex = null;
    /** Index of the last editable character. */
    this.lastEditableIndex = null;
    /** Lookup for indices of editable characters in the pattern. */
    this._editableIndices = {};
    /** If true, only the pattern before the last valid value character shows. */
    this.isRevealingMask = isRevealingMask;

    this._parse();
  }

  _parse() {
    const sourceChars = this.source.split('');
    let patternIndex = 0;
    const pattern = [];

    for (let i = 0, l = sourceChars.length; i < l; i++) {
      let char = sourceChars[i];

      if (char === ESCAPE_CHAR) {
        if (i === l - 1) {
          throw new Error('InputMask: pattern ends with a raw ' + ESCAPE_CHAR);
        }

        char = sourceChars[++i];
      } else if (char in this.formatCharacters) {
        if (this.firstEditableIndex === null) {
          this.firstEditableIndex = patternIndex;
        }

        this.lastEditableIndex = patternIndex;
        this._editableIndices[patternIndex] = true;
      }

      pattern.push(char);
      patternIndex++;
    }

    if (this.firstEditableIndex === null) {
      throw new Error(
        'InputMask: pattern "' + this.source + '" does not contain any editable characters.',
      );
    }

    this.pattern = pattern;
    this.length = pattern.length;
  }

  formatValue(value: string[]): string[] {
    const valueBuffer = new Array(this.length);
    let valueIndex = 0;

    for (let i = 0, l = this.length; i < l; i++) {
      if (this.isEditableIndex(i)) {
        if (
          this.isRevealingMask &&
          value.length <= valueIndex &&
          !this.isValidAtIndex(value[valueIndex], i)
        ) {
          break;
        }

        valueBuffer[i] =
          value.length > valueIndex && this.isValidAtIndex(value[valueIndex], i)
            ? this.transform(value[valueIndex], i)
            : this.placeholderChar;

        valueIndex++;
      } else {
        valueBuffer[i] = this.pattern[i];

        // Also allow the value to contain static values from the pattern by
        // advancing its index.
        if (value.length > valueIndex && value[valueIndex] === this.pattern[i]) {
          valueIndex++;
        }
      }
    }

    return valueBuffer;
  }

  isEditableIndex(index: number) {
    return this._editableIndices[index];
  }

  isValidAtIndex(char: string, index: number) {
    return this.formatCharacters[this.pattern[index]].validate(char);
  }

  transform(char: string, index: number) {
    const format = this.formatCharacters[this.pattern[index]];
    return typeof format.transform === 'function' ? format.transform(char) : char;
  }
}

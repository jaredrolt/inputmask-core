import { copy } from './util';

export interface FormatCharacters {
  [char: string]: {
    validate: (char: string) => boolean;
    transform?: (char: string) => string;
  };
}

const DIGIT_RE = /^\d$/;
const LETTER_RE = /^[A-Za-z]$/;
const ALPHANNUMERIC_RE = /^[\dA-Za-z]$/;

export const DEFAULT_FORMAT_CHARACTERS: FormatCharacters = {
  '*': {
    validate: (char: string) => ALPHANNUMERIC_RE.test(char),
  },
  '1': {
    validate: (char: string) => DIGIT_RE.test(char),
  },
  a: {
    validate: (char: string) => LETTER_RE.test(char),
  },
  A: {
    validate: (char: string) => LETTER_RE.test(char),
    transform: (char: string) => char.toUpperCase(),
  },
  '#': {
    validate: (char: string) => ALPHANNUMERIC_RE.test(char),
    transform: (char: string) => char.toUpperCase(),
  },
};

/**
 * Merge an object defining format characters into the defaults.
 * Passing null/undefined for en existing format character removes it.
 * Passing a definition for an existing format character overrides it.
 * @param {?Object} formatCharacters.
 */
export const mergeFormatCharacters = (formatCharacters: FormatCharacters | null) => {
  const merged = copy(DEFAULT_FORMAT_CHARACTERS);

  if (formatCharacters) {
    const chars = Object.keys(formatCharacters);

    for (let i = 0, l = chars.length; i < l; i++) {
      const char = chars[i];

      if (formatCharacters[char] === null) {
        delete merged[char];
      } else {
        merged[char] = formatCharacters[char];
      }
    }
  }

  return merged;
};

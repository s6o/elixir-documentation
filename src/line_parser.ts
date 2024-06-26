import * as vscode from 'vscode';

export type LineToken = {
  phrase: string;
  range: vscode.Range;
  state: LineTokenState;
};

export enum LineTokenState {
  Initialized,
  Collecting,
  Closed,
}

export function lineParser(
  line: string,
  lineRange: vscode.Range,
  cursor: vscode.Position
): LineToken[] {
  const tokenSplitters = [' ', '(', ',', ')', ';', '{', '}'];
  let tokens: LineToken[] = [];

  let index = lineRange.start.character;
  let maxIndex = lineRange.end.character;
  let token = {
    phrase: '',
    range: new vscode.Range(
      new vscode.Position(lineRange.start.line, 0),
      new vscode.Position(lineRange.start.line, 0)
    ),
    state: LineTokenState.Initialized,
  };

  while (index < maxIndex) {
    let ch = line[index];
    if (tokenSplitters.includes(ch)) {
      // Still initializing ...
      if (token.state === LineTokenState.Initialized) {
        // But (another) token splitter, move initialization range to right
        token.range = new vscode.Range(
          new vscode.Position(lineRange.start.line, index),
          new vscode.Position(lineRange.start.line, index)
        );
      }
      // Have we started collecting tokens?
      if (token.state === LineTokenState.Collecting) {
        // A phrase completed, close active token, re-initialize
        token.state = LineTokenState.Closed;
        tokens.push({ ...token });
        token = {
          phrase: '',
          range: new vscode.Range(
            new vscode.Position(lineRange.start.line, index),
            new vscode.Position(lineRange.start.line, index)
          ),
          state: LineTokenState.Initialized,
        };
      }
    } else {
      // A token character, append to current token phrase
      token.phrase = token.phrase + ch;
      token.range = new vscode.Range(
        new vscode.Position(
          lineRange.start.line,
          index - (token.phrase.length - 1)
        ),
        new vscode.Position(lineRange.start.line, index)
      );
      token.state = LineTokenState.Collecting;
      // End of line check
      if (index === maxIndex - 1) {
        // Close last token
        token.state = LineTokenState.Closed;
        tokens.push({ ...token });
      }
    }
    index += 1;
  }

  // If a token range is containing the active cursor position make it the first
  // item in the returned tokens
  let cursorIndex = -1;
  tokens.forEach((item: LineToken, index: number) => {
    if (
      item.range.start.character <= cursor.character &&
      item.range.end.character >= cursor.character
    ) {
      cursorIndex = index;
    }
  });
  if (cursorIndex > 0) {
    let cursorItem = { ...tokens[cursorIndex] };
    tokens[cursorIndex] = tokens[0];
    tokens[0] = cursorItem;
  }
  // Remove duplicates from final result
  return tokens.filter((token, index) => {
    return index === tokens.findIndex((t) => token.phrase === t.phrase);
  });
}

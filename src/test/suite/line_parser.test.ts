import * as assert from 'assert';
import * as vscode from 'vscode';
import * as parser from '../../line_parser';

suite('Line parser tests', () => {
  test('Token parser on an empty (string) line(s)', () => {
    const inputLine1 = '';
    const range1 = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0)
    );
    const tokens1 = parser.lineParser(
      inputLine1,
      range1,
      new vscode.Position(0, 0)
    );
    assert.deepEqual(tokens1, []);

    const inputLine2 = '       ';
    const range2 = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 6)
    );
    const tokens2 = parser.lineParser(
      inputLine2,
      range2,
      new vscode.Position(0, 0)
    );
    assert.deepEqual(tokens2, []);
  });

  test('Token parser module declarations', () => {
    const inputLine1 = '  use Agent';
    const range1 = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 11)
    );
    const tokens1 = parser.lineParser(
      inputLine1,
      range1,
      new vscode.Position(0, 8)
    );
    assert.deepEqual(tokens1, [
      {
        phrase: 'Agent',
        range: new vscode.Range(
          new vscode.Position(0, 6),
          new vscode.Position(0, 10)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: 'use',
        range: new vscode.Range(
          new vscode.Position(0, 2),
          new vscode.Position(0, 4)
        ),
        state: parser.LineTokenState.Closed,
      },
    ]);

    const inputLine2 = '  require Logger';
    const range2 = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 16)
    );
    const tokens2 = parser.lineParser(
      inputLine2,
      range2,
      new vscode.Position(0, 0)
    );
    assert.deepEqual(tokens2, [
      {
        phrase: 'require',
        range: new vscode.Range(
          new vscode.Position(0, 2),
          new vscode.Position(0, 8)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: 'Logger',
        range: new vscode.Range(
          new vscode.Position(0, 10),
          new vscode.Position(0, 15)
        ),
        state: parser.LineTokenState.Closed,
      },
    ]);
  });

  test('Token parser line tokens', () => {
    const inputLine1 = '    |> Map.put(:config, cfg)';
    const range1 = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 28)
    );
    const tokens1 = parser.lineParser(
      inputLine1,
      range1,
      new vscode.Position(0, 0)
    );
    assert.deepEqual(tokens1, [
      {
        phrase: '|>',
        range: new vscode.Range(
          new vscode.Position(0, 4),
          new vscode.Position(0, 5)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: 'Map.put',
        range: new vscode.Range(
          new vscode.Position(0, 7),
          new vscode.Position(0, 13)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: ':config',
        range: new vscode.Range(
          new vscode.Position(0, 15),
          new vscode.Position(0, 21)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: 'cfg',
        range: new vscode.Range(
          new vscode.Position(0, 24),
          new vscode.Position(0, 26)
        ),
        state: parser.LineTokenState.Closed,
      },
    ]);

    const inputLine2 = '    Agent.get(__MODULE__, fn state ->';
    const range2 = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 37)
    );
    const tokens2 = parser.lineParser(
      inputLine2,
      range2,
      new vscode.Position(0, 5)
    );
    assert.deepEqual(tokens2, [
      {
        phrase: 'Agent.get',
        range: new vscode.Range(
          new vscode.Position(0, 4),
          new vscode.Position(0, 12)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: '__MODULE__',
        range: new vscode.Range(
          new vscode.Position(0, 14),
          new vscode.Position(0, 23)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: 'fn',
        range: new vscode.Range(
          new vscode.Position(0, 26),
          new vscode.Position(0, 27)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: 'state',
        range: new vscode.Range(
          new vscode.Position(0, 29),
          new vscode.Position(0, 33)
        ),
        state: parser.LineTokenState.Closed,
      },
      {
        phrase: '->',
        range: new vscode.Range(
          new vscode.Position(0, 35),
          new vscode.Position(0, 36)
        ),
        state: parser.LineTokenState.Closed,
      },
    ]);
  });
});

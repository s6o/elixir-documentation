import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
//import * as ext from '../../extension';

suite('Line parser regexp tests', () => {
  vscode.window.showInformationMessage(
    'Elixir documentation - line parsers regexp'
  );

  test('Test alias|@behaviour|import|require|use Module(s)', () => {
    const module =
      /(?!alias|@behaviour|import|require|use)(?!\s+)[A-Z][\w\.]*/gmu;

    const input =
      'alias Postgrex.Connection dladfj require Logger dlad @behaviour Mailer dldl use GenServer';
    const results = input.match(module);
    console.log(results);

    assert.strictEqual(results!.length, 4);
    assert.strictEqual(results![0], 'Postgrex.Connection');
    assert.strictEqual(results![1], 'Logger');
    assert.strictEqual(results![2], 'Mailer');
    assert.strictEqual(results![3], 'GenServer');
  });
});

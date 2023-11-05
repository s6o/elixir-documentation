// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import util from 'util';
import { execFile as execNonPromise } from 'child_process';
const execFile = util.promisify(execNonPromise);

async function elixirOTPVersion(): Promise<[string, string]> {
  const { stdout, stderr } = await execFile('iex', ['-v']);
  if (stdout) {
    console.log('stdout:', stdout);

    const results = [...stdout.matchAll(/IEx\s+([\d\.]+).+OTP\s+(\d+)/g)];
    if (results && results[0]) {
      console.log(`Elixir ${results[0][1]}`);
      console.log(`OTP ${results[0][2]}`);
      return [results[0][1], results[0][2]];
    }
  }
  return ['', ''];
}

function majorElixirVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length > 2) {
    return `v${[parts[0], parts[1]].join('.')}`;
  } else {
    return `v${version}`;
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "Elixir Documentation Lookup" is now active!'
  );

  const [elixirVersion, otpVersion] = await elixirOTPVersion();

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let cmdOpen = vscode.commands.registerCommand(
    'elixir-documentation.open',
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      vscode.commands.executeCommand(
        'simpleBrowser.api.open',
        `https://elixir-lang.org/docs.html#${majorElixirVersion(elixirVersion)}`
      );
    }
  );

  let cmdLookup = vscode.commands.registerCommand(
    'elixir-documentation.lookup',
    () => {
      // Find text on current line
      const te = vscode.window.activeTextEditor;
      if (te) {
        console.log(`Working dir: ${__dirname}`);
        const range = te.selection.isEmpty
          ? te.document.getWordRangeAtPosition(
              te.selection.active,
              RegExp('[\\w\\.(]+')
            )
          : te.selection;
        if (range) {
          const word = te.document.getText(range);
          console.log(`Word on the line: ${word}`);
        }
      }
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      vscode.commands.executeCommand(
        'simpleBrowser.api.open',
        `https://hexdocs.pm/elixir/${elixirVersion}/Kernel.html`
      );
    }
  );

  context.subscriptions.push(cmdOpen);
  context.subscriptions.push(cmdLookup);
}

// This method is called when your extension is deactivated
export function deactivate() {}

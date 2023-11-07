// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import util from 'util';
import { execFile as execNonPromise } from 'child_process';
const execFile = util.promisify(execNonPromise);

type DocRef = {
  erlBase: string;
  hexBase: string;
  elixirVersion: string;
  module: string;
  fragment: string;
  isErl: boolean;
};

async function initDocRef(): Promise<DocRef> {
  const ref = {
    erlBase: 'https://www.erlang.org/doc/man',
    hexBase: 'https://hexdocs.pm', // TODO: get from configuration
    elixirVersion: '',
    module: 'Kernel',
    fragment: '',
    isErl: false,
  };

  const { stdout, stderr } = await execFile('iex', ['-v']);
  if (stdout) {
    console.log('stdout:', stdout);
    const results = [...stdout.matchAll(/IEx\s+([\d\.]+).+OTP\s+(\d+)/g)];
    if (results && results[0]) {
      ref.elixirVersion = results[0][1];
      console.log(`Elixir ${results[0][1]}`);
      console.log(`OTP ${results[0][2]}`);
    }
  }
  return ref;
}

function toDocUrl(ref: DocRef): string {
  if (ref.isErl) {
    return `${ref.erlBase}/${ref.module}${
      ref.fragment ? `#${ref.fragment}` : ''
    }`;
  } else {
    return `${ref.hexBase}/elixir/${ref.elixirVersion}/${ref.module}.html${
      ref.fragment ? `#${ref.fragment}` : ''
    }`;
  }
}

function toMainDocUrl(ref: DocRef): string {
  return `https://elixir-lang.org/docs.html#${majorElixirVersion(
    ref.elixirVersion
  )}`;
}

function majorElixirVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length > 2) {
    return `v${[parts[0], parts[1]].join('.')}`;
  } else {
    return `v${version}`;
  }
}

function updateDocRef(ref: DocRef, item: vscode.QuickPickItem) {
  const isFunction: boolean = item.detail?.startsWith('(function)') || false;
  const isModule: boolean = item.detail !== null && item.detail === 'module';

  if (isFunction) {
    const startIndex = item.detail!.indexOf(' ') + 1;
    const finalIndex = item.detail!.indexOf('.', startIndex);
    const module = item.detail!.slice(startIndex, finalIndex);
    ref.isErl = module.startsWith(':');
    ref.module = ref.isErl ? module.slice(1) : module;
    ref.fragment = ref.isErl ? item.label.replace('/', '-') : item.label;
    return ref;
  }

  if (isModule) {
    ref.isErl = item.label.startsWith(':');
    ref.module = ref.isErl ? item.label.slice(1) : item.label;
    return ref;
  }

  return ref;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "Elixir Documentation Lookup" is now active!'
  );

  let docRef = await initDocRef();

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
        toMainDocUrl(docRef)
      );
    }
  );

  let cmdLookup = vscode.commands.registerCommand(
    'elixir-documentation.lookup',
    async () => {
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

          const completes: { items: Array<vscode.QuickPickItem> } =
            await vscode.commands.executeCommand(
              'vscode.executeCompletionItemProvider',
              te.document.uri,
              range.end
            );
          console.log(completes);
          const result = await vscode.window.showQuickPick(
            [
              ...completes.items.map((e) => ({
                label: e.label,
                description: undefined,
                detail: e.detail,
              })),
            ],
            {
              canPickMany: false,
            }
          );
          if (result) {
            console.log('QuickPick result:\n');
            console.log(result);
            docRef = updateDocRef(docRef, result);
          }
        }
      }
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      vscode.commands.executeCommand(
        'simpleBrowser.api.open',
        toDocUrl(docRef)
      );
    }
  );

  context.subscriptions.push(cmdOpen);
  context.subscriptions.push(cmdLookup);
}

// This method is called when your extension is deactivated
export function deactivate() {}

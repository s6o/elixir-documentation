import * as vscode from 'vscode';
import crypto from 'node:crypto';
import process from 'process';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { EOL } from 'node:os';
import util from 'node:util';
import { execFile as execNonPromise } from 'node:child_process';
const execFile = util.promisify(execNonPromise);

type MixDep = {
  name: string;
  version: string;
};

type DocRef = {
  erlBase: string;
  hexBase: string;
  elixirVersion: string;
  otpVersion: string;
  module: string;
  fragment: string;
  isErl: boolean;
  isType: boolean;
  package: undefined | MixDep;
};

enum TryLSP {
  No,
  Yes,
}

enum MainRef {
  Elixir,
  Erlang,
}

let cachedMixDeps: MixDep[] = [];
let cachedMixPath: string | undefined = undefined;
let cachedMixHash: string = '';

async function initDocRef(): Promise<DocRef> {
  const ref = {
    erlBase: 'https://www.erlang.org/docs',
    hexBase: 'https://hexdocs.pm', // TODO: get from configuration
    elixirVersion: '',
    otpVersion: '',
    module: 'Kernel',
    fragment: '',
    isErl: false,
    isType: false,
    package: undefined,
  };

  const { stdout, stderr } = await execFile('iex', ['-v']);
  if (stdout) {
    console.log('stdout:', stdout);
    const results = [...stdout.matchAll(/IEx\s+([\d\.]+).+OTP\s+(\d+)/g)];
    if (results && results[0]) {
      ref.elixirVersion = results[0][1];
      ref.otpVersion = results[0][2];
      console.log(`Elixir ${results[0][1]}`);
      console.log(`OTP ${results[0][2]}`);
    }
  }
  return ref;
}

async function initMix() {
  const te = vscode.window.activeTextEditor;
  if (te) {
    const [lockFileFound, mixLockPath] = await findMixLock(
      te.document.fileName
    );
    console.log('Initial lock file found: ' + lockFileFound);
    console.log('Initial lock file at: ' + mixLockPath);
    if (lockFileFound) {
      cachedMixPath = mixLockPath;
      cachedMixDeps = await parseMixDeps(mixLockPath);
    }
  } else {
    console.log('Could not find mix.lock');
  }
}

async function findMixLock(filePath: string): Promise<[boolean, string]> {
  const cwd = process.cwd();
  let baseDir = path.dirname(filePath);
  while (true) {
    const mixLockFile = `${baseDir}${path.sep}mix.lock`;
    try {
      await fs.access(mixLockFile, fs.constants.R_OK);
      process.chdir(cwd); // restore the workding directory we started from
      return [true, mixLockFile];
    } catch {
      if (path.dirname(baseDir) === '/' || path.dirname(baseDir) === 'C:\\') {
        return [false, ''];
      } else {
        baseDir = path.dirname(baseDir);
        continue;
      }
    }
  }
}

async function mixContentsWithHash(
  filePath: string
): Promise<[string, string]> {
  let contentHash = '';
  const contents = await fs
    .readFile(filePath, { encoding: 'utf-8' })
    .then((buf) => {
      contentHash = crypto.createHash('sha1').update(buf).digest('hex');
      return buf.toString();
    });
  return [contentHash, contents];
}

async function parseMixDeps(filePath: string): Promise<MixDep[]> {
  try {
    const [contentHash, contents] = await mixContentsWithHash(filePath);
    cachedMixHash = contentHash;
    console.log(`Mix lock contents hash: ${cachedMixHash}`);
    const lines = contents.split(EOL);
    lines.shift();
    lines.pop();
    lines.pop();
    const dependencies = lines.map((line) => {
      const pkgParts = line.split('{');
      const verParts = pkgParts[1].split(',');
      const dep: MixDep = {
        name: pkgParts[0].replaceAll(/[":]/gi, '').trim(),
        version: verParts[2].replaceAll('"', '').trim(),
      };
      return dep;
    });
    return dependencies;
  } catch (e) {
    console.log(e);
    return [];
  }
}

function lineLookup(line: string, ref: DocRef): TryLSP {
  let lsp = TryLSP.No;
  const patterns = {
    // look for pattern: :module.[.module[.m..]]function([arg[, arg...]])
    efa: /:[a-z]\w*\.[\w\.]+\([\w\s,%:"\{\}\[\]]*\)/gu,
    // look for pattern: Module.[.Module[.M..]]function([arg[, arg...]])
    mfa: /[A-Z]\w*\.[\w\.]+\([\w\s,%:"\{\}\[\]]*\)/gu,
    // look for pattern: [alias|@behaviour|import|require|use] Module[.Modules[...]]
    module: /(?:alias|@behaviour|import|require|use)\s+[A-Z][\w\.]*/gu,
    // look for pattern: %Module[.Module[...]]{[field: var[, field: var[, ...]]]}
    struct: /(?!%)[A-Z][\w\.]*(?=\{)/gu,
  };
  const isType = line.trim().startsWith('@spec');
  console.log(`EFA:`);
  console.log(line.match(patterns.efa));
  console.log(`\n`);
  console.log(`MFA:`);
  console.log(line.match(patterns.mfa));
  console.log(`\n`);
  console.log(`MODULE:`);
  console.log(line.match(patterns.module));
  console.log(`\n`);
  console.log(`STRUCT:`);
  console.log(line.match(patterns.struct));
  console.log(`\n`);
  return lsp;
}

async function lspLookup(
  te: vscode.TextEditor,
  range: vscode.Range,
  docRef: DocRef
): Promise<void> {
  const completes: vscode.CompletionList = await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider',
    te.document.uri,
    range.end
  );
  // Try LSP lookup if line parsing did not yield actionable results
  if (completes && completes.items && completes.items.length > 0) {
    const first: vscode.QuickPickItem = {
      label: completes.items[0].label as string,
      detail: completes.items[0].detail,
    };
    if (completes.items.length > 1) {
      const selected = await vscode.window.showQuickPick(
        [
          ...completes.items.map((e) => ({
            label: e.label as string,
            detail: e.detail,
          })),
        ],
        {
          canPickMany: false,
        }
      );
      if (selected) {
        console.log('Selected: ');
        console.log(selected);
        docRef = updateDocRef(docRef, selected, cachedMixDeps);
      }
    } else {
      console.log('First: ');
      console.log(first);
      docRef = updateDocRef(docRef, first, cachedMixDeps);
    }
  }
}

function isDependency(
  packages: MixDep[],
  packageName: string
): undefined | MixDep {
  return packages.find((dep) => dep.name === packageName);
}

function toDocUrl(ref: DocRef): string {
  if (ref.package) {
    return `${ref.hexBase}/${ref.package.name}/${ref.package.version}/${
      ref.module
    }.html${ref.fragment ? `#${ref.fragment}` : ''}`;
  } else {
    if (ref.isErl) {
      return `${ref.erlBase}/${ref.otpVersion}/man/${ref.module}${
        ref.fragment ? `#${ref.fragment}` : ''
      }`;
    } else {
      return `${ref.hexBase}/elixir/${ref.elixirVersion}/${ref.module}.html${
        ref.fragment ? `#${ref.fragment}` : ''
      }`;
    }
  }
}

function toMainDocUrl(ref: DocRef, main: MainRef): string {
  if (main === MainRef.Erlang) {
    return `${ref.erlBase}/${ref.otpVersion}`;
  } else {
    return `https://elixir-lang.org/docs.html#${majorElixirVersion(
      ref.elixirVersion
    )}`;
  }
}

function majorElixirVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length > 2) {
    return `v${[parts[0], parts[1]].join('.')}`;
  } else {
    return `v${version}`;
  }
}

function updateDocRef(
  ref: DocRef,
  item: vscode.QuickPickItem,
  packages: MixDep[]
): DocRef {
  const isFunction: boolean = item.detail?.startsWith('(function)') || false;
  const isBehaviour: boolean =
    item.detail !== null && item.detail === 'behaviour';
  const isException: boolean =
    item.detail !== null && item.detail === 'exception';
  const isMacro: boolean = item.detail?.startsWith('(macro)') || false;
  const isModule: boolean = item.detail !== null && item.detail === 'module';
  const isStruct: boolean = item.detail !== null && item.detail === 'struct';

  if (isBehaviour) {
    ref.module = item.label.replace(' (behaviour)', '');
  }

  if (isException) {
    ref.module = item.label.replace(' (exception)', '');
  }

  if (isFunction || isMacro) {
    const startIndex = item.detail!.indexOf(' ');
    const finalIndex = item.detail!.lastIndexOf('.');
    const module = item.detail!.slice(startIndex, finalIndex).trim();
    ref.isErl = module.startsWith(':');
    ref.module = ref.isErl ? module.slice(1) : module;
    if (module === 'Kernel.SpecialForms') {
      let arity = '/0';
      const args = item.detail!.match(/\([^\.]+\)$/gi);
      if (args && args[0]) {
        const splits = args[0].split(',');
        arity = `/${splits.length}`;
      }
      ref.fragment = `${item.label}${arity}`;
    } else {
      ref.fragment = ref.isErl ? item.label.replace('/', '-') : item.label;
    }
  }

  if (isModule) {
    ref.isErl = item.label.startsWith(':');
    ref.module = ref.isErl ? item.label.slice(1) : item.label;
  }

  if (isStruct) {
    ref.module = item.label.replace(' (struct)', '');
  }

  ref.package = isDependency(packages, ref.module.toLowerCase());

  return ref;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "Elixir/Erlang Documentation Lookup" is now active!'
  );

  let docRef = await initDocRef();
  await initMix();

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let cmdOpen = vscode.commands.registerCommand(
    'elixir-documentation.open',
    () => {
      vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      vscode.commands.executeCommand(
        'simpleBrowser.api.open',
        toMainDocUrl(docRef, MainRef.Elixir)
      );
    }
  );

  let cmdOtp = vscode.commands.registerCommand(
    'elixir-documentation.otp',
    () => {
      vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      vscode.commands.executeCommand(
        'simpleBrowser.api.open',
        toMainDocUrl(docRef, MainRef.Erlang)
      );
    }
  );

  let cmdLookup = vscode.commands.registerCommand(
    'elixir-documentation.lookup',
    async () => {
      const te = vscode.window.activeTextEditor;
      if (te) {
        // Check if cached mix dependencies need to be updated
        if (
          cachedMixPath &&
          te.document.fileName.startsWith(path.dirname(cachedMixPath)) === false
        ) {
          console.log(
            'The mix project changed, update cached mixed dependencies ...'
          );
          await initMix();
        } else {
          // still the same mix.lock path, but have contents changed?
          if (cachedMixPath) {
            const [mixHash, _] = await mixContentsWithHash(cachedMixPath);
            if (cachedMixHash !== mixHash) {
              console.log(
                "The project's mix.lock changed, update cached mixed dependencies ..."
              );
              await initMix();
            }
          } else {
            console.error('Expected to find a mix.lock, but did not ... ?!');
          }
        }

        // TODO: capture alias lines at the top of the file
        // Capture the whole line for parsing of lookup suggestions
        const range = te.selection.isEmpty
          ? te.document.getWordRangeAtPosition(
              te.selection.active,
              RegExp('^.+$')
            )
          : te.selection;
        if (range) {
          const lookupLine = te.document.getText(range);
          console.log(`Lookup line: ${lookupLine}`);

          const tryLSP = lineLookup(lookupLine, docRef);
          if (tryLSP) {
            await lspLookup(te, range, docRef);
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
  context.subscriptions.push(cmdOtp);
  context.subscriptions.push(cmdLookup);
}

// This method is called when your extension is deactivated
export function deactivate() {}

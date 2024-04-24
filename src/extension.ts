import * as vscode from 'vscode';
import * as parser from './line_parser';
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

enum MainRef {
  Elixir,
  Erlang,
}

let baseDocRef: DocRef | undefined;
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

async function initMix(elixirVersion: string) {
  const te = vscode.window.activeTextEditor;
  if (te) {
    const [lockFileFound, mixLockPath] = await findMixLock(
      te.document.fileName
    );
    console.log('Initial lock file found: ' + lockFileFound);
    console.log('Initial lock file at: ' + mixLockPath);
    if (lockFileFound) {
      cachedMixPath = mixLockPath;
      cachedMixDeps = await parseMixDeps(mixLockPath, elixirVersion);
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

async function parseMixDeps(
  filePath: string,
  otpVersion: string
): Promise<MixDep[]> {
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
    dependencies.push({
      name: 'ex_unit',
      version: otpVersion,
    });
    dependencies.push({
      name: 'logger',
      version: otpVersion,
    });
    return dependencies;
  } catch (e) {
    console.log(e);
    return [];
  }
}

/*
async function lineLookup(
  line: string,
  ref: DocRef
): Promise<[DocRef, TryLSP]> {
  let lookups: Array<DocRef & { label?: string; detail?: string }> = [];

  // TODO: replace by an actual parser, so that more complex nested variants don't break things
  // or
  // 1) get partial efa, mfa matches ending at(/with) '('
  // 2) for each parital match move cursor to position before '('
  // 3) run LSP completion request, aggregate results
  
//  const patterns = {
//    // look for pattern: :module.[.module[.m..]]function([arg[, arg...]])
//    //efa: /:[a-z]\w*\.[\w\.]+\([\w\s,%:"-\/\{\}\[\]]*\)/gu,
//    efa: /:[a-z]\w*\.[\w\.]+\(/gu,
//    // look for pattern: Module.[.Module[.M..]]function([arg[, arg...]])
//    //mfa: /[A-Z]\w*\.[\w\.!\?]+\([\w\s,%:"-\/\{\}\[\]]*\)/gu,
//    mfa: /[A-Z]\w*\.[\w\.!\?]+\(/gu,
//    // look for pattern: [alias|@behaviour|import|require|use] Module[.Modules[...]]
//    module: /(?:alias|@behaviour|import|require|use)\s+[A-Z][\w\.]\*\/gu,
//    // look for pattern: %Module[.Module[...]]{[field: var[, field: var[, ...]]]}
//    struct: /(?!%)[A-Z][\w\.]*(?=\{)/gu,
//  };

  const isType = line.trim().startsWith('@spec');

  console.log(line.match(patterns.efa));
  line.match(patterns.efa)?.forEach((item: string) => {
    const dref: DocRef & { label?: string; detail?: string } = {
      ...ref,
      isErl: true,
    };
    const dotIndex = item.lastIndexOf('.');
    const pLft = item.indexOf('(');
    const pRgt = item.lastIndexOf(')');
    const fn = item.slice(dotIndex + 1, pLft);
    const arity = item
      .slice(pLft + 1, pRgt)
      .split(',')
      .filter((arg) => arg !== '').length;
    dref.module = item.slice(1, dotIndex);
    dref.fragment = `${fn}/${arity}`;
    dref.label = item;
    dref.detail = `function - ${dref.module}.${fn}/${arity}`;
    lookups.push(dref);
  });

  console.log(line.match(patterns.mfa));
  line.match(patterns.mfa)?.forEach((item: string) => {
    const dref: DocRef & { label?: string; detail?: string } = { ...ref };
    const dotIndex = item.lastIndexOf('.');
    const pLft = item.indexOf('(');
    const pRgt = item.lastIndexOf(')');
    const fn = item.slice(dotIndex + 1, pLft);
    const arity = item
      .slice(pLft + 1, pRgt)
      .split(',')
      .filter((arg) => arg !== '').length;
    dref.module = item.slice(0, dotIndex);
    dref.fragment = `${fn}/${arity}`;
    dref.isType = isType || item.endsWith('t()') || item.endsWith('t');
    dref.label = item;
    dref.detail = `${dref.isType ? 'type' : 'function'} - ${
      dref.module
    }.${fn}/${arity}`;
    lookups.push(dref);
  });

  console.log(line.match(patterns.module));
  line.match(patterns.module)?.forEach((item: string) => {
    const dref: DocRef & { label?: string; detail?: string } = { ...ref };
    dref.module = item.slice(item.lastIndexOf(' ') + 1);
    dref.label = item;
    dref.detail = 'module';
    lookups.push(dref);
  });

  console.log(line.match(patterns.struct));
  line.match(patterns.struct)?.forEach((item: string) => {
    const dref: DocRef & { label?: string; detail?: string } = {
      ...ref,
      module: item,
    };
    dref.label = item;
    dref.detail = 'struct';
    lookups.push(dref);
  });

  if (lookups.length === 0) {
    const pkg = isDependency(cachedMixDeps, ref.module);
    return [{ ...ref, package: pkg }, TryLSP.Yes];
  }
  if (lookups.length > 1) {
    const selected = await vscode.window.showQuickPick(
      lookups as vscode.QuickPickItem[],
      { canPickMany: false }
    );
    if (selected !== undefined) {
      const dref = selected as unknown as DocRef;
      const pkg = isDependency(cachedMixDeps, dref.module);
      return [{ ...dref, package: pkg }, TryLSP.No];
    } else {
      const pkg = isDependency(cachedMixDeps, ref.module);
      return [{ ...ref, package: pkg }, TryLSP.Yes];
    }
  } else {
    const pkg = isDependency(cachedMixDeps, lookups[0].module);
    return [{ ...lookups[0], package: pkg }, TryLSP.No];
  }
}
*/

async function completedItems(
  te: vscode.TextEditor,
  lineToken: parser.LineToken
): Promise<vscode.QuickPickItem[]> {
  let completes: vscode.CompletionList = new vscode.CompletionList([], true);
  try {
    completes = await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      te.document.uri,
      new vscode.Position(
        lineToken.range.end.line,
        lineToken.range.end.character + 1
      )
    );
    // Clean LSP completions from Elixir snippets
    if (completes && completes.items && completes.items.length > 0) {
      console.log(
        `\nCompletes ${lineToken.phrase}: ${JSON.stringify(completes.items)}`
      );
      const filtered = completes.items.filter(
        (item) =>
          item.detail !== undefined &&
          item.detail.indexOf('Elixir snippets') < 0
      );
      if (filtered.length > 0) {
        return filtered
          .map((e) => ({
            label: lineToken.phrase,
            detail: e.detail,
          }))
          .slice(0, 20);
      }
    }
  } catch (e) {
    console.log(
      `Completed items lookup failure for lineToken: ${JSON.stringify(
        lineToken
      )}`
    );
  }
  return [];
}

async function lspLookup(
  docRef: DocRef,
  te: vscode.TextEditor,
  lineTokens: parser.LineToken[]
): Promise<void> {
  let lspPicks: vscode.QuickPickItem[] = [];

  let lookups = lineTokens.map((lineToken) => completedItems(te, lineToken));
  let completions = await Promise.all(lookups);

  completions.forEach((items) => {
    lspPicks = [...lspPicks, ...items];
  });

  console.log(`\nQuick picks: ${JSON.stringify(lspPicks)}`);
  if (lspPicks.length > 0) {
    const first = lspPicks[0];
    if (lspPicks.length > 1) {
      const selected = await vscode.window.showQuickPick(
        lspPicks.slice(0, 10),
        {
          canPickMany: false,
        }
      );
      if (selected) {
        console.log('\nLSP quickpick: ');
        console.log(selected);
        docRef = updateDocRef(docRef, selected, cachedMixDeps);
        console.log(`\nDocRef: ${JSON.stringify(docRef)}`);
      }
    } else {
      console.log('LSP first: ');
      console.log(first);
      docRef = updateDocRef(docRef, first, cachedMixDeps);
    }
  }
}

function isDependency(packages: MixDep[], module: string): undefined | MixDep {
  const pkgSnakeCase = module
    .split(/(?=[A-Z][a-z])/g)
    .map((s) => `_${s.toLowerCase()}`)
    .join('')
    .slice(1)
    .replace(/\./g, '');
  return packages.find((dep) => pkgSnakeCase.startsWith(dep.name));
}

function toDocUrl(ref: DocRef): string {
  if (ref.package) {
    return `${ref.hexBase}/${ref.package.name}/${ref.package.version}/${
      ref.module
    }.html${ref.fragment ? `#${ref.isType ? 't:' : ''}${ref.fragment}` : ''}`;
  } else {
    if (ref.isErl) {
      return `${ref.erlBase}/${ref.otpVersion}/man/${ref.module}${
        ref.fragment ? `#${ref.fragment}` : ''
      }`;
    } else {
      return `${ref.hexBase}/elixir/${ref.elixirVersion}/${ref.module}.html${
        ref.fragment ? `#${ref.isType ? 't:' : ''}${ref.fragment}` : ''
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

  // The QuickPickItem label contains the line parsers token, which can contain
  // module name(s)
  const trimmedLabel =
    item.label.lastIndexOf('.') >= 0
      ? item.label.substring(item.label.lastIndexOf('.') + 1)
      : item.label;

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

  ref.package = isDependency(packages, ref.module);

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

  baseDocRef = await initDocRef();
  let docRef = { ...baseDocRef };
  await initMix(baseDocRef.elixirVersion);

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
      docRef = { ...baseDocRef! };
      if (te) {
        // In test files default module to ExUnit.Case
        if (te.document.fileName.toLowerCase().endsWith('.exs')) {
          docRef.module = 'ExUnit.Case';
        }
        // Check if cached mix dependencies need to be updated
        if (
          cachedMixPath &&
          te.document.fileName.startsWith(path.dirname(cachedMixPath)) === false
        ) {
          console.log(
            'The mix project changed, update cached mixed dependencies ...'
          );
          await initMix(docRef.elixirVersion);
        } else {
          // still the same mix.lock path, but have contents changed?
          if (cachedMixPath) {
            const [mixHash, _] = await mixContentsWithHash(cachedMixPath);
            if (cachedMixHash !== mixHash) {
              console.log(
                "The project's mix.lock changed, update cached mixed dependencies ..."
              );
              await initMix(docRef.elixirVersion);
            }
          } else {
            console.error('Expected to find a mix.lock, but did not ... ?!');
          }
        }

        // Capture the whole line for parsing of lookup suggestions
        const range = te.selection.isEmpty
          ? te.document.getWordRangeAtPosition(
              te.selection.active,
              RegExp('^.+$')
            )
          : te.selection;
        if (range) {
          const lookupLine = te.document.getText(range);
          let lineTokens = parser.lineParser(lookupLine, range);
          console.log(`Lookup line: ${lookupLine}`);
          console.log(`Line tokens: ${JSON.stringify(lineTokens)}`);
          await lspLookup(docRef, te, lineTokens);
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

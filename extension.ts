import * as vscode from 'vscode';

// types
type codeBlock = {
    id: number;
    startLine: number;
    endLine: number;
    hasLang: boolean | undefined;
    lang: string;
    lines: vscode.TextLine[];
}

type lintResult = {
    hasError: boolean;
    lineNumber: number | null;
    ruleName: string;
    ruleDescription: string;
    errorDetail: string;
    errorRange: vscode.Range;
}

// Variables
let lintingEnabled: boolean = true;
let targetGeneration = 0;
let diagnosticGeneration = 0;
let diagnosticCollection: vscode.DiagnosticCollection;
const shellTypeLanguages = ["bash", "shell", "powershell"];
const extensionDisplayName = '';


/**
 * 拡張機能がactivateされたとき（＝package.jsonのactivatinoEventsで定義される条件が満たされたとき）に実行される関数
 * @param context 
 */
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(didOpenTextDocument),
		vscode.window.onDidChangeActiveTextEditor(didChangeActiveTextEditor),
		vscode.window.onDidChangeVisibleTextEditors(didChangeVisibleTextEditors),
		vscode.workspace.onDidChangeTextDocument(didChangeTextDocument),
		vscode.workspace.onDidSaveTextDocument(didSaveTextDocument)
	);

    // Create DiagnosticCollection
	diagnosticCollection = vscode.languages.createDiagnosticCollection(extensionDisplayName);
	context.subscriptions.push(diagnosticCollection);
}

// Handles the onDidOpenTextDocument event
function didOpenTextDocument (document: vscode.TextDocument) {
    lint(document);
}

// Handles the onDidChangeActiveTextEditor event
function didChangeActiveTextEditor (textEditor: vscode.TextEditor | undefined) {
    if (textEditor !== undefined) {
    	lint(textEditor.document);
    }
}

// Handles the onDidChangeVisibleTextEditors event
function didChangeVisibleTextEditors (textEditors: readonly vscode.TextEditor[]) {
	for (const textEditor of textEditors) {
		lint(textEditor.document);
	}
}

// Handles the onDidChangeTextDocument event
function didChangeTextDocument (event: vscode.TextDocumentChangeEvent) {
    lint(event.document);
}

// Handles the onDidOpenTextDocument event
function didSaveTextDocument (document: vscode.TextDocument) {
    lint(document);
}

// Lints all visible files
function lintVisibleFiles () {
	didChangeVisibleTextEditors(vscode.window.visibleTextEditors);
}

function lint (document: vscode.TextDocument) {
	if (!lintingEnabled) {
		return;
	}

	// Lint
    if (document.languageId === 'markdown') {
        lintMarkdown(document);
    }
    else if (document.languageId === 'asciidoc') {
        // lintAsciidoc(document);  // TODO Asciidocのlint関数を実装
    }
    else {
        return;
    }
}

function lintMarkdown(document: vscode.TextDocument) {
    // Retrieve first code blocks
    const firstCodeBlock = retrieveFirstShellTypeCodeBlock(document);
    if (firstCodeBlock === null) {
        return;
    }
    const lineResult = lintForStartWithCd(firstCodeBlock);
    if (lineResult === null) {
        return;
    }

    // Create Diagnostics
    let diagnostics: vscode.Diagnostic[] = [];
    if (lineResult.hasError) {
        const code = lineResult.ruleName;
        const message = "[" + lineResult.ruleName + "]: " + lineResult.ruleDescription + "\n" + lineResult.errorDetail;
        const range = lineResult.errorRange;
        
        const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
        diagnostic.code = code;
        diagnostic.source = extensionDisplayName;

        diagnostics.push(diagnostic);
    }

    // Publish
    if (targetGeneration === diagnosticGeneration) {// TODO targetGenerationとdiagnosticGenerationの実装
        diagnosticCollection.set(document.uri, diagnostics);
    }

    return;
}

function retrieveFirstShellTypeCodeBlock(document: vscode.TextDocument): codeBlock | null {
    
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        if (line.text.trim().startsWith('```')) {
            const lang = line.text.replace(/```|:.*/g, '').trim();
            if (!shellTypeLanguages.includes(lang)) {
                continue;
            }

            const startLine = i;
            let lines = [line];
            for (let j = i + 1; j < document.lineCount; j++) {
                const nextLine = document.lineAt(j);
                if (nextLine.text.trim().startsWith('```')) {
                    const endLine = j;
                    return {id: 0, startLine, endLine, hasLang: undefined, lang, lines};
                }
                lines.push(nextLine);
            }
        }
    }
    return null;  // コードブロックが見つからなかった場合
}

function lintForStartWithCd(codeBlock: codeBlock): lintResult {
    let hasError = false;
    let lineNumber = null;
    let ruleName = "";
    let ruleDescription = "";
    let errorDetail = "";
    let errorRange = codeBlock.lines[0].range;

    // 空行を無視して最初のコマンドを取得
    let firstCommandLine: vscode.TextLine | undefined;
    for (let i = 1; i < codeBlock.lines.length; i++) {
        const line = codeBlock.lines[i];
        if (line.text.trim().length > 0) {
            firstCommandLine = line;
            break;
        }
    }
    if (firstCommandLine === undefined) {
        // コードブロックが空の場合
        return {hasError, lineNumber, ruleName, ruleDescription, errorDetail, errorRange};
    }

    if (!firstCommandLine.text.trim().startsWith('cd ')) {
        hasError = true;
        ruleName = 'start-with-cd';
        ruleDescription = 'First code block should start with `cd` command.';
        errorDetail = 'First code block does not start with `cd` command.';
        const range = firstCommandLine.range;
        errorRange = range.with(range.start.with(undefined, 0), range.end.with(undefined, 1));
    }
    return {hasError, lineNumber, ruleName, ruleDescription, errorDetail, errorRange};
}


export function deactivate() {}

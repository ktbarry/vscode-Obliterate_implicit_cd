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
    // fixInfo: any;
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
    // [主機能] エディタ内テキスト変更時の関数
    // let timeout: NodeJS.Timeout | undefined;
    // const dFuncForTextChange = vscode.workspace.onDidChangeTextDocument(event => {
    //     if (timeout) {
    //         clearTimeout(timeout)
    //     }
    //     timeout = setTimeout(() => {
    //         const document = event.document;
    //         if (document.languageId === "markdown" || document.languageId === "asciidoc") {
    //             const changes = event.contentChanges;
    //             changes.forEach(change => {
    //                 funcForTextChange(change.text, document, document.languageId);
    //             });
    //         }
    //     }, 300);  // 300ms 入力が無いとトリガされる (デバウンス)
    // });
    // context.subscriptions.push(dFuncForTextChange);


    // // DiagnosticCollectionを用いた実装
    // const diagnostics = vscode.languages.createDiagnosticCollection("markdown-lint");

    // // ドキュメントが開かれるたびに診断を実行
    // vscode.workspace.onDidOpenTextDocument(doc => {
    //     if (doc.languageId === 'markdown') {
    //         diagnoseMarkdown(doc, diagnostics);
    //     }
    // });

    context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(didChangeActiveTextEditor),
		vscode.window.onDidChangeVisibleTextEditors(didChangeVisibleTextEditors),
		// vscode.window.onDidChangeTextEditorSelection(didChangeTextEditorSelection),
		vscode.workspace.onDidOpenTextDocument(didOpenTextDocument),
		vscode.workspace.onDidChangeTextDocument(didChangeTextDocument),
		// vscode.workspace.onDidSaveTextDocument(didSaveTextDocument),
		// vscode.workspace.onDidCloseTextDocument(didCloseTextDocument),
		// vscode.workspace.onDidChangeConfiguration(didChangeConfiguration),
		// vscode.workspace.onDidGrantWorkspaceTrust(didGrantWorkspaceTrust),
		// vscode.workspace.onDidChangeWorkspaceFolders(didChangeWorkspaceFolders)
	);

    // Create DiagnosticCollection
	diagnosticCollection = vscode.languages.createDiagnosticCollection(extensionDisplayName);
	context.subscriptions.push(diagnosticCollection);
}

// Handles the onDidChangeActiveTextEditor event
function didChangeActiveTextEditor () {
	// if (applicationConfiguration[sectionFocusMode] !== false) {
		lintVisibleFiles();
	// }
}

// Handles the onDidOpenTextDocument event
function didOpenTextDocument (document: vscode.TextDocument) {
    lint(document);
}

// Handles the onDidChangeTextDocument event
function didChangeTextDocument (event: vscode.TextDocumentChangeEvent) {
    lint(event.document);
}

// Lints all visible files
function lintVisibleFiles () {
	didChangeVisibleTextEditors(vscode.window.visibleTextEditors);
}

// Handles the onDidChangeVisibleTextEditors event
function didChangeVisibleTextEditors (textEditors: readonly vscode.TextEditor[]) {
	for (const textEditor of textEditors) {
		lint(textEditor.document);
	}
}

function lint (document: vscode.TextDocument) {
	if (!lintingEnabled) {
		return;
	}
	const diagnostics: vscode.DiagnosticCollection[] = [];
	const targetGeneration = diagnosticGeneration;

	// Lint
    if (document.languageId === 'markdown') {
        // [ ] 以下のデバッグコードを削除
        console.log("doc.filename: ", document.fileName);
        console.log("doc.uri: ", document.uri);
        console.log("doc.uri.fsPath: ", document.uri.fsPath);
        console.log("doc.uri.path: ", document.uri.path);
        console.log("doc.uri.scheme: ", document.uri.scheme);
        console.log("doc.getText(): ", document.getText());
        lintMarkdown(document);
    }
    else if (document.languageId === 'asciidoc') {
        // lintAsciidoc(document);  // [ ] Asciidocのlint関数を実装
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
    if (targetGeneration === diagnosticGeneration) {// [ ] targetGenerationとdiagnosticGenerationの実装
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
    // let fixInfo = null;

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


/**
 * エディタ内テキスト変更時の処理
 * @param changedText: string 入力された文字や置換後のテキスト
 * @param document: vscode.TextDocument 対象のドキュメント
 * @param lang: `string` ファイルの言語
 */
function funcForTextChange(changedText: string, document: vscode.TextDocument, lang: string) {
    // ファイルの言語共通の前処理（あれば）

    // ファイルの言語ごとに分岐 [TODO] Mapとかを使って書く
    switch (lang) {
        case "markdown":
            funcForTextChangeMarkdown(changedText, document);
            break;
        case "asciidoc":
            // funcForTextChangeAsciiDoc(changedText, document);
            break;
        default:
            console.log(`This language (${lang}) is not supported.`);
            break;
    }
}

/**
 * エディタ内テキスト変更時の処理（markdownファイル）
 * @param changedText: string 入力された文字や置換後のテキスト
 * @param document: vscode.TextDocument
 */
function funcForTextChangeMarkdown(changedText: string, document: vscode.TextDocument) {
    // 機能間で共通の前処理
    // Retrieve all code blocks
    const text = document.getText();
    const codeBlocks = getCodeBlockTexts(text);
    

    // 機能1: 各コードブロック内のディレクトリ情報を表示
    
    // 機能2: 最初のコードブロックがcdコマンドで始まっているか確認

}

/**
 * マークダウン中のコードブロック内のテキストを全て抽出する。
 * @param text: `string`
 * @returns `string[]` コードブロックが無い場合は空の配列を返す
 */
function getCodeBlockTexts(text: string): string[] {
    // コードブロックの抽出
    const regexCodeBlock = /```.*?```/g;
    const matches = regexCodeBlock.exec(text);
    if (!matches) {
        return [];
    }

    // 各コードブロックから「```」を除去し、内容のみを取り出す
    return matches.map(block => block.replace(/^```[\s\S]*?\n|\n```$/g, '').trim());
}

/**
 * コードブロックで言語が指定されているかを判定し、結果を返す
 * @param codeBlocks: `string[]` ```と```に囲まれた文字列の配列
 * @returns `{hasLang: boolean; lang: string}[]` 引数codeBlocksの各要素が言語を指定しているならTrue（ただしその言語が存在するとは限らない）
 */
function languageSpecified(codeBlocks: string[]): {hasLang: boolean; lang: string}[] {
    const regex = /```\s*[a-z]+\s*/;  // 言語を指定していればマッチ
    const matches = codeBlocks.map(block => block.match(regex));

    return matches.map(match => {
        if (!match) {
            const hasLang = false;
            const lang = "";
            return {hasLang, lang};
        }
        else {
            const hasLang = true;
            const lang = match[2].replace(/(```|:.*)|\s*/g, "");
            return {hasLang, lang};
        }
    });
}

/**
 * 言語がターミナル系であればtrueを返す
 * @param langs: `string[]` ```と```に囲まれた文字列の配列
 * @returns `bolean[]`
 */
function isTerminalCodeBlock(langs: string[]): boolean[] {
    const retrievedLanguages: string[] = ["bash", "shell", "powershell"];

    return langs.map(lang => {
        if (retrievedLanguages.includes(lang)) {
            return true;
        } else {
            return false;
        }
    });
}


/** // [ ] lintのオンオフがトグルされたときの処理
// Toggles linting on/off
function toggleLinting () {
	lintingEnabled = !lintingEnabled;
	clearDiagnosticsAndLintVisibleFiles();
}

// Clears diagnostics and lints all visible files
function clearDiagnosticsAndLintVisibleFiles (eventUri) {
	if (eventUri) {
		outputLine(`Re-linting due to "${eventUri.fsPath}" change.`);
	}
	diagnosticCollection.clear();
	diagnosticGeneration++;
	outputChannelShown = false;
	lintVisibleFiles();
}
 */

export function deactivate() {}

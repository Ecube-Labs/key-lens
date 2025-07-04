import * as vscode from "vscode";
import { KeyLensProvider } from "./key-lens-provider";

export function activate(context: vscode.ExtensionContext) {
  const keyLensProvider = new KeyLensProvider();

  keyLensProvider.loadKeyValueMappings().then(() => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      keyLensProvider.updateDecorations(activeEditor);
    }
  });

  // #region define Commands
  const enableCommand = vscode.commands.registerCommand(
    "key-lens.enable",
    () => {
      keyLensProvider.enable();
    }
  );
  const disableCommand = vscode.commands.registerCommand(
    "key-lens.disable",
    () => {
      keyLensProvider.disable();
    }
  );

  const refreshCommand = vscode.commands.registerCommand(
    "key-lens.refresh",
    () => {
      keyLensProvider.refresh();
    }
  );
  // #endregion Commands

  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        keyLensProvider.updateDecorations(editor);
      }
    }
  );

  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        keyLensProvider.updateDecorations(editor);
      }
    }
  );

  const onDidChangeTextEditorSelection =
    vscode.window.onDidChangeTextEditorSelection(
      keyLensProvider.onDidChangeTextEditorSelection.bind(keyLensProvider)
    );

  context.subscriptions.push(
    enableCommand,
    disableCommand,
    refreshCommand,
    onDidChangeActiveTextEditor,
    onDidChangeTextDocument,
    onDidChangeTextEditorSelection,
    keyLensProvider
  );
}

export function deactivate() {}

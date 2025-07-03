// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface KeyLensConfig {
  paths: string[];
  filePatterns?: string[];
}

interface KeyValueMap {
  [key: string]: string;
}

class KeyLensProvider {
  private keyValueMap: KeyValueMap = {};
  private decorationType: vscode.TextEditorDecorationType;
  private isEnabled: boolean = true;
  public activeDecorations: vscode.DecorationOptions[] = [];
  private hiddenLines: Set<number> = new Set();
  private config: KeyLensConfig | null = null;

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        backgroundColor: new vscode.ThemeColor(
          "editor.hoverHighlightBackground"
        ),
        border: "1px solid",
        borderColor: new vscode.ThemeColor("editorHoverWidget.border"),
        margin: "0 0 0 1em",
        fontStyle: "italic",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  async loadKeyValueMappings() {
    this.keyValueMap = {};

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const configPath = path.join(
      workspaceFolder.uri.fsPath,
      "keylens.config.json"
    );

    try {
      const configContent = fs.readFileSync(configPath, "utf8");
      this.config = JSON.parse(configContent);

      if (!this.config) {
        return;
      }

      for (const relativePath of this.config.paths) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);

        if (fs.existsSync(fullPath)) {
          try {
            const jsonContent = fs.readFileSync(fullPath, "utf8");
            const data = JSON.parse(jsonContent);

            // Flatten nested objects with dot notation
            this.flattenObject(data, "", this.keyValueMap);
          } catch (error) {
            console.error(`Error reading JSON file ${fullPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("Error reading keylens.config.json:", error);
    }
  }

  private flattenObject(obj: any, prefix: string, result: KeyValueMap) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (
          typeof obj[key] === "object" &&
          obj[key] !== null &&
          !Array.isArray(obj[key])
        ) {
          this.flattenObject(obj[key], newKey, result);
        } else {
          result[newKey] = String(obj[key]);
        }
      }
    }
  }

  private shouldApplyToFile(fileName: string): boolean {
    if (!this.config || !this.config.filePatterns) {
      return true; // Apply to all files if no patterns specified
    }

    return this.config.filePatterns.some((pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(fileName);
    });
  }

  updateDecorations(editor: vscode.TextEditor) {
    if (!this.isEnabled || !editor) {
      return;
    }

    // Check if file matches the configured patterns
    const fileName = path.basename(editor.document.fileName);
    if (!this.shouldApplyToFile(fileName)) {
      return;
    }

    const text = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];

    // Find all keys in the text
    for (const key in this.keyValueMap) {
      const value = this.keyValueMap[key];
      const regex = new RegExp(`(['"\`])${this.escapeRegExp(key)}\\1`, "g");

      let match;
      while ((match = regex.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(
          match.index + match[0].length
        );

        const lineNumber = startPos.line;

        // Skip if this line is hidden
        if (this.hiddenLines.has(lineNumber)) {
          continue;
        }

        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(startPos, endPos),
          renderOptions: {
            after: {
              contentText: ` → ${value}`,
            },
          },
        };

        decorations.push(decoration);
      }
    }

    this.activeDecorations = decorations;
    editor.setDecorations(this.decorationType, decorations);
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  toggle() {
    this.isEnabled = !this.isEnabled;

    if (this.isEnabled) {
      // Re-apply decorations
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.updateDecorations(editor);
      }
    } else {
      // Clear all decorations
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.setDecorations(this.decorationType, []);
      }
    }

    vscode.window.showInformationMessage(
      `Key-Lens ${this.isEnabled ? "enabled" : "disabled"}`
    );
  }

  refresh() {
    this.hiddenLines.clear(); // Clear hidden lines on refresh
    this.loadKeyValueMappings().then(() => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.updateDecorations(editor);
      }
      vscode.window.showInformationMessage("Key-Lens refreshed");
    });
  }

  hideDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.decorationType, []);
    }
  }

  hideDecorationsForLine(lineNumber: number) {
    this.hiddenLines.add(lineNumber);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateDecorations(editor);
    }
  }

  showDecorationsForLine(lineNumber: number) {
    this.hiddenLines.delete(lineNumber);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateDecorations(editor);
    }
  }

  clearHiddenLines() {
    this.hiddenLines.clear();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateDecorations(editor);
    }
  }

  dispose() {
    this.decorationType.dispose();
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Key-Lens extension is now active!");

  const keyLensProvider = new KeyLensProvider();

  // Load initial mappings
  keyLensProvider.loadKeyValueMappings();

  // Register commands
  const toggleCommand = vscode.commands.registerCommand(
    "key-lens.toggle",
    () => {
      keyLensProvider.toggle();
    }
  );

  const refreshCommand = vscode.commands.registerCommand(
    "key-lens.refresh",
    () => {
      keyLensProvider.refresh();
    }
  );

  // Listen for active editor changes
  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        keyLensProvider.updateDecorations(editor);
      }
    }
  );

  // Listen for text document changes
  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        keyLensProvider.updateDecorations(editor);
      }
    }
  );

  // Listen for cursor position changes (to handle click events)
  const onDidChangeTextEditorSelection =
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;
      if (!editor) {
        return;
      }

      // Check if clicked on a decoration
      const position = event.selections[0].active;
      const decorations = keyLensProvider.activeDecorations;
      const clickedLineNumber = position.line;

      let clickedOnDecoration = false;
      for (const decoration of decorations) {
        if (decoration.range.contains(position)) {
          clickedOnDecoration = true;
          break;
        }
      }

      if (clickedOnDecoration) {
        // Hide decorations for this specific line
        keyLensProvider.hideDecorationsForLine(clickedLineNumber);

        // Show decorations again after 3 seconds or when clicking elsewhere
        setTimeout(() => {
          keyLensProvider.showDecorationsForLine(clickedLineNumber);
        }, 3000);
      }
    });

  // Add to context subscriptions
  context.subscriptions.push(
    toggleCommand,
    refreshCommand,
    onDidChangeActiveTextEditor,
    onDidChangeTextDocument,
    onDidChangeTextEditorSelection,
    keyLensProvider
  );

  // Update decorations for the currently active editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    keyLensProvider.updateDecorations(activeEditor);
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}

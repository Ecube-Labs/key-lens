import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

interface KeyLensConfig {
  paths: string[];
  extensions?: string[];
}

interface KeyValueMap {
  [key: string]: string;
}

export class KeyLensProvider {
  private keyValueMap: KeyValueMap = {};
  private decorationType: vscode.TextEditorDecorationType;
  private isEnabled: boolean = true;
  public activeDecorations: vscode.DecorationOptions[] = [];
  private hiddenLine?: number;
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

      for (const pathPattern of this.config.paths) {
        // Use glob to find all files matching the pattern
        const matchedFiles = await glob(pathPattern, {
          cwd: workspaceFolder.uri.fsPath,
          absolute: true,
          nodir: true,
        });

        for (const filePath of matchedFiles) {
          if (fs.existsSync(filePath)) {
            try {
              const jsonContent = fs.readFileSync(filePath, "utf8");
              const data = JSON.parse(jsonContent);

              // Flatten nested objects with dot notation
              this.flattenObject(data, "", this.keyValueMap);
            } catch (error) {
              console.error(`Error reading JSON file ${filePath}:`, error);
            }
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
    if (!this.config || !this.config.extensions) {
      return true; // Apply to all extensions if no patterns specified
    }

    const fileExtension = path.extname(fileName).slice(1);
    return this.config.extensions.some((extension: string) => {
      return fileExtension === extension;
    });
  }

  private isKeyMappingLoaded(): boolean {
    return Object.keys(this.keyValueMap).length > 0;
  }

  updateDecorations(editor: vscode.TextEditor) {
    if (!this.isEnabled || !editor) {
      return;
    }

    // If key mapping is not loaded yet, skip decoration
    if (!this.isKeyMappingLoaded()) {
      return;
    }

    const fileName = path.basename(editor.document.fileName);
    if (!this.shouldApplyToFile(fileName)) {
      return;
    }

    const text = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];

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
        if (this.hiddenLine === lineNumber) {
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

  disable() {
    this.isEnabled = false;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.decorationType, []);
    }
    vscode.window.showInformationMessage("Key-Lens disabled");
  }

  enable() {
    this.isEnabled = true;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateDecorations(editor);
    }
    vscode.window.showInformationMessage("Key-Lens enabled");
  }

  refresh() {
    this.hiddenLine = undefined;
    this.loadKeyValueMappings().then(() => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.updateDecorations(editor);
      }
      vscode.window.showInformationMessage("Key-Lens refreshed");
    });
  }

  hideDecorationsForLine(lineNumber: number) {
    this.hiddenLine = lineNumber;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateDecorations(editor);
    }
  }

  clearHiddenLines() {
    this.hiddenLine = undefined;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateDecorations(editor);
    }
  }

  dispose() {
    this.decorationType.dispose();
  }

  onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent) {
    const editor = event.textEditor;
    if (!editor) {
      return;
    }

    const position = event.selections[0].active;
    const decorations = this.activeDecorations;
    const clickedLineNumber = position.line;

    let clickedOnDecoration = false;
    for (const decoration of decorations) {
      if (decoration.range.contains(position)) {
        clickedOnDecoration = true;
        break;
      }
    }

    if (clickedOnDecoration) {
      this.hideDecorationsForLine(clickedLineNumber);
    } else {
      this.clearHiddenLines();
    }
  }
}

/* eslint-disable eqeqeq */

import { types } from "util";
import * as vscode from "vscode";

const HEADER = "HEADER";
const BODY = "BODY";
const END_OF_HEADERS = "---";
const END_OF_NODE = "===";

type Headers = {
  [name: string]: string;
};

type MatchPart = {
  index: number;
  text: string;
};

/* startLine, startCol, endLine, endCol */
type Pos = [number, number, number, number];

type IfState = {
  indent: number;
  line: number;
  lastElse: Pos | null;
};

type YarnCommandSchema = {
  commands: {
    [name: string]: {
      minArgs?: number;
      maxArgs?: number;
      types?: [string];
    };
  };
  enums: {
    [name: string]: [string];
  };
};

export function activate(context: vscode.ExtensionContext) {
  let disp;
  const diag = vscode.languages.createDiagnosticCollection("sc-yarnspinner");

  const COMMAND_LINE = /^(\s*)(<<\s*)(.*?)(\s*>>\s*)/;

  let config = vscode.workspace.getConfiguration("YarnSpinner");
  let schema = config.get<YarnCommandSchema>("commandValidationSchema");

  function maybeScanDocument(doc: vscode.TextDocument) {
    const bugs: Array<vscode.Diagnostic> = [];

    function makeDiag(location: Pos, message: string): void {
      const [startLine, startCol, endLine, endCol] = location;
      bugs.push(
        new vscode.Diagnostic(
          new vscode.Range(
            new vscode.Position(startLine, startCol),
            new vscode.Position(endLine, endCol)
          ),
          message
        )
      );
    }

    if (doc.languageId !== "yarnspinner") {
      return;
    }

    // Clear bugs for this uri
    diag.delete(doc.uri);

    // FIND BUGS
    let mode = HEADER;
    let lasttext;
    let ii = 0,
      headers: Headers = {},
      hadTitleHeader = false;
    let ifStack: Array<IfState> = [];
    let headerStartLine = 0;
    for (ii = 0; ii < doc.lineCount; ii++) {
      const line = doc.lineAt(ii);
      if (mode === HEADER) {
        if (line.text === END_OF_HEADERS) {
          if (headers.title == null || headers.title.trim() === "") {
            makeDiag(
              [headerStartLine, 0, ii, 0],
              `Node is missing a "title" header.`
            );
          }
          mode = BODY;
        } else if (line.text.length > 0) {
          const parts = line.text.split(": ", 2);
          if (parts.length === 1) {
            makeDiag(
              [ii, 0, ii, line.text.length],
              `Headers must be of the form "name: value"`
            );
          } else {
            headers[parts[0]] = parts[1];
          }

          // VALIDATE HEADER LINE
        }
      } else {
        if (line.text === END_OF_NODE) {
          mode = HEADER;
          headers = {};
          headerStartLine = ii + 1;
          hadTitleHeader = false;

          if (ifStack.length > 0) {
            for (const ifEntry of ifStack) {
              makeDiag(
                [ifEntry.line, 0, ifEntry.line + 1, 0],
                `Missing "endif" for this "if".`
              );
            }
          }
          ifStack = [];
        } else {
          // Validate Commands
          const commandMatch = line.text.match(COMMAND_LINE);
          if (commandMatch != null) {
            const indent = commandMatch[1].length;
            const posBase = indent + commandMatch[2].length;
            const posCommand: Pos = [
              ii,
              posBase,
              ii,
              posBase + commandMatch[3].length,
            ];
            let pos = posCommand;
            const command = commandMatch[3];
            if (command.trim().length === 0) {
              makeDiag(
                pos,
                `Invalid command syntax.  Commands require a name.`
              );
            } else {
              const parts: Array<MatchPart> = [];
              for (const match of command.matchAll(/(\S+)\s*/g)) {
                parts.push({
                  index: posBase + (match.index ?? 0),
                  text: match[1],
                });
              }
              // Validate Command
              if (schema != null) {
                const def = schema.commands[parts[0].text];
                pos = [
                  ii,
                  parts[0].index,
                  ii,
                  parts[0].index + parts[0].text.length,
                ];

                if (parts[0].text === "if") {
                  ifStack.push({ indent, line: ii, lastElse: null });
                } else if (parts[0].text === "elseif") {
                  if (ifStack.length === 0) {
                    makeDiag(pos, `Unexpected "elseif" without "if".`);
                  } else if (ifStack[ifStack.length - 1].indent !== indent) {
                    makeDiag(
                      pos,
                      `Indentation of "elseif" (${indent}) must match earlier "if" (${
                        ifStack[ifStack.length - 1].indent
                      }) on line ${ifStack[ifStack.length - 1].line}.`
                    );
                  }
                } else if (parts[0].text === "else") {
                  if (ifStack.length === 0) {
                    makeDiag(pos, `Unexpected "else" without "if".`);
                  } else if (ifStack[ifStack.length - 1].lastElse !== null) {
                    makeDiag(
                      pos,
                      `Unexpected duplicate "else" (see line ${
                        ifStack[ifStack.length - 1]?.lastElse?.[0]
                      }) for "if" from line ${
                        ifStack[ifStack.length - 1].line
                      }.`
                    );
                  } else if (ifStack[ifStack.length - 1].indent !== indent) {
                    makeDiag(
                      pos,
                      `Indentation of "else" (${indent}) must match earlier "if" (${
                        ifStack[ifStack.length - 1].indent
                      }) on line ${ifStack[ifStack.length - 1].line}.`
                    );
                  }
                } else if (parts[0].text === "endif") {
                  if (ifStack.length === 0) {
                    makeDiag(pos, `Unexpected "endif" without "if".`);
                  } else if (ifStack[ifStack.length - 1].indent !== indent) {
                    makeDiag(
                      pos,
                      `Indentation of "endif" (${indent}) must match earlier "if" (${
                        ifStack[ifStack.length - 1].indent
                      }) on line ${ifStack[ifStack.length - 1].line}.`
                    );
                  }
                  ifStack.pop();
                }

                if (def == null) {
                  makeDiag(pos, `Unknown command "${parts[0].text}".`);
                } else {
                  if (def.minArgs != null && parts.length - 1 < def.minArgs) {
                    if (def.minArgs === 1) {
                      makeDiag(
                        posCommand,
                        `Command "${parts[0].text}" takes at least 1 argument.`
                      );
                    } else {
                      makeDiag(
                        posCommand,
                        `Command "${parts[0].text}" takes at least ${def.minArgs} arguments.`
                      );
                    }
                  }
                  if (def.maxArgs != null && parts.length - 1 > def.maxArgs) {
                    if (def.maxArgs === 0) {
                      makeDiag(
                        posCommand,
                        `Command "${parts[0].text}" takes no arguments.`
                      );
                    } else {
                      makeDiag(
                        posCommand,
                        `Command "${parts[0].text}" takes at most ${def.maxArgs} arguments.`
                      );
                    }
                  }
                  if (def.types != null) {
                    // Validate Types
                    for (let jj = 0; jj < def.types.length; jj++) {
                      if (jj >= parts.length - 1) {
                        break;
                      }

                      const type = def.types[jj];
                      const part = parts[jj + 1];
                      pos = [ii, part.index, ii, part.index + part.text.length];

                      if (type === "number") {
                        if (isNaN(parseFloat(part.text))) {
                          makeDiag(
                            pos,
                            `Invalid value "${part.text}" for argument ${
                              jj + 1
                            } of type "${type}" for "${parts[0].text}".`
                          );
                        }
                      } else if (type === "string") {
                        // nothing
                      } else if (schema.enums) {
                        // enum
                        const en = schema.enums[type];
                        if (!en.includes(part.text)) {
                          makeDiag(
                            pos,
                            `Invalid value "${part.text}" for argument ${
                              jj + 1
                            } of type "${type}" for "${parts[0].text}".`
                          );
                        }
                      } else {
                        makeDiag(pos, `Schema Error: Unknown type "${type}"`);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (line.text !== "") {
        lasttext = line.text;
      }
    }

    if (lasttext !== END_OF_NODE) {
      makeDiag([ii, 0, ii, 0], `Missing '${END_OF_NODE}' at end of file`);
    }

    diag.set(doc.uri, bugs);
  }

  // TODO: Open schema

  function rescanOpenDocuments() {
    for (const doc of vscode.workspace.textDocuments) {
      maybeScanDocument(doc);
    }
  }

  rescanOpenDocuments();

  // Scan all *open* documents.
  // Rescan documents on open.
  disp = vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => {
    maybeScanDocument(doc);
  });
  context.subscriptions.push(disp);
  // Rescan documents on change.
  disp = vscode.workspace.onDidChangeTextDocument(
    (change: vscode.TextDocumentChangeEvent) => {
      maybeScanDocument(change.document);
    }
  );
  context.subscriptions.push(disp);
  disp = vscode.workspace.onDidChangeConfiguration(
    (_change: vscode.ConfigurationChangeEvent) => {
      config = vscode.workspace.getConfiguration("YarnSpinner");
      schema = config.get<YarnCommandSchema>("commandValidationSchema");
      rescanOpenDocuments();
    }
  );
  context.subscriptions.push(disp);

  // TODO: Find all .yarn files in the workspace and do a scan on them
}

export function deactivate() {}

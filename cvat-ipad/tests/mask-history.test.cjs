const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(
    __dirname,
    '../../cvat-canvas/src/typescript/nativeTouchMasksHandler.ts',
), 'utf8');

function loadHandler() {
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: 'nativeTouchMasksHandler.ts',
    }).outputText;
    const compiledModule = new Module(__filename, module.parent);
    compiledModule.filename = path.join(__dirname, 'nativeTouchMasksHandler.js');
    compiledModule.paths = Module._nodeModulePaths(__dirname);
    const originalLoad = Module._load;
    Module._load = function mockedLoad(request, parent, isMain) {
        if (request === './canvasModel' || request === './shared' || request === './pointer') {
            return request === './shared' ? { imageDataToRLE() {}, RLEToImageData() {} } : {};
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        compiledModule._compile(compiled, compiledModule.filename);
        return compiledModule.exports.NativeTouchMasksHandler;
    } finally {
        Module._load = originalLoad;
    }
}

function handlerWithEmptyHistory(Handler) {
    const handler = Object.create(Handler.prototype);
    handler.undoStack = [];
    handler.redoStack = [];
    handler.historyBytes = 0;
    return handler;
}

function snapshot(bytes) {
    return { data: { byteLength: bytes } };
}

test('history pruning keeps the newest snapshots within the 64 MiB budget', () => {
    const Handler = loadHandler();
    const handler = handlerWithEmptyHistory(Handler);
    const chunk = 20 * 1024 * 1024;

    handler.pushUndo(snapshot(chunk));
    handler.pushUndo(snapshot(chunk));
    handler.pushUndo(snapshot(chunk));
    handler.pushUndo(snapshot(chunk));

    assert.equal(handler.undoStack.length, 3);
    assert.equal(handler.historyBytes, 60 * 1024 * 1024);
    assert.ok(handler.historyBytes <= 64 * 1024 * 1024);
});

test('new edits clear redo before budgeting their undo snapshot', () => {
    const Handler = loadHandler();
    const handler = handlerWithEmptyHistory(Handler);
    const oldUndo = snapshot(16 * 1024 * 1024);
    const redo = snapshot(48 * 1024 * 1024);

    handler.pushUndo(oldUndo);
    handler.pushRedo(redo);
    handler.strokeBefore = snapshot(16 * 1024 * 1024);
    handler.tool = null;
    handler.completeStroke();

    assert.equal(handler.redoStack.length, 0);
    assert.equal(handler.undoStack.length, 2);
    assert.equal(handler.historyBytes, 32 * 1024 * 1024);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(require('node:path').join(__dirname, '../src/storage.ts'), 'utf8');

function loadStorage(filesystem, localStore = {}) {
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: 'storage.ts',
    }).outputText;
    const compiledModule = new Module(__filename, module.parent);
    compiledModule.filename = require('node:path').join(__dirname, '../src/storage.js');
    compiledModule.paths = Module._nodeModulePaths(__dirname);
    const originalLoad = Module._load;
    Module._load = function mockedLoad(request, parent, isMain) {
        if (request === '@capacitor/core') return { Capacitor: {
            isNativePlatform: () => true,
            convertFileSrc: (uri) => uri,
        }, registerPlugin: () => localStore };
        if (request === '@capacitor/filesystem') return {
            Directory: { Data: 'DATA', Cache: 'CACHE' },
            Encoding: { UTF8: 'utf8' },
            Filesystem: filesystem,
        };
        if (request === '@capacitor/share') return { Share: {} };
        if (request === './project') return { annotationExport: () => ({}) };
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        compiledModule._compile(compiled, compiledModule.filename);
        return compiledModule.exports;
    } finally {
        Module._load = originalLoad;
    }
}

function project() {
    return {
        version: 1, id: 'project-1', name: 'Demo', updatedAt: '2026-01-01T00:00:00.000Z',
        images: [], labels: [], shapes: [], nextShapeID: 1,
    };
}

test('saveProject surfaces native store failures without filesystem fallbacks', { concurrency: false }, async () => {
    const calls = [];
    const filesystem = {
        writeFile: async (options) => calls.push(['write', options]),
    };
    const localStore = { save: async () => { throw new Error('native save failed'); } };
    const storage = loadStorage(filesystem, localStore);

    await assert.rejects(storage.saveProject(project()), /native save failed/);
    assert.deepEqual(calls, []);
});

test('saveProject sends the serialized project to the native store', { concurrency: false }, async () => {
    const calls = [];
    const localStore = { save: async (options) => calls.push(options) };
    const storage = loadStorage({}, localStore);
    const value = project();

    await storage.saveProject(value);
    assert.deepEqual(calls, [{ id: value.id, data: JSON.stringify(value) }]);
});

test('importStack creates the native project directory once before image writes', { concurrency: false }, async () => {
    const calls = [];
    const filesystem = {
        mkdir: async (options) => calls.push(['mkdir', options]),
        writeFile: async (options) => calls.push(['write', options]),
        rmdir: async () => calls.push(['rmdir']),
    };
    const originalRandomUUID = global.crypto.randomUUID;
    Object.defineProperty(global.crypto, 'randomUUID', {
        configurable: true,
        value: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    global.createImageBitmap = async () => ({ width: 100, height: 50, close() {} });
    global.FileReader = class {
        readAsDataURL() { this.result = 'data:image/png;base64,AAAA'; this.onload(); }
    };
    const storage = loadStorage(filesystem, { save: async () => undefined });
    const files = [{ name: 'view-1.png' }, { name: 'view-2.png' }];

    await storage.importStack(files, 'Stack');
    assert.equal(calls.filter(([operation]) => operation === 'mkdir').length, 1);
    assert.equal(calls.filter(([operation]) => operation === 'write').length, 2);
    const imageWrites = calls.filter(([operation]) => operation === 'write');
    assert.ok(imageWrites.every(([, options]) => options.recursive === undefined));
    Object.defineProperty(global.crypto, 'randomUUID', { configurable: true, value: originalRandomUUID });
});

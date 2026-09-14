// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalProject, StackImage, annotationExport } from './project';

const native = Capacitor.isNativePlatform();
const directory = Directory.Data;
interface LocalProjectStorePlugin {
    save(options: { id: string; data: string }): Promise<void>;
}

const localProjectStore = registerPlugin<LocalProjectStorePlugin>('LocalProjectStore');

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('cvat-local', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('projects', { keyPath: 'id' });
            request.result.createObjectStore('images');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function transaction<T>(
    store: 'projects' | 'images', mode: IDBTransactionMode,
    action: (value: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        let tx: IDBTransaction;
        let request: IDBRequest<T>;
        try {
            tx = database.transaction(store, mode);
            request = action(tx.objectStore(store));
        } catch (error) {
            database.close();
            reject(error);
            return;
        }
        tx.oncomplete = () => {
            database.close();
            resolve(request.result);
        };
        tx.onabort = () => {
            database.close();
            reject(tx.error || request.error || new Error('Local save was interrupted'));
        };
        tx.onerror = () => { /* onabort reports the transaction failure */ };
    });
}

function base64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function writeImage(projectID: string, imageID: string, file: Blob): Promise<void> {
    if (native) {
        await Filesystem.writeFile({
            path: `projects/${projectID}/${imageID}`, directory, data: await base64(file),
        });
    } else {
        await transaction('images', 'readwrite', (store) => store.put(file, `${projectID}/${imageID}`));
    }
}

export async function readImage(projectID: string, imageID: string): Promise<Blob> {
    if (!native) {
        const blob = await transaction<Blob>('images', 'readonly', (store) => store.get(`${projectID}/${imageID}`));
        if (!blob) throw new Error('This image is missing from local storage.');
        return blob;
    }
    const { uri } = await Filesystem.getUri({ path: `projects/${projectID}/${imageID}`, directory });
    const response = await fetch(Capacitor.convertFileSrc(uri));
    if (!response.ok) throw new Error('Could not read the saved image.');
    return response.blob();
}

export async function saveProject(project: LocalProject): Promise<void> {
    if (native) {
        await localProjectStore.save({ id: project.id, data: JSON.stringify(project) });
    } else {
        await transaction('projects', 'readwrite', (store) => store.put(project));
    }
}

export async function listProjects(): Promise<LocalProject[]> {
    let projects: LocalProject[];
    if (!native) {
        projects = await transaction('projects', 'readonly', (store) => store.getAll());
    } else {
        try {
            await Filesystem.mkdir({ path: 'projects', directory, recursive: true });
        } catch (error) {
            // Some native Filesystem versions reject recursive mkdir when the
            // directory already exists. Accept that case only after verifying
            // the existing path is actually a directory.
            try {
                const existing = await Filesystem.stat({ path: 'projects', directory });
                if (existing.type !== 'directory') throw error;
            } catch {
                throw error;
            }
        }
        const { files } = await Filesystem.readdir({ path: 'projects', directory });
        projects = [];
        for (const file of files.filter((entry) => entry.type === 'directory')) {
            // Incomplete imports have no project.json and are not presented as saved projects.
            const entries = await Filesystem.readdir({ path: `projects/${file.name}`, directory });
            if (entries.files.some((entry) => entry.name === 'project.json')) {
                const { data } = await Filesystem.readFile({
                    path: `projects/${file.name}/project.json`, directory, encoding: Encoding.UTF8,
                });
                projects.push(JSON.parse(data as string));
            }
        }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function importStack(files: File[], name: string): Promise<LocalProject> {
    if (!files.length) throw new Error('Choose at least one image.');
    const id = crypto.randomUUID();
    const images: StackImage[] = [];
    try {
        if (native) {
            // Create the directory once for the whole import. This also makes
            // each image write independent of recursive mkdir behavior.
            await Filesystem.mkdir({ path: `projects/${id}`, directory, recursive: true });
        }
        for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
            const bitmap = await createImageBitmap(file);
            const { width, height } = bitmap;
            bitmap.close();
            if (images.length && (width !== images[0].width || height !== images[0].height)) {
                throw new Error(`${file.name} has different dimensions. Aligned views must have the same width and height.`);
            }
            const image = { id: crypto.randomUUID(), name: file.name, width, height };
            await writeImage(id, image.id, file);
            images.push(image);
        }
        const project: LocalProject = {
            version: 1, id, name: name.trim() || files[0].name, updatedAt: new Date().toISOString(), images,
            labels: [{ id: 1, name: 'Object', color: '#52c4ff' }], shapes: [], nextShapeID: 1,
        };
        await saveProject(project);
        return project;
    } catch (error) {
        // Only clean up this new import; existing projects are never touched.
        if (native) {
            await Filesystem.rmdir({ path: `projects/${id}`, directory, recursive: true }).catch(() => undefined);
        } else {
            await Promise.all(images.map((image) => (
                transaction('images', 'readwrite', (store) => store.delete(`${id}/${image.id}`))
                    .catch(() => undefined)
            )));
        }
        throw error;
    }
}

export async function exportProject(project: LocalProject): Promise<void> {
    const filename = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'annotations'}.annotations.json`;
    const data = JSON.stringify(annotationExport(project));
    if (native) {
        const result = await Filesystem.writeFile({
            path: `exports/${filename}`, data, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true,
        });
        await Share.share({ title: project.name, files: [result.uri] });
    } else {
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

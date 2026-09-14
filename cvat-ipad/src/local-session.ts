// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { Job } from '../../cvat-core/src/session';
import AnnotationsCollection from '../../cvat-core/src/annotations-collection';
import AnnotationHistory from '../../cvat-core/src/annotations-history';
import { FramesMetaData } from '../../cvat-core/src/frames';
import { Event } from '../../cvat-core/src/event';
import ObjectState from '../../cvat-core/src/object-state';
import {
    DataStorageLocation, DimensionType, JobStage, JobState, JobType, LabelType, MediaType,
    RelatedImageMode, ShapeType, Source, TaskMode,
} from '../../cvat-core/src/enums';
import { LocalProject } from './project';
import { readImage, saveProject, exportProject } from './storage';

type ChangeListener = (project: LocalProject) => void;
const numericID = (value: string): number => (
    Math.abs([...value].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0)) || 1
);

export class LocalJob extends Job {
    public readonly localMode = true;
    public readonly meta: FramesMetaData;
    private local: LocalProject;
    private readonly changed: ChangeListener;
    private readonly collection: AnnotationsCollection;
    private readonly bitmaps = new Map<number, Promise<ImageBitmap>>();
    private savedShapes: string;
    private queue = Promise.resolve();
    private closed = false;

    constructor(project: LocalProject, changed: ChangeListener = () => undefined) {
        super({
            id: numericID(project.id), task_id: numericID(project.id), task_name: project.name,
            start_frame: 0, stop_frame: 0, frame_count: 1,
            type: JobType.ANNOTATION, state: JobState.IN_PROGRESS, stage: JobStage.ANNOTATION,
            mode: TaskMode.ANNOTATION, dimension: DimensionType.DIMENSION_2D, media_type: MediaType.IMAGE,
            related_image_mode: RelatedImageMode.ALIGNED,
            labels: project.labels.map((label) => ({ ...label, type: LabelType.ANY, attributes: [] })),
        });
        this.local = project;
        this.changed = changed;
        const history = new AnnotationHistory();
        const primary = project.images[0];
        this.meta = new FramesMetaData({
            chunk_size: 1, size: 1, start_frame: 0, stop_frame: 0, frame_filter: '', image_quality: 100,
            deleted_frames: {}, included_frames: null, chapters: [], chunks_updated_date: project.updatedAt,
            storage: DataStorageLocation.LOCAL, cloud_storage_id: null,
            frames: [{ width: primary.width, height: primary.height, name: primary.name,
                related_files: project.images.length - 1, related_file_paths: project.images.slice(1).map((image) => image.name) }],
        });
        this.collection = new AnnotationsCollection({
            labels: this.labels, history, stopFrame: 0, dimension: DimensionType.DIMENSION_2D,
            jobType: JobType.ANNOTATION,
            framesInfo: { 0: { width: primary.width, height: primary.height }, isFrameDeleted: () => false },
        });
        this.collection.import({
            tags: [], tracks: [],
            shapes: project.shapes.map((shape, index) => ({
                id: shape.id, frame: 0, label_id: shape.labelID, type: shape.type as ShapeType, points: shape.points,
                rotation: shape.rotation, occluded: false, outside: false, z_order: index,
                source: Source.MANUAL, attributes: [], group: 0, elements: [],
            })),
        });
        this.savedShapes = JSON.stringify(this.snapshot().shapes);
        this.local = this.snapshot();
        this.logger = { log: async (scope, payload = {}) => new Event(scope, payload) };
        const unsupported = async (): Promise<never> => { throw new Error('This operation is not available for a local image stack.'); };
        this.frames = {
            get: async () => ({
                number: 0, width: primary.width, height: primary.height, deleted: false, filename: primary.name,
                relatedFiles: project.images.length - 1, relatedFilePaths: project.images.slice(1).map((image) => image.name),
                data: async () => ({ imageData: await this.bitmap(0), renderWidth: primary.width, renderHeight: primary.height }),
            }),
            frameNumbers: async () => [0], search: async () => 0,
            contextImage: async () => Object.fromEntries(await Promise.all(project.images.slice(1).map(async (_, index) => (
                [String(index), await this.bitmap(index + 1)]
            )))),
            cachedChunks: async () => [0], save: async () => [],
            delete: unsupported, restore: unsupported, contextImageData: unsupported, chunk: unsupported, preview: async () => '',
        } as unknown as typeof this.frames;
        this.annotations = {
            get: async (frame: number, allTracks = false, filters: object[] = []) => {
                if (this.annotations.hasUnsavedChanges()) await this.persist();
                return this.collection.get(frame, allTracks, filters);
            },
            put: async (states) => {
                if (states.some((state) => !(state instanceof ObjectState) ||
                    !['mask', 'rectangle', 'points', 'polygon'].includes(state.shapeType))) {
                    throw new Error('Local stacks currently support masks, points, boxes and polygons.');
                }
                const ids = this.collection.put(states);
                await this.persist();
                return ids;
            },
            save: () => this.persist(),
            hasUnsavedChanges: () => JSON.stringify(this.snapshot().shapes) !== this.savedShapes,
            export: async () => this.collection.export(), statistics: async () => this.collection.statistics(),
            select: async (states, x, y) => this.collection.select(states, x, y),
            clear: async (options) => {
                if (!options?.reload) { this.collection.clear(options); await this.persist(); }
            },
            search: async (...args) => this.collection.search(...args),
        } as typeof this.annotations;
        this.actions = {
            undo: async (count = 1) => { const ids = await history.undo(count); await this.persist(); return ids; },
            redo: async (count = 1) => { const ids = await history.redo(count); await this.persist(); return ids; },
            freeze: async (frozen) => history.freeze(frozen), clear: async () => history.clear(), get: async () => history.get(),
        };
    }

    private bitmap(index: number): Promise<ImageBitmap> {
        if (!this.bitmaps.has(index)) {
            this.bitmaps.set(index, readImage(this.local.id, this.local.images[index].id).then((blob) => createImageBitmap(blob))
                .then((bitmap) => {
                    if (this.closed) { bitmap.close(); throw new Error('Project has been closed.'); }
                    return bitmap;
                }).catch((error) => { this.bitmaps.delete(index); throw error; }));
        }
        return this.bitmaps.get(index);
    }

    private snapshot(): LocalProject {
        const shapes = this.collection.get(0, false, []).map((state) => ({
            id: state.clientID, labelID: state.label.id, type: state.shapeType as LocalProject['shapes'][number]['type'],
            points: [...state.points], rotation: state.rotation || 0,
        }));
        return { ...this.local, shapes, nextShapeID: Math.max(0, ...shapes.map((shape) => shape.id)) + 1 };
    }

    private persist(): Promise<void> {
        const updated = { ...this.snapshot(), updatedAt: new Date().toISOString() };
        const serialized = JSON.stringify(updated.shapes);
        this.local = updated;
        this.queue = this.queue.catch(() => undefined).then(async () => {
            await saveProject(updated);
            this.savedShapes = serialized;
            this.changed(updated);
        });
        return this.queue;
    }

    async exportLocalAnnotations(): Promise<void> {
        await this.persist();
        await exportProject(this.local);
    }

    async close(): Promise<void> {
        await this.queue;
        this.closed = true;
        this.bitmaps.forEach((promise) => { void promise.then((bitmap) => bitmap.close()).catch(() => undefined); });
        this.bitmaps.clear();
    }
}

export function getLocalJob(project: LocalProject, changed?: ChangeListener): LocalJob {
    return new LocalJob(project, changed);
}

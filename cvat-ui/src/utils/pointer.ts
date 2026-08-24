// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

export function isCoarsePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    // iPad + Pencil is pointer:fine (stylus) but any-pointer:coarse (finger).
    return window.matchMedia('(any-pointer: coarse)').matches;
}

export function isIPadLike(): boolean {
    if (typeof navigator === 'undefined') {
        return false;
    }
    const ua = navigator.userAgent || '';
    if (/iPad/.test(ua)) {
        return true;
    }
    // iPadOS 13+ reports as Macintosh with a touchscreen
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function isTouchLayout(): boolean {
    return isIPadLike() || isCoarsePointer();
}

const ANNOTATION_VIEWPORT =
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

export function lockAnnotationViewport(): () => void {
    const meta = document.querySelector('meta[name="viewport"]');
    const previous = meta?.getAttribute('content') || 'width=device-width, initial-scale=1.0';
    if (meta) {
        meta.setAttribute('content', ANNOTATION_VIEWPORT);
    }
    document.documentElement.classList.add('cvat-annotation-session');
    document.body.classList.add('cvat-annotation-session');
    if (isTouchLayout()) {
        document.documentElement.classList.add('cvat-touch-layout');
        document.body.classList.add('cvat-touch-layout');
    }

    return () => {
        if (meta) {
            meta.setAttribute('content', previous);
        }
        document.documentElement.classList.remove('cvat-annotation-session');
        document.body.classList.remove('cvat-annotation-session');
        document.documentElement.classList.remove('cvat-touch-layout');
        document.body.classList.remove('cvat-touch-layout');
    };
}

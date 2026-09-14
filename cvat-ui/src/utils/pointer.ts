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
const TOUCH_SCROLLABLE_SELECTOR = [
    '.ant-drawer-body',
    '.ant-dropdown',
    '.ant-dropdown-menu',
    '.ant-select-dropdown',
    '.rc-virtual-list-holder',
    '.ant-popover',
    '.ant-popover-inner-content',
    '.ant-modal-wrap',
    '.ant-modal-body',
    '.cvat-touch-dock-rail',
    '.cvat-touch-dock-extras',
    '.cvat-touch-inline-tools',
    '.cvat-touch-tool-dock',
    '.cvat-brush-tools-toolbox',
    '.cvat-touch-brush-palette',
].join(',');

export function lockAnnotationViewport(): () => void {
    const meta = document.querySelector('meta[name="viewport"]');
    const previous = meta?.getAttribute('content') || 'width=device-width, initial-scale=1.0';
    if (meta) {
        meta.setAttribute('content', ANNOTATION_VIEWPORT);
    }
    document.documentElement.classList.add('cvat-annotation-session');
    document.body.classList.add('cvat-annotation-session');
    const touchLayout = isTouchLayout();
    const preventBrowserGesture = (event: TouchEvent): void => {
        if (!event.cancelable) {
            return;
        }
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.closest(TOUCH_SCROLLABLE_SELECTOR)) {
            event.preventDefault();
        }
    };
    const preventGestureEvent = (event: Event): void => {
        if (event.cancelable) {
            event.preventDefault();
        }
    };

    if (touchLayout) {
        document.documentElement.classList.add('cvat-touch-layout');
        document.body.classList.add('cvat-touch-layout');
        document.addEventListener('touchmove', preventBrowserGesture, { passive: false });
        document.addEventListener('gesturestart', preventGestureEvent, { passive: false });
        document.addEventListener('gesturechange', preventGestureEvent, { passive: false });
    }

    return () => {
        if (meta) {
            meta.setAttribute('content', previous);
        }
        document.documentElement.classList.remove('cvat-annotation-session');
        document.body.classList.remove('cvat-annotation-session');
        document.documentElement.classList.remove('cvat-touch-layout');
        document.body.classList.remove('cvat-touch-layout');
        if (touchLayout) {
            document.removeEventListener('touchmove', preventBrowserGesture);
            document.removeEventListener('gesturestart', preventGestureEvent);
            document.removeEventListener('gesturechange', preventGestureEvent);
        }
    };
}

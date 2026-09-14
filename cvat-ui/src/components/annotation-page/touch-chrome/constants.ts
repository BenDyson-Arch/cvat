// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import type { CSSProperties } from 'react';

export const TOUCH_DOCK_EXTRAS_ID = 'cvat-touch-dock-extras';
export const TOUCH_BRUSH_PALETTE_ID = 'cvat-touch-brush-palette';

export const TOUCH_DROPDOWN_MENU_STYLE: CSSProperties = {
    maxHeight: 'min(22.5rem, calc(100dvh - 10rem))',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
};

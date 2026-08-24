// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    createContext, useContext, useMemo, useState,
} from 'react';

interface TouchChromeState {
    objectsOpen: boolean;
    toolsOpen: boolean;
    drawSheetOpen: boolean;
    setObjectsOpen(open: boolean): void;
    setToolsOpen(open: boolean): void;
    setDrawSheetOpen(open: boolean): void;
}

const TouchChromeContext = createContext<TouchChromeState | null>(null);

export function TouchChromeProvider(props: { children: React.ReactNode }): JSX.Element {
    const { children } = props;
    const [objectsOpen, setObjectsOpenState] = useState(false);
    const [toolsOpen, setToolsOpenState] = useState(false);
    const [drawSheetOpen, setDrawSheetOpenState] = useState(false);

    const setObjectsOpen = (open: boolean): void => {
        setObjectsOpenState(open);
    };
    const setToolsOpen = (open: boolean): void => {
        setToolsOpenState(open);
        if (open) {
            setDrawSheetOpenState(false);
        }
    };
    const setDrawSheetOpen = (open: boolean): void => {
        setDrawSheetOpenState(open);
        if (open) {
            setToolsOpenState(false);
        }
    };

    const value = useMemo(() => ({
        objectsOpen,
        toolsOpen,
        drawSheetOpen,
        setObjectsOpen,
        setToolsOpen,
        setDrawSheetOpen,
    }), [objectsOpen, toolsOpen, drawSheetOpen]);

    return (
        <TouchChromeContext.Provider value={value}>
            {children}
        </TouchChromeContext.Provider>
    );
}

export function useTouchChrome(): TouchChromeState {
    const context = useContext(TouchChromeContext);
    if (!context) {
        throw new Error('useTouchChrome must be used within TouchChromeProvider');
    }
    return context;
}

// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    createContext, useContext, useMemo, useState,
} from 'react';

export type TouchDockPanel = 'primary' | 'draw-tools' | 'draw-settings' | 'annotation-tools' | 'mask-settings';

interface TouchChromeState {
    objectsOpen: boolean;
    dockPanel: TouchDockPanel;
    setObjectsOpen(open: boolean): void;
    setDockPanel(panel: TouchDockPanel): void;
}

const TouchChromeContext = createContext<TouchChromeState | null>(null);

export function TouchChromeProvider(props: { children: React.ReactNode }): JSX.Element {
    const { children } = props;
    const [objectsOpen, setObjectsOpenState] = useState(false);
    const [dockPanel, setDockPanelState] = useState<TouchDockPanel>('primary');

    const setObjectsOpen = (open: boolean): void => {
        setObjectsOpenState(open);
    };
    const setDockPanel = (panel: TouchDockPanel): void => {
        setDockPanelState(panel);
        if (panel !== 'primary') {
            setObjectsOpenState(false);
        }
    };

    const value = useMemo(() => ({
        objectsOpen,
        dockPanel,
        setObjectsOpen,
        setDockPanel,
    }), [objectsOpen, dockPanel]);

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

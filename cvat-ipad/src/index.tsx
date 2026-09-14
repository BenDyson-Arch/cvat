// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Button from 'antd/lib/button';
import Card from 'antd/lib/card';
import Input from 'antd/lib/input';
import Typography from 'antd/lib/typography';
import Alert from 'antd/lib/alert';
import Space from 'antd/lib/space';
import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localeData from 'dayjs/plugin/localeData';
import relativeTime from 'dayjs/plugin/relativeTime';
import weekday from 'dayjs/plugin/weekday';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import weekYear from 'dayjs/plugin/weekYear';
import duration from 'dayjs/plugin/duration';
import '@fontsource-variable/roboto-flex';
import '@fontsource/sora/400.css';
import '../../cvat-ui/src/styles.scss';
import { LocalProject } from './project';
import { exportProject, importStack, listProjects } from './storage';
import LocalWorkspace from './local-workspace';
import logger from '../../cvat-core/src/logger';
import { Event as LocalEvent } from '../../cvat-core/src/event';

// This standalone build has no event-logging server.
logger.log = async (scope, payload = {}) => new LocalEvent(scope, payload);
logger.save = async () => undefined;

[customParseFormat, advancedFormat, relativeTime, weekday, localeData, weekOfYear, weekYear, duration]
    .forEach((plugin) => dayjs.extend(plugin));

function App(): JSX.Element {
    const [projects, setProjects] = useState<LocalProject[]>([]);
    const [project, setProject] = useState<LocalProject | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const report = useCallback((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
    }, []);
    const refresh = useCallback(async () => {
        try { setProjects(await listProjects()); } catch (reason) { report(reason); }
    }, [report]);
    useEffect(() => { void refresh(); }, [refresh]);

    const close = useCallback(() => {
        setProject(null);
        void refresh();
    }, [refresh]);

    if (project) {
        return <LocalWorkspace project={project} onChange={setProject} onClose={close} onError={report} />;
    }

    return (
        <section style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
            <Typography.Title level={2}>Local projects</Typography.Title>
            {error && <Alert type='error' message={error} closable onClose={() => setError('')} />}
            <Card title='Open an aligned image stack' style={{ marginBottom: 24 }}>
                <Space direction='vertical' style={{ width: '100%' }}>
                    <Typography.Paragraph>
                        Choose PNG, JPEG or WebP images of the same size. The views share one set of annotations.
                    </Typography.Paragraph>
                    <Input aria-label='Project name' placeholder='Project name' value={name} onChange={(event) => setName(event.target.value)} />
                    <input aria-label='Choose images' type='file' accept='image/png,image/jpeg,image/webp' multiple disabled={busy}
                        onChange={async (event) => {
                            const files = Array.from(event.target.files || []);
                            event.target.value = '';
                            if (!files.length) return;
                            setBusy(true);
                            setError('');
                            try { setProject(await importStack(files, name)); } catch (reason) { report(reason); }
                            finally { setBusy(false); }
                        }} />
                    {busy && <Typography.Text>Importing images…</Typography.Text>}
                </Space>
            </Card>
            {projects.map((value) => (
                <Card key={value.id} title={value.name} style={{ marginBottom: 16 }}>
                    <Space>
                        <Typography.Text>{value.images.length} views · {value.shapes.length} objects</Typography.Text>
                        <Button type='primary' onClick={() => setProject(value)}>Open {value.name}</Button>
                        <Button onClick={() => { void exportProject(value).catch(report); }}>Export annotations</Button>
                    </Space>
                </Card>
            ))}
        </section>
    );
}

createRoot(document.getElementById('root')).render(<App />);

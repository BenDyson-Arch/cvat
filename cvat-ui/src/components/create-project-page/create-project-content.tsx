// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    RefObject, useRef, useState, useEffect,
} from 'react';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router';
import { Col, Row } from 'antd/lib/grid';
import Text from 'antd/lib/typography/Text';
import Form, { FormInstance } from 'antd/lib/form';
import Collapse from 'antd/lib/collapse';
import Button from 'antd/lib/button';
import Input from 'antd/lib/input';
import Select from 'antd/lib/select';
import notification from 'antd/lib/notification';
import { createProjectAsync } from 'actions/projects-actions';
import {
    AnnotationProfile, RelatedImageMode, Storage, StorageData, StorageLocation,
} from 'cvat-core-wrapper';
import patterns from 'utils/validation-patterns';
import LabelsEditor from 'components/labels-editor/labels-editor';
import SourceStorageField from 'components/storage/source-storage-field';
import TargetStorageField from 'components/storage/target-storage-field';

interface AdvancedConfiguration {
    sourceStorage: StorageData;
    targetStorage: StorageData;
    bug_tracker?: string | null;
}

const initialValues: AdvancedConfiguration = {
    bug_tracker: null,
    sourceStorage: {
        location: StorageLocation.LOCAL,
        cloudStorageId: undefined,
    },
    targetStorage: {
        location: StorageLocation.LOCAL,
        cloudStorageId: undefined,
    },
};

interface AdvancedConfigurationProps {
    formRef: RefObject<FormInstance>;
    sourceStorageLocation: StorageLocation;
    targetStorageLocation: StorageLocation;
    onChangeSourceStorageLocation?: (value: StorageLocation) => void;
    onChangeTargetStorageLocation?: (value: StorageLocation) => void;
}

type InputRef = React.ComponentRef<typeof Input>;

function NameConfigurationForm(
    { formRef, inputRef }:
    { formRef: RefObject<FormInstance>, inputRef: RefObject<InputRef> },
):JSX.Element {
    return (
        <Form layout='vertical' ref={formRef}>
            <Form.Item
                name='name'
                hasFeedback
                label='Name'
                rules={[
                    {
                        required: true,
                        message: 'Please, specify a name',
                    },
                ]}
            >
                <Input ref={inputRef} />
            </Form.Item>
        </Form>
    );
}

function AdvancedConfigurationForm(props: AdvancedConfigurationProps): JSX.Element {
    const {
        formRef,
        sourceStorageLocation,
        targetStorageLocation,
        onChangeSourceStorageLocation,
        onChangeTargetStorageLocation,
    } = props;
    return (
        <Form layout='vertical' ref={formRef} initialValues={initialValues}>
            <Form.Item
                name='bug_tracker'
                label='Issue tracker'
                extra='Attach issue tracker where the project is described'
                hasFeedback
                rules={[
                    {
                        validator: (_, value, callback): void => {
                            if (value && !patterns.validateURL.pattern.test(value)) {
                                callback('Issue tracker must be URL');
                            } else {
                                callback();
                            }
                        },
                    },
                ]}
            >
                <Input />
            </Form.Item>
            <Row justify='space-between'>
                <Col span={11}>
                    <SourceStorageField
                        instanceId={null}
                        storageDescription='Specify source storage for import resources like annotation, backups'
                        locationValue={sourceStorageLocation}
                        onChangeLocationValue={onChangeSourceStorageLocation}
                    />
                </Col>
                <Col span={11} offset={1}>
                    <TargetStorageField
                        instanceId={null}
                        storageDescription='Specify target storage for export resources like annotation, backups'
                        locationValue={targetStorageLocation}
                        onChangeLocationValue={onChangeTargetStorageLocation}
                    />
                </Col>
            </Row>
        </Form>
    );
}

export default function CreateProjectContent(): JSX.Element {
    const [projectLabels, setProjectLabels] = useState<any[]>([]);
    const [annotationProfile, setAnnotationProfile] = useState<AnnotationProfile | null>(null);
    const [relatedImageMode, setRelatedImageMode] = useState<RelatedImageMode>(RelatedImageMode.CONTEXTUAL);
    const [sourceStorageLocation, setSourceStorageLocation] = useState(StorageLocation.LOCAL);
    const [targetStorageLocation, setTargetStorageLocation] = useState(StorageLocation.LOCAL);
    const nameFormRef = useRef<FormInstance>(null);
    const nameInputRef = useRef<InputRef>(null);
    const advancedFormRef = useRef<FormInstance>(null);
    const dispatch = useDispatch();
    const history = useHistory();

    const resetForm = (): void => {
        if (nameFormRef.current) nameFormRef.current.resetFields();
        if (advancedFormRef.current) advancedFormRef.current.resetFields();
        setProjectLabels([]);
        setAnnotationProfile(null);
        setRelatedImageMode(RelatedImageMode.CONTEXTUAL);
        setSourceStorageLocation(StorageLocation.LOCAL);
        setTargetStorageLocation(StorageLocation.LOCAL);
    };

    const focusForm = (): void => {
        nameInputRef.current?.focus();
    };

    const submit = async (): Promise<any> => {
        try {
            if (annotationProfile && !projectLabels.length) {
                notification.error({
                    message: 'Could not create a project',
                    description: 'A project with an annotation workflow must contain at least one label',
                    className: 'cvat-notification-create-project-fail',
                });
                return false;
            }

            let projectData: Record<string, any> = {};
            if (nameFormRef.current) {
                const basicValues = await nameFormRef.current.validateFields();
                const advancedValues = advancedFormRef.current ? await advancedFormRef.current.validateFields() : {};

                projectData = {
                    ...projectData,
                    ...advancedValues,
                    name: basicValues.name,
                    annotation_profile: annotationProfile,
                    related_image_mode: relatedImageMode,
                    source_storage: new Storage(
                        advancedValues.sourceStorage || { location: StorageLocation.LOCAL },
                    ).toJSON(),
                    target_storage: new Storage(
                        advancedValues.targetStorage || { location: StorageLocation.LOCAL },
                    ).toJSON(),
                };
            }

            projectData.labels = projectLabels;

            const createdProject = await dispatch(createProjectAsync(projectData));
            return createdProject;
        } catch {
            return false;
        }
    };

    const onSubmitAndOpen = async (): Promise<void> => {
        const createdProject = await submit();
        if (createdProject) {
            history.push(`/projects/${createdProject.id}`);
        }
    };

    const onSubmitAndContinue = async (): Promise<void> => {
        const res = await submit();
        if (res) {
            resetForm();
            notification.info({
                message: 'The project has been created',
                className: 'cvat-notification-create-project-success',
            });
            focusForm();
        }
    };

    useEffect(() => {
        focusForm();
    }, []);

    return (
        <Row justify='start' align='middle' className='cvat-create-project-content'>
            <Col span={24}>
                <NameConfigurationForm formRef={nameFormRef} inputRef={nameInputRef} />
            </Col>
            <Col span={24}>
                <Text className='cvat-text-color'>Annotation workflow:</Text>
                <Select
                    allowClear
                    placeholder='Unrestricted (legacy behavior)'
                    value={annotationProfile}
                    onChange={(value: AnnotationProfile | undefined) => setAnnotationProfile(value || null)}
                    options={[
                        { value: AnnotationProfile.CLASSIFICATION, label: '2D classification' },
                        { value: AnnotationProfile.OBJECT_DETECTION, label: '2D object detection' },
                        { value: AnnotationProfile.INSTANCE_SEGMENTATION, label: '2D instance segmentation' },
                        { value: AnnotationProfile.SEMANTIC_SEGMENTATION, label: '2D semantic segmentation' },
                        { value: AnnotationProfile.KEYPOINTS, label: '2D keypoints' },
                    ]}
                    style={{ width: '100%' }}
                />
            </Col>
            <Col span={24}>
                <Text className='cvat-text-color'>Related images:</Text>
                <Select
                    value={relatedImageMode}
                    onChange={setRelatedImageMode}
                    options={[
                        { value: RelatedImageMode.CONTEXTUAL, label: 'Contextual images' },
                        { value: RelatedImageMode.ALIGNED, label: 'Aligned views (shared annotations)' },
                    ]}
                    style={{ width: '100%' }}
                />
            </Col>
            <Col span={24}>
                <Text className='cvat-text-color'>Labels:</Text>
                <LabelsEditor
                    labels={projectLabels}
                    onSubmit={(newLabels): void => {
                        setProjectLabels(newLabels);
                    }}
                />
            </Col>
            <Col span={24}>
                <Collapse
                    className='cvat-advanced-configuration-wrapper'
                    items={[{
                        key: '1',
                        label: <Text className='cvat-title'>Advanced configuration</Text>,
                        children: (
                            <AdvancedConfigurationForm
                                formRef={advancedFormRef}
                                sourceStorageLocation={sourceStorageLocation}
                                targetStorageLocation={targetStorageLocation}
                                onChangeSourceStorageLocation={
                                    (value: StorageLocation) => setSourceStorageLocation(value)
                                }
                                onChangeTargetStorageLocation={
                                    (value: StorageLocation) => setTargetStorageLocation(value)
                                }
                            />
                        ),
                    }]}
                />
            </Col>
            <Col span={24}>
                <Row justify='end' gutter={8}>
                    <Col>
                        <Button className='cvat-submit-open-project-button' type='primary' onClick={onSubmitAndOpen}>
                            Submit & Open
                        </Button>
                    </Col>
                    <Col>
                        <Button className='cvat-submit-continue-project-button' type='primary' onClick={onSubmitAndContinue}>
                            Submit & Continue
                        </Button>
                    </Col>
                </Row>
            </Col>
        </Row>
    );
}

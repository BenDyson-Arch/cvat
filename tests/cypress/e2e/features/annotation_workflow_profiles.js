// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Annotation workflow profiles', () => {
    const taskName = 'Instance segmentation workflow';
    let taskId;
    let jobId;

    before(() => {
        cy.visit('/auth/login');
        cy.login();
        cy.headlessCreateTask({
            name: taskName,
            project_id: null,
            annotation_profile: 'instance_segmentation',
            related_image_mode: 'contextual',
            labels: [{ name: 'object', attributes: [], type: 'any' }],
            source_storage: { location: 'local' },
            target_storage: { location: 'local' },
        }, {
            server_files: ['images/image_1.jpg'],
            image_quality: 70,
            use_zip_chunks: true,
            use_cache: true,
            sorting_method: 'lexicographical',
        }).then((response) => {
            taskId = response.taskId;
            [jobId] = response.jobIds;
            cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
            cy.get('.cvat-canvas-container').should('be.visible');
        });
    });

    after(() => {
        cy.task('getAuthHeaders').then((headers) => {
            cy.request({
                method: 'DELETE',
                url: `/api/tasks/${taskId}`,
                headers,
            });
        });
    });

    it('shows polygon and mask tools for the same label', () => {
        cy.get('.cvat-draw-polygon-control').should('be.visible');
        cy.get('.cvat-draw-mask-control').should('be.visible');
        cy.get('.cvat-draw-rectangle-control').should('not.exist');
        cy.get('.cvat-draw-polyline-control').should('not.exist');
    });
});

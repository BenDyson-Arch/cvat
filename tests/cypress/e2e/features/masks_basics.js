// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Manipulations with masks', { scrollBehavior: false }, () => {
    const taskName = 'Basic actions with masks';
    const serverFiles = ['images/image_1.jpg', 'images/image_2.jpg', 'images/image_3.jpg'];

    const drawingActions = [{
        method: 'brush',
        coordinates: [[300, 300], [700, 300], [700, 700], [300, 700]],
    }, {
        method: 'polygon-plus',
        coordinates: [[450, 210], [650, 400], [450, 600], [260, 400]],
    }, {
        method: 'brush-size',
        value: 150,
    }, {
        method: 'eraser',
        coordinates: [[500, 500]],
    }, {
        method: 'brush-size',
        value: 10,
    }, {
        method: 'polygon-minus',
        coordinates: [[450, 400], [600, 400], [450, 550], [310, 400]],
    }];

    const editingActions = [{
        method: 'polygon-minus',
        coordinates: [[50, 400], [800, 400], [800, 800], [50, 800]],
    }];

    let taskId = null;
    let jobId = null;

    before(() => {
        cy.visit('/auth/login');
        cy.login();
        cy.headlessCreateTask({
            labels: [{ name: 'mask label', attributes: [], type: 'any' }],
            name: taskName,
            project_id: null,
            source_storage: { location: 'local' },
            target_storage: { location: 'local' },
        }, {
            server_files: serverFiles,
            image_quality: 70,
            use_zip_chunks: true,
            use_cache: true,
            sorting_method: 'lexicographical',
        }).then((response) => {
            taskId = response.taskId;
            [jobId] = response.jobIds;
        }).then(() => {
            cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
            cy.get('.cvat-canvas-container').should('exist').and('be.visible');
        });
    });

    after(() => {
        cy.logout();
        cy.task('getAuthHeaders').then((authHeaders) => {
            cy.request({
                method: 'DELETE',
                url: `/api/tasks/${taskId}`,
                headers: authHeaders,
            });
        });
    });

    describe('Tests to make sure that basic features work with masks', () => {
        beforeEach(() => {
            cy.removeAnnotations();
            cy.goCheckFrameNumber(0);
        });

        function readMaskSvgBox(selector) {
            // Wait with retry: mask SVG gets real width/height only after async image.load().
            // Assertions inside .then() are one-shot and flaky in CI.
            return cy.get(selector)
                .should('exist')
                .and('be.visible')
                .and(($el) => {
                    expect(+$el.attr('width')).to.be.gt(1);
                    expect(+$el.attr('height')).to.be.gt(1);
                })
                .then(($el) => {
                    const width = +$el.attr('width');
                    const height = +$el.attr('height');
                    return { width, height, area: width * height };
                });
        }

        function readTemporaryMaskPixelAlpha(clientX, clientY) {
            return cy.get(
                '.cvat_native_touch_masks_canvas:visible, .cvat_masks_canvas_wrapper .lower-canvas:visible',
            ).first().then(([$canvas]) => {
                const rect = $canvas.getBoundingClientRect();
                const x = Math.round((clientX - rect.left) * ($canvas.width / rect.width));
                const y = Math.round((clientY - rect.top) * ($canvas.height / rect.height));
                return $canvas.getContext('2d').getImageData(x, y, 1, 1).data[3];
            });
        }

        it('Drawing a couple of masks. Save job, reopen job, masks must exist', () => {
            cy.startMaskDrawing();
            cy.drawMask(drawingActions);
            cy.get('.cvat-brush-tools-finish').click();
            cy.get('.cvat-brush-tools-continue').click();
            cy.get('.cvat-brush-tools-toolbox').should('exist').and('be.visible');
            cy.get('#cvat_canvas_shape_1').should('exist').and('be.visible');

            // it is expected, that after clicking "continue", brush tools are still opened
            cy.drawMask(drawingActions);
            cy.finishMaskDrawing();
            cy.get('.cvat-brush-tools-toolbox').should('not.be.visible');

            cy.saveJob();
            cy.reload();

            for (const id of [1, 2]) {
                cy.get(`#cvat_canvas_shape_${id}`).should('exist').and('be.visible');
            }
            cy.removeAnnotations();
        });

        it('Propagate mask to another frame', () => {
            cy.startMaskDrawing();
            cy.drawMask(drawingActions);
            cy.finishMaskDrawing();

            cy.interactAnnotationObjectMenu('#cvat-objects-sidebar-state-item-1', 'Propagate');
            cy.get('.cvat-propagate-confirm-up-to-input').find('input')
                .should('have.attr', 'value', serverFiles.length - 1);
            cy.contains('button', 'Yes').click();
            for (let i = 1; i < serverFiles.length; i++) {
                cy.goCheckFrameNumber(i);
                cy.get('.cvat_canvas_shape').should('exist').and('be.visible');
            }
        });

        it('Copy mask to another frame', () => {
            cy.startMaskDrawing();
            cy.drawMask(drawingActions);
            cy.finishMaskDrawing();

            cy.interactAnnotationObjectMenu('#cvat-objects-sidebar-state-item-1', 'Make a copy');
            cy.get('body').type('{ctrl}z');
            cy.get('#cvat_canvas_shape_1').should('exist').and('be.visible');
            cy.goCheckFrameNumber(serverFiles.length - 1);
            cy.get('.cvat-canvas-container').click();
            cy.get('#cvat_canvas_shape_2').should('exist').and('be.visible');
        });

        it('Check hidden mask still invisible after changing frame/opacity', () => {
            cy.startMaskDrawing();
            cy.drawMask(drawingActions);
            cy.finishMaskDrawing();

            cy.get('#cvat-objects-sidebar-state-item-1').within(() => {
                cy.get('.cvat-object-item-button-hidden')
                    .should('exist').and('be.visible').click();
                cy.get('.cvat-object-item-button-hidden')
                    .should('have.class', 'cvat-object-item-button-hidden-enabled');
            });

            cy.goCheckFrameNumber(serverFiles.length - 1);
            cy.goCheckFrameNumber(0);

            cy.get('.cvat-appearance-opacity-slider').click('right');
            cy.get('.cvat-appearance-opacity-slider').click('center');
            cy.get('#cvat_canvas_shape_1')
                .should('exist').and('have.class', 'cvat_canvas_hidden').and('not.be.visible');
        });

        it('Editing a drawn mask', () => {
            cy.startMaskDrawing();
            cy.drawMask(drawingActions);
            cy.finishMaskDrawing();

            cy.interactAnnotationObjectMenu('#cvat-objects-sidebar-state-item-1', 'Edit');
            cy.drawMask(editingActions);

            // Check issue fixed in https://github.com/cvat-ai/cvat/pull/8598
            // Frames navigation should not work during editing
            cy.get('.cvat-player-next-button').click();
            cy.checkFrameNum(0);

            cy.finishMaskDrawing();
        });

        it('Underlying pixels are removed on enabling "Remove underlying pixels" tool', () => {
            const mask1 = [{
                method: 'brush',
                coordinates: [[450, 250], [600, 400]],
            }];
            const mask2 = [{
                method: 'brush',
                coordinates: [[450, 250], [525, 325]],
            }, {
                method: 'underlying-pixels',
                value: true,
            }];

            cy.startMaskDrawing();
            cy.drawMask(mask1);
            cy.get('.cvat-brush-tools-continue').click();
            cy.hideTooltips();

            cy.drawMask(mask2);
            cy.finishMaskDrawing();

            cy.get('#cvat-objects-sidebar-state-item-2').within(() => {
                cy.get('.cvat-object-item-button-hidden').click();
            });

            cy.get('.cvat-canvas-container').then(([$canvas]) => {
                cy.wrap($canvas).trigger('mousemove', { clientX: 450, clientY: 250 });
                cy.get('#cvat_canvas_shape_1').should('not.have.class', 'cvat_canvas_shape_activated');

                cy.wrap($canvas).trigger('mousemove', { clientX: 550, clientY: 350 });
                cy.get('#cvat_canvas_shape_1').should('have.class', 'cvat_canvas_shape_activated');
            });

            cy.hideTooltips();
            cy.startMaskDrawing();
            cy.drawMask([{ method: 'underlying-pixels', value: false }]);
            cy.finishMaskDrawing();
        });

        it('Mask bbox shrinks after remove underlying pixels overlap', () => {
            const mask1 = [{
                method: 'brush',
                coordinates: [[450, 250], [600, 400]],
            }];
            const mask2 = [{
                method: 'brush',
                coordinates: [[450, 250], [525, 325]],
            }, {
                method: 'underlying-pixels',
                value: true,
            }];

            cy.startMaskDrawing();
            cy.drawMask(mask1);
            cy.get('.cvat-brush-tools-continue').click();
            cy.hideTooltips();

            readMaskSvgBox('#cvat_canvas_shape_1').then((before) => {
                cy.drawMask(mask2);
                cy.hideTooltips();
                cy.finishMaskDrawing();

                cy.get('#cvat_canvas_shape_1').should(($el) => {
                    const afterW = +$el.attr('width');
                    const afterH = +$el.attr('height');
                    expect(afterW).to.be.gt(1);
                    expect(afterH).to.be.gt(1);
                    expect(afterW * afterH).to.be.lessThan(before.area);
                    expect(afterW < before.width || afterH < before.height).to.be.true;
                });
            });

            cy.hideTooltips();
            cy.startMaskDrawing();
            cy.drawMask([{ method: 'underlying-pixels', value: false }]);
            cy.finishMaskDrawing();
        });

        it('Mask bbox is restored after undo remove underlying pixels overlap', () => {
            const mask1 = [{
                method: 'brush',
                coordinates: [[450, 250], [600, 400]],
            }];
            const mask2 = [{
                method: 'brush',
                coordinates: [[450, 250], [525, 325]],
            }, {
                method: 'underlying-pixels',
                value: true,
            }];

            cy.startMaskDrawing();
            cy.drawMask(mask1);
            cy.get('.cvat-brush-tools-continue').click();
            cy.hideTooltips();

            readMaskSvgBox('#cvat_canvas_shape_1').then((before) => {
                cy.drawMask(mask2);
                cy.hideTooltips();
                cy.finishMaskDrawing();

                cy.get('#cvat_canvas_shape_1').should(($el) => {
                    const afterW = +$el.attr('width');
                    const afterH = +$el.attr('height');
                    expect(afterW).to.be.gt(1);
                    expect(afterH).to.be.gt(1);
                    expect(afterW * afterH).to.be.lessThan(before.area);
                });

                cy.hideTooltips();
                cy.contains('.cvat-annotation-header-button', 'Undo').click();

                cy.get('#cvat_canvas_shape_1').should(($el) => {
                    const restoredW = +$el.attr('width');
                    const restoredH = +$el.attr('height');
                    expect(restoredW).to.be.gt(1);
                    expect(restoredH).to.be.gt(1);
                    expect(restoredW * restoredH).to.be.at.least(before.area - 1);
                });
            });

            cy.hideTooltips();
            cy.startMaskDrawing();
            cy.drawMask([{ method: 'underlying-pixels', value: false }]);
            cy.finishMaskDrawing();
        });

        it('Check brush tools shortcuts', () => {
            const mask1 = [{
                method: 'brush',
                coordinates: [[450, 250], [600, 400]],
            }];
            cy.startMaskDrawing();
            cy.drawMask(mask1);
            cy.get('.cvat-brush-tools-polygon-minus').click();
            cy.get('.cvat-brush-tools-polygon-minus').should('have.class', 'cvat-brush-tools-active-tool');

            cy.get('body').type('{shift}{1}');
            cy.get('.cvat-brush-tools-brush').should('have.class', 'cvat-brush-tools-active-tool');
            cy.get('body').type('{shift}{2}');
            cy.get('.cvat-brush-tools-eraser').should('have.class', 'cvat-brush-tools-active-tool');
            cy.get('body').type('{shift}{3}');
            cy.get('.cvat-brush-tools-polygon-plus').should('have.class', 'cvat-brush-tools-active-tool');
            cy.get('body').type('{shift}{4}');
            cy.get('.cvat-brush-tools-polygon-minus').should('have.class', 'cvat-brush-tools-active-tool');

            cy.get('.cvat-brush-tools-finish').trigger('mouseover');
            cy.get('.cvat-brush-tools-finish').trigger('mouseout');
            cy.get('body').type('n');
            cy.get('.cvat-brush-tools-toolbox').should('not.be.visible');
        });

        it('Undo and redo mask drawing actions locally', () => {
            cy.startMaskDrawing();
            cy.drawMask([{
                method: 'brush',
                coordinates: [[300, 300], [400, 300]],
            }]);
            cy.finishMaskDrawing();
            cy.get('#cvat_canvas_shape_1').should('exist').and('be.visible');

            cy.startMaskDrawing();
            cy.drawMask([{
                method: 'brush',
                coordinates: [[300, 500], [400, 500]],
            }, {
                method: 'brush',
                coordinates: [[600, 500], [700, 500]],
            }]);
            cy.get('.cvat-canvas-container').trigger('mousemove', {
                clientX: 800,
                clientY: 200,
                bubbles: true,
            });

            readTemporaryMaskPixelAlpha(350, 500).should('be.greaterThan', 0);
            readTemporaryMaskPixelAlpha(650, 500).should('be.greaterThan', 0);

            cy.get('body').type('{ctrl}z');
            cy.get('#cvat_canvas_shape_1').should('exist').and('be.visible');
            readTemporaryMaskPixelAlpha(350, 500).should('be.greaterThan', 0);
            readTemporaryMaskPixelAlpha(650, 500).should('equal', 0);

            cy.get('body').type('{ctrl}{shift}z');
            readTemporaryMaskPixelAlpha(650, 500).should('be.greaterThan', 0);

            cy.get('.cvat-canvas-container').trigger('mousemove', {
                clientX: 300, clientY: 600, bubbles: true,
            });
            cy.get('.cvat-canvas-container').trigger('mousedown', {
                clientX: 300, clientY: 600, button: 0, bubbles: true,
            });
            cy.get('.cvat-canvas-container').trigger('mousemove', {
                clientX: 400, clientY: 600, bubbles: true,
            });
            cy.get('body').type('{ctrl}z');
            readTemporaryMaskPixelAlpha(650, 500).should('equal', 0);
            readTemporaryMaskPixelAlpha(350, 600).should('be.greaterThan', 0);
            cy.get('.cvat-canvas-container').trigger('mouseup', { bubbles: true });

            cy.get('body').type('n');
            cy.get('.cvat-brush-tools-toolbox').should('not.be.visible');
        });

        it('Check hide mask feature', () => {
            function checkHideFeature() {
                cy.get('.cvat-brush-tools-hide').click();
                cy.get('.cvat-brush-tools-hide').should('have.class', 'cvat-brush-tools-active-tool');
                cy.get('.cvat_masks_canvas_wrapper').should('not.be.visible');
                cy.get('.cvat-brush-tools-hide').click();
                cy.get('.cvat_masks_canvas_wrapper').should('be.visible');
            }

            function checkHideShortcut() {
                cy.get('body').type('h');
                cy.get('.cvat-brush-tools-hide').should('have.class', 'cvat-brush-tools-active-tool');
                cy.get('.cvat_masks_canvas_wrapper').should('not.be.visible');
            }

            function checkObjectIsHidden() {
                cy.get('#cvat-objects-sidebar-state-item-1').within(() => {
                    cy.get('.cvat-object-item-button-hidden-enabled').should('exist');
                });
            }

            const mask = [{
                method: 'brush',
                coordinates: [[450, 250], [600, 400]],
            }];
            const drawPolygon = [{
                method: 'polygon-plus',
                coordinates: [[450, 210], [650, 400], [450, 600], [260, 400]],
            }];
            cy.startMaskDrawing();
            cy.drawMask(mask);

            checkHideFeature();
            checkHideShortcut();

            cy.finishMaskDrawing();
            cy.get('#cvat_canvas_shape_1').should('be.visible');

            cy.interactAnnotationObjectMenu('#cvat-objects-sidebar-state-item-1', 'Edit');
            checkHideFeature();

            cy.drawMask(drawPolygon);
            checkHideShortcut();
            cy.get('.cvat_canvas_shape_drawing')
                .invoke('attr', 'fill-opacity')
                .then((opacity) => expect(+opacity).to.be.equal(0));
            checkObjectIsHidden();
            cy.get('.cvat-brush-tools-brush').click();
            cy.get('.cvat-brush-tools-brush').should('have.class', 'cvat-brush-tools-active-tool');
            cy.finishMaskDrawing();
            checkObjectIsHidden();
        });
    });

    describe('Tests to make sure that empty masks cannot be created', () => {
        beforeEach(() => {
            cy.removeAnnotations();
            cy.saveJob('PUT');
        });

        function checkEraseTools(baseTool = '.cvat-brush-tools-brush', disabled = true) {
            cy.get(baseTool).should('have.class', 'cvat-brush-tools-active-tool');

            const condition = disabled ? 'be.disabled' : 'not.be.disabled';
            cy.get('.cvat-brush-tools-eraser').should(condition);
            cy.get('.cvat-brush-tools-polygon-minus').should(condition);
        }

        function checkMaskNotEmpty(selector) {
            cy.get(selector).should('exist').and('be.visible');
            cy.get(selector)
                .should('have.attr', 'height')
                .then((height) => {
                    expect(+height).to.be.gt(1);
                });
            cy.get(selector)
                .should('have.attr', 'width')
                .then((width) => {
                    expect(+width).to.be.gt(1);
                });
        }

        it('Erase tools are locked when nothing to erase', () => {
            const erasedMask = [{
                method: 'brush',
                coordinates: [[450, 250], [600, 400], [450, 550], [300, 400]],
            }, {
                method: 'polygon-minus',
                coordinates: [[100, 100], [700, 100], [700, 700], [100, 700]],
            }];

            cy.startMaskDrawing();
            checkEraseTools();
            cy.drawMask(erasedMask);

            cy.get('.cvat-brush-tools-brush').click();
            checkEraseTools();

            cy.finishMaskDrawing();
            cy.get('#cvat_canvas_shape_1').should('not.exist');
        });

        it('Drawing a mask, finish with erasing tool. On new mask drawing tool is reset', () => {
            const masks = [[{
                method: 'brush',
                coordinates: [[450, 250], [600, 400], [450, 550], [300, 400]],
            }, {
                method: 'polygon-minus',
                coordinates: [[100, 100], [400, 100], [400, 400], [100, 400]],
            }], [{
                method: 'brush',
                coordinates: [[550, 350], [700, 500], [550, 650], [400, 500]],
            }, {
                method: 'eraser',
                coordinates: [[550, 350]],
            }]];

            for (const [index, mask] of masks.entries()) {
                cy.startMaskDrawing();
                cy.drawMask(mask);
                cy.finishMaskDrawing();

                cy.get(`#cvat_canvas_shape_${index + 1}`).should('exist').and('be.visible');

                cy.startMaskDrawing();
                checkEraseTools();
                cy.finishMaskDrawing();
            }
        });

        it('Empty masks are deleted using remove underlying pixels feature', () => {
            const masks = [[{
                method: 'brush',
                coordinates: [[150, 150], [270, 270]],
            }], [{
                method: 'brush',
                coordinates: [[350, 350], [370, 370]],
            }], [{
                method: 'polygon-plus',
                coordinates: [[100, 100], [400, 100], [400, 400], [100, 400]],
            }]];

            cy.startMaskDrawing();
            cy.drawMask([{ method: 'underlying-pixels', value: true }]);
            cy.finishMaskDrawing();

            for (const [index, mask] of masks.entries()) {
                cy.startMaskDrawing();
                cy.drawMask(mask);
                cy.finishMaskDrawing();

                cy.get(`#cvat_canvas_shape_${index + 1}`).should('exist').and('be.visible');
            }

            // First mask is updated, second mask is removed after third mask is drawn
            cy.get('.cvat-empty-masks-notification').should('be.visible').within(() => {
                cy.contains('Some objects were deleted').should('be.visible');
                cy.contains(
                    'As a result of removing the underlying pixels, some masks became empty and were subsequently deleted.',
                ).should('be.visible');
            });
            cy.closeNotification('.cvat-empty-masks-notification');
            for (const id of [1, 3]) {
                cy.get(`#cvat_canvas_shape_${id}`).should('exist').and('be.visible');
            }
            cy.get('#cvat_canvas_shape_2').should('not.exist');
            cy.saveJob('PATCH', 200, 'removeUnderlyingPixelsUndoRedo');

            // Undo creating mask, second mask is restored
            cy.contains('.cvat-annotation-header-button', 'Undo').click();
            for (const id of [1, 2]) {
                cy.get(`#cvat_canvas_shape_${id}`).should('exist').and('be.visible');
            }
            cy.saveJob('PATCH', 200, 'removeUnderlyingPixelsUndoRedo');

            // Redo creating mask, second mask is removed
            cy.contains('.cvat-annotation-header-button', 'Redo').click();
            for (const id of [1, 3]) {
                cy.get(`#cvat_canvas_shape_${id}`).should('exist').and('be.visible');
            }
            cy.get('#cvat_canvas_shape_2').should('not.exist');
            cy.saveJob('PATCH', 200, 'removeUnderlyingPixelsUndoRedo');

            cy.get('.cvat-notification-notice-save-annotations-failed').should('not.exist');
        });

        it('Erasing a mask during editing is not allowed', () => {
            const mask = [{
                method: 'brush',
                coordinates: [[450, 250], [600, 400], [450, 550], [300, 400]],
            }];
            const eraseAction = [{
                method: 'polygon-minus',
                coordinates: [[100, 100], [700, 100], [700, 700], [100, 700]],
            }];

            cy.startMaskDrawing();
            cy.drawMask(mask);
            cy.finishMaskDrawing();

            cy.interactAnnotationObjectMenu('#cvat-objects-sidebar-state-item-1', 'Edit');
            cy.drawMask(eraseAction);
            cy.finishMaskDrawing();

            checkMaskNotEmpty('#cvat_canvas_shape_1');
        });

        // Pointer phases intentionally share one subject to preserve capture ordering.
        /* eslint-disable cypress/unsafe-to-chain-command */
        it('Shows native Pencil mask preview before pointerup and preserves annotations', () => {
            function readNativeMaskPixelAlpha(clientX, clientY) {
                return cy.get('.cvat_native_touch_masks_canvas:visible').then(([$canvas]) => {
                    const rect = $canvas.getBoundingClientRect();
                    const x = Math.round((clientX - rect.left) * ($canvas.width / rect.width));
                    const y = Math.round((clientY - rect.top) * ($canvas.height / rect.height));
                    return $canvas.getContext('2d').getImageData(x, y, 1, 1).data[3];
                });
            }

            cy.visit(`/tasks/${taskId}/jobs/${jobId}`, {
                onBeforeLoad(win) {
                    Object.defineProperty(win.navigator, 'userAgent', {
                        configurable: true,
                        value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
                    });
                    Object.defineProperty(win.navigator, 'maxTouchPoints', {
                        configurable: true,
                        value: 5,
                    });
                },
            });
            cy.get('.cvat-canvas-container').should('be.visible');
            cy.get('.cvat-touch-tool-dock').should('be.visible').then(([$dock]) => {
                cy.get('.cvat-canvas-container').then(([$canvas]) => {
                    expect($dock.getBoundingClientRect().top).to.be.at.least(
                        $canvas.getBoundingClientRect().bottom - 1,
                    );
                });
            });
            cy.get('.cvat-header').should('not.be.visible');
            cy.get('.cvat-canvas-layer-stack-trigger').should('not.be.visible');
            cy.get('.cvat-touch-tool-dock [aria-label="Select"]').then(([$select]) => {
                cy.get('.cvat-touch-mode-selector').then(([$mode]) => {
                    expect($select.getBoundingClientRect().left).to.be.lessThan(
                        $mode.getBoundingClientRect().left,
                    );
                });
            });
            cy.get('.cvat-touch-mode-selector').click();
            cy.contains('.ant-dropdown-menu-item', 'Box').click();
            cy.get('.ant-drawer-open').should('not.exist');
            cy.get('.cvat-touch-label-chip-active').should('contain.text', 'mask label');
            cy.get('.cvat-touch-tool-dock [aria-label="Drawing settings"]').click();
            cy.contains('.cvat-touch-draw-settings', 'Shape').should('be.visible');
            cy.get('.cvat-touch-mode-selector').click();
            cy.contains('.ant-dropdown-menu-item', 'Mask').click();
            cy.get('.cvat-touch-tool-dock [aria-label="Done"]').should('not.exist');
            cy.get('.cvat-touch-tool-dock [aria-label="Pan"]').should('not.exist');
            cy.get('.cvat-touch-tool-dock .cvat-brush-tools-polygon-plus').should('not.exist');
            cy.get('.cvat-touch-tool-dock .cvat-brush-tools-polygon-minus').should('not.exist');
            cy.get('.cvat-touch-tool-dock .cvat-brush-tools-hide').should('not.exist');
            cy.get('.cvat-touch-tool-dock .ant-select').should('not.exist');
            cy.get('.cvat-touch-brush-size-control .ant-slider').should('be.visible')
                .click('right');
            cy.get('.cvat-touch-brush-size-value').invoke('text').then((value) => {
                expect(Number(value)).to.be.greaterThan(10);
            });
            cy.get('.cvat-touch-tool-dock .cvat-brush-tools-continue')
                .should('have.class', 'ant-btn-primary')
                .then(([$next]) => {
                    cy.get('.cvat-touch-tool-dock').then(([$dock]) => {
                        expect($next.getBoundingClientRect().right).to.be.closeTo(
                            $dock.getBoundingClientRect().right,
                            20,
                        );
                    });
                })
                .click();
            cy.get('.cvat_native_touch_masks_canvas:visible').should('exist');
            cy.get('.cvat-touch-tool-dock .cvat-brush-tools-brush')
                .should('have.class', 'cvat-brush-tools-active-tool');
            cy.get('#cvat_canvas_wrapper')
                .trigger('pointerdown', {
                    pointerId: 70,
                    pointerType: 'pen',
                    pressure: 0.5,
                    button: 0,
                    buttons: 1,
                    clientX: 350,
                    clientY: 300,
                })
                .trigger('pointermove', {
                    pointerId: 70,
                    pointerType: 'pen',
                    pressure: 0.5,
                    button: -1,
                    buttons: 1,
                    clientX: 500,
                    clientY: 300,
                });
            readNativeMaskPixelAlpha(425, 300).should('be.greaterThan', 0);
            cy.get('#cvat_canvas_wrapper').trigger('pointerup', {
                pointerId: 70,
                pointerType: 'pen',
                pressure: 0,
                button: 0,
                buttons: 0,
                clientX: 500,
                clientY: 300,
            });
            cy.get('.cvat-touch-tool-dock [aria-label="Cancel"]').click();
            cy.startMaskDrawing();

            cy.get('#cvat_canvas_wrapper')
                .trigger('pointerdown', {
                    pointerId: 71,
                    pointerType: 'pen',
                    pressure: 0.4,
                    button: 0,
                    buttons: 1,
                    clientX: 350,
                    clientY: 350,
                })
                .trigger('pointermove', {
                    pointerId: 71,
                    pointerType: 'pen',
                    pressure: 0.8,
                    button: -1,
                    buttons: 1,
                    clientX: 500,
                    clientY: 350,
                });
            readNativeMaskPixelAlpha(425, 350).should('be.greaterThan', 0);
            cy.get('#cvat_canvas_wrapper').trigger('pointerup', {
                pointerId: 71,
                pointerType: 'pen',
                pressure: 0,
                button: 0,
                buttons: 0,
                clientX: 500,
                clientY: 350,
            });
            cy.finishMaskDrawing();
            cy.get('#cvat_canvas_shape_1').should('be.visible');

            cy.startMaskDrawing();
            cy.get('#cvat_canvas_shape_1').should('be.visible');
            cy.get('#cvat_canvas_wrapper')
                .trigger('pointerdown', {
                    pointerId: 72,
                    pointerType: 'pen',
                    pressure: 0.5,
                    button: 0,
                    buttons: 1,
                    clientX: 350,
                    clientY: 450,
                })
                .trigger('pointermove', {
                    pointerId: 72,
                    pointerType: 'pen',
                    pressure: 0.7,
                    button: -1,
                    buttons: 1,
                    clientX: 500,
                    clientY: 450,
                });
            readNativeMaskPixelAlpha(425, 450).should('be.greaterThan', 0);
            cy.get('#cvat_canvas_shape_1').should('be.visible');
            cy.get('#cvat_canvas_wrapper').trigger('pointerup', {
                pointerId: 72,
                pointerType: 'pen',
                pressure: 0,
                button: 0,
                buttons: 0,
                clientX: 500,
                clientY: 450,
            });
            cy.finishMaskDrawing();
            cy.get('#cvat_canvas_shape_2').should('be.visible');

            cy.interactControlButton('draw-rectangle');
            cy.switchLabel('mask label', 'draw-rectangle');
            cy.get('.cvat-draw-rectangle-popover').within(() => {
                cy.contains('.ant-radio-wrapper', 'By 2 Points').click();
                cy.contains('button', 'Shape').click();
            });
            cy.get('#cvat_canvas_wrapper')
                .trigger('pointerdown', {
                    pointerId: 73,
                    pointerType: 'pen',
                    pressure: 0.5,
                    button: 0,
                    buttons: 1,
                    clientX: 300,
                    clientY: 250,
                })
                .trigger('pointermove', {
                    pointerId: 73,
                    pointerType: 'pen',
                    pressure: 0.5,
                    button: -1,
                    buttons: 1,
                    clientX: 550,
                    clientY: 500,
                });
            cy.get('.cvat_canvas_shape_drawing').should('be.visible').then(($shape) => {
                expect($shape[0].getBoundingClientRect().width).to.be.greaterThan(1);
                expect($shape[0].getBoundingClientRect().height).to.be.greaterThan(1);
                const beforePalm = $shape[0].getBoundingClientRect();
                cy.get('#cvat_canvas_wrapper')
                    .trigger('pointerdown', {
                        pointerId: 74,
                        pointerType: 'touch',
                        pressure: 0.5,
                        width: 30,
                        height: 30,
                        button: 0,
                        buttons: 1,
                        clientX: 700,
                        clientY: 600,
                    })
                    .trigger('pointermove', {
                        pointerId: 74,
                        pointerType: 'touch',
                        pressure: 0.5,
                        width: 30,
                        height: 30,
                        button: -1,
                        buttons: 1,
                        clientX: 760,
                        clientY: 650,
                    });
                cy.get('.cvat_canvas_shape_drawing').then(($afterPalm) => {
                    const afterPalm = $afterPalm[0].getBoundingClientRect();
                    expect(afterPalm.left).to.equal(beforePalm.left);
                    expect(afterPalm.top).to.equal(beforePalm.top);
                    expect(afterPalm.width).to.equal(beforePalm.width);
                    expect(afterPalm.height).to.equal(beforePalm.height);
                });
            });
            cy.get('#cvat_canvas_wrapper').trigger('pointerup', {
                pointerId: 74,
                pointerType: 'touch',
                pressure: 0,
                width: 30,
                height: 30,
                button: 0,
                buttons: 0,
                clientX: 760,
                clientY: 650,
            });
            cy.get('#cvat_canvas_wrapper').trigger('pointerup', {
                pointerId: 73,
                pointerType: 'pen',
                pressure: 0,
                button: 0,
                buttons: 0,
                clientX: 550,
                clientY: 500,
            }).then(([$wrapper]) => {
                expect($wrapper.hasPointerCapture(73)).to.be.false;
            });
            cy.get('#cvat_canvas_shape_3').should('be.visible');

            cy.interactControlButton('draw-rectangle');
            cy.get('.cvat-draw-rectangle-popover').within(() => {
                cy.contains('.ant-radio-wrapper', 'By 2 Points').click();
                cy.contains('button', 'Shape').click();
            });
            cy.get('#cvat_canvas_wrapper')
                .trigger('pointerdown', {
                    pointerId: 75,
                    pointerType: 'touch',
                    pressure: 0.35,
                    width: 1,
                    height: 1,
                    button: 0,
                    buttons: 1,
                    clientX: 600,
                    clientY: 250,
                })
                .trigger('pointermove', {
                    pointerId: 75,
                    pointerType: 'touch',
                    pressure: 0.75,
                    width: 1,
                    height: 1,
                    button: -1,
                    buttons: 1,
                    clientX: 750,
                    clientY: 400,
                });
            cy.get('.cvat_canvas_shape_drawing').should('be.visible');
            cy.get('#cvat_canvas_wrapper').trigger('pointerup', {
                pointerId: 75,
                pointerType: 'touch',
                pressure: 0,
                width: 1,
                height: 1,
                button: 0,
                buttons: 0,
                clientX: 750,
                clientY: 400,
            });
            cy.get('#cvat_canvas_shape_4').should('be.visible');

            cy.get('#cvat_canvas_background').then(($background) => {
                const initialLeft = $background[0].style.left;
                cy.get('#cvat_canvas_wrapper')
                    .trigger('pointerdown', {
                        pointerId: 81,
                        pointerType: 'touch',
                        pressure: 0.5,
                        width: 30,
                        height: 30,
                        button: 0,
                        buttons: 1,
                        clientX: 400,
                        clientY: 550,
                    })
                    .trigger('pointermove', {
                        pointerId: 81,
                        pointerType: 'touch',
                        pressure: 0.5,
                        width: 30,
                        height: 30,
                        button: -1,
                        buttons: 1,
                        clientX: 430,
                        clientY: 550,
                    });
                cy.get('#cvat_canvas_background').should(($panned) => {
                    expect($panned[0].style.left).not.to.equal(initialLeft);
                });
            });
            cy.get('#cvat_canvas_background').then(($background) => {
                const initialTransform = $background[0].style.transform;
                cy.get('#cvat_canvas_wrapper')
                    .trigger('pointerdown', {
                        pointerId: 82,
                        pointerType: 'touch',
                        pressure: 0.5,
                        width: 30,
                        height: 30,
                        button: 0,
                        buttons: 1,
                        clientX: 600,
                        clientY: 550,
                    })
                    .trigger('pointermove', {
                        pointerId: 82,
                        pointerType: 'touch',
                        pressure: 0.5,
                        width: 30,
                        height: 30,
                        button: -1,
                        buttons: 1,
                        clientX: 660,
                        clientY: 550,
                    });
                cy.get('#cvat_canvas_background').should(($pinched) => {
                    expect($pinched[0].style.transform).not.to.equal(initialTransform);
                });
            });
            cy.get('#cvat_canvas_wrapper')
                .trigger('pointerup', {
                    pointerId: 82,
                    pointerType: 'touch',
                    pressure: 0,
                    width: 30,
                    height: 30,
                    button: 0,
                    buttons: 0,
                    clientX: 660,
                    clientY: 550,
                })
                .trigger('pointermove', {
                    pointerId: 81,
                    pointerType: 'touch',
                    pressure: 0.5,
                    width: 30,
                    height: 30,
                    button: -1,
                    buttons: 1,
                    clientX: 460,
                    clientY: 550,
                })
                .trigger('pointerup', {
                    pointerId: 81,
                    pointerType: 'touch',
                    pressure: 0,
                    width: 30,
                    height: 30,
                    button: 0,
                    buttons: 0,
                    clientX: 460,
                    clientY: 550,
                });
        });
        /* eslint-enable cypress/unsafe-to-chain-command */
    });
});

const { test, expect } = require('@playwright/test');
const path = require('node:path');

async function png(page, color, width = 256, height = 256) {
    return Buffer.from(await page.evaluate(({ color: fill, width: w, height: h }) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext('2d');
        context.fillStyle = fill;
        context.fillRect(0, 0, w, h);
        return canvas.toDataURL('image/png').split(',')[1];
    }, { color, width, height }), 'base64');
}

async function stroke(page, points, pointerID = 1) {
    await page.locator('#cvat_canvas_content').evaluate((element, { coordinates, pointerId }) => {
        const box = element.getBoundingClientRect();
        const dispatch = (type, point, down) => element.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId, pointerType: 'pen', isPrimary: true,
            clientX: box.left + point[0], clientY: box.top + point[1],
            button: type === 'pointermove' ? -1 : 0, buttons: down ? 1 : 0, pressure: down ? 0.7 : 0,
            width: 1, height: 1,
        }));
        dispatch('pointerdown', coordinates[0], true);
        coordinates.slice(1).forEach((point) => dispatch('pointermove', point, true));
        dispatch('pointerup', coordinates[coordinates.length - 1], false);
    }, { coordinates: points, pointerId: pointerID });
}

async function exportAnnotations(page) {
    await page.locator('.cvat-annotation-header-menu-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export annotations', exact: true }).click();
    const stream = await (await downloadPromise).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
}

test('original CVAT touch interface opens a local aligned stack', async ({ page }) => {
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/\/api\//.test(request.url())) requests.push(request.url()); });
    await page.goto('/');
    await page.getByLabel('Project name', { exact: true }).fill('Local sample');
    await page.getByLabel('Choose images').setInputFiles([
        { name: 'view-1.png', mimeType: 'image/png', buffer: await png(page, '#444444') },
        { name: 'view-2.png', mimeType: 'image/png', buffer: await png(page, '#777777') },
    ]);
    await expect(page.locator('.cvat-touch-tool-dock')).toBeVisible();
    await expect(page.locator('.cvat-touch-annotation-header')).toBeVisible();
    await expect(page.locator('#cvat_canvas_content')).toBeVisible();
    await page.getByRole('button', { name: 'Choose annotation mode' }).click();
    await page.getByRole('menuitem', { name: 'Mask', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next annotation', exact: true })).toBeVisible();
    const box = await page.locator('#cvat_canvas_content').boundingBox();
    await stroke(page, [[box.width / 2 - 30, box.height / 2], [box.width / 2 + 30, box.height / 2]]);
    await page.getByRole('button', { name: 'Next annotation', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const first = await exportAnnotations(page);
    expect(first.annotations.shapes.map((shape) => shape.type)).toEqual(['mask']);
    expect(first.annotations.shapes[0].points.length).toBeGreaterThan(4);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByRole('button', { name: 'Edit annotation', exact: true }).click();
    await page.getByRole('button', { name: 'Eraser', exact: true }).click();
    await stroke(page, [[box.width / 2, box.height / 2 - 20], [box.width / 2, box.height / 2 + 20]], 7);
    await page.getByRole('button', { name: 'Save annotation changes', exact: true }).click();
    const edited = await exportAnnotations(page);
    const area = (points) => points.slice(0, -4).reduce((sum, run, index) => sum + (index % 2 ? run : 0), 0);
    expect(area(edited.annotations.shapes[0].points)).toBeLessThan(area(first.annotations.shapes[0].points));
    expect(area(edited.annotations.shapes[0].points)).toBeGreaterThan(0);
    await page.locator('.cvat-aligned-view-selector').click();
    await page.locator('.ant-select-item-option-content').getByText('view-2.png', { exact: true }).click();
    await expect(page.locator('.cvat-aligned-view-selector')).toContainText('view-2.png');
    await expect(page.locator('.cvat-aligned-view-selector')).toHaveAttribute('title', 'Switch aligned image');
    await page.getByRole('button', { name: 'Choose annotation mode' }).click();
    await page.getByRole('menuitem', { name: 'Box', exact: true }).click();
    await stroke(page, [[box.width / 2 - 50, box.height / 2 - 50], [box.width / 2 + 50, box.height / 2 + 50]], 2);
    expect(errors).toEqual([]);
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).not.toBeVisible();
    const second = await exportAnnotations(page);
    expect(second.annotations.shapes.map((shape) => shape.type)).toEqual(['mask', 'rectangle']);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await exportAnnotations(page)).annotations.shapes).toHaveLength(1);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await exportAnnotations(page)).annotations.shapes).toHaveLength(2);

    await page.getByRole('button', { name: 'Choose annotation mode' }).click();
    await page.getByRole('menuitem', { name: 'Points', exact: true }).click();
    await stroke(page, [[box.width / 2, box.height / 2]], 3);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    expect((await exportAnnotations(page)).annotations.shapes).toHaveLength(3);

    await page.getByRole('button', { name: 'Choose annotation mode' }).click();
    await page.getByRole('menuitem', { name: 'Polygon', exact: true }).click();
    await stroke(page, [[box.width / 2 - 40, box.height / 2 - 40]], 4);
    await stroke(page, [[box.width / 2 + 40, box.height / 2 - 40]], 5);
    await stroke(page, [[box.width / 2, box.height / 2 + 40]], 6);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    expect((await exportAnnotations(page)).annotations.shapes).toHaveLength(4);
    await page.locator('.cvat-annotation-header-menu-button').click();
    await page.getByRole('menuitem', { name: 'All tasks', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Local sample', exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Open Local sample', exact: true }).click();
    await expect(page.locator('.cvat-touch-tool-dock')).toBeVisible();
    expect((await exportAnnotations(page)).annotations.shapes.map((shape) => shape.type)).toEqual(['mask', 'rectangle', 'points', 'polygon']);
    await page.screenshot({ path: path.join(__dirname, '../test-results/original-ui.png') });
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
});

test('mismatched aligned image dimensions leave no partial project', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Choose images').setInputFiles([
        { name: 'a.png', mimeType: 'image/png', buffer: await png(page, '#777777') },
        { name: 'b.png', mimeType: 'image/png', buffer: await png(page, '#777777', 128, 128) },
    ]);
    await expect(page.getByRole('alert')).toContainText('different dimensions');
    await page.reload();
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(0);
});

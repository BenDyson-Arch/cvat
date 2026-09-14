# iPad testing handoff

## User requirements

- Preserve the existing `feat/ipad-pencil-ux` UI exactly. Do not redesign it.
- Installable iPad app, no Docker or local server required.
- Primary workflow: mask drawing on aligned image stacks, retaining points,
  boxes and polygons. Pencil already works well on the branch.
- Server upload can be added later as a separate operation.
- User has authorized committing and pushing the implementation, then handing
  off to the `cvat-ipad` project on Tailscale host `bens-macbook-pro` and pulling
  there. The app lists that project at `/Users/bendyson/projects/cvat`.

## Workspace state

Source is `/home/bend/Documents/cvat`, branch `feat/ipad-pencil-ux`, based on
`81c8691c7` (Improve iPad dropdown scrolling and palm rejection).
Pull `feat/ipad-pencil-ux` from origin after checking the Mac working tree.
Use the whole repository, not only this directory: the iPad build imports
the sibling CVAT packages. Preserve any existing Mac changes.

New package: `cvat-ipad/`, with its own npm lockfile and Capacitor 8.5.2 iOS
project. Changes outside this directory:

- `cvat-canvas/src/typescript/nativeTouchMasksHandler.ts`: 64 MiB combined
  raster undo/redo budget, with redo cleared before new-edit budgeting.
- `cvat-ui/src/components/annotation-page/top-bar/annotation-menu.tsx`: narrow
  local-job export hook and hiding of server-only actions for local jobs.
  Ordinary CVAT keeps its existing menu behavior.

The temporary replacement editor/theme was removed after the user explicitly
rejected a redesign. `src/local-workspace.tsx` now directly renders the original
CVAT annotation page, touch header, dock, brush palette, drawer and settings.
`src/local-session.ts` supplies a local Job backed by the actual core annotation
collection/history. Do not restore the discarded replacement interface.

## Verified here

- Production web build passes.
- TypeScript check passes.
- Storage and mask-history unit tests pass.
- Browser workflow tests pass: original touch UI, aligned import, mask creation
  and erasing an existing mask, box/points/polygon creation, view switching,
  undo/redo, annotation export, returning to the library, reload and reopen.
- Tests verify no API requests occur during the workflow and that mismatched
  image dimensions leave no saved partial project.
- Capacitor iOS sync passes. Latest web build is copied to ignored native assets.
- Swift/Xcode compilation, iPad installation, native filesystem persistence,
  share sheet and real Pencil gestures have NOT been tested here (Linux host).

See README.md for Mac setup and commands. On the Mac, install root workspace
dependencies and `npm ci` in `cvat-ipad`, then `npm run ios:sync` and
`npm run ios:open`. Configure the user's signing team in Xcode. Target: iPadOS
16+, Xcode 26+, iPad only. Native saves use a custom registered Capacitor plugin
with Foundation atomic writes to Documents/projects/<uuid>/project.json.

## Prototype limits / next testing

- Local import launcher currently creates an Object class; full local label
  and project management is not implemented yet.
- PNG/JPEG/WebP only, equal dimensions and already registered. One shared
  annotation layer across views; no depth-volume or image registration logic.
- Current durable shape schema covers type, label, points and rotation. Broader
  CVAT attributes/group/occlusion metadata needs extending before claiming full
  annotation parity. Extra tools outside the four supported types report an
  unsupported-operation error.
- No server upload/sync, video or local AI processing yet.
- Annotation JSON export is a prototype format, not a full CVAT task backup.
- Commit masks with the existing Next annotation control, polygons/points with
  Done. Unfinished drawing can be lost on force quit. Completed operations save
  locally; test interruption, low storage and native write failures on-device.
- Related images are cached as decoded bitmaps, so large stacks need memory
  testing and potentially loading only the selected view before daily use.

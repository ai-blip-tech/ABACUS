# Unified Room Studio — discovery map

Preview-only implementation map prepared before UI changes.

## Image editor

| ID | Current control | Existing component / location | Existing handler / state | New location |
|---|---|---|---|---|
| I01 | Save state / save project | `Home`, `.canvas-head` | `saveProject`, `persistProject`, `projectSaved`, `isSavingProject` | Shared `StudioProjectBar` and status footer |
| I02 | Commercial proposal | `.proposal-control` | `openCommercialProposal` | Shared project action bar |
| I03 | Favorite | `.favorite-icon` | `favorite`, `setFavorite` | Shared project action bar |
| I04 | Placement point | `.room-canvas` | `layerCursorPosition`, `placementPoint`, `setPlacementPoint` | Image canvas contextual layer |
| I05 | Add furniture | `FurnitureChoice`, `.furniture-action-bar` | `generate`, `generateFurnitureEdits`, `queueCatalogProduct` | Image context panel + catalog rail |
| I06 | Replace furniture | `.furniture-switch`, `FurnitureChoice` | `setFurnitureAction("replace")`, `generate`, `replaceSelectedObject` | Image contextual toolbar |
| I07 | Remove furniture | `.furniture-action-bar`, `ObjectPanel` | `removeAtPlacement`, `removeSelectedObject` | Image contextual toolbar |
| I08 | Select render version | `.history-strip` | `openHistoryVersion`, `activeHistoryId` | Right render-history rail |
| I09 | Download render version | `.history-download` | `downloadHistoryVersion` | History card + shared selected-render action |
| I10 | Upload source interior | `FurnitureChoice`, `ObjectPanel`, empty canvas | `loadInterior` | Left `Source image` panel |
| I11 | Choose source file | Existing hidden file inputs | native file input → `loadInterior` | Source upload/replace card |
| I12 | Upload furniture reference | `FurnitureChoice` | local file reader → `setReferenceImage` / `setReferenceName` | Left `Reference` panel |
| I13 | Add from catalog | `FurnitureCatalogPicker` | `queueCatalogProduct`, `setLinkedCatalogProduct` | Collapsible bottom catalog rail |
| I14 | Create interior/render | `FurnitureChoice` / `DesignPanel` | `generate`, `generateFurnitureEdits` | Primary `Create render` action; handler unchanged |
| I15 | Text edit draft | `FurnitureChoice` | `placementPrompt`, `setPlacementPrompt` | Left `Text edit` panel |
| I16 | Apply text edit | `FurnitureChoice` | `editCurrentImage` | Beside text-edit textarea |
| I17 | Upscale | `.upscale-panel` | `upscaleVersion`, `upscaleHistoryVersion` | Secondary panel below canvas |
| I18 | Undo | No production control or handler found | **Unmapped — no mock action will be added** | Reported as a missing legacy contract |
| I19 | Account / help / Ono | `topbar`, `AccountDropdown`, sitewide Ono | existing global handlers/context | Global shell, unchanged |

## Plan editor

| ID | Current control | Existing component / location | Existing handler / state | New location |
|---|---|---|---|---|
| P01 | Zoom out | `PlanogramWorkspaceBase` toolbar | internal `setZoom` | Plan canvas toolbar |
| P02 | Zoom value | `PlanogramWorkspaceBase` toolbar | internal `zoom` | Plan canvas toolbar |
| P03 | Zoom in | `PlanogramWorkspaceBase` toolbar | internal `setZoom` | Plan canvas toolbar |
| P04 | Save project | `.plan-save` | `exportPlan` → `room-save-project` → `saveProject` | Shared project action bar/footer |
| P05 | Room width | room resize handle | `roomResize`, `onRoomChange` | Plan canvas + room summary |
| P06 | Room length | room resize handle | `roomResize`, `onRoomChange` | Plan canvas + room summary |
| P07 | Drag item | `.planogram-furniture` | pointer `move`, `setDragging`, `onChange` | Plan canvas, unchanged |
| P08 | Resize item | eight `.plan-resize-handle` controls | `editingId`, `resizing`, `onChange` | Plan canvas, unchanged |
| P09 | Item types | `PlanogramPanel` | `planTemplates`, local `add` | Right `Add item` panel |
| P10 | Select item | plan canvas / `PlanogramPanel` | `setPlanSelectedId`, `onSelect` | Plan canvas + right properties |
| P11 | Upload item reference | plan context menu | `attachReference` | Selected-item properties |
| P12 | Set camera | `PlanogramWorkspace` wrapper | `placeCamera`, `setPlanCamera` | Plan canvas + right camera block |
| P13 | Floor reference | `.plan-surface-reference` | `attachSurfaceReference("floor")` | Stable lower plan action area |
| P14 | Wall reference | `.plan-surface-reference` | `attachSurfaceReference("wall")` | Stable lower plan action area |
| P15 | Render instruction draft | `.plan-instruction-panel` | `planInstructionDraft`, `setPlanInstructionDraft` | Right instruction block |
| P16 | Remember instruction | `.plan-instruction-panel` | `setPlanInstruction`, `setProjectSaved(false)` | Beside instruction |
| P17 | Create render | `.plan-create-reference` | `createReference` → `createPlanReference` | Primary lower plan action |
| P18 | Item count | `.planogram-footer` | `items.length` | Plan toolbar/footer |

## Shared and mode-scoped state

- Shared in `Home`: `projectId`, room label, auth/tenant context, `projectSaved`, `historyVersions`, `activeHistoryId`, catalog adapter and Ono context.
- Image-scoped in `Home`: image/source/reference state, `placementPrompt`, placement/selection, image filters and selected history version.
- Plan-scoped in `Home`: `planItems`, `planRoom`, `planSelectedId`, surface references, camera, `planInstructionDraft` and saved instruction.
- Switching currently unmounts a visual subtree, but the meaningful drafts live in the parent and survive. The unified shell keeps that ownership and does not introduce a second project context.

## Data and actions

- Save: `saveProject` → `persistProject` → `PUT /api/projects/:id`.
- Image generation/edit/upscale: existing `/api/generate` payloads, unchanged.
- Plan generation: `createPlanReference` → existing `/api/generate` plan payload, unchanged.
- History: `historyVersions` loaded from and saved to project `state_json` through the existing project API.
- Catalog: existing `FurnitureCatalogPicker` / `/api/catalog` adapter.
- Download: `downloadHistoryVersion` / `downloadImageAsJpeg`.
- Commercial proposal: `openCommercialProposal`; payload unchanged.
- Favorite: existing local `favorite` toggle; no new persistence contract introduced.

## Preview flag and rollback

- Flag: URL query `studioPreview=unified` while the route remains `#студия`.
- Flag off: legacy two-item project sidebar and legacy studio layout remain available.
- No database migration, API schema change, generation prompt change or production rollout.

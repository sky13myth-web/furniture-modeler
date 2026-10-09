# ATÖLYE — cabinet furniture designer

A free, local furniture design application. Design the cabinet itself: divide its interior, arrange doors and drawers, and place it in a room with an irregular outline. All dimensions are in millimetres. The interface supports Turkish, Russian and English; production documents default to Turkish.

[Русский](README.md) · [Türkçe](README.tr.md) · [MIT license](LICENSE)

## Run

Install Node.js 18 or newer, download or clone this repository, and run:

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). On Windows, you can double-click `start.bat`. There are no npm dependencies to install. Once started, the application works without an internet connection.

## Design

- Split cabinet sections vertically or horizontally. Moving a divider changes the adjacent openings while preserving distant sections.
- Choose doors, drawers, open niches, pull-out shelves or internal drawers behind doors. Door hinges can be on the left, right or top; opening can use a handle or push-to-open.
- Select a door section and choose **Internal layout** to divide its interior into shelf and drawer areas behind the same tall doors. The existing split, resize and delete tools work inside; **Back to doors** returns to the outer view.
- Add clothes rails to open or door compartments, including internal compartments. Set the axis height, front inset, diameter and length. Automatic length is the clear width minus 4 mm: an editable planning allowance of 2 mm per end, to check against the selected holders. The default diameter is 25 mm. Rails and pairs of holders appear separately from sheet parts in the hardware schedule. Removing outer doors preserves the internal layout. Delete an element with its trash button or selected-object action; Ctrl+Z restores it.
- Extend a cabinet with a full-height section, create wall cabinets or place a top cabinet above an existing one.
- Remove backs, bottoms and local plinths, extend sides to the floor, and add rear strengthening rails or a rear notch.
- Set a plinth separately for each bottom section, including a raised bottom beside a floor opening. A section with a positive plinth always keeps its own bottom panel, even when the cabinet bottom is disabled; a floor opening removes both. New floor cabinets default to a 100 mm plinth; wall and top cabinets default to zero. **Full cabinet back panel** overrides local backs and rails. With it off, each section can have a back panel or its own rails. A section rail's height is measured from the bottom of that section's clear opening.
- Draw irregular rooms, move walls and corners, add windows and doors, and drag cabinets and openings on the plan.
- Cabinets stop at obstacles and slide along walls or neighbouring cabinets. Zoom the plan with the wheel or − / + controls, fit the room, and pan with Space + drag or the middle mouse button.
- Resize a selected cabinet's width and depth directly on the plan with two grips or numeric fields. Constraints protect its construction, appliances and placement. Delete the selected cabinet with its visible button or Delete on the plan; Ctrl+Z restores it.
- Use editable appliance dimensions and installation allowances. Placement checks include room boundaries, cabinet collisions and ceiling clearance.
- Assign board materials, colours, thicknesses and grain directions. Factory presets use verified Yıldız Entegre product sizes.

New cabinets default to a **3 mm hardboard back**, named **Hardboard · back panel · 3 mm**. This editable material has no manufacturer or product code. It is separate from the confirmed Yıldız factory presets; choose the actual board product, finish and sheet size in Materials. Opening an older project adds the missing 3 mm hardboard stock to its catalogue. Existing saved materials and cabinet thicknesses are preserved; choose 3 mm hardboard in **Back panel** to update an existing cabinet. Drawer bottoms remain **8 mm**. `/?demo=interior` opens a disposable example with shelves and internal drawers behind shared doors.

## Production documents

Six orthographic views include section openings, individual fronts and fastener centre distances. Zoom and pan drawings on screen. Print the drawing set, individual SVGs or the current cabinet 3D view. Compact views share a page when possible.

In **Room**, choose **Plan** or **3D** and use **Print / PDF**. The A4 landscape room plan includes the actual outline, wall dimensions, window and door offsets, rotated furniture and schedules. Its scale is independent of the editor zoom. The room 3D print retains the current viewpoint and open-front state. The preview lets you save a standalone HTML document with **Save room plan** or **Save room 3D view**. Document language is selected separately and defaults to Turkish.

Cutting layouts consider stock material, thickness, kerf, margins and grain direction. Cutting sizes automatically exclude the applied edge band thickness, including when opening older projects. Ordinary shelves are banded only at the front: an 864 × 600 mm shelf with a 1 mm front band uses an 864 × 599 mm blank. The 3D model and assembly drawings retain finished sizes. Individual part drawings highlight the banded edges and label blank and finished sizes separately. Export a parts CSV with both sizes, selected edge bands and their total length. Save the project as JSON to move it between computers; it retains outer and internal compartments, section plinths, back panels and rails. Browser storage saves changes locally.

JSON also retains clothes rail positions, diameters and manual lengths. `/?demo=rods` opens a disposable example with two rails behind shared doors in an L-shaped room. `node scripts/export-room-example.mjs` updates `examples/clothes-rods.*`, including the project, drawings and room plan.

The hardware schedule counts handles, hinges and guide sets: one set is a pair of guides per drawer or pull-out shelf. **Door hardware** lets you set 2–12 **Hinges per door**, or **Estimate from height**. The automatic count is a planning estimate; check door weight, width and the chosen hinge manufacturer's instructions. It does not specify lift mechanisms for upward-opening fronts.

Open **Prices and cost estimate** to edit full-sheet prices and handle, guide set, hinge and edge band rates in TRY. Manual values, including zero for existing stock, are saved in the project JSON and used for new projects on this computer; an imported file keeps its own values. Reference prices are a dated sample of published Turkish supplier offers; finish, payment method and hardware model affect the actual price. Material references are scaled by sheet area, without guessing another thickness or finish. The estimate buys whole sheets from the cutting plan and counts hardware usage; supplier minimum packs, delivery, labour and installation are excluded. Missing prices are shown explicitly. [Sources and pricing limits](docs/standards.md#цены-и-смета).

Enter the clothes rail price per metre and holder price manually; no verified price for a specific rail model is provided. A project using rails has an incomplete estimate until both rates are entered.

The cutting layout is a rectangular packing heuristic. Notched parts reserve their bounding rectangles. It does not produce CNC toolpaths, a drilling plan, hardware-specific joinery or structural calculations. Review dimensions, hardware and appliance instructions with the workshop before manufacture.

## Development

Vanilla JavaScript modules, SVG and canvas; a small Node.js server. Run the checks with:

```sh
npm test
```

`node scripts/export-example.mjs` regenerates the example project files and production drawings. `/?demo=1` opens a disposable example without changing the saved project.

You may use, modify and redistribute the application under the MIT license.

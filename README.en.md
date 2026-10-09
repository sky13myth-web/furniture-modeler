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
- Extend a cabinet with a full-height section, create wall cabinets or place a top cabinet above an existing one.
- Remove backs, bottoms and local plinths, extend sides to the floor, and add rear strengthening rails or a rear notch.
- Draw irregular rooms, move walls and corners, add windows and doors, and drag cabinets and openings on the plan.
- Cabinets stop at obstacles and slide along walls or neighbouring cabinets. Zoom the plan with the wheel or − / + controls, fit the room, and pan with Space + drag or the middle mouse button.
- Resize a selected cabinet's width and depth directly on the plan with two grips or numeric fields. Constraints protect its construction, appliances and placement. Delete the selected cabinet with its visible button or Delete on the plan; Ctrl+Z restores it.
- Use editable appliance dimensions and installation allowances. Placement checks include room boundaries, cabinet collisions and ceiling clearance.
- Assign board materials, colours, thicknesses and grain directions. Factory presets use verified Yıldız Entegre product sizes.

## Production documents

Six orthographic views include section openings, individual fronts and fastener centre distances. Zoom and pan drawings on screen. Print the drawing set, individual SVGs or the current cabinet 3D view. Compact views share a page when possible.

Cutting layouts consider stock material, thickness, kerf, margins and grain direction. Export a parts CSV with finished and blank sizes, selected edge bands and their total length. Save the project as JSON to move it between computers. Browser storage saves changes locally.

The cutting layout is a rectangular packing heuristic. Notched parts reserve their bounding rectangles. It does not produce CNC toolpaths, a drilling plan, hardware-specific joinery or structural calculations. Review dimensions, hardware and appliance instructions with the workshop before manufacture.

## Development

Vanilla JavaScript modules, SVG and canvas; a small Node.js server. Run the checks with:

```sh
npm test
```

`node scripts/export-example.mjs` regenerates the example project files and production drawings. `/?demo=1` opens a disposable example without changing the saved project.

You may use, modify and redistribute the application under the MIT license.

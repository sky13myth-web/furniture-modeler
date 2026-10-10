# ATÖLYE — cabinet furniture designer

A free, local furniture design application. Design the cabinet itself: divide its interior, arrange doors and drawers, and place it in a room with an irregular outline. All dimensions are in millimetres. The interface supports Turkish, Russian and English; production documents default to Turkish.

[Русский](README.md) · [Türkçe](README.tr.md) · [Free Use — No Sale license](LICENSE)

## Windows installer

Download **ATOLYE-Setup-2.2.1-x64.exe** from the [latest release](https://github.com/sky13myth-web/furniture-modeler/releases/latest) and follow the installation wizard. Launch ATÖLYE from its desktop or Start menu shortcut. No Node.js, terminal or internet connection is needed to use the installed application. Installation is per user; projects stay on your computer. [Installation and backups](docs/windows-install.md).

## Cloudflare Pages web application

If GitHub setup shows **Deploy command**, this is a **Workers** application. Use name `furniture-modeler`, branch `main`, **Build command** `node scripts/prepare-pages.mjs` and **Deploy command** `npx wrangler deploy`. Set `SKIP_DEPENDENCY_INSTALL=1` under **Settings → Build → Build Variables and Secrets**. The included `wrangler.jsonc` publishes only the prepared static assets at `*.workers.dev`. [Workers setup](https://developers.cloudflare.com/workers/static-assets/get-started/).

Open **Workers & Pages → Create application → Pages → Connect to Git**, connect GitHub and select `sky13myth-web/furniture-modeler`. Use production branch `main`, framework preset **None**, build command `node scripts/prepare-pages.mjs` and output directory `.tools/pages-site`. Set `SKIP_DEPENDENCY_INSTALL=1`; the browser app does not need Windows installer dependencies. **Save and Deploy** provides a `*.pages.dev` URL; pushes to `main` update the site automatically. [Cloudflare instructions](https://developers.cloudflare.com/pages/get-started/git-integration/).

Only public HTML, browser modules, styles and licenses are published. User projects stay in their own browsers; no application server or database is needed. `ATOLYE-Web-2.2.1.zip` in the release also supports manual upload.

## Run from source

Install Node.js 22 or newer, download or clone this repository, and run:

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). On Windows, you can double-click `start.bat`. There are no npm dependencies to install. Once started, the application works without an internet connection.

## Design

- Split cabinet sections vertically or horizontally. Moving a divider changes the adjacent openings while preserving distant sections.
- Choose doors, drawers, open niches, pull-out shelves or internal drawers behind doors. Door hinges can be on the left, right or top; opening can use a handle or push-to-open.
- Select a door section and choose **Internal layout** to divide its interior into shelf and drawer areas behind the same tall doors. The existing split, resize and delete tools work inside; **Back to doors** returns to the outer view. Select an internal drawer to set **Hinge clearance / side**: the value belongs to the enclosing doors and is applied only at their outside side walls.
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

Select a cabinet and use its **Scheme / 3D / Drawings** tabs. In **3D**, choose **Explode parts** and click a panel to select it; double-click to open its drawing. All holes and dimension lines are shown together. Matching offsets share row or column dimensions; notch edges are measured separately. Vertical panels are shown upright with B measured from the bottom. Edge pilots have a thickness section. Diameter, depth and drill entry use short labels. The sidebar retains the P code, finished dimensions and unbanded blank dimensions. The same interactive diagram is available under **Drawings → Drilling**. Exploding changes only the display; manufacturing geometry stays unchanged. Carcass drilling is optional and covers confirmat joints, with hardware-specific patterns excluded.

Use the small diagram under **Edge banding for this part** to tick the edges to band. Thickness comes from the cabinet setting. Cabinet sides have front and top banding enabled by default. Cut dimensions, band length, drilling and exports update while finished dimensions stay unchanged. These overrides are saved in the project. **Restore automatic banding** returns to the calculated defaults.

In **Room**, choose **Plan** or **3D** and use **Print / PDF**. The A4 landscape room plan includes the actual outline, wall dimensions, window and door offsets, rotated furniture and schedules. Its scale is independent of the editor zoom. The room 3D print retains the current viewpoint and open-front state. The preview lets you save a standalone HTML document with **Save room plan** or **Save room 3D view**. Document language is selected separately and defaults to Turkish.

Cutting layouts consider stock material, thickness, kerf, margins and grain direction. Cutting sizes automatically exclude the applied edge band thickness, including when opening older projects. Ordinary shelves are banded only at the front: an 864 × 600 mm shelf with a 1 mm front band uses an 864 × 599 mm blank. The 3D model and assembly drawings retain finished sizes. Individual part drawings highlight the banded edges and label blank and finished sizes separately. Export a parts CSV with both sizes, selected edge bands and their total length. Save the project as JSON to move it between computers; it retains outer and internal compartments, section plinths, back panels and rails. Browser storage saves changes locally.

**Cutting layout → For the factory** exports a CSV for import with column mapping and a ZIP package containing the parts list, materials, nested sheet DXF at 1:1 in mm, a separate cut sequence with kerf, Excel grouped by material, part SVGs, assembly HTML and instructions. Map only one size pair: `CUT_*` contains blanks with edge bands already deducted, so disable further deduction; use `FINISHED_*` if the factory deducts edge bands itself. Documents default to Turkish. The factory still prepares its own machine program. See the [field and handoff reference (Russian)](docs/factory-export.md); `node scripts/export-factory-example.mjs` updates the example.

JSON also retains clothes rail positions, diameters and manual lengths. `/?demo=rods` opens a disposable example with two rails behind shared doors in an L-shaped room. `node scripts/export-room-example.mjs` updates `examples/clothes-rods.*`, including the project, drawings and room plan.

The hardware schedule counts handles, hinges and guide sets: one set is a pair of guides per drawer or pull-out shelf. **Door hardware** lets you set 2–12 **Hinges per door**, or **Estimate from height**. The automatic count is a planning estimate; check door weight, width and the chosen hinge manufacturer's instructions. It does not specify lift mechanisms for upward-opening fronts.

Open **Prices and cost estimate** to edit full-sheet prices and handle, guide set, hinge and edge band rates in TRY. Manual values, including zero for existing stock, are saved in the project JSON and used for new projects on this computer; an imported file keeps its own values. Reference prices are a dated sample of published Turkish supplier offers; finish, payment method and hardware model affect the actual price. Material references are scaled by sheet area, without guessing another thickness or finish. The estimate buys whole sheets from the cutting plan and counts hardware usage; supplier minimum packs, delivery, labour and installation are excluded. Missing prices are shown explicitly. [Sources and pricing limits](docs/standards.md#цены-и-смета).

Enter the clothes rail price per metre and holder price manually; no verified price for a specific rail model is provided. A project using rails has an incomplete estimate until both rates are entered.

**Carcass drilling:** in **Cutting → For the factory**, enable **Carcass drilling for confirmat screws**. The initial profile is a 7×50 mm furniture screw. Download a separate operation CSV or ZIP with part maps; P codes match the cutting list. Diameters, extra pilot depth, end offset and spacing are editable under **Drilling settings**. Set countersink depth to match the chosen screw head and tool; an empty field is exported as requiring workshop setup. [Scope and coordinate reference](docs/drilling.md).

The cutting layout is a guillotine packing heuristic with a replayable straight-cut sequence. Notched parts reserve their bounding rectangles. It does not produce CNC toolpaths, hardware-specific hinge/slide drilling or structural calculations. Review dimensions, hardware and appliance instructions with the workshop before manufacture.

## Development

Vanilla JavaScript modules, SVG and canvas; a small Node.js server. Run the checks with:

```sh
npm test
```

`node scripts/export-example.mjs` regenerates the example project files and production drawings. `/?demo=1` opens a disposable example without changing the saved project.

You may use, modify and redistribute the application free of charge under the [ATÖLYE license](LICENSE). Selling the application or modified versions and charging for access are prohibited. Commercial use for furniture work and sale of your own designs are allowed.

Workshop Excel uses one tab per material/decor/gauge with raw width and length first. `dxf/sheets-all.dxf` shows the actual nested stock sheets; `cuts/cuts-all.dxf` and CSV describe the straight-cut sequence with a default 3 mm kerf. Click a panel to select it and double-click to open its diagram. The edge-band measurement checkbox switches between raw and finished datums without moving holes. Hinges are shown schematically in 3D with the configured hardware count. S callouts show the opening and usable depth.

MDF backs use separate configurable screws and matching drilling; 3 mm hardboard backs use nails without drilling. Back screw parameters are in the factory order window. The hardware list and estimate include screw/nail quantities; their unit prices are editable in settings. Section backs overlap the carcass edges and meet at the centre of shared partitions. Compatible adjacent panels in one plane merge into a single rectangular back.

The new license applies from 2.2.1. Earlier releases through 2.2.0 keep MIT. [License scope and prior releases](docs/licensing.md).

# Street block art and sources

The storefronts, verandas, compound walls, drainage, paving, benches, poles and wires are original procedural WASA geometry. Their dimensions and businesses are illustrative game art. They are not an as-built reconstruction of a photographed street or actual business addresses.

The block is aligned with road way `559167448` in the bundled OpenStreetMap extract. Site selection checks existing mapped building bounds and nearby roads before adding the block. OSM provenance and attribution remain in `public/world/DATA-SOURCES.md`.

## Architectural reference

- [Burabura modern Market 01](https://commons.wikimedia.org/wiki/File:Burabura_modern_Market_01.jpg), Mr. Snatch, photographed 30 June 2024. The Commons page identifies the photo as Burabura modern market, Damaturu, and lists CC0. Inspected for repeated shop bays, cream/red facade treatment, veranda/roof bands, utility poles and road-verge proportions.
- [Market jpg](https://commons.wikimedia.org/wiki/File:Market_jpg.jpg), Mr. Snatch, photographed 29 June 2024. The Commons page identifies the image as a Damaturu market and lists CC0. Used as a secondary location reference.

Reference photographs are not bundled, copied into textures, or used to assign business locations. Drain geometry is an illustrative road-edge detail, not a survey derived from these photographs.

## Generated foliage asset

- Consumed asset: `public/assets/street-block/foliage-cluster-512.png`.
- Generated with the built-in `image_gen` tool, in generate mode with `transparent_background: true`.
- Mechanical processing: resized to 512 × 342 pixels with premultiplied-alpha bilinear resampling and lossless PNG compression. Final file is 273,635 bytes. Alpha-tested leaf cards share this one texture; there is no full-size image download in the scene.
- The plant is a neem-like shade-tree art asset; the in-game trees are not mapped real trees or a botanical survey.

Generation prompt:

> Use case: photorealistic-natural. Asset type: alpha-tested foliage sprite for an optimized Babylon.js 3D game street in northern Nigeria. Generate one isolated loose cluster of fine neem-like compound foliage: several thin woody twigs with many slender pointed green leaflets, uneven airy silhouette with clear gaps between leaves. A branch spray about 1 meter across, photographed front-on, centered with a generous transparent margin. True transparent background, including gaps between leaves. Natural muted olive and medium green leaves with subtle dry tips, softly lit by neutral daylight with no strong baked directional shadows. High botanical detail suitable for a 3D tree canopy made of overlapping leaf cards. No trunk, no pot, no ground, no border, no text, no people, no watermark. One cohesive branch cluster, not a collage or an entire tree.

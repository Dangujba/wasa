# WASA Avatar Creator, Step 3

Implemented on the WASA development subdomain. The /avatar/ path is an independent Babylon.js 3D character studio available through Main Menu → My Character.

- Persistent appearance stored in player_profiles.avatar_config (JSONB); avatar_status changes to created after saving.
- The server validates all avatar choices, with rate limits and HttpOnly authentication.
- API: GET /api/avatar/catalog, authenticated GET /api/avatar, and authenticated PATCH /api/avatar.
- These are stylized procedural 3D prototypes, not the final scanned or rigged garment meshes.
- Customization: body frame, skin tone, hair, facial hair, northern-inspired outfits, traditional caps/headwraps, footwear, colours and accessories.
- In-game marketplace, item ownership, Wasa Kudi pricing, purchases, skeletal character animations and inventory are NOT operational. Wardrobe items are explicitly free trial selections during pre-alpha.
- No cash or virtual currency is charged.
- Preserve stable server-side item IDs when upgrading models so existing saved selections remain readable.
- When creating the store, introduce inventory ownership and proper transactions without arbitrarily deleting earlier trial player saves.

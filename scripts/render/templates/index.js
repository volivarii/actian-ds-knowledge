"use strict";
// TEMPLATES is the derive-canonical.js escape hatch: a slug listed here gets
// its fragment + CSS replaced by a hand-authored derive-from-facts template
// instead of the generic renderer (see the TEMPLATES[slug] override loop in
// derive-canonical.js, which is retained even though this map is empty).
// tag-read-only and checkbox used to live here (renderer relocation phase
// 1b-beta retired them once the generic renderer rendered both correctly),
// but the hook stays for a future component the generic renderer cannot
// derive.
module.exports = {
  TEMPLATES: {},
};

# POI Assignment Audit — One Fukuoka Building Navigation

Spatial mapping of new tenant names to existing node IDs. Source: `translation/floorplan/new_poi.txt` and SVG floorplan review.

Only `label` values changed. All node IDs, coordinates, types, elevations, and edges are identical.

---

## Floor 1 — Ground Floor (20 POI-type nodes)

### Infrastructure nodes (kept functional)
| id | type | old label | new label | reason |
|----|------|-----------|-----------|--------|
| 1 | entrance | Main Entrance | **Grand Lobby** | South facade main public entrance — matches "Grand Lobby" from new list |
| 15 | entrance | North Entrance | **Car Drop-off** | North facade vehicular access — matches "車寄せ" |
| 2 | elevator | Elevator Bank | Elevator Bank | No elevator-specific tenant name in list; functional label retained |
| 3 | escalator | Central Escalators | Central Escalators | Retained functional |
| 4 | stairs | Stairwell NW | Stairwell NW | Retained functional |
| 5 | stairs | Stairwell SE | Stairwell SE | Retained functional |

### Retail POI nodes
| id | x,y | old label | new label | notes |
|----|-----|-----------|-----------|-------|
| 16 | 430,240 | Northgate Department Store | **CHANEL** | NW anchor — luxury brand anchor position |
| 17 | 820,200 | Apparel Co. | **Valextra** | North spur left boutique — Italian leather goods |
| 18 | 1180,200 | Tech Hub | **EDIT(h)** | North spur right boutique |
| 19 | 1400,210 | Cosmetics | **Spica・ALBION** | NE cluster left — beauty/cosmetics brand, spatially appropriate |
| 20 | 1590,210 | Jewelry | **Hirotaka** | NE cluster mid — Japanese jewelry brand, replaces Jewelry |
| 21 | 1770,250 | Optics | **NIWAKA** | NE cluster right — Japanese jewelry/accessories brand |
| 22 | 1795,440 | Restrooms | **Restrooms** | NE alcove restroom block — functional label retained |
| 23 | 1814,570 | Electronics | **MUCHA** | East wing upper unit |
| 24 | 1814,845 | FreshMart Supermarket | **THE CONTINENTAL ROYAL&Goh** | East wing lower — large F&B venue |
| 25 | 196,570 | Pharmacy | **PIERRE MARCOLINI** | West wing upper — Belgian premium patissier/chocolatier |
| 26 | 196,845 | City Bank | **ONE FUKUOKA HOTEL Entrance** | West wing lower — hotel connection point |
| 27 | 650,1150 | Food Court West | **THE CAFE by ONE FUKUOKA HOTEL** | South band west — hotel café F&B |
| 28 | 1320,1150 | Food Court East | **One Fukuoka Bldg. Bicycle Parking** | South band east — ground-floor service amenity; no second F&B in provided list |
| 29 | 1150,880 | Information Desk | **Information Desk** | Retained functional |

### Dropped from Floor 1 new-name list (no matching node)
| name | reason |
|------|--------|
| Office Conference | No `conference` node type; no viable non-functional slot |
| Office Sky Lobby Elevator | No second elevator bank node on floor 1 |

---

## Floor 2 — Upper Floor (24 POI-type nodes)

### Infrastructure nodes (kept functional)
| id | type | old label | new label |
|----|------|-----------|-----------|
| 101 | elevator | Elevator Bank | Elevator Bank |
| 102 | escalator | Central Escalators | Central Escalators |
| 103 | stairs | Stairwell NW | Stairwell NW |
| 104 | stairs | Stairwell SE | Stairwell SE |

### Service POI nodes (kept functional — no tenant assignment)
| id | old label | new label |
|----|-----------|-----------|
| 122 | Restrooms | Restrooms |
| 125 | Management Office | Management Office |
| 126 | Storage | Storage |
| 127 | Kids Play Area | Kids Play Area |
| 128 | Restroom (West) | Restroom (West) |
| 135 | Information Desk | Information Desk |

### Retail POI nodes (12 assigned, 2 balconies retained)
| id | x,y | old label | new label | notes |
|----|-----|-----------|-----------|-------|
| 116 | 400,240 | Starplex Cinemas | **LINC ORIGINAL MAKERS** | NW anchor — large format retail replaces cinema |
| 117 | 830,200 | Arcade | **NIKE FUKUOKA TENJIN** | North spur left — sportswear |
| 118 | 1190,200 | Bookstore | **MoMA Design Store** | North spur right — design goods |
| 119 | 1420,220 | Fashion Boutique | **Patou** | NE cluster left — French fashion |
| 120 | 1610,220 | Footwear | **MAISON KITSUNÉ** | NE cluster mid — French-Japanese fashion |
| 121 | 1790,250 | Watches | **MYKITA** | NE cluster right — eyewear boutique |
| 123 | 1814,580 | FitZone Gym | **TATRAS** | East wing upper — Italian outerwear brand |
| 124 | 1814,870 | Spa & Salon | **SALOMON STORE** | East wing lower — outdoor sports brand |
| 129 | 500,1150 | Trattoria | **CAFÉ KITSUNÉ** | South restaurant band slot 1 |
| 130 | 850,1150 | Sushi Bar | **Face Records** | South band slot 2 — record shop/café concept |
| 131 | 1290,1150 | Grill House | **HYDROGEN** | South band slot 3 |
| 132 | 1520,1150 | Café | **kolor** | South band slot 4 — Japanese fashion brand |
| 133 | 740,700 | West Atrium Balcony | **West Atrium Balcony** | Retained — navigable viewpoint |
| 134 | 1260,700 | East Atrium Balcony | **East Atrium Balcony** | Retained — navigable viewpoint |

### Dropped from Floor 2 new-name list (9 names, insufficient retail slots)
| name | reason |
|------|--------|
| POP UP SPACE | Generic event space — no dedicated slot; no permanent node |
| athletia | No available retail slot after service nodes reserved |
| NOSE SHOP | No available slot |
| TRENT | No available slot |
| N.HOOLYWOOD | No available slot |
| DRESSLAVE | No available slot |
| Jouete L/ | No available slot |
| NEUTRALWORKS. | No available slot |
| and wander | No available slot |

---

## Invented / extended names
None — all new labels come from the provided `new_poi.txt` list or are retained functional names.

---

## Verification checklist
- [x] No junction-type node labels changed
- [x] No node IDs, coordinates, types, or elevations changed
- [x] No edge references broken (edges reference node IDs only)
- [x] Floor 1: 20 POI-type nodes accounted for (6 infra + 14 retail)
- [x] Floor 2: 24 POI-type nodes accounted for (4 infra + 6 service + 12 retail + 2 balconies)
- [x] `poi_translations.json` keys match every new `label` byte-for-byte
- [x] Both `frontend/public/poi_translations.json` and `backend/seed/poi_translations.json` are identical copies

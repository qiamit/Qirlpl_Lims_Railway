import { writeFileSync } from 'node:fs'

const rows = [
  [1, 'CHEMICAL- BUILDING MATERIAL', 'Fine & Coarse Aggregates', 'Organic Impurities', 'IS 2386 (Part 2)'],
  [2, 'CHEMICAL- BUILDING MATERIAL', 'Fine & Coarse Aggregates', 'Sulphate (SO3)', 'IS 4032'],
  [3, 'CHEMICAL- BUILDING MATERIAL', 'Fine & Coarse Aggregates', 'Water Soluble Chloride (Cl)', 'IS 14959 (Part 2)'],
  [4, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Bismuth (Bi)', 'ASTM E1251'],
  [5, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Boron (B)', 'ASTM E1251'],
  [6, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Chromium (Cr)', 'ASTM E1251'],
  [7, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Copper (Cu)', 'ASTM E1251'],
  [8, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Galium (Ga)', 'ASTM E1251'],
  [9, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Iron (Fe)', 'ASTM E1251'],
  [10, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Lead (Pb)', 'ASTM E1251'],
  [11, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Magenisum (Mg)', 'ASTM E1251'],
  [12, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Manganese (Mn)', 'ASTM E1251'],
  [13, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Nickel (Ni)', 'ASTM E1251'],
  [14, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Silicon (Si)', 'ASTM E1251'],
  [15, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Titanium (Ti)', 'ASTM E1251'],
  [16, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Vanadium (V)', 'ASTM E1251'],
  [17, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Zinc (Zn)', 'ASTM E1251'],
  [18, 'CHEMICAL- METALS & ALLOYS', 'Aluminium & its alloys', 'Zirconium (Zr)', 'ASTM E1251'],
  [19, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Aluminium (Al)', 'IS 8811'],
  [20, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Carbon (C)', 'IS 228 (Part 1)'],
  [21, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Carbon (C)', 'IS 8811'],
  [22, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Chromium (Cr)', 'IS 8811'],
  [23, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Copper (Cu)', 'IS 8811'],
  [24, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Manganese (Mn)', 'IS 228 (Part 2)'],
  [25, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Manganese (Mn)', 'IS 8811'],
  [26, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Molybdenum (Mo)', 'IS 8811'],
  [27, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Nickel (Ni)', 'IS 8811'],
  [28, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Nitrogen (N)', 'ASTM E415'],
  [29, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Phosphorus (P)', 'IS 228 (Part 3)'],
  [30, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Phosphorus (P)', 'IS 8811'],
  [31, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Silicon (Si)', 'IS 228 (Part 9)'],
  [32, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Silicon (Si)', 'IS 8811'],
  [33, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Sulphur (S)', 'IS 228 (Part 8)'],
  [34, 'CHEMICAL- METALS & ALLOYS', 'Carbon Steel', 'Sulphur (S)', 'IS 8811'],
  [35, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Aluminium (Al)', 'BS EN 15079'],
  [36, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Antimony (Sb)', 'BS EN 15079'],
  [37, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Arsenic (As)', 'BS EN 15079'],
  [38, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Bismuth (Bi)', 'BS EN 15079'],
  [39, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Iron (Fe)', 'BS EN 15079'],
  [40, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Lead (Pb)', 'BS EN 15079'],
  [41, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Manganese (Mn)', 'BS EN 15079'],
  [42, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Nickel (Ni)', 'BS EN 15079'],
  [43, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Phosphorous (P)', 'BS EN 15079'],
  [44, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Silicon (Si)', 'BS EN 15079'],
  [45, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Sulphur (S)', 'BS EN 15079'],
  [46, 'CHEMICAL- METALS & ALLOYS', 'Copper', 'Zinc (Zn)', 'BS EN 15079'],
  [47, 'CHEMICAL- METALS & ALLOYS', 'Ferro Manganense', 'Carbon', 'IS 1559'],
  [48, 'CHEMICAL- METALS & ALLOYS', 'Ferro Manganese', 'Manganese', 'IS 1559'],
  [49, 'CHEMICAL- METALS & ALLOYS', 'Ferro Manganese', 'Phosphorus', 'IS 1559'],
  [50, 'CHEMICAL- METALS & ALLOYS', 'Ferro Manganese', 'Silicon', 'IS 1559'],
  [51, 'CHEMICAL- METALS & ALLOYS', 'Ferro Manganese', 'Sulphur', 'IS 1559'],
  [52, 'CHEMICAL- METALS & ALLOYS', 'Ferro Silicon', 'Carbon', 'IS 1559'],
  [53, 'CHEMICAL- METALS & ALLOYS', 'Ferro Silicon', 'Silicon', 'IS 1559'],
  [54, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Carbon (C)', 'IS 228 (Part 1)'],
  [55, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Carbon (C)', 'IS 9879'],
  [56, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Chromium (Cr)', 'IS 9879'],
  [57, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Copper (Cu)', 'IS 9879'],
  [58, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Manganese (Mn)', 'IS 228 (Part 2)'],
  [59, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Manganese (Mn)', 'IS 9879'],
  [60, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Molybdenum (Mo)', 'IS 9879'],
  [61, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Nickel (Ni)', 'IS 9879'],
  [62, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Phosphorous (P)', 'IS 9879'],
  [63, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Phosphorus (P)', 'IS 228 (Part 3)'],
  [64, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Silicon (Si)', 'IS 228 (Part 8)'],
  [65, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Silicon (Si)', 'IS 9879'],
  [66, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Sulphur (S)', 'IS 228 (Part 9)'],
  [67, 'CHEMICAL- METALS & ALLOYS', 'Stainless Steel', 'Sulphur (S)', 'IS 9879'],
  [68, 'CHEMICAL- METALS & ALLOYS', 'Zinc', 'Aluminium (Al)', 'ISO 3815-1'],
  [69, 'CHEMICAL- METALS & ALLOYS', 'Zinc', 'Cadmium (Cd)', 'ISO 3815-1'],
  [70, 'CHEMICAL- METALS & ALLOYS', 'Zinc', 'Copper (Cu)', 'ISO 3815-1'],
  [71, 'CHEMICAL- METALS & ALLOYS', 'Zinc', 'Iron (Fe)', 'ISO 3815-1'],
  [72, 'CHEMICAL- METALS & ALLOYS', 'Zinc', 'Lead (Pb)', 'ISO 3815-1'],
  [73, 'CHEMICAL- METALS & ALLOYS', 'Zinc', 'Mangnesium (Mg)', 'ISO 3815-1'],
  [74, 'CHEMICAL- METALS & ALLOYS', 'Zinc', 'Tin (Sn)', 'ISO 3815-1'],
  [75, 'CHEMICAL- SOLID FUELS', 'Coal', 'Ash Content', 'IS 1350 (Part 1)'],
  [76, 'CHEMICAL- SOLID FUELS', 'Coal', 'Fixed Carbon', 'IS 1350 (Part 1)'],
  [77, 'CHEMICAL- SOLID FUELS', 'Coal', 'Sulphur', 'IS 1350 (Part 3)'],
  [78, 'CHEMICAL- SOLID FUELS', 'Coal', 'Surface Moisture', 'IS 1350 (Part 1)'],
  [79, 'CHEMICAL- SOLID FUELS', 'Coal', 'Volatile Matter', 'IS 1350 (Part 1)'],
  [80, 'CHEMICAL- WATER', 'Construction Water', 'Chloride', 'IS 3025 (Part 32)'],
  [81, 'CHEMICAL- WATER', 'Construction Water', 'Inorganic Solids', 'IS 3025 (Part 18)'],
  [82, 'CHEMICAL- WATER', 'Construction Water', 'Organic Solids', 'IS 3025 (Part 18)'],
  [83, 'CHEMICAL- WATER', 'Construction Water', 'pH', 'IS 3025 (Part 11)'],
  [84, 'CHEMICAL- WATER', 'Construction Water', 'Sulphate', 'IS 3025 (Part 24/ Sec 1)'],
  [85, 'CHEMICAL- WATER', 'Construction Water', 'Suspended Matter', 'IS 3025 (Part 17)'],
  [86, 'CHEMICAL- WATER', 'Construction Water', 'Volume of 0.02N H2SO4 required to Neutralize 100 ml of sample of Water using Mixed Indicator', 'IS 3025 (Part 23)'],
  [87, 'CHEMICAL- WATER', 'Construction Water', 'Volume of 0.02N NaOH required to Neutralize 100 ml of sample of Water using Phenolphthalein as an indicator', 'IS 3025 (Part 22)'],
  [88, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', '10 % Fines Value', 'IS 2386 (Part 4)'],
  [89, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Bulk Density', 'IS 2386 (Part 3)'],
  [90, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Crushing Value', 'IS 2386 (Part 4)'],
  [91, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Elongation Index', 'IS 2386 (Part 1)'],
  [92, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Flakiness Index', 'IS 2386 (Part 1)'],
  [93, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Impact Value', 'IS 2386 (Part 4)'],
  [94, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Los Angeles Abrasion Test', 'IS 2386 (Part 4)'],
  [95, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Sieve Analysis (Sieve Size: 80 mm to 2.36 mm)', 'IS 2386 (Part 1)'],
  [96, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Soundness Test (by Sodium Sulphate)', 'IS 2386 (Part 5)'],
  [97, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Specific Gravity', 'IS 2386 (Part 3)'],
  [98, 'MECHANICAL- BUILDINGS MATERIALS', 'Coarse Aggregates', 'Water Absorption', 'IS 2386 (Part 3)'],
  [99, 'MECHANICAL- BUILDINGS MATERIALS', 'Fine Aggregates', 'Bulk Density', 'IS 2386 (Part 3)'],
  [100, 'MECHANICAL- BUILDINGS MATERIALS', 'Fine Aggregates', 'Sieve Analysis (Sieve Size: 10 mm to 150 micron)', 'IS 2386 (Part 1)'],
  [101, 'MECHANICAL- BUILDINGS MATERIALS', 'Fine Aggregates', 'Soundness Test (by Sodium Sulphate)', 'IS 2386 (Part 5)'],
  [102, 'MECHANICAL- BUILDINGS MATERIALS', 'Fine Aggregates', 'Specific Gravity', 'IS 2386 (Part 3)'],
  [103, 'MECHANICAL- BUILDINGS MATERIALS', 'Fine Aggregates', 'Water Absorption', 'IS 2386 (Part 3)'],
  [104, 'MECHANICAL- BUILDINGS MATERIALS', 'Hardened Concrete (Cube)', 'Compressive Strength', 'IS 516 (Part 1/ Sec 1)'],
  [105, 'MECHANICAL- BUILDINGS MATERIALS', 'Paver Blocks', 'Compressive Strength', 'IS 15658'],
  [106, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', '% Elongation', 'IS 1608 (Part 1)'],
  [107, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', '% Total Elongation at Maximum Force', 'IS 1608 (Part 1)'],
  [108, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', '0.2% Proof Stress', 'IS 1608 (Part 1)'],
  [109, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', 'Reduction in Area', 'IS 1608 (Part 1)'],
  [110, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', 'Rockwell Hardness (HRBW)', 'IS 1586 (Part 1)'],
  [111, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', 'Rockwell Hardness (HRC)', 'IS 1586 (Part 1)'],
  [112, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', 'Tensile Strength', 'IS 1608 (Part 1)'],
  [113, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Ferrous Materials, Alloys & Products', 'Yield Strength', 'IS 1608 (Part 1)'],
  [114, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'High Strength Deformed Steel Bars and Wires', 'Mass', 'IS 1786'],
  [115, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'High Strength Deformed Steel Bars and Wires', 'Re-bend Test', 'IS 1786'],
  [116, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Metallic Material', 'Bend Test', 'IS 1599'],
  [117, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Metallic Material', 'Tube Flattening Test', 'IS 2328'],
  [118, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Metallic Material', 'Wire Torsion Test', 'IS 1717'],
  [119, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Metallic Material', 'Wire Wrapping Test', 'IS 1755'],
  [120, 'MECHANICAL- MECHANICAL PROPERTIES OF METALS', 'Metallic Tubes', 'Drift Expansion Test', 'IS 2335'],
]

const esc = (s) => s.replace(/'/g, "''")
const values = rows
  .map(
    (r) =>
      `(${r[0]}, '${esc(r[1])}', '${esc(r[2])}', '${esc(r[3])}', '${esc(r[4])}', 'Permanent Testing')`,
  )
  .join(',\n')

const sql = `-- Generated from NABL Scope certificate TC-15442
DROP POLICY IF EXISTS lims_product_services_authenticated_all ON public.product_services;
DROP POLICY IF EXISTS lims_product_service_master_options_authenticated_all ON public.product_service_master_options;
DROP TABLE IF EXISTS public.product_service_master_options;
DROP TABLE IF EXISTS public.product_services;

CREATE TABLE public.nabl_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  s_no integer NOT NULL,
  discipline_group text NOT NULL,
  materials_products text NOT NULL,
  component_parameter text NOT NULL,
  test_method_specification text NOT NULL,
  permanent_testing text NOT NULL DEFAULT 'Permanent Testing',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_nabl_scope_s_no ON public.nabl_scope(s_no);
CREATE INDEX idx_nabl_scope_discipline ON public.nabl_scope(discipline_group);
CREATE INDEX idx_nabl_scope_materials ON public.nabl_scope(materials_products);
CREATE TRIGGER trg_nabl_scope_updated_at BEFORE UPDATE ON public.nabl_scope
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nabl_scope ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lims_nabl_scope_authenticated_all ON public.nabl_scope;
CREATE POLICY lims_nabl_scope_authenticated_all ON public.nabl_scope
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.nabl_scope (s_no, discipline_group, materials_products, component_parameter, test_method_specification, permanent_testing)
VALUES
${values};
`

writeFileSync(new URL('../supabase/migrations/20260531140000_nabl_scope.sql', import.meta.url), sql)
console.log(`Wrote migration with ${rows.length} rows`)

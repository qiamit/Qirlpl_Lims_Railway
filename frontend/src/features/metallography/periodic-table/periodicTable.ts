/**
 * Periodic table reference data and helpers (S6). Static data only: no database, no network.
 * Ported from the old Metallurgy Software (`lib/periodicTable.ts`). Element data is unchanged;
 * the helpers add the LIMS routes and the `?temp` parsing (a missing value means 27 °C).
 */

export type ElementCategory =
  | 'alkali-metal'
  | 'alkaline-earth'
  | 'transition-metal'
  | 'post-transition'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble-gas'
  | 'lanthanide'
  | 'actinide'
  | 'unknown'

export type ElementPhase = 'solid' | 'liquid' | 'gas' | 'unknown'
export type ElementBlock = 's' | 'p' | 'd' | 'f'
export type TempUnit = 'C' | 'F' | 'K'

export type PeriodicElement = {
  number: number
  symbol: string
  name: string
  /** Standard atomic weight as printed; "(98)" style for the most stable isotope. */
  mass: string
  category: ElementCategory
  period: number
  group: number
  block: ElementBlock
  /** Phase at room temperature, as tabulated. */
  phase: ElementPhase
  electronConfiguration: string
  electronegativity: number | null
  meltingPointC: number | null
  boilingPointC: number | null
  /** g/cm³ */
  density: number | null
  discovered: string
  metallurgyNote: string
  /** 1–7 main table, 8 lanthanoids, 9 actinoids. */
  gridRow: number
  gridCol: number
}

export const PERIODIC_TABLE_ROUTE = '/metallography/periodic-table'

/** Room temperature used by the lab (and the default when `?temp` is missing). */
export const STP_TEMP_C = 27
/** Slider range in °C. */
export const TEMP_MIN_C = -273
export const TEMP_MAX_C = 6000

export const CATEGORY_LABELS: Record<ElementCategory, string> = {
  'alkali-metal': 'Alkali metals',
  'alkaline-earth': 'Alkaline earth metals',
  'transition-metal': 'Transition metals',
  'post-transition': 'Post-transition metals',
  metalloid: 'Metalloids',
  nonmetal: 'Nonmetals',
  halogen: 'Halogens',
  'noble-gas': 'Noble gases',
  lanthanide: 'Lanthanoids',
  actinide: 'Actinoids',
  unknown: 'Unknown',
}

/** Hero colour of the detail sheet and spotlight (dark text is always used on top). */
export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  'alkali-metal': '#f87171',
  'alkaline-earth': '#fb923c',
  'transition-metal': '#facc15',
  'post-transition': '#a3e635',
  metalloid: '#4ade80',
  nonmetal: '#2dd4bf',
  halogen: '#38bdf8',
  'noble-gas': '#818cf8',
  lanthanide: '#c084fc',
  actinide: '#f472b6',
  unknown: '#94a3b8',
}

export const PHASE_LABELS: Record<ElementPhase, string> = {
  solid: 'Solid',
  liquid: 'Liquid',
  gas: 'Gas',
  unknown: 'Unknown',
}

export const PHASE_MARKERS: Record<ElementPhase, string> = {
  solid: 'S',
  liquid: 'L',
  gas: 'G',
  unknown: '?',
}

/** Tile colours by phase. Light fills with dark text, so they read the same in every LIMS theme. */
export const PHASE_STYLES: Record<ElementPhase, { border: string; fill: string }> = {
  solid: { border: '#57534e', fill: '#d6d3d1' },
  liquid: { border: '#2563eb', fill: '#93c5fd' },
  gas: { border: '#7c3aed', fill: '#c4b5fd' },
  unknown: { border: '#a8a29e', fill: '#f5f5f4' },
}

/** Lanthanoids (57–71) sit in row 8 and actinoids (89–103) in row 9; the rest at period / group. */
function gridPos(number: number, period: number, group: number): { gridRow: number; gridCol: number } {
  if (number >= 57 && number <= 71) return { gridRow: 8, gridCol: number - 57 + 3 }
  if (number >= 89 && number <= 103) return { gridRow: 9, gridCol: number - 89 + 3 }
  return { gridRow: period, gridCol: group }
}

type RawElement = [
  number: number,
  symbol: string,
  name: string,
  mass: string,
  category: ElementCategory,
  period: number,
  group: number,
  block: ElementBlock,
  phase: ElementPhase,
  electronConfiguration: string,
  electronegativity: number | null,
  meltingPointC: number | null,
  boilingPointC: number | null,
  density: number | null,
  discovered: string,
  metallurgyNote: string,
]

const RAW: RawElement[] = [
  [1, 'H', 'Hydrogen', '1.008', 'nonmetal', 1, 1, 's', 'gas', '1s¹', 2.2, -259, -253, 0.0000899, '1766', 'Used in annealing atmospheres and reducing environments in heat treatment.'],
  [2, 'He', 'Helium', '4.0026', 'noble-gas', 1, 18, 's', 'gas', '1s²', null, -272, -269, 0.0001785, '1868', 'Inert shielding gas for welding and thermal analysis.'],
  [3, 'Li', 'Lithium', '6.94', 'alkali-metal', 2, 1, 's', 'solid', '[He] 2s¹', 0.98, 181, 1342, 0.534, '1817', 'Al-Li alloys for lightweight aerospace structures.'],
  [4, 'Be', 'Beryllium', '9.0122', 'alkaline-earth', 2, 2, 's', 'solid', '[He] 2s²', 1.57, 1287, 2471, 1.85, '1798', 'Cu-Be alloys for high-strength tooling and molds.'],
  [5, 'B', 'Boron', '10.81', 'metalloid', 2, 13, 'p', 'solid', '[He] 2s² 2p¹', 2.04, 2076, 3927, 2.34, '1808', 'Boronizing surface treatment for wear resistance.'],
  [6, 'C', 'Carbon', '12.011', 'nonmetal', 2, 14, 'p', 'solid', '[He] 2s² 2p²', 2.55, 3550, 4027, 2.267, 'Ancient', 'Central to all steels, cast irons, and carbide phases in metallography.'],
  [7, 'N', 'Nitrogen', '14.007', 'nonmetal', 2, 15, 'p', 'gas', '[He] 2s² 2p³', 3.04, -210, -196, 0.001251, '1772', 'Nitriding and nitrocarburizing surface hardening processes.'],
  [8, 'O', 'Oxygen', '15.999', 'nonmetal', 2, 16, 'p', 'gas', '[He] 2s² 2p⁴', 3.44, -218, -183, 0.001429, '1774', 'Oxidation reactions; oxide inclusions in steel cleanliness studies.'],
  [9, 'F', 'Fluorine', '18.998', 'halogen', 2, 17, 'p', 'gas', '[He] 2s² 2p⁵', 3.98, -220, -188, 0.001696, '1886', 'Fluxes in aluminum and magnesium metallurgy.'],
  [10, 'Ne', 'Neon', '20.180', 'noble-gas', 2, 18, 'p', 'gas', '[He] 2s² 2p⁶', null, -249, -246, 0.0009, '1898', 'Inert atmosphere applications in specialized labs.'],
  [11, 'Na', 'Sodium', '22.990', 'alkali-metal', 3, 1, 's', 'solid', '[Ne] 3s¹', 0.93, 98, 883, 0.968, '1807', 'Used in molten salt heat-treatment baths.'],
  [12, 'Mg', 'Magnesium', '24.305', 'alkaline-earth', 3, 2, 's', 'solid', '[Ne] 3s²', 1.31, 650, 1090, 1.738, '1755', 'Lightweight alloys; common inclusion in Al-Mg systems.'],
  [13, 'Al', 'Aluminium', '26.982', 'post-transition', 3, 13, 'p', 'solid', '[Ne] 3s² 3p¹', 1.61, 660, 2519, 2.7, '1825', 'Widely used structural metal; critical in casting and rolling analysis.'],
  [14, 'Si', 'Silicon', '28.085', 'metalloid', 3, 14, 'p', 'solid', '[Ne] 3s² 3p²', 1.9, 1414, 3265, 2.33, '1824', 'Deoxidizer in steelmaking; silicon steels for electrical applications.'],
  [15, 'P', 'Phosphorus', '30.974', 'nonmetal', 3, 15, 'p', 'solid', '[Ne] 3s² 3p³', 2.19, 44, 280, 1.82, '1669', 'Tramp element in steel; forms brittle phosphides.'],
  [16, 'S', 'Sulfur', '32.06', 'nonmetal', 3, 16, 'p', 'solid', '[Ne] 3s² 3p⁴', 2.58, 115, 445, 2.07, 'Ancient', 'Forms MnS inclusions; affects machinability and corrosion.'],
  [17, 'Cl', 'Chlorine', '35.45', 'halogen', 3, 17, 'p', 'gas', '[Ne] 3s² 3p⁵', 3.16, -102, -34, 0.003214, '1774', 'Used in pickling and surface cleaning of metals.'],
  [18, 'Ar', 'Argon', '39.948', 'noble-gas', 3, 18, 'p', 'gas', '[Ne] 3s² 3p⁶', null, -189, -186, 0.001784, '1894', 'Primary shielding gas for TIG/MIG welding and atomization.'],
  [19, 'K', 'Potassium', '39.098', 'alkali-metal', 4, 1, 's', 'solid', '[Ar] 4s¹', 0.82, 63, 759, 0.862, '1807', 'Minor role in specialized flux formulations.'],
  [20, 'Ca', 'Calcium', '40.078', 'alkaline-earth', 4, 2, 's', 'solid', '[Ar] 4s²', 1, 842, 1484, 1.55, '1808', 'Ca-treated steel for inclusion shape control.'],
  [21, 'Sc', 'Scandium', '44.956', 'transition-metal', 4, 3, 'd', 'solid', '[Ar] 3d¹ 4s²', 1.36, 1541, 2836, 2.989, '1879', 'Al-Sc grain refinement in high-performance alloys.'],
  [22, 'Ti', 'Titanium', '47.867', 'transition-metal', 4, 4, 'd', 'solid', '[Ar] 3d² 4s²', 1.54, 1668, 3287, 4.54, '1791', 'Aerospace alloys; nitrides and carbides in microstructure.'],
  [23, 'V', 'Vanadium', '50.942', 'transition-metal', 4, 5, 'd', 'solid', '[Ar] 3d³ 4s²', 1.63, 1910, 3407, 6.11, '1801', 'Microalloying element; forms V(C,N) precipitates in HSLA steel.'],
  [24, 'Cr', 'Chromium', '51.996', 'transition-metal', 4, 6, 'd', 'solid', '[Ar] 3d⁵ 4s¹', 1.66, 1907, 2671, 7.19, '1797', 'Stainless and tool steels; carbides Cr₇C₃ and Cr₂₃C₆.'],
  [25, 'Mn', 'Manganese', '54.938', 'transition-metal', 4, 7, 'd', 'solid', '[Ar] 3d⁵ 4s²', 1.55, 1246, 2061, 7.21, '1774', 'Essential deoxidizer and alloying element in all commercial steels.'],
  [26, 'Fe', 'Iron', '55.845', 'transition-metal', 4, 8, 'd', 'solid', '[Ar] 3d⁶ 4s²', 1.83, 1538, 2862, 7.874, 'Ancient', 'Foundation of metallography — ferrite, pearlite, martensite, bainite.'],
  [27, 'Co', 'Cobalt', '58.933', 'transition-metal', 4, 9, 'd', 'solid', '[Ar] 3d⁷ 4s²', 1.88, 1495, 2927, 8.86, '1735', 'Superalloys, hard-facing, and magnetic materials.'],
  [28, 'Ni', 'Nickel', '58.693', 'transition-metal', 4, 10, 'd', 'solid', '[Ar] 3d⁸ 4s²', 1.91, 1455, 2913, 8.912, '1751', 'Stainless steels, Ni-base superalloys, and plating.'],
  [29, 'Cu', 'Copper', '63.546', 'transition-metal', 4, 11, 'd', 'solid', '[Ar] 3d¹⁰ 4s¹', 1.9, 1085, 2562, 8.96, 'Ancient', 'Electrical conductors; Cu inclusions and brass microstructures.'],
  [30, 'Zn', 'Zinc', '65.38', 'transition-metal', 4, 12, 'd', 'solid', '[Ar] 3d¹⁰ 4s²', 1.65, 420, 907, 7.14, '1746', 'Galvanizing protection; Zn-Al coatings.'],
  [31, 'Ga', 'Gallium', '69.723', 'post-transition', 4, 13, 'p', 'solid', '[Ar] 3d¹⁰ 4s² 4p¹', 1.81, 30, 2403, 5.904, '1875', 'Low-melting solders and semiconductor metallization.'],
  [32, 'Ge', 'Germanium', '72.630', 'metalloid', 4, 14, 'p', 'solid', '[Ar] 3d¹⁰ 4s² 4p²', 2.01, 938, 2833, 5.323, '1886', 'Alloying in specialty steels and electronics.'],
  [33, 'As', 'Arsenic', '74.922', 'metalloid', 4, 15, 'p', 'solid', '[Ar] 3d¹⁰ 4s² 4p³', 2.18, 817, 614, 5.727, 'Ancient', 'Tramp element; free-machining steels (limited use).'],
  [34, 'Se', 'Selenium', '78.971', 'nonmetal', 4, 16, 'p', 'solid', '[Ar] 3d¹⁰ 4s² 4p⁴', 2.55, 221, 685, 4.809, '1817', 'Free-machining additive in steels.'],
  [35, 'Br', 'Bromine', '79.904', 'halogen', 4, 17, 'p', 'liquid', '[Ar] 3d¹⁰ 4s² 4p⁵', 2.96, -7, 59, 3.102, '1826', 'Limited use in metal surface treatments.'],
  [36, 'Kr', 'Krypton', '83.798', 'noble-gas', 4, 18, 'p', 'gas', '[Ar] 3d¹⁰ 4s² 4p⁶', 3, -157, -153, 0.003733, '1898', 'Specialized lighting and ion-beam applications.'],
  [37, 'Rb', 'Rubidium', '85.468', 'alkali-metal', 5, 1, 's', 'solid', '[Kr] 5s¹', 0.82, 39, 688, 1.532, '1861', 'No major metallurgical use.'],
  [38, 'Sr', 'Strontium', '87.62', 'alkaline-earth', 5, 2, 's', 'solid', '[Kr] 5s²', 0.95, 777, 1382, 2.64, '1790', 'Minor modifier in aluminum alloys.'],
  [39, 'Y', 'Yttrium', '88.906', 'transition-metal', 5, 3, 'd', 'solid', '[Kr] 4d¹ 5s²', 1.22, 1526, 3345, 4.472, '1794', 'Grain refinement in magnesium and superalloys.'],
  [40, 'Zr', 'Zirconium', '91.224', 'transition-metal', 5, 4, 'd', 'solid', '[Kr] 4d² 5s²', 1.33, 1855, 4409, 6.52, '1789', 'Nuclear and corrosion-resistant alloys; Zr inclusions in steel.'],
  [41, 'Nb', 'Niobium', '92.906', 'transition-metal', 5, 5, 'd', 'solid', '[Kr] 4d⁴ 5s¹', 1.6, 2477, 4744, 8.57, '1801', 'Microalloying in HSLA steel; Nb(C,N) precipitation strengthening.'],
  [42, 'Mo', 'Molybdenum', '95.95', 'transition-metal', 5, 6, 'd', 'solid', '[Kr] 4d⁵ 5s¹', 2.16, 2623, 4639, 10.28, '1781', 'Heat-resistant and tool steels; carbides Mo₂C.'],
  [43, 'Tc', 'Technetium', '(98)', 'transition-metal', 5, 7, 'd', 'solid', '[Kr] 4d⁵ 5s²', 1.9, 2157, 4265, 11, '1937', 'Radioactive; no commercial metallurgical use.'],
  [44, 'Ru', 'Ruthenium', '101.07', 'transition-metal', 5, 8, 'd', 'solid', '[Kr] 4d⁷ 5s¹', 2.2, 2334, 4150, 12.45, '1844', 'Hardness additive in platinum-group alloys.'],
  [45, 'Rh', 'Rhodium', '102.91', 'transition-metal', 5, 9, 'd', 'solid', '[Kr] 4d⁸ 5s¹', 2.28, 1964, 3695, 12.41, '1803', 'Catalytic and high-temperature coatings.'],
  [46, 'Pd', 'Palladium', '106.42', 'transition-metal', 5, 10, 'd', 'solid', '[Kr] 4d¹⁰', 2.2, 1555, 2963, 12.023, '1803', 'Hydrogen storage alloys and brazing.'],
  [47, 'Ag', 'Silver', '107.87', 'transition-metal', 5, 11, 'd', 'solid', '[Kr] 4d¹⁰ 5s¹', 1.93, 962, 2162, 10.49, 'Ancient', 'Brazing alloys, electrical contacts, and plating.'],
  [48, 'Cd', 'Cadmium', '112.41', 'transition-metal', 5, 12, 'd', 'solid', '[Kr] 4d¹⁰ 5s²', 1.69, 321, 767, 8.69, '1817', 'Corrosion-resistant plating (being phased out).'],
  [49, 'In', 'Indium', '114.82', 'post-transition', 5, 13, 'p', 'solid', '[Kr] 4d¹⁰ 5s² 5p¹', 1.78, 157, 2072, 7.31, '1863', 'Low-melting solders and ITO coatings.'],
  [50, 'Sn', 'Tin', '118.71', 'post-transition', 5, 14, 'p', 'solid', '[Kr] 4d¹⁰ 5s² 5p²', 1.96, 232, 2602, 7.287, 'Ancient', 'Tin plating, bronzes, and lead-free solders.'],
  [51, 'Sb', 'Antimony', '121.76', 'metalloid', 5, 15, 'p', 'solid', '[Kr] 4d¹⁰ 5s² 5p³', 2.05, 631, 1587, 6.685, 'Ancient', 'Free-machining steels and bearing alloys.'],
  [52, 'Te', 'Tellurium', '127.60', 'metalloid', 5, 16, 'p', 'solid', '[Kr] 4d¹⁰ 5s² 5p⁴', 2.1, 450, 988, 6.232, '1782', 'Machinability additive in steels.'],
  [53, 'I', 'Iodine', '126.90', 'halogen', 5, 17, 'p', 'solid', '[Kr] 4d¹⁰ 5s² 5p⁵', 2.66, 114, 184, 4.93, '1811', 'Limited analytical applications.'],
  [54, 'Xe', 'Xenon', '131.29', 'noble-gas', 5, 18, 'p', 'gas', '[Kr] 4d¹⁰ 5s² 5p⁶', 2.6, -112, -108, 0.005887, '1898', 'Specialized ion sources.'],
  [55, 'Cs', 'Caesium', '132.91', 'alkali-metal', 6, 1, 's', 'solid', '[Xe] 6s¹', 0.79, 28, 671, 1.873, '1860', 'No major metallurgical use.'],
  [56, 'Ba', 'Barium', '137.33', 'alkaline-earth', 6, 2, 's', 'solid', '[Xe] 6s²', 0.89, 727, 1897, 3.594, '1808', 'Deoxidizer and inclusion modifier in steel.'],
  [57, 'La', 'Lanthanum', '138.91', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 5d¹ 6s²', 1.1, 920, 3464, 6.145, '1839', 'Nodularizing and desulfurization in cast iron.'],
  [58, 'Ce', 'Cerium', '140.12', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f¹ 5d¹ 6s²', 1.12, 795, 3443, 6.77, '1803', 'Rare-earth treatment for sulfide shape control.'],
  [59, 'Pr', 'Praseodymium', '140.91', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f³ 6s²', 1.13, 931, 3520, 6.773, '1885', 'Magnesium alloy grain refinement.'],
  [60, 'Nd', 'Neodymium', '144.24', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f⁴ 6s²', 1.14, 1021, 3074, 7.007, '1885', 'High-strength Nd-Fe-B magnets.'],
  [61, 'Pm', 'Promethium', '(145)', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f⁵ 6s²', 1.13, 1042, 3000, 7.26, '1945', 'Radioactive; no commercial metallurgical use.'],
  [62, 'Sm', 'Samarium', '150.36', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f⁶ 6s²', 1.17, 1074, 1794, 7.52, '1879', 'Sm-Co permanent magnets.'],
  [63, 'Eu', 'Europium', '151.96', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f⁷ 6s²', 1.2, 822, 1527, 5.244, '1901', 'Phosphors; limited metallurgical role.'],
  [64, 'Gd', 'Gadolinium', '157.25', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f⁷ 5d¹ 6s²', 1.2, 1313, 3273, 7.895, '1880', 'Neutron absorption in nuclear alloys.'],
  [65, 'Tb', 'Terbium', '158.93', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f⁹ 6s²', 1.1, 1356, 3230, 8.229, '1843', 'Magnetostrictive alloys (Terfenol-D).'],
  [66, 'Dy', 'Dysprosium', '162.50', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f¹⁰ 6s²', 1.22, 1412, 2567, 8.55, '1886', 'High-temperature Nd-Fe-B magnet additive.'],
  [67, 'Ho', 'Holmium', '164.93', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f¹¹ 6s²', 1.23, 1474, 2700, 8.795, '1878', 'Magnetic pole pieces in research.'],
  [68, 'Er', 'Erbium', '167.26', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f¹² 6s²', 1.24, 1529, 2868, 9.066, '1843', 'Aluminum alloy grain control.'],
  [69, 'Tm', 'Thulium', '168.93', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f¹³ 6s²', 1.25, 1545, 1950, 9.321, '1879', 'Specialized high-temperature applications.'],
  [70, 'Yb', 'Ytterbium', '173.05', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f¹⁴ 6s²', 1.1, 819, 1196, 6.965, '1878', 'Stress measurement in alloys.'],
  [71, 'Lu', 'Lutetium', '174.97', 'lanthanide', 6, 3, 'f', 'solid', '[Xe] 4f¹⁴ 5d¹ 6s²', 1.27, 1663, 3402, 9.841, '1907', 'Single-crystal superalloy research.'],
  [72, 'Hf', 'Hafnium', '178.49', 'transition-metal', 6, 4, 'd', 'solid', '[Xe] 4f¹⁴ 5d² 6s²', 1.3, 2233, 4603, 13.31, '1923', 'Nuclear control rods and superalloy grain-boundary control.'],
  [73, 'Ta', 'Tantalum', '180.95', 'transition-metal', 6, 5, 'd', 'solid', '[Xe] 4f¹⁴ 5d³ 6s²', 1.5, 3017, 5458, 16.69, '1802', 'Capacitors, chemical processing, and carbide tools.'],
  [74, 'W', 'Tungsten', '183.84', 'transition-metal', 6, 6, 'd', 'solid', '[Xe] 4f¹⁴ 5d⁴ 6s²', 2.36, 3422, 5555, 19.25, '1783', 'High-speed tool steels, hard carbides, and refractory alloys.'],
  [75, 'Re', 'Rhenium', '186.21', 'transition-metal', 6, 7, 'd', 'solid', '[Xe] 4f¹⁴ 5d⁵ 6s²', 1.9, 3186, 5596, 21.02, '1925', 'Single-crystal superalloy strengthening.'],
  [76, 'Os', 'Osmium', '190.23', 'transition-metal', 6, 8, 'd', 'solid', '[Xe] 4f¹⁴ 5d⁶ 6s²', 2.2, 3033, 5012, 22.59, '1803', 'Hardest platinum-group metal; instrument pivots.'],
  [77, 'Ir', 'Iridium', '192.22', 'transition-metal', 6, 9, 'd', 'solid', '[Xe] 4f¹⁴ 5d⁷ 6s²', 2.2, 2466, 4428, 22.56, '1803', 'High-temperature crucibles and spark plugs.'],
  [78, 'Pt', 'Platinum', '195.08', 'transition-metal', 6, 10, 'd', 'solid', '[Xe] 4f¹⁴ 5d⁹', 2.28, 1768, 3825, 21.45, '1735', 'Catalysts, thermocouples, and lab crucibles.'],
  [79, 'Au', 'Gold', '196.97', 'transition-metal', 6, 11, 'd', 'solid', '[Xe] 4f¹⁴ 5d¹⁰ 6s¹', 2.54, 1064, 2856, 19.32, 'Ancient', 'Electronics plating, brazing, and dental alloys.'],
  [80, 'Hg', 'Mercury', '200.59', 'transition-metal', 6, 12, 'd', 'liquid', '[Xe] 4f¹⁴ 5d¹⁰ 6s²', 2, -39, 357, 13.534, 'Ancient', 'Amalgams and historical mercury switches.'],
  [81, 'Tl', 'Thallium', '204.38', 'post-transition', 6, 13, 'p', 'solid', '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹', 1.62, 304, 1473, 11.85, '1861', 'Limited specialty alloy applications.'],
  [82, 'Pb', 'Lead', '207.2', 'post-transition', 6, 14, 'p', 'solid', '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²', 2.33, 327, 1749, 11.34, 'Ancient', 'Free-machining steels; being replaced due to toxicity.'],
  [83, 'Bi', 'Bismuth', '208.98', 'post-transition', 6, 15, 'p', 'solid', '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³', 2.02, 271, 1564, 9.78, 'Ancient', 'Low-melting fusible alloys and castings.'],
  [84, 'Po', 'Polonium', '(209)', 'metalloid', 6, 16, 'p', 'solid', '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴', 2, 254, 962, 9.196, '1898', 'Radioactive; no commercial use.'],
  [85, 'At', 'Astatine', '(210)', 'halogen', 6, 17, 'p', 'solid', '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵', 2.2, 302, 337, 7, '1940', 'Radioactive; no commercial use.'],
  [86, 'Rn', 'Radon', '(222)', 'noble-gas', 6, 18, 'p', 'gas', '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶', 2.2, -71, -62, 0.00973, '1900', 'Radioactive; no metallurgical use.'],
  [87, 'Fr', 'Francium', '(223)', 'alkali-metal', 7, 1, 's', 'solid', '[Rn] 7s¹', 0.7, 27, 677, 1.87, '1939', 'Radioactive; no commercial use.'],
  [88, 'Ra', 'Radium', '(226)', 'alkaline-earth', 7, 2, 's', 'solid', '[Rn] 7s²', 0.9, 700, 1737, 5.5, '1898', 'Radioactive; no commercial use.'],
  [89, 'Ac', 'Actinium', '(227)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 6d¹ 7s²', 1.1, 1050, 3200, 10.07, '1899', 'Radioactive; research only.'],
  [90, 'Th', 'Thorium', '232.04', 'actinide', 7, 3, 'f', 'solid', '[Rn] 6d² 7s²', 1.3, 1750, 4788, 11.72, '1829', 'Nuclear and high-temperature ceramic applications.'],
  [91, 'Pa', 'Protactinium', '231.04', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f² 6d¹ 7s²', 1.5, 1572, 4000, 15.37, '1913', 'Radioactive; research only.'],
  [92, 'U', 'Uranium', '238.03', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f³ 6d¹ 7s²', 1.38, 1135, 4131, 19.1, '1789', 'Nuclear fuel; high-density penetrators.'],
  [93, 'Np', 'Neptunium', '(237)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f⁴ 6d¹ 7s²', 1.36, 644, 3902, 20.45, '1940', 'Radioactive; research only.'],
  [94, 'Pu', 'Plutonium', '(244)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f⁶ 7s²', 1.28, 640, 3228, 19.84, '1940', 'Nuclear fuel and weapons research.'],
  [95, 'Am', 'Americium', '(243)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f⁷ 7s²', 1.3, 1176, 2607, 13.67, '1944', 'Radioactive; research only.'],
  [96, 'Cm', 'Curium', '(247)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f⁷ 6d¹ 7s²', 1.3, 1345, 3110, 13.51, '1944', 'Radioactive; research only.'],
  [97, 'Bk', 'Berkelium', '(247)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f⁹ 7s²', 1.3, 986, 2627, 14.78, '1949', 'Radioactive; research only.'],
  [98, 'Cf', 'Californium', '(251)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f¹⁰ 7s²', 1.3, 900, 1470, 15.1, '1950', 'Radioactive; neutron source research.'],
  [99, 'Es', 'Einsteinium', '(252)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f¹¹ 7s²', 1.3, 860, 996, 8.84, '1952', 'Radioactive; research only.'],
  [100, 'Fm', 'Fermium', '(257)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f¹² 7s²', 1.3, 1527, null, null, '1952', 'Radioactive; research only.'],
  [101, 'Md', 'Mendelevium', '(258)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f¹³ 7s²', 1.3, 827, null, null, '1955', 'Radioactive; research only.'],
  [102, 'No', 'Nobelium', '(259)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f¹⁴ 7s²', 1.3, 827, null, null, '1958', 'Radioactive; research only.'],
  [103, 'Lr', 'Lawrencium', '(266)', 'actinide', 7, 3, 'f', 'solid', '[Rn] 5f¹⁴ 7s² 7p¹', 1.3, 1627, null, null, '1961', 'Radioactive; research only.'],
  [104, 'Rf', 'Rutherfordium', '(267)', 'transition-metal', 7, 4, 'd', 'unknown', '[Rn] 5f¹⁴ 6d² 7s²', null, null, null, null, '1964', 'Synthetic superheavy element.'],
  [105, 'Db', 'Dubnium', '(268)', 'transition-metal', 7, 5, 'd', 'unknown', '[Rn] 5f¹⁴ 6d³ 7s²', null, null, null, null, '1967', 'Synthetic superheavy element.'],
  [106, 'Sg', 'Seaborgium', '(269)', 'transition-metal', 7, 6, 'd', 'unknown', '[Rn] 5f¹⁴ 6d⁴ 7s²', null, null, null, null, '1974', 'Synthetic superheavy element.'],
  [107, 'Bh', 'Bohrium', '(270)', 'transition-metal', 7, 7, 'd', 'unknown', '[Rn] 5f¹⁴ 6d⁵ 7s²', null, null, null, null, '1981', 'Synthetic superheavy element.'],
  [108, 'Hs', 'Hassium', '(277)', 'transition-metal', 7, 8, 'd', 'unknown', '[Rn] 5f¹⁴ 6d⁶ 7s²', null, null, null, null, '1984', 'Synthetic superheavy element.'],
  [109, 'Mt', 'Meitnerium', '(278)', 'unknown', 7, 9, 'd', 'unknown', '[Rn] 5f¹⁴ 6d⁷ 7s²', null, null, null, null, '1982', 'Synthetic superheavy element.'],
  [110, 'Ds', 'Darmstadtium', '(281)', 'unknown', 7, 10, 'd', 'unknown', '[Rn] 5f¹⁴ 6d⁸ 7s²', null, null, null, null, '1994', 'Synthetic superheavy element.'],
  [111, 'Rg', 'Roentgenium', '(282)', 'unknown', 7, 11, 'd', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s¹', null, null, null, null, '1994', 'Synthetic superheavy element.'],
  [112, 'Cn', 'Copernicium', '(285)', 'unknown', 7, 12, 'd', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s²', null, null, null, null, '1996', 'Synthetic superheavy element.'],
  [113, 'Nh', 'Nihonium', '(286)', 'unknown', 7, 13, 'p', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p¹', null, null, null, null, '2003', 'Synthetic superheavy element.'],
  [114, 'Fl', 'Flerovium', '(289)', 'unknown', 7, 14, 'p', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p²', null, null, null, null, '1998', 'Synthetic superheavy element.'],
  [115, 'Mc', 'Moscovium', '(290)', 'unknown', 7, 15, 'p', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p³', null, null, null, null, '2003', 'Synthetic superheavy element.'],
  [116, 'Lv', 'Livermorium', '(293)', 'unknown', 7, 16, 'p', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁴', null, null, null, null, '2000', 'Synthetic superheavy element.'],
  [117, 'Ts', 'Tennessine', '(294)', 'unknown', 7, 17, 'p', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁵', null, null, null, null, '2010', 'Synthetic superheavy element.'],
  [118, 'Og', 'Oganesson', '(294)', 'unknown', 7, 18, 'p', 'unknown', '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶', null, null, null, null, '2002', 'Synthetic superheavy element.'],
]

export const ELEMENTS: PeriodicElement[] = RAW.map((row) => ({
  number: row[0],
  symbol: row[1],
  name: row[2],
  mass: row[3],
  category: row[4],
  period: row[5],
  group: row[6],
  block: row[7],
  phase: row[8],
  electronConfiguration: row[9],
  electronegativity: row[10],
  meltingPointC: row[11],
  boilingPointC: row[12],
  density: row[13],
  discovered: row[14],
  metallurgyNote: row[15],
  ...gridPos(row[0], row[5], row[6]),
}))

export const ELEMENT_BY_NUMBER = new Map(ELEMENTS.map((el) => [el.number, el]))
/** Keyed by lower-case symbol ("fe"). */
export const ELEMENT_BY_SYMBOL = new Map(ELEMENTS.map((el) => [el.symbol.toLowerCase(), el]))

export function findElementBySymbol(symbol: string | null | undefined): PeriodicElement | null {
  if (!symbol) return null
  return ELEMENT_BY_SYMBOL.get(symbol.trim().toLowerCase()) ?? null
}

/** Name, symbol or atomic number; an empty query matches everything. */
export function searchElements(query: string): PeriodicElement[] {
  const q = query.trim().toLowerCase()
  if (!q) return ELEMENTS
  const num = Number(q)
  return ELEMENTS.filter(
    (el) =>
      el.name.toLowerCase().includes(q) ||
      el.symbol.toLowerCase().includes(q) ||
      (!Number.isNaN(num) && el.number === num) ||
      String(el.number).startsWith(q),
  )
}

export function clampTempC(tempC: number): number {
  return Math.min(TEMP_MAX_C, Math.max(TEMP_MIN_C, Math.round(tempC)))
}

/**
 * `?temp=` (°C) from the URL. Missing, empty or not a number gives 27 °C
 * (the old page read a missing value as 0 °C).
 */
export function parseTempParam(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === '') return STP_TEMP_C
  const n = Number(raw)
  return Number.isFinite(n) ? clampTempC(n) : STP_TEMP_C
}

export function periodicTableUrl(tempC: number): string {
  return tempC === STP_TEMP_C ? PERIODIC_TABLE_ROUTE : `${PERIODIC_TABLE_ROUTE}?temp=${Math.round(tempC)}`
}

export function elementDetailUrl(element: PeriodicElement, tempC: number): string {
  const params = new URLSearchParams({ temp: String(Math.round(tempC)) })
  return `${PERIODIC_TABLE_ROUTE}/${encodeURIComponent(element.symbol.toLowerCase())}?${params}`
}

export function formatTemp(c: number | null): string {
  if (c === null) return '—'
  return `${c.toLocaleString('en-IN')} °C`
}

export function formatDensity(d: number | null): string {
  if (d === null) return '—'
  if (d < 0.01) return `${d} g/cm³`
  return `${d.toLocaleString('en-IN')} g/cm³`
}

export function celsiusToUnit(tempC: number, unit: TempUnit): number {
  if (unit === 'F') return (tempC * 9) / 5 + 32
  if (unit === 'K') return tempC + 273.15
  return tempC
}

export function unitToCelsius(value: number, unit: TempUnit): number {
  if (unit === 'F') return ((value - 32) * 5) / 9
  if (unit === 'K') return value - 273.15
  return value
}

export const TEMP_UNIT_LABELS: Record<TempUnit, string> = { C: '°C', F: '°F', K: 'K' }

export function formatTempInUnit(tempC: number, unit: TempUnit): string {
  const value = celsiusToUnit(tempC, unit)
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded.toLocaleString('en-IN')} ${TEMP_UNIT_LABELS[unit]}`
}

/** Phase at a temperature from the melting and boiling points (1 atm). */
export function getPhaseAtTemp(element: PeriodicElement, tempC: number): ElementPhase {
  const mp = element.meltingPointC
  const bp = element.boilingPointC

  if (mp !== null && tempC < mp) return 'solid'
  if (bp !== null && tempC >= bp) return 'gas'
  if (mp !== null && tempC >= mp && (bp === null || tempC < bp)) return 'liquid'
  if (mp === null && bp !== null && tempC < bp) {
    if (element.phase === 'gas' && tempC > -200) return 'gas'
    return 'solid'
  }
  if (mp === null && bp === null) return element.phase
  return 'unknown'
}

export function getPhaseTransitionNote(element: PeriodicElement, tempC: number): string {
  const phase = getPhaseAtTemp(element, tempC)
  const mp = element.meltingPointC
  const bp = element.boilingPointC

  if (phase === 'solid' && mp !== null) {
    return `Solid. Melts at ${formatTemp(mp)}, ${Math.round(mp - tempC).toLocaleString('en-IN')} °C above the set temperature.`
  }
  if (phase === 'liquid') {
    if (mp !== null && bp !== null) return `Liquid between ${formatTemp(mp)} (melts) and ${formatTemp(bp)} (boils).`
    if (mp !== null) return `Liquid above the melting point, ${formatTemp(mp)}.`
    if (bp !== null) return `Liquid below the boiling point, ${formatTemp(bp)}.`
  }
  if (phase === 'gas' && bp !== null) {
    return `Gas. Boils at ${formatTemp(bp)}, ${Math.round(tempC - bp).toLocaleString('en-IN')} °C below the set temperature.`
  }
  return `${PHASE_LABELS[phase]} at ${formatTempInUnit(tempC, 'C')}.`
}

const METAL_CATEGORIES: ReadonlySet<ElementCategory> = new Set<ElementCategory>([
  'alkali-metal',
  'alkaline-earth',
  'transition-metal',
  'post-transition',
  'lanthanide',
  'actinide',
])

export function isMetalCategory(category: ElementCategory): boolean {
  return METAL_CATEGORIES.has(category)
}

export function getMaterialClass(category: ElementCategory): string {
  if (isMetalCategory(category)) return 'Metal'
  if (category === 'metalloid') return 'Metalloid'
  if (category === 'nonmetal' || category === 'halogen' || category === 'noble-gas') return 'Nonmetal'
  return 'Unknown'
}

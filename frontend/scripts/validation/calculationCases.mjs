/**
 * Reference cases for the LIMS calculation validation (ISO/IEC 17025 7.11.6).
 *
 * Every expected value is worked out by hand (or from the cited document),
 * NOT copied from the program's output. `source` says where it comes from.
 *
 * Case fields
 *   id        stable id, quoted in the validation report (never reuse one)
 *   module    source file under frontend/src that is checked
 *   title     what is checked, in plain words
 *   source    where the expected value comes from
 *   run(m)    calls the bundled module(s) and returns the actual value
 *   expected  hand-calculated value
 *   tol       optional: numbers compare within this absolute tolerance
 *   known     optional: a known deviation that the Quality Manager has been
 *             told about. The case is reported as KNOWN (not a failure)
 *             while the program still gives `knownActual`; if the program is
 *             fixed and gives `expected`, the case reports FIXED so the entry
 *             can be removed. Any other answer is a FAIL.
 *
 * Module handles (see run-calculation-validation.mjs):
 *   m.mu, m.rds, m.point, m.testResult, m.conformity, m.ulr, m.reportNo, m.series, m.is2
 *   metallography: m.mgScale, m.mgStats, m.mgRing, m.mgRingDetect, m.mgFormat
 *
 * Rounding (lab decision, Amit, 23 Oct 2026): reported values are rounded by
 * IS 2:1960 "Rules for rounding off numerical values" — the digits dropped are
 * judged as written in decimal; more than half a unit rounds up, less leaves
 * the kept digit; exactly half (a 5 followed by nothing or zeros) rounds to the
 * even digit; negative values round by magnitude. The rounded value keeps its
 * declared number of decimals (10.2 to 2 decimals is 10.20). The same half-even
 * rule is ISO 80000-1:2009 Annex B rule B.
 */

export const MODULE_FILES = {
  mu: 'src/features/calibration/equipments/muCalcEngine.ts',
  rds: 'src/features/calibration/rawDataSheetTypes.ts',
  cert: 'src/features/calibration/handling/certificate-preparation/certificateDraftTypes.ts',
  sig: 'src/features/sample-handling/report-preparation/reportSignatories.ts',
  point: 'src/features/calibration/equipment-for-calibration/pointFormula.ts',
  testResult: 'src/features/sample-handling/sample-under-testing/testResultValues.ts',
  conformity: 'src/features/sample-handling/report-preparation/evaluateResultConformity.ts',
  partD: 'src/features/sample-handling/report-preparation/testReportPartDRemarks.ts',
  scope: 'src/features/sample-handling/report-preparation/reportScope.ts',
  ulr: 'src/features/sample-handling/report-preparation/nablUlrNumber.ts',
  reportNo: 'src/features/sample-handling/report-preparation/formattedTestReportNumber.ts',
  series: 'src/features/finance/sale/shared/documentSeriesApi.ts',
  is2: 'src/lib/is2Rounding.ts',
  // Metallurgy & Metallography (design 3.10 A)
  mgScale: 'src/features/metallography/calc/scaleCalibration.ts',
  mgStats: 'src/features/metallography/calc/fieldStatistics.ts',
  mgRing: 'src/features/metallography/engines/ringTest/ringMaths.ts',
  mgRingDetect: 'src/features/metallography/engines/ringTest/detectRing.ts',
  mgFormat: 'src/features/metallography/formatResult.ts',
}

// ---------------------------------------------------------------------------
// Measurement uncertainty budget used by MU-02 / MU-03.
// Five repeat readings of a 10 mm gauge block on a dial gauge (mm):
//   10.01, 10.02, 9.99, 10.00, 10.03
// Hand calculation (JCGM 100:2008 GUM 4.2 and 4.3; EA-4/02 M:2022):
//   mean        = 50.05 / 5 = 10.01
//   deviations  = 0, +0.01, -0.02, -0.01, +0.02 ; sum of squares = 0.0010
//   s           = sqrt(0.0010 / 4) = 0.0158114
//   uA = s/sqrt5 = 0.0070711                       -> 6 dp "0.007071"
//   reference standard certificate U = 0.010, k = 2 -> uB1 = 0.005000
//   resolution 0.01 (rectangular, half-width 0.005) -> uB2 = 0.01/(2*sqrt3) = 0.0028868 -> "0.002887"
//   uc = sqrt(0.007071^2 + 0.005^2 + 0.002887^2) = sqrt(8.33338e-5) = 0.0091287 -> "0.009129"
//   U  = k * uc = 2 * 0.009129 = 0.018258           -> 3 dp "0.018"
// The sheet rounds every calculated column to its decimals before the next
// column uses it (as on the printed MU sheet), so the figures above use the
// rounded intermediate values; the unrounded chain gives the same results.
// None of the dropped parts is exactly half, so IS 2 and half-up agree here.
// ---------------------------------------------------------------------------

function formulaCol(key, expression, decimals) {
  return {
    key,
    label: key,
    type: 'formula',
    required: false,
    formula: { op: 'sum', sources: [], constant: null, decimals, expression },
  }
}

function numberCol(key) {
  return { key, label: key, type: 'number', required: true }
}

export const MU_BUDGET_TABLE = {
  id: 'budget',
  label: 'Dial gauge budget',
  columns: [
    numberCol('R1'),
    numberCol('R2'),
    numberCol('R3'),
    numberCol('R4'),
    numberCol('R5'),
    formulaCol('uA', '=STDEV([R1],[R2],[R3],[R4],[R5])/SQRT(5)', 6),
    numberCol('Uref'),
    formulaCol('uB1', '=[Uref]/2', 6),
    numberCol('Res'),
    formulaCol('uB2', '=[Res]/(2*SQRT(3))', 6),
    formulaCol('uc', '=SQRT([uA]^2+[uB1]^2+[uB2]^2)', 6),
    formulaCol('U', '=2*[uc]', 3),
  ],
}

const MU_BUDGET_VALUES = {
  R1: '10.01',
  R2: '10.02',
  R3: '9.99',
  R4: '10.00',
  R5: '10.03',
  Uref: '0.010',
  Res: '0.01',
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]))
}

const conf = (m, observed, requirement, options) => m.conformity.evaluateResultConformity(observed, requirement, options)
const GUARD1 = { ruleType: 'guard_band', guardBandFactor: 1 }
const NONBIN1 = { ruleType: 'non_binary', guardBandFactor: 1 }
const SIMPLE = { ruleType: 'simple_acceptance' }

// India Standard Time instants for the financial-year boundary (UTC + 05:30).
const IST_2026_03_31_235959 = new Date('2026-03-31T18:29:59Z')
const IST_2026_04_01_000000 = new Date('2026-03-31T18:30:00Z')
const IST_2027_01_01_000000 = new Date('2026-12-31T18:30:00Z')
const IST_2099_04_01_120000 = new Date('2099-04-01T06:30:00Z')

// ---------------------------------------------------------------------------
// Metallography (design 3.10 A). Ring test geometry for RT-01 … RT-09:
// concentric circles centred at (400, 400) px; t1–t8 rays from the outer
// centre; the inner edge is moved out by inner_gap_px and the outer edge in by
// outer_gap_px along each ray (the drawn lines sit on the edges), so with 1 px
// gaps t = (R_outer − 1) − (R_inner + 1) px. Areas: F&P = inner disc,
// TM = outer disc − inner disc, share = TM / (TM + F&P) × 100.
// Limits are given in the case (old code's values: 0.07 d – 0.15 d, 30–50 %).
// ---------------------------------------------------------------------------

const RING_LIMITS = {
  thickness_min_factor: 0.07,
  thickness_max_factor: 0.15,
  tm_share_min_pct: 30,
  tm_share_max_pct: 50,
  limits_inclusive: true,
}

function ringGeometry(inner, outer, gapPx) {
  return {
    inner,
    outer,
    diameterLines: [],
    thicknessApplied: true,
    pointOffsets: Array.from({ length: 8 }, () => ({ angleOffsetDeg: 0, deltaPx: 0 })),
    angularCorrectionDeg: 0,
    outerGapPx: gapPx,
    innerGapPx: gapPx,
  }
}

const ringCircle = (r) => ({ type: 'circle', cx: 400, cy: 400, r })

function ringSquare(cx, cy, side) {
  const h = side / 2
  return {
    type: 'polygon',
    cx,
    cy,
    points: [
      { x: cx - h, y: cy - h },
      { x: cx + h, y: cy - h },
      { x: cx + h, y: cy + h },
      { x: cx - h, y: cy + h },
    ],
  }
}

function ringOutcome(s) {
  return {
    thickness_mm: s.thickness.map((p) => p.thickness_mm),
    valid_point_count: s.valid_point_count,
    thickness_range_low_mm: s.thickness_range_low_mm,
    thickness_range_high_mm: s.thickness_range_high_mm,
    thickness_in_range: s.thickness_in_range,
    area_tm_mm2: s.area_tm_mm2,
    area_fp_mm2: s.area_fp_mm2,
    tm_share_pct: s.tm_share_pct,
    tm_share_in_range: s.tm_share_in_range,
    overall_pass: s.overall_pass,
  }
}

/** Stage micrometer readings of the given lengths along one axis (MC-01). */
function micrometerReadings(axis, lengths) {
  return lengths.map((len) =>
    axis === 'x'
      ? { axis, x1: 10, y1: 50, x2: 10 + len, y2: 50 }
      : { axis, x1: 50, y1: 10, x2: 50, y2: 10 + len },
  )
}

export const CASES = [
  // ------------------------------------------------------------- MU
  {
    id: 'MU-01',
    module: 'mu',
    title: 'Type A: sample standard deviation and s/√n of five readings',
    source: 'Hand calculation, GUM 4.2.2–4.2.3 (s with n−1; u = s/√n)',
    run: (m) => {
      const r = [10.01, 10.02, 9.99, 10.0, 10.03]
      return { s: m.mu.sampleStdDev(r), uA: m.mu.computeTypeAFromReadings(r) }
    },
    expected: { s: Math.sqrt(0.001 / 4), uA: Math.sqrt(0.001 / 4) / Math.sqrt(5) },
    tol: 1e-12,
  },
  {
    id: 'MU-02',
    module: 'mu',
    title: 'Uncertainty budget sheet: uA, uB (certificate, resolution), uc and U (k = 2)',
    source: 'Hand calculation above MU_BUDGET_TABLE (GUM 4.3.7 rectangular a/√3; EA-4/02 M:2022 §5)',
    run: (m) => pick(m.mu.evaluateMuTableValues(MU_BUDGET_TABLE, MU_BUDGET_VALUES, 4), ['uA', 'uB1', 'uB2', 'uc', 'U']),
    expected: { uA: '0.007071', uB1: '0.005000', uB2: '0.002887', uc: '0.009129', U: '0.018' },
  },
  {
    id: 'MU-03',
    module: 'mu',
    title: 'Expanded U for the report from the combined uncertainty column (U = k·uc)',
    source: 'Hand calculation: 2 × 0.009129 = 0.018258 (6 dp of the uc column)',
    run: (m) => {
      const calc = {
        enabled: true,
        label: 'Calculation',
        tables: [{ id: 't', label: 't', columns: [formulaCol('uc', '=1', 6)] }],
      }
      calc.tables[0].columns[0].label = 'Combined standard uncertainty'
      return m.mu.pickExpandedUncertaintyDisplay(calc, { uc: '0.009129' }, 2)
    },
    expected: { label: 'Expanded U (k = 2)', value: '0.018258' },
  },
  {
    id: 'MU-04',
    module: 'mu',
    title: 'Least count read from equipment text ("0.01 | 0.05" and "0.05 kN")',
    source: 'Specification in muCalcEngine.normalizeMuLeastCountRaw: first positive number segment',
    run: (m) => [m.mu.normalizeMuLeastCountRaw('0.01 | 0.05'), m.mu.normalizeMuLeastCountRaw('0.05 kN')],
    expected: ['0.01', '0.05 kN'],
  },
  {
    id: 'MU-05',
    module: 'rds',
    title: 'Formula column rounds to its decimals by IS 2 (raw data sheet / certificate figures)',
    source:
      'IS 2:1960, hand rounding: 2/3 = 0.6667 (4 dp); 10.0 − 9.9875 = 0.0125 → 0.012 (exact half, 2 is even); ' +
      '5 − 4.9865 = 0.0135 → 0.014 (exact half, 3 is odd; binary 0.01349999… must not give 0.013)',
    run: (m) => {
      const diff = (a, b) =>
        m.rds.computeFormulaValue(formulaCol('e', '=[A]-[B]', 3), { A: a, B: b }, 2, [
          numberCol('A'),
          numberCol('B'),
          formulaCol('e', '=[A]-[B]', 3),
        ])
      return [m.rds.computeFormulaValue(formulaCol('x', '=2/3', 4), {}, 2), diff('10.0', '9.9875'), diff('5', '4.9865')]
    },
    expected: ['0.6667', '0.012', '0.014'],
  },

  {
    id: 'RD-01',
    module: 'rds',
    title: 'Raw data sheet: decimals of the least count (single, with unit, multi-range, none)',
    source: 'Hand: 0.01 → 2; 0.002 mm → 3; 0.5 kN → 1; 2 → 0; "0.02 | 0.01" → first value 0.02 → 2; "" → none',
    run: (m) =>
      ['0.01', '0.002 mm', '0.5 kN', '2', '0.02 | 0.01', ''].map((lc) => m.rds.leastCountDecimalPlaces(lc)),
    expected: [2, 3, 1, 0, 2, null],
  },
  {
    id: 'RD-02',
    module: 'rds',
    title: 'Raw data sheet: a typed reading is padded to the least count, never rounded',
    source:
      'ISO/IEC 17025 7.5.1 (the observation is recorded as read). OQ-02 staging run 23 Oct 2026: ' +
      '50.01 and 49.99 became 50 when the field was left. Hand: LC 0.01 → 50.01, 49.99, 50 → 50.00; ' +
      'more digits than the LC are kept (10.0016); 0 places keeps 50.01; text that is not a number is left as typed',
    run: (m) => [
      m.rds.formatTypedReading('50.01', 2),
      m.rds.formatTypedReading('49.99', 2),
      m.rds.formatTypedReading('50', 2),
      m.rds.formatTypedReading('10.0016', 2),
      m.rds.formatTypedReading('50.01', 0),
      m.rds.formatTypedReading('-0.5', 3),
      m.rds.formatTypedReading(' ', 2),
      m.rds.formatTypedReading('OK', 2),
    ],
    expected: ['50.01', '49.99', '50.00', '10.0016', '50.01', '-0.500', '', 'OK'],
  },

  {
    id: 'RD-03',
    module: 'rds',
    title: 'Renaming a raw data column keeps the formulas that use it working',
    source:
      'OQ-02 staging run 23 Oct 2026: the Vernier Caliper template still named "DUC Reading 1 mm" after the ' +
      'column became "DUC Reading E1 mm", so Average stayed empty. Hand: readings 50.01, 50.02, 49.99 → ' +
      'average 150.02 / 3 = 50.006667 → 50.007 (3 dp); error = 50.007 − 50.0016 = 0.0054 → 0.005',
    run: (m) => {
      const cols = [
        numberCol('m'),
        numberCol('e1'),
        numberCol('e2'),
        numberCol('e3'),
        formulaCol('avg', '=AVERAGE([DUC Reading 1 mm],[DUC Reading 2 mm],[DUC Reading 3 mm])', 3),
        formulaCol('err', '=[Average]-[Master]', 3),
      ]
      const labels = { m: 'Master', e1: 'DUC Reading 1 mm', e2: 'DUC Reading 2 mm', e3: 'DUC Reading 3 mm', avg: 'Average', err: 'Error' }
      let tpl = { version: 1, seedFrom: 'none', verification: { items: [] }, columns: cols.map((c) => ({ ...c, label: labels[c.key] })) }
      const rename = (key, to) => {
        const from = [...tpl.columns].find((c) => c.key === key).label
        tpl = { ...tpl, columns: tpl.columns.map((c) => (c.key === key ? { ...c, label: to } : c)) }
        tpl = m.rds.renameColumnRefsInTemplate(tpl, key, from, to)
      }
      rename('e1', 'DUC Reading E1 mm')
      rename('e2', 'DUC Reading E2 mm')
      rename('e3', 'DUC Reading E3 mm')
      rename('avg', 'Average Reading External Jaws mm')
      const values = { m: '50.0016', e1: '50.01', e2: '50.02', e3: '49.99' }
      const out = m.rds.applyFormulaColumns(tpl.columns, values, 2)
      return [tpl.columns[4].formula.expression, tpl.columns[5].formula.expression, out.avg, out.err]
    },
    expected: [
      '=AVERAGE([DUC Reading E1 mm],[DUC Reading E2 mm],[DUC Reading E3 mm])',
      '=[Average Reading External Jaws mm]-[Master]',
      '50.007',
      '0.005',
    ],
  },
  {
    id: 'RD-04',
    module: 'rds',
    title: 'Rename with a label shared by another table: only formulas that meant the renamed column change',
    source:
      'Reference resolution takes the first column with the label. Renaming the second "Master" (internal jaws) ' +
      'leaves [Master] meaning the first one; renaming the first moves [Master] to its new name; ' +
      'a new name already used by an earlier column, or an empty name, changes nothing',
    run: (m) => {
      const tpl = {
        version: 1,
        seedFrom: 'none',
        verification: { items: [] },
        columns: [{ ...numberCol('m1'), label: 'Master' }, { ...formulaCol('x', '=[Master]*2', 2), label: 'X' }],
        extraTables: [{ id: 't2', name: 'Internal', columns: [{ ...numberCol('m2'), label: 'Master' }] }],
      }
      const second = m.rds.renameColumnRefsInTemplate(tpl, 'm2', 'Master', 'Master Internal')
      const first = m.rds.renameColumnRefsInTemplate(tpl, 'm1', 'Master', 'Master External')
      const clash = m.rds.renameColumnRefsInTemplate(tpl, 'm2', 'Master', 'X')
      const empty = m.rds.renameColumnRefsInTemplate(tpl, 'm1', 'Master', ' ')
      return [second, first, clash, empty].map((t) => t.columns[1].formula.expression)
    },
    expected: ['=[Master]*2', '=[Master External]*2', '=[Master]*2', '=[Master]*2'],
  },

  {
    id: 'RD-05',
    module: 'rds',
    title: 'Malformed formulas are refused instead of giving a wrong number',
    source:
      'OQ-02 staging run 23 Oct 2026: =AVERAGE [I1],[I2],[I3] (brackets missing) gave 9.99, the last reading, ' +
      'instead of the average 10.007; the editor accepted it. Hand: readings 10.01, 10.02, 9.99 → 30.02 / 3 = 10.007; ' +
      'IF and ROUND keep their argument commas',
    run: (m) => {
      const cols = [
        { key: 'a', label: 'I1', type: 'number' },
        { key: 'b', label: 'I2', type: 'number' },
        { key: 'c', label: 'I3', type: 'number' },
      ]
      const v = { a: '10.01', b: '10.02', c: '9.99' }
      const calc = (e) =>
        m.rds.computeFormulaValue(formulaCol('f', e, 3), v, 3, [...cols, formulaCol('f', e, 3)])
      const ok = (e) => m.rds.analyzeColumnFormulaExpression(e, cols) == null
      return [
        calc('=AVERAGE [I1],[I2],[I3]'),
        ok('=AVERAGE [I1],[I2],[I3]'),
        ok('=MAX([I1],[I2],[I3]-MIN([I1],[I2],[I3])'),
        ok('=[I1])'),
        calc('=AVERAGE([I1],[I2],[I3])'),
        calc('=IF([I1]>[I3],ROUND([I1]-[I3],2),0)'),
        ok('=MAX([I1],[I2],[I3])-MIN([I1],[I2],[I3])'),
      ]
    },
    expected: ['', false, false, false, '10.007', '0.020', true],
  },

  // ------------------------------------------------------------- calibration point formula
  {
    id: 'PF-01',
    module: 'point',
    title: 'Point formula x^2/2 + 1 at x = 4',
    source: 'Hand: 16/2 + 1 = 9',
    run: (m) => m.point.evaluatePointFormula('x^2/2 + 1', 4),
    expected: 9,
    tol: 1e-12,
  },
  {
    id: 'PF-02',
    module: 'point',
    title: 'Scientific notation 1.2e-3·x is not read as Euler e (x = 1000)',
    source: 'Hand: 0.0012 × 1000 = 1.2',
    run: (m) => m.point.evaluatePointFormula('1.2e-3 * x', 1000),
    expected: 1.2,
    tol: 1e-12,
  },
  {
    id: 'PF-03',
    module: 'point',
    title: 'sqrt(x) at 16 and pi·x at 2',
    source: 'Hand: √16 = 4; 2π = 6.283185307179586',
    run: (m) => [m.point.evaluatePointFormula('sqrt(x)', 16), m.point.evaluatePointFormula('pi * x', 2)],
    expected: [4, 2 * Math.PI],
    tol: 1e-12,
  },
  {
    id: 'PF-04',
    module: 'point',
    title: 'Invalid formula and division by zero give no value (never a wrong point)',
    source: 'Requirement URS-CAL-04: invalid or non-finite results are refused',
    run: (m) => [m.point.evaluatePointFormula('x +', 1), m.point.evaluatePointFormula('1/(x-2)', 2)],
    expected: [null, null],
  },
  {
    id: 'PF-05',
    module: 'point',
    title: 'Point display rounding: 1/3 to 4 dp; 123.456789 auto (2 dp above 100)',
    source: 'Hand rounding; pointFormula.formatFormulaResult rule (≥100 → 2 dp)',
    run: (m) => [m.point.formatFormulaResult(1 / 3, 4), m.point.formatFormulaResult(123.456789)],
    expected: ['0.3333', '123.46'],
  },

  // ------------------------------------------------------------- test results
  {
    id: 'TR-01',
    module: 'testResult',
    title: 'Statistics of readings 10.1, 10.3, 10.2 (mean, s, CV, range)',
    source: 'Hand: mean 10.2; s = √(0.02/2) = 0.1; CV = 0.1/10.2 = 0.980392 %; range 0.2',
    run: (m) => {
      const s = m.testResult.computeTestResultStats([10.1, 10.3, 10.2])
      return { average: s.average, stddev: s.stddev, cv: s.cv, range: s.range, count: s.count }
    },
    expected: { average: 10.2, stddev: 0.1, cv: (0.1 / 10.2) * 100, range: 0.2, count: 3 },
    tol: 1e-9,
  },
  {
    id: 'TR-02',
    module: 'testResult',
    title: 'Reported statistic text: mean (2 dp), CV (2 dp), declared decimals kept',
    source: 'Hand, IS 2:1960 (declared decimals kept): 10.2 → "10.20"; 0.980392 % → "0.98%"',
    run: (m) => {
      const s = m.testResult.computeTestResultStats([10.1, 10.3, 10.2])
      return [m.testResult.formatStatDisplay(s, 'average', 2), m.testResult.formatStatDisplay(s, 'cv', 2)]
    },
    expected: ['10.20', '0.98%'],
  },
  {
    id: 'TR-03',
    module: 'testResult',
    title: 'Compare actions: ratio 45/50, |12.34 − 12.5|, divide by zero',
    source: 'Hand, 2 declared decimals: 90.00 %; 0.16; division by zero shows "—"',
    run: (m) => [
      m.testResult.computeCompareResult('ratio', 45, 50, 2),
      m.testResult.computeCompareResult('difference', 12.34, 12.5, 2),
      m.testResult.computeCompareResult('divide', 5, 0, 2),
    ],
    expected: ['90.00%', '0.16', '—'],
  },
  {
    id: 'TR-04',
    module: 'testResult',
    title: 'Reading typed with a thousands separator "1,234.5"',
    source: 'Hand: 1234.5',
    run: (m) => m.testResult.parseReadingInput('1,234.5'),
    expected: 1234.5,
  },
  {
    id: 'TR-05',
    module: 'testResult',
    title: 'Rounding to 2 dp keeps the declared decimals (10.20, not 10.2)',
    source: 'IS 2:1960 and lab decision 23 Oct 2026: the rounded value keeps its declared decimals (trailing zeros are significant)',
    run: (m) => m.testResult.formatNumber(10.2, 2),
    expected: '10.20',
  },
  {
    id: 'TR-06',
    module: 'testResult',
    title: 'Rounding of an exact half: 2.5 and 3.5 to 0 dp',
    source: 'IS 2:1960 (exact half to the even digit): 2.5 → 2, 3.5 → 4',
    run: (m) => [m.testResult.formatNumber(2.5, 0), m.testResult.formatNumber(3.5, 0)],
    expected: ['2', '4'],
  },
  {
    id: 'TR-07',
    module: 'testResult',
    title: 'Rounding 1.015 and 2.675 to 2 dp',
    source:
      'IS 2:1960 on the written value (exact half, kept digit odd → up): 1.015 → 1.02; 2.675 → 2.68. ' +
      'Binary floating point stores them as 1.01499999… and 2.67499999…, which must not round down',
    run: (m) => [m.testResult.formatNumber(1.015, 2), m.testResult.formatNumber(2.675, 2)],
    expected: ['1.02', '2.68'],
  },
  {
    id: 'TR-08',
    module: 'testResult',
    title: 'Single reading: standard deviation 0, count 1',
    source: 'Definition: s needs n ≥ 2; the app reports 0 for n = 1',
    run: (m) => {
      const s = m.testResult.computeTestResultStats([7.5])
      return { stddev: s.stddev, count: s.count, average: s.average }
    },
    expected: { stddev: 0, count: 1, average: 7.5 },
  },

  // ------------------------------------------------------------- conformity, no rule / simple acceptance
  {
    id: 'CF-01',
    module: 'conformity',
    title: 'No rule: 9.8 vs "10 max" conforms; 10.2 does not',
    source: 'Simple acceptance, ILAC-G8:09/2019 §4.2.1 (w = 0)',
    run: (m) => [conf(m, '9.8', '10 max'), conf(m, '10.2', '10 max')],
    expected: ['Conforms', 'Does Not Conform'],
  },
  {
    id: 'CF-02',
    module: 'conformity',
    title: 'Strict and inclusive limits: 10 vs "< 10" and 10 vs "≤ 10"',
    source: 'Hand: < excludes the limit, ≤ includes it',
    run: (m) => [conf(m, '10', '< 10'), conf(m, '10', '≤ 10')],
    expected: ['Does Not Conform', 'Conforms'],
  },
  {
    id: 'CF-03',
    module: 'conformity',
    title: 'Range "10 - 20": 20 (on the limit) conforms, 20.1 does not',
    source: 'Hand: range limits are inclusive',
    run: (m) => [conf(m, '20', '10 - 20'), conf(m, '20.1', '10 - 20')],
    expected: ['Conforms', 'Does Not Conform'],
  },
  {
    id: 'CF-04',
    module: 'conformity',
    title: 'Tolerance "5 ± 0.2": 5.25 does not conform; 5.2 and 4.8 (on the limit) conform',
    source: 'Hand: |5.2 − 5| = 0.2 ≤ 0.2 (tolerance limits are inclusive)',
    run: (m) => [conf(m, '5.25', '5 ± 0.2'), conf(m, '5.2', '5 ± 0.2'), conf(m, '4.8', '5 ± 0.2')],
    expected: ['Does Not Conform', 'Conforms', 'Conforms'],
  },
  {
    id: 'CF-05',
    module: 'conformity',
    title: 'Simple-acceptance rule ignores U: 9.9 vs "10 max" with U = 0.3',
    source: 'ILAC-G8:09/2019 §4.2.1 (w = 0)',
    run: (m) => conf(m, '9.9', '10 max', { rule: SIMPLE, uncertainty: '± 0.3' }),
    expected: 'Conforms',
  },
  {
    id: 'CF-06',
    module: 'conformity',
    title: 'Blank requirement → Not Applicable; qualitative "Absent" / "Present" vs "Absent"',
    source: 'Requirement URS-RPT-06; qualitative results ignore U',
    run: (m) => [
      conf(m, '12', ''),
      conf(m, 'Absent', 'Absent / 25 g', { rule: GUARD1, uncertainty: '0.3' }),
      conf(m, 'Present', 'Absent / 25 g', { rule: GUARD1, uncertainty: '0.3' }),
    ],
    expected: ['Not Applicable', 'Conforms', 'Does Not Conform'],
  },
  {
    id: 'CF-07',
    module: 'conformity',
    title: 'Remarks saved as "Confirm" / "Not Confirm" read as Conforms / Does Not Conform',
    source: 'Wording change 23 Oct 2026 (ISO/IEC 17025 7.8.6 statement of conformity); saved results keep their outcome',
    run: (m) => [
      m.conformity.canonicalConformityRemark('Confirm'),
      m.conformity.canonicalConformityRemark('Not Confirm'),
      m.conformity.conformityOutcomeFromRemark('Not Confirm'),
      m.conformity.canonicalConformityRemark('Okay'),
    ],
    expected: ['Conforms', 'Does Not Conform', 'fail', null],
  },
  {
    id: 'CF-09',
    module: 'conformity',
    title: 'DR-NR (rule not applied): judged as with no rule; no guard band, no missing-U flag',
    source: 'Lab decision 25 Oct 2026: the lab applies no decision rule; ILAC-G8 not used',
    run: (m) => {
      const nr = { ruleType: 'not_applied', guardBandFactor: 0 }
      const d1 = m.conformity.evaluateResultConformityDetailed('9.8', '10 max', { rule: nr, uncertainty: '± 0.3' })
      const d2 = m.conformity.evaluateResultConformityDetailed('9.8', '10 max', { rule: nr })
      return [d1.remark, d1.guardBand, d1.uncertaintyMissing, d2.remark, d2.uncertaintyMissing]
    },
    expected: ['Conforms', null, false, 'Conforms', false],
  },
  {
    id: 'CF-08',
    module: 'conformity',
    title: 'Part D line 1: open reports say "Conforms to"; reports issued with the old wording print "Confirms to" as issued',
    source: 'ISO/IEC 17025 7.8.2.1 / 8.4: an issued report reprints as issued; wording change 23 Oct 2026',
    run: (m) => [
      m.partD.splitPartDRemarks('', 'IS 1786: 2008').line1,
      m.partD.splitPartDRemarks('', 'IS 1786: 2008', m.conformity.isLegacyConformityRemark('Confirm')).line1,
      m.partD.splitPartDRemarks('1. The Sample Confirms to IS 1786: 2008 with Respect to Above Tests.\n2. Retest', 'IS 1786: 2008'),
      m.partD.modernizePartDRemarks('1. The Sample Confirms to IS 1786: 2008 with Respect to Above Tests.\n2. Retest'),
    ],
    expected: [
      '1. The Sample Conforms to IS 1786: 2008 with Respect to Above Tests.',
      '1. The Sample Confirms to IS 1786: 2008 with Respect to Above Tests.',
      { line1: '1. The Sample Confirms to IS 1786: 2008 with Respect to Above Tests.', line2: '2. Retest' },
      '1. The Sample Conforms to IS 1786: 2008 with Respect to Above Tests.\n2. Retest',
    ],
  },

  // ------------------------------------------------------------- conformity, guard band
  {
    id: 'GB-01',
    module: 'conformity',
    title: 'Guard band w = 1·U, U = 0.3, "10 max": 9.6 accept, 9.8 reject, 9.7 (= AL) accept',
    source: 'ILAC-G8:09/2019 §4.2.2: acceptance limit AL = TL − w = 9.7; accept when result ≤ AL',
    run: (m) => ['9.6', '9.8', '9.7'].map((v) => conf(m, v, '10 max', { rule: GUARD1, uncertainty: '± 0.3' })),
    expected: ['Conforms', 'Does Not Conform', 'Conforms'],
  },
  {
    id: 'GB-02',
    module: 'conformity',
    title: 'Guard band with relative U "± 2 %" on range 40–51: 50 accept, 50.5 reject',
    source: 'Hand: U = 2 % of 50 = 1.00, margin to 51 = 1.0 ≥ 1.0; at 50.5 U = 1.01, margin 0.5 < 1.01',
    run: (m) => ['50', '50.5'].map((v) => conf(m, v, '40 - 51', { rule: GUARD1, uncertainty: '± 2 %' })),
    expected: ['Conforms', 'Does Not Conform'],
  },
  {
    id: 'GB-03',
    module: 'conformity',
    title: 'Guard band on a lower limit "≥ 3", U = 0.5: 3.4 reject, 3.6 accept',
    source: 'ILAC-G8 §4.2.2: AL = 3 + 0.5 = 3.5',
    run: (m) => ['3.4', '3.6'].map((v) => conf(m, v, '≥ 3', { rule: GUARD1, uncertainty: '0.5' })),
    expected: ['Does Not Conform', 'Conforms'],
  },
  {
    id: 'GB-04',
    module: 'conformity',
    title: 'Guard band with no usable U falls back to simple acceptance and says so',
    source: 'Specification (evaluateResultConformity header): uncertaintyMissing = true',
    run: (m) => {
      const d = m.conformity.evaluateResultConformityDetailed('9.8', '10 max', { rule: GUARD1, uncertainty: 'N/A' })
      return { remark: d.remark, uncertaintyMissing: d.uncertaintyMissing }
    },
    expected: { remark: 'Conforms', uncertaintyMissing: true },
  },
  {
    id: 'GB-05',
    module: 'conformity',
    title: 'Guard band factor 2 (w = 2U), U = 0.1, "10 max": 9.85 reject, 9.75 accept',
    source: 'ILAC-G8 §4.2.2: w = 0.2, AL = 9.8',
    run: (m) =>
      ['9.85', '9.75'].map((v) => conf(m, v, '10 max', { rule: { ruleType: 'guard_band', guardBandFactor: 2 }, uncertainty: '0.1' })),
    expected: ['Does Not Conform', 'Conforms'],
  },

  // ------------------------------------------------------------- conformity, non-binary
  {
    id: 'NB-01',
    module: 'conformity',
    title: 'Non-binary, U = 0.3, "10 max": 9.6 Pass, 9.8 Cond. Pass, 10.2 Cond. Fail, 10.4 Fail',
    source: 'ILAC-G8:09/2019 §4.2.3 zones: ≤ 9.7 pass; 9.7–10 cond. pass; 10–10.3 cond. fail; > 10.3 fail',
    run: (m) => ['9.6', '9.8', '10.2', '10.4'].map((v) => conf(m, v, '10 max', { rule: NONBIN1, uncertainty: '0.3' })),
    expected: ['Pass', 'Conditional Pass', 'Conditional Fail', 'Fail'],
  },
  {
    id: 'NB-02',
    module: 'conformity',
    title: 'Non-binary on range 10–20, U = 0.5: 15 Pass, 10.2 Cond. Pass, 9.8 Cond. Fail, 9.0 Fail',
    source: 'ILAC-G8 §4.2.3 applied to both limits (w = 0.5)',
    run: (m) => ['15', '10.2', '9.8', '9.0'].map((v) => conf(m, v, '10 - 20', { rule: NONBIN1, uncertainty: '0.5' })),
    expected: ['Pass', 'Conditional Pass', 'Conditional Fail', 'Fail'],
  },
  {
    id: 'NB-03',
    module: 'conformity',
    title: 'Expanded U read from text: "U = 0.5 mg/kg (k=2)" and "± 1.2 % at 95 % confidence"',
    source: 'Hand reading of the text',
    run: (m) => [m.conformity.parseUncertaintyText('U = 0.5 mg/kg (k=2)'), m.conformity.parseUncertaintyText('± 1.2 % at 95 % confidence')],
    expected: [
      { value: 0.5, relative: false },
      { value: 1.2, relative: true },
    ],
  },

  // ------------------------------------------------------------- ULR
  {
    id: 'ULR-01',
    module: 'ulr',
    title: 'NABL ULR from lab prefix TC1234526, serial 1',
    source: 'NABL ULR format: TC + cert 12345 + YY 26 + location 0 + 8-digit serial + F = 19 characters',
    run: (m) => {
      const u = m.ulr.formatNablUlrNumber('TC1234526', 1)
      return { ulr: u, length: u.length, valid: m.ulr.matchesNablUlrStructure(u) }
    },
    expected: { ulr: 'TC1234526000000001F', length: 19, valid: true },
  },
  {
    id: 'ULR-02',
    module: 'ulr',
    title: 'Calibration ULR from accreditation "CC - 3039", serial 42; serial read back',
    source: 'NABL ULR format: CC + 03039 + 26 + 0 + 00000042 + F',
    run: (m) => {
      const cert = m.ulr.parseNablAccreditationCert('CC - 3039')
      const u = m.ulr.formatNablUlrNumber(`${cert.cab}${cert.digits}26`, 42, 'CC')
      return { cert, ulr: u, serial: m.ulr.parseNablUlrSequence(u, `${cert.cab}${cert.digits}26`, 'CC') }
    },
    expected: { cert: { cab: 'CC', digits: '03039' }, ulr: 'CC0303926000000042F', serial: 42 },
  },
  {
    id: 'ULR-03',
    module: 'ulr',
    title: 'Malformed ULRs are rejected (18 characters; wrong last letter)',
    source: 'NABL ULR format: exactly 19 characters ending in F',
    run: (m) => [m.ulr.matchesNablUlrStructure('TC123452600000001F'), m.ulr.matchesNablUlrStructure('TC1234526000000001A')],
    expected: [false, false],
  },

  {
    id: 'ULR-04',
    module: 'ulr',
    title: 'Amended report ULR: original ULR + -R and the next revision number',
    source:
      'Lab decision 23 Oct 2026 (OQ-01 step 11): amended report keeps the ULR with -R1, then -R2, … ' +
      'Hand: first amendment of TC1544226000000400F → -R1; amending again (from the original or from -R1) → -R2; ' +
      'base with a hand-typed -R2 already present → -R3; another ULR\'s revisions and deleted ones count only for their own base',
    run: (m) => {
      const u = 'TC1544226000000400F'
      return [
        m.ulr.nextRevisedNablUlrNumber(u, [u]),
        m.ulr.nextRevisedNablUlrNumber(u, [u, `${u}-R1`]),
        m.ulr.nextRevisedNablUlrNumber(`${u}-R1`, [u, `${u}-R1`]),
        m.ulr.nextRevisedNablUlrNumber('TC1544226000000261F', ['TC1544226000000261F-R2']),
        m.ulr.nextRevisedNablUlrNumber(u, ['TC1544226000000401F-R5', `${u.toLowerCase()}-r1`]),
      ]
    },
    expected: [
      'TC1544226000000400F-R1',
      'TC1544226000000400F-R2',
      'TC1544226000000400F-R2',
      'TC1544226000000261F-R3',
      'TC1544226000000400F-R2',
    ],
  },
  {
    id: 'ULR-05',
    module: 'ulr',
    title: 'A revised ULR passes the format check with its serial; partial suffixes are dropped',
    source:
      'Report Preparation keeps a stored ULR only when it passes the format check (else it assigns a new ULR). ' +
      'Hand: TC1544226000000400F-R1 → serial 400, valid; a trailing "-" or "-R" is removed; 20 characters without a suffix are cut to 19',
    run: (m) => [
      m.ulr.isValidNablUlrFormat('TC1544226000000400F-R1', 'TC15442260'),
      m.ulr.parseNablUlrSequence('TC1544226000000400F-R1', 'TC15442260'),
      m.ulr.sanitizeNablUlrInput('tc1544226000000400f-r1'),
      m.ulr.sanitizeNablUlrInput('TC1544226000000400F-'),
      m.ulr.sanitizeNablUlrInput('TC1544226000000400F-R'),
      m.ulr.sanitizeNablUlrInput('TC1544226000000400FX'),
      m.ulr.isValidNablUlrFormat('TC1544226000000400X-R1', 'TC15442260'),
    ],
    expected: [true, 400, 'TC1544226000000400F-R1', 'TC1544226000000400F', 'TC1544226000000400F', 'TC1544226000000400F', false],
  },

  {
    id: 'ULR-06',
    module: 'ulr',
    title: 'Calibration certificate ULR: CC + calibration accreditation, its own series apart from TC',
    source:
      'NABL ULR format; lab accreditations TC-15442 (testing) and CC-3039 (calibration). OQ-02 staging run 23 Oct 2026: ' +
      'certificates had taken TC serials of test reports. Hand: CC-3039 → CC03039 + YY + 0 + 8-digit serial + F; ' +
      'a TC ULR has no serial in the CC series, so the series never take each other\'s numbers',
    run: (m) => [
      m.ulr.isCalibrationUlr('CC0303926000000001F'),
      m.ulr.isCalibrationUlr('TC1544226000000401F'),
      m.ulr.isCalibrationUlr('cc0303926000000002f-r1'),
      m.ulr.formatNablUlrNumber('CC0303926', 7, 'CC'),
      m.ulr.parseNablUlrSequence('TC1544226000000401F', 'CC03039260', 'CC'),
      m.ulr.parseNablUlrSequence('CC0303926000000012F', 'CC03039260', 'CC'),
      m.ulr.parseNablAccreditationCert(m.ulr.LAB_CALIBRATION_ACCREDITATION_DEFAULT),
    ],
    expected: [true, false, true, 'CC0303926000000007F', null, 12, { cab: 'CC', digits: '03039' }],
  },

  {
    id: 'CN-01',
    module: 'cert',
    title: 'Next calibration certificate number counts amended and replaced numbers',
    source:
      'OQ staging run 23 Oct 2026: after QI/CC/2026/0003 became QI/CC/2026/0003/A1 the next new certificate got 0003 again. ' +
      'Hand: used 0001, 0002, 0003/A1 (+ replaced 0003) → 0004; R2/S1 suffixes count too; other years and prefixes are ignored',
    run: (m) => [
      m.cert.certificateNumberBase('QI/CC/2026/0003/A1'),
      m.cert.certificateNumberBase('QI/CC/2026/0007/r2'),
      m.cert.nextCalibrationCertificateNumber('QI/CC', 2026, ['QI/CC/2026/0001', 'QI/CC/2026/0002', 'QI/CC/2026/0003/A1']),
      m.cert.nextCalibrationCertificateNumber('QI/CC', 2026, ['QI/CC/2026/0002', 'QI/CC/2026/0009/S1', 'QI/CC/2025/0050', 'XX/2026/0099']),
      m.cert.nextCalibrationCertificateNumber('QI/CC', 2027, ['QI/CC/2026/0003/A1']),
    ],
    expected: ['QI/CC/2026/0003', 'QI/CC/2026/0007', 'QI/CC/2026/0004', 'QI/CC/2026/0010', 'QI/CC/2027/0001'],
  },

  {
    id: 'CN-02',
    module: 'cert',
    title: 'Certificate notes by instrument type and the place-of-calibration remark',
    source:
      'OQ-02 staging run 23 Oct 2026: a vernier caliper certificate printed the IS 1828 machine notes and ' +
      '"done at the Site of Customer" for an In Lab job. Hand: UTM / tensile / compression machines are force testing machines, ' +
      'a vernier caliper or tensionmeter is not; In Lab → laboratory, On Site → customer\'s site, numbering kept',
    run: (m) => [
      m.cert.isForceTestingMachine('Universal Testing Machine'),
      m.cert.isForceTestingMachine('Compression Tasting Machine'),
      m.cert.isForceTestingMachine('Vernier Caliper'),
      m.cert.isForceTestingMachine('Tensionmeter'),
      m.cert.applyCertificateLocationRemark('1) The above Calibration is done at the Site of Customer.\n2) Results valid.', 'In Lab'),
      m.cert.applyCertificateLocationRemark('1) The above calibration was carried out in the laboratory.', 'On Site'),
      m.cert.DEFAULT_CERTIFICATE_NOTES.includes('machine'),
    ],
    expected: [
      true,
      true,
      false,
      false,
      '1) The above calibration was carried out in the laboratory.\n2) Results valid.',
      "1) The above calibration was carried out at the customer's site.",
      false,
    ],
  },
  {
    id: 'RD-06',
    module: 'rds',
    title: 'Certificate U is the largest saved expanded U of the points on the sheet',
    source:
      'OQ-02 staging run 23 Oct 2026: the certificate printed the master\'s certificate U (±0.01 mm). Hand: saved U 0.018, 0.021 ' +
      'and 0.050 on a row that was deleted → 0.021; nothing saved → none; k defaults to 2',
    run: (m) => {
      const mu = m.rds.parseRawDataMuResults({
        coverageFactorK: 2,
        label: 'U',
        rows: [
          { rowId: 'r1', expanded: '0.018', combined: '0.009' },
          { rowId: 'r2', expanded: '±0.021', combined: '0.0105' },
          { rowId: 'gone', expanded: '0.050', combined: '0.025' },
          { rowId: 'r4', expanded: '', combined: '' },
        ],
      })
      return [
        m.rds.maxSavedExpandedUncertainty(mu, ['r1', 'r2', 'r3']),
        m.rds.maxSavedExpandedUncertainty(m.rds.parseRawDataMuResults({ rows: [] }), ['r1']),
        mu.rows.length,
        m.rds.parseRawDataMuResults({ rows: [{ rowId: 'a', expanded: '1' }] }).coverageFactorK,
      ]
    },
    expected: [0.021, null, 3, 2],
  },

  {
    id: 'SG-01',
    module: 'sig',
    title: 'Test report signatories: Print Setting roles and parts only; tester and the approving TM, never the issuer',
    source:
      'ISO/IEC 17025 7.8.2.1 o. OQ-01 staging run 23 Oct 2026: reports printed the Print Setting names (two testing ' +
      'engineers and a TM) whoever did the work. Lab 25 Oct: only the roles and parts of Print Setting; the issuer is not printed. ' +
      'Hand: layout Tested By x2 after Part D, Approved By after A, B, D; people: one tester, one reviewer, issuer Director ' +
      '→ Tested By (tester, D), Approved By (reviewer, A B D); no Reviewed By line, no Director',
    run: (m) => {
      const slot = (roleLabel, name, parts) => ({ roleLabel, userId: name, name, designation: '', department: '', enabled: true, required: true, showAfterParts: parts })
      const settings = {
        showSignatures: true,
        signatures: [
          slot('Tested By', 'Vishal Rahangdale', ['part_d']),
          slot('Tested By', 'Rajat Maurya', ['part_d']),
          slot('Approved By', 'Kunal Patle', ['part_a', 'part_b', 'part_d']),
        ],
      }
      const p = (name, designation) => ({ userId: name, name, designation, department: '' })
      const out = m.sig.applyReportPeopleToSignatures(settings, {
        testers: [p('OQ Testing Engineer Mech', 'Testing Engineer'), p('OQ Testing Engineer Mech', 'Testing Engineer')],
        reviewers: [p('OQ Technical Manager Mech', 'Technical Manager'), { userId: '', name: 'OQ Technical Manager Mech', designation: '', department: '' }],
        issuer: p('Yogeshwar Krishna', 'Laboratory Director'),
      })
      const notReviewed = m.sig.applyReportPeopleToSignatures(settings, {
        testers: [p('OQ Testing Engineer Mech', 'Testing Engineer')],
        reviewers: [],
        issuer: p('Yogeshwar Krishna', 'Laboratory Director'),
      })
      const line = (sg) => `${sg.roleLabel}: ${sg.name} [${sg.showAfterParts.join(' ')}]`
      return [...out.signatures.map(line), '--', ...notReviewed.signatures.map(line)]
    },
    expected: [
      'Tested By: OQ Testing Engineer Mech [part_d]',
      'Approved By: OQ Technical Manager Mech [part_a part_b part_d]',
      '--',
      'Tested By: OQ Testing Engineer Mech [part_d]',
      'Approved By: Kunal Patle [part_a part_b part_d]',
    ],
  },
  {
    id: 'SC-01',
    module: 'scope',
    title: 'NABL scope of one result: Non-NABL when outside the accredited range, never NABL when the master is not',
    source:
      'Lab 26 Oct 2026: a NABL parameter whose result is outside the accredited range is reported as Non-NABL ' +
      '(NABL 133; ISO/IEC 17025 7.8.1). Hand: master NABL + no change → NABL; master NABL + Non NABL → Non NABL; ' +
      'master Non NABL + any value → Non NABL; report scope kind follows (A/B)',
    run: (m) => {
      const e = m.scope.effectiveResultScope
      return [
        e('NABL', null),
        e('NABL', 'Non NABL'),
        e('Non NABL', null),
        e('Non NABL', 'NABL'),
        m.scope.scopeKindFromLabel(e('NABL', 'Non NABL')),
      ]
    },
    expected: ['NABL', 'Non NABL', 'Non NABL', 'Non NABL', 'non_nabl'],
  },
  {
    id: 'SG-02',
    module: 'sig',
    title: 'Test report signatories: a person with their own Print Setting row prints with that row only',
    source:
      'Lab 26 Oct 2026: Print Setting Tested By Vishal after Part D, Tested By Rajat with no part, Approved By Kunal after ' +
      'A, B, D; both engineers entered results. Changes in Print Setting had no effect. Hand: Rajat not printed; Vishal ' +
      'after D; Kunal after A, B, D. Rajat switched off with parts → not printed; Rajat after Part A → printed after A, ' +
      'in Print Setting order',
    run: (m) => {
      const row = (roleLabel, id, name, parts, enabled = true) => ({ roleLabel, userId: id, name, designation: '', department: '', enabled, required: true, showAfterParts: parts })
      const person = (id, name, designation) => ({ userId: id, name, designation, department: '' })
      const people = {
        testers: [person('r', 'Rajat Maurya', 'Testing Engineer'), person('v', 'Vishal Rahangdale', 'Testing Engineer')],
        reviewers: [person('k', 'Kunal Patle', 'Technical Manager')],
        issuer: person('y', 'Yogeshwar Krishna', 'Laboratory Director'),
      }
      const layout = (rajat) => ({
        showSignatures: true,
        signatures: [row('Tested By', 'v', 'Vishal Rahangdale', ['part_d']), rajat, row('Approved By', 'k', 'Kunal Patle', ['part_a', 'part_b', 'part_d'])],
      })
      const line = (sg) => `${sg.roleLabel}: ${sg.name} [${sg.showAfterParts.join(' ')}]`
      const run = (rajat) => m.sig.applyReportPeopleToSignatures(layout(rajat), people).signatures.map(line)
      return [
        ...run(row('Tested By', 'r', 'Rajat Maurya', [])),
        '--',
        ...run(row('Tested By', 'r', 'Rajat Maurya', ['part_d'], false)),
        '--',
        ...run(row('Tested By', 'r', 'Rajat Maurya', ['part_a'])),
      ]
    },
    expected: [
      'Tested By: Vishal Rahangdale [part_d]',
      'Approved By: Kunal Patle [part_a part_b part_d]',
      '--',
      'Tested By: Vishal Rahangdale [part_d]',
      'Approved By: Kunal Patle [part_a part_b part_d]',
      '--',
      'Tested By: Vishal Rahangdale [part_d]',
      'Tested By: Rajat Maurya [part_a]',
      'Approved By: Kunal Patle [part_a part_b part_d]',
    ],
  },

  // ------------------------------------------------------------- test report number
  {
    id: 'RN-01',
    module: 'reportNo',
    title: 'Report number from prefix QI/TR/26/ and serial 7 (16 characters, NABL letter A)',
    source: 'Lab numbering rule (formattedTestReportNumber): prefix + zero-padded serial + A = 16 characters',
    run: (m) => m.reportNo.formatTestReportNumber('QI/TR/26/', 7),
    expected: 'QI/TR/26/000007A',
  },
  {
    id: 'RN-02',
    module: 'reportNo',
    title: 'Amendment / revised suffix, non-NABL letter and serial read back',
    source: 'Lab numbering rule: …AA amendment, …AR revised, B = non-NABL scope',
    run: (m) => [
      m.reportNo.withReceivingReportTypeSuffix('QI/TR/26/000007A', 'Amendment Report'),
      m.reportNo.withReceivingReportTypeSuffix('QI/TR/26/000007A', 'Revised Report'),
      m.reportNo.toReportNumberForScope('QI/TR/26/000007A', 'non_nabl'),
      m.reportNo.parseTestReportSequence('QI/TR/26/000007B', 'QI/TR/26/'),
      m.reportNo.stripReceivingReportTypeSuffix('QI/TR/26/000007AS'),
    ],
    expected: ['QI/TR/26/000007AA', 'QI/TR/26/000007AR', 'QI/TR/26/000007B', 7, 'QI/TR/26/000007A'],
  },
  {
    id: 'RN-03',
    module: 'reportNo',
    title: 'Serial capacity: a 14-character prefix leaves one digit; serial 19 grows the number, never cut to 9',
    source:
      'Requirement URS-RPT-03 (report numbers are never repeated): QIRLPL/TR/2026 + 9 + A; + 19 + A (17 characters); ' +
      'serial read back, amendment letter added after the scope letter',
    run: (m) => {
      const p = 'QIRLPL/TR/2026'
      const a = m.reportNo.formatTestReportNumber(p, 9)
      const b = m.reportNo.formatTestReportNumber(p, 19)
      return {
        a,
        b,
        differ: a !== b,
        serialB: m.reportNo.parseTestReportSequence(b, p),
        amendedB: m.reportNo.withReceivingReportTypeSuffix(b, 'Amendment Report'),
        nonNablB: m.reportNo.toReportNumberForScope(b, 'non_nabl'),
      }
    },
    expected: {
      a: 'QIRLPL/TR/20269A',
      b: 'QIRLPL/TR/202619A',
      differ: true,
      serialB: 19,
      amendedB: 'QIRLPL/TR/202619AA',
      nonNablB: 'QIRLPL/TR/202619B',
    },
  },

  // ------------------------------------------------------------- IS 2 rounding (src/lib/is2Rounding.ts)
  {
    id: 'IS-01',
    module: 'is2',
    title: 'Exact half rounds to the even digit: 2.25 → 2.2, 2.35 → 2.4, 2.45 → 2.4 (1 dp)',
    source: 'IS 2:1960: dropped digit exactly 5 → kept digit made even',
    run: (m) => [m.is2.is2RoundFixed(2.25, 1), m.is2.is2RoundFixed(2.35, 1), m.is2.is2RoundFixed(2.45, 1)],
    expected: ['2.2', '2.4', '2.4'],
  },
  {
    id: 'IS-02',
    module: 'is2',
    title: 'More / less than half: 2.251 → 2.3, 2.249 → 2.2, 2.2500001 → 2.3 (1 dp)',
    source: 'IS 2:1960: a 5 followed by any non-zero digit is more than half → round up',
    run: (m) => [m.is2.is2RoundFixed(2.251, 1), m.is2.is2RoundFixed(2.249, 1), m.is2.is2RoundFixed('2.2500001', 1)],
    expected: ['2.3', '2.2', '2.3'],
  },
  {
    id: 'IS-03',
    module: 'is2',
    title: 'Written halves are not spoilt by binary floating point: 1.015, 8.335, 8.345 (2 dp); 0.0125 (3 dp)',
    source: 'IS 2:1960 on the decimal value: 1.015 → 1.02; 8.335 → 8.34; 8.345 → 8.34; 0.0125 → 0.012',
    run: (m) => [
      m.is2.is2RoundFixed(1.015, 2),
      m.is2.is2RoundFixed(8.335, 2),
      m.is2.is2RoundFixed(8.345, 2),
      m.is2.is2RoundFixed(0.0125, 3),
    ],
    expected: ['1.02', '8.34', '8.34', '0.012'],
  },
  {
    id: 'IS-04',
    module: 'is2',
    title: 'Negative values round by magnitude: −2.25 → −2.2, −2.35 → −2.4; −0.004 (2 dp) → 0.00',
    source: 'IS 2:1960 applied to the magnitude; a result of zero carries no sign',
    run: (m) => [m.is2.is2RoundFixed(-2.25, 1), m.is2.is2RoundFixed(-2.35, 1), m.is2.is2RoundFixed(-0.004, 2)],
    expected: ['-2.2', '-2.4', '0.00'],
  },
  {
    id: 'IS-05',
    module: 'is2',
    title: 'Declared decimals kept: 10.2 → "10.20", 9.995 → "10.00", 5 → "5.000", "10.20" → "10.20"',
    source: 'Lab decision 23 Oct 2026: trailing zeros are significant; 9.995 is an exact half, 9 odd → up',
    run: (m) => [
      m.is2.is2RoundFixed(10.2, 2),
      m.is2.is2RoundFixed(9.995, 2),
      m.is2.is2RoundFixed(5, 3),
      m.is2.is2RoundFixed('10.20', 2),
    ],
    expected: ['10.20', '10.00', '5.000', '10.20'],
  },
  {
    id: 'IS-06',
    module: 'is2',
    title: 'Rounding to an interval: 2.25 and 2.75 to 0.5; 12.5 and 17.5 to 5',
    source: 'IS 2:1960: nearest multiple, the even multiple when exactly half way (2.0, 3.0, 10, 20)',
    run: (m) => [
      m.is2.is2RoundToInterval(2.25, 0.5),
      m.is2.is2RoundToInterval(2.75, 0.5),
      m.is2.is2RoundToInterval(12.5, 5),
      m.is2.is2RoundToInterval(17.5, 5),
    ],
    expected: ['2.0', '3.0', '10', '20'],
  },
  {
    id: 'IS-07',
    module: 'rds',
    title: 'Raw data sheet output text: "0.125" and "1.35±0.025" to 2 dp',
    source: 'IS 2:1960: 0.125 → 0.12 (2 even); 0.025 → 0.02 (2 even); 1.35 kept',
    run: (m) => [m.rds.formatFormulaOutput('0.125', 2), m.rds.formatFormulaOutput('1.35±0.025', 2)],
    expected: ['0.12', '1.35±0.02'],
  },
  {
    id: 'IS-08',
    module: 'mu',
    title: 'MU figure display: 0.0125 and 0.0135 to 3 dp; 0.02 to 3 dp',
    source: 'IS 2:1960: 0.012 (2 even), 0.014 (3 odd → up); declared decimals kept: 0.020',
    run: (m) => [m.mu.formatMuNumber(0.0125, 3), m.mu.formatMuNumber(0.0135, 3), m.mu.formatMuNumber(0.02, 3)],
    expected: ['0.012', '0.014', '0.020'],
  },

  // ---------------------------------------- spreadsheet ROUND / MROUND inside formulas (IS 2)
  {
    id: 'IS-09',
    module: 'rds',
    title: 'Formula ROUND(x,n): exact half to the even digit, judged on the decimal digits',
    source:
      'IS 2:1960 (lab decision 23 Oct 2026): 2.25 → 2.2 (2 even); 2.35 → 2.4 (3 odd → up); 1.015 → 1.02 ' +
      '(decimal half, 1 odd → up; binary 1.01499… must not give 1.01); −2.25 → −2.2 (magnitude); ' +
      '2.5 → 2, 3.5 → 4 (no digits = whole number); 2.251 → 2.3 (more than half); 1/3 → 0.3333',
    run: (m) =>
      [
        'ROUND(2.25,1)',
        'ROUND(2.35,1)',
        'ROUND(1.015,2)',
        'ROUND(-2.25,1)',
        'ROUND(2.5)',
        'ROUND(3.5)',
        'ROUND(2.251,1)',
        'ROUND(1/3,4)',
      ].map((f) => m.rds.evaluateMathExpression(f)),
    expected: [2.2, 2.4, 1.02, -2.2, 2, 4, 2.3, 0.3333],
  },
  {
    id: 'IS-10',
    module: 'rds',
    title: 'Formula ROUND(x,−n) rounds to tens / hundreds by IS 2',
    source:
      'IS 2:1960 rounding to a multiple of 100 / 10: 1250 → 1200 (12 even); 1350 → 1400 (13 odd → up); ' +
      '1251 → 1300 (more than half); −1250 → −1200; 25 → 20 (2 even)',
    run: (m) =>
      ['ROUND(1250,-2)', 'ROUND(1350,-2)', 'ROUND(1251,-2)', 'ROUND(-1250,-2)', 'ROUND(25,-1)'].map((f) =>
        m.rds.evaluateMathExpression(f),
      ),
    expected: [1200, 1400, 1300, -1200, 20],
  },
  {
    id: 'IS-11',
    module: 'rds',
    title: 'Formula MROUND(x,m): nearest multiple, the even multiple when exactly half way',
    source:
      'IS 2:1960 rounding to an interval: 7.5/5 = 1.5 → 2 → 10; 12.5/5 = 2.5 → 2 → 10; ' +
      '0.125/0.05 = 2.5 → 2 → 0.10; 2.25/0.5 = 4.5 → 4 → 2.0; 2.75/0.5 = 5.5 → 6 → 3.0; ' +
      '17.4/5 = 3.48 → 3 → 15; −12.5 with −5 → −10; 0.7 to 0.1 is 0.7 exactly (no binary 0.7000000000000001); ' +
      'multiple 0 gives no result',
    run: (m) =>
      [
        'MROUND(7.5,5)',
        'MROUND(12.5,5)',
        'MROUND(0.125,0.05)',
        'MROUND(2.25,0.5)',
        'MROUND(2.75,0.5)',
        'MROUND(17.4,5)',
        'MROUND(-12.5,-5)',
        'MROUND(0.7,0.1)',
        'MROUND(3,0)',
      ].map((f) => m.rds.evaluateMathExpression(f)),
    expected: [10, 10, 0.1, 2, 3, 15, -10, 0.7, null],
  },
  {
    id: 'IS-12',
    module: 'point',
    title: 'ROUND / MROUND in point and column formulas; ROUNDUP / ROUNDDOWN stay directional',
    source:
      'IS 2:1960: point formula ROUND(x/4,1) at x = 9 → 2.25 → 2.2; MROUND(x,0.5) at x = 2.25 → 2.0; ' +
      'column =ROUND([A]-[B],2) with 10.0 − 9.995 = 0.005 → 0.00 (0 even); ' +
      'ROUNDUP / ROUNDDOWN are not IS 2 rounding (away from / toward zero): 2.1 → 3, −2.1 → −3, −2.9 → −2',
    run: (m) => [
      m.point.evaluatePointFormula('ROUND(x/4,1)', 9),
      m.point.evaluatePointFormula('MROUND(x,0.5)', 2.25),
      m.rds.evaluateColumnFormulaExpression('=ROUND([A]-[B],2)', [numberCol('A'), numberCol('B')], {
        A: '10.0',
        B: '9.995',
      }),
      m.rds.evaluateMathExpression('ROUNDUP(2.1)'),
      m.rds.evaluateMathExpression('ROUNDUP(-2.1)'),
      m.rds.evaluateMathExpression('ROUNDDOWN(-2.9)'),
    ],
    expected: [2.2, 2, 0, 3, -3, -2],
  },

  // ------------------------------------------------------------- finance document series
  {
    id: 'DS-01',
    module: 'series',
    title: 'Financial year at the 31 March / 1 April boundary (India time)',
    source: 'Indian FY runs 1 April – 31 March; IST = UTC + 05:30',
    run: (m) => [
      m.series.resolveSeriesPrefix('QI/{FY}/', IST_2026_03_31_235959),
      m.series.resolveSeriesPrefix('QI/{FY}/', IST_2026_04_01_000000),
    ],
    expected: ['QI/25-26/', 'QI/26-27/'],
  },
  {
    id: 'DS-02',
    module: 'series',
    title: 'Calendar year tokens at New Year (India time) and FY in January',
    source: 'Hand: 1 Jan 2027 IST → YYYY 2027, YY 27, FY 26-27',
    run: (m) => m.series.resolveSeriesPrefix('{YYYY}/{YY}/{FY}', IST_2027_01_01_000000),
    expected: '2027/27/26-27',
  },
  {
    id: 'DS-03',
    module: 'series',
    title: 'Century wrap of the FY token (FY 2099–2100)',
    source: 'Hand: two-digit years 99-00',
    run: (m) => m.series.resolveSeriesPrefix('{FY}', IST_2099_04_01_120000),
    expected: '99-00',
  },
  {
    id: 'DS-04',
    module: 'series',
    title: 'Document number padding and padding limit (1–8 digits); document types',
    source: 'Specification in documentSeriesApi.sampleDocumentNumber / seriesDocType',
    run: (m) => [
      m.series.sampleDocumentNumber({ prefix: 'INV/', pad_width: 4, next_number: 7 }),
      m.series.sampleDocumentNumber({ prefix: 'INV/', pad_width: 12, next_number: 7 }),
      m.series.seriesDocType('invoice'),
      m.series.seriesDocType('unknown'),
    ],
    expected: ['INV/0007', 'INV/00000007', 'TAX_INVOICE', null],
  },

  // ------------------------------------------------------------- metallography: scale and statistics
  {
    id: 'MC-01',
    module: 'mgScale',
    title: 'Microscope scale: 100 µm over 199, 200, 201 px on each axis → µm/px, s, u_rel',
    source:
      'Hand: mean = 600 / 3 = 200 px; µm/px = 100 / 200 = 0.5000; deviations −1, 0, +1 → ' +
      's = √(2 / 2) = 1 px; u_rel = 1 / 200 × 100 = 0.50 %. Same rule as the database calibration guard',
    run: (m) => {
      const r = m.mgScale.computeScaleFromReadings(
        [...micrometerReadings('x', [199, 200, 201]), ...micrometerReadings('y', [199, 200, 201])],
        100,
      )
      return {
        meanPxX: r.meanPxX,
        meanPxY: r.meanPxY,
        umPerPxX: r.umPerPxX,
        umPerPxY: r.umPerPxY,
        sPxX: r.sPxX,
        sPxY: r.sPxY,
        uRelScalePct: r.uRelScalePct,
        errors: r.errors,
      }
    },
    expected: { meanPxX: 200, meanPxY: 200, umPerPxX: 0.5, umPerPxY: 0.5, sPxX: 1, sPxY: 1, uRelScalePct: 0.5, errors: [] },
    tol: 1e-9,
  },
  {
    id: 'MC-02',
    module: 'mgStats',
    title: 'Field statistics of 10, 12, 11, 13, 9: mean, s, 95 % CI, % relative accuracy',
    source:
      'Hand: mean = 55 / 5 = 11.000; Σ(x − mean)² = 10 → s = √(10 / 4) = 1.581; ' +
      't(0.975, 4) = 2.776 (t table); CI95 = 2.776 × 1.581 / √5 = 1.963; %RA = 1.963 / 11 × 100 = 17.8',
    run: (m) => {
      const r = m.mgStats.fieldStatistics([10, 12, 11, 13, 9])
      return [
        r.n,
        m.is2.is2RoundFixed(r.mean, 3),
        m.is2.is2RoundFixed(r.s, 3),
        r.t95,
        m.is2.is2RoundFixed(r.ci95, 3),
        m.is2.is2RoundFixed(r.relativeAccuracyPct, 1),
      ]
    },
    expected: [5, '11.000', '1.581', 2.776, '1.963', '17.8'],
  },

  // ------------------------------------------------------------- metallography: ring test (IS 1786)
  {
    id: 'RT-01',
    module: 'mgRing',
    title: 'Ring test: outer r 300 px, inner r 210 px, 0.02 mm/px, d 12 mm, 1 px gaps → thickness in range, TM 51.0 % → FAIL',
    source:
      'Hand: t = (300 − 1) − (210 + 1) = 88 px × 0.02 = 1.760 mm at all 8 points; limits 0.07 × 12 = 0.84 to ' +
      '0.15 × 12 = 1.80 mm → in range; TM = π(300² − 210²) = π·45900 px², F&P = π·44100 px² → ' +
      'TM = 18.36π = 57.6796 mm², F&P = 17.64π = 55.4177 mm²; share = 45900 / 90000 = 51.0 % > 50 % → FAIL',
    run: (m) =>
      ringOutcome(
        m.mgRing.computeRing(ringGeometry(ringCircle(210), ringCircle(300), 1), { kind: 'in_image', mmPerPx: 0.02 }, 12, RING_LIMITS),
      ),
    expected: {
      thickness_mm: [1.76, 1.76, 1.76, 1.76, 1.76, 1.76, 1.76, 1.76],
      valid_point_count: 8,
      thickness_range_low_mm: 0.84,
      thickness_range_high_mm: 1.8,
      thickness_in_range: true,
      area_tm_mm2: 57.6796,
      area_fp_mm2: 55.4177,
      tm_share_pct: 51,
      tm_share_in_range: false,
      overall_pass: false,
    },
    tol: 1e-9,
  },
  {
    id: 'RT-02',
    module: 'mgRing',
    title: 'Ring test: as RT-01 with inner r 225 px → t 1.460 mm in range, TM 43.75 % → PASS',
    source:
      'Hand: t = 299 − 226 = 73 px × 0.02 = 1.460 mm (0.84–1.80 mm → in range); TM = π(90000 − 50625) = π·39375 px² ' +
      '= 15.75π = 49.4801 mm², F&P = π·50625 px² = 20.25π = 63.6173 mm²; share = 39375 / 90000 = 43.75 % ' +
      '(30–50 %) → PASS',
    run: (m) =>
      ringOutcome(
        m.mgRing.computeRing(ringGeometry(ringCircle(225), ringCircle(300), 1), { kind: 'in_image', mmPerPx: 0.02 }, 12, RING_LIMITS),
      ),
    expected: {
      thickness_mm: [1.46, 1.46, 1.46, 1.46, 1.46, 1.46, 1.46, 1.46],
      valid_point_count: 8,
      thickness_range_low_mm: 0.84,
      thickness_range_high_mm: 1.8,
      thickness_in_range: true,
      area_tm_mm2: 49.4801,
      area_fp_mm2: 63.6173,
      tm_share_pct: 43.75,
      tm_share_in_range: true,
      overall_pass: true,
    },
    tol: 1e-9,
  },
  {
    id: 'RT-03',
    module: 'mgRing',
    title: 'Ring test polygon edges: inner square 100 px, outer square 200 px, 0.1 mm/px → areas by shoelace',
    source:
      'Hand: outer square (200 × 0.1)² = 400 mm², inner (100 × 0.1)² = 100 mm² → TM = 300 mm², F&P = 100 mm², ' +
      'share = 300 / 400 = 75.0 %. Circles through the same points would give other areas (old code used circles)',
    run: (m) => {
      const s = m.mgRing.computeRing(
        ringGeometry(ringSquare(300, 300, 100), ringSquare(300, 300, 200), 0),
        { kind: 'calibration', umPerPxX: 100, umPerPxY: 100 },
        12,
        RING_LIMITS,
      )
      return { area_tm_mm2: s.area_tm_mm2, area_fp_mm2: s.area_fp_mm2, tm_share_pct: s.tm_share_pct }
    },
    expected: { area_tm_mm2: 300, area_fp_mm2: 100, tm_share_pct: 75 },
    tol: 1e-9,
  },
  {
    id: 'RT-04',
    module: 'mgRing',
    title: 'Ring test: thickness exactly 0.07 d → in range when limits are inclusive, out when exclusive',
    source:
      'Hand: d 12 mm → 0.07 d = 0.84 mm = 42 px at 0.02 mm/px; outer r 300, inner r 256, 1 px gaps → ' +
      't = 299 − 257 = 42 px = 0.840 mm at all 8 points. Inclusive limits (≥ low, ≤ high) → in range; exclusive ' +
      '(> low, < high) → out. The method setting limits_inclusive decides; which one IS 1786 requires is confirmed ' +
      'in Phase 0 (default inclusive, flagged "verify against IS 1786")',
    run: (m) => {
      const g = ringGeometry(ringCircle(256), ringCircle(300), 1)
      const scale = { kind: 'in_image', mmPerPx: 0.02 }
      const inc = m.mgRing.computeRing(g, scale, 12, { ...RING_LIMITS, limits_inclusive: true })
      const exc = m.mgRing.computeRing(g, scale, 12, { ...RING_LIMITS, limits_inclusive: false })
      return [inc.thickness_min_mm, inc.thickness_max_mm, inc.thickness_in_range, exc.thickness_in_range]
    },
    expected: [0.84, 0.84, true, false],
  },
  {
    id: 'RT-05',
    module: 'mgRing',
    title: 'Ring test with separate x / y scale (20 × 25 µm/px): thickness per axis, areas π r² sx sy, share unchanged',
    source:
      'Hand: as RT-02 (inner r 225, outer r 300, 1 px gaps → 73 px along every ray) with 0.020 mm/px across and ' +
      '0.025 mm/px down. t1 / t5 (vertical) = 73 × 0.025 = 1.825 mm; t3 / t7 (horizontal) = 73 × 0.020 = 1.460 mm; ' +
      't2, t4, t6, t8 (45°) = 73 × √((0.020² + 0.025²) / 2) = 73 × 0.0226385 = 1.6526 → 1.653 mm. Outer area ' +
      'π·90000 × 0.020 × 0.025 = 45π = 141.3717 mm², F&P = π·50625 × 0.0005 = 25.3125π = 79.5216 mm², ' +
      'TM = 61.8501 mm²; share = 61.8501 / 141.3717 = 43.75 % (as with one scale). 1.825 > 0.15 × 12 = 1.80 → FAIL',
    run: (m) => {
      const s = m.mgRing.computeRing(
        ringGeometry(ringCircle(225), ringCircle(300), 1),
        { kind: 'calibration', umPerPxX: 20, umPerPxY: 25 },
        12,
        RING_LIMITS,
      )
      return ringOutcome(s)
    },
    expected: {
      thickness_mm: [1.825, 1.653, 1.46, 1.653, 1.825, 1.653, 1.46, 1.653],
      valid_point_count: 8,
      thickness_range_low_mm: 0.84,
      thickness_range_high_mm: 1.8,
      thickness_in_range: false,
      area_tm_mm2: 61.8501,
      area_fp_mm2: 79.5216,
      tm_share_pct: 43.75,
      tm_share_in_range: true,
      overall_pass: false,
    },
    tol: 1e-9,
  },
  {
    id: 'RT-06',
    module: 'mgRing',
    title: 'Ring test: one source of d — a measured diameter line does not move the limits',
    source:
      'Hand: nominal d 10 mm → limits 0.07 × 10 = 0.70 to 0.15 × 10 = 1.50 mm. A diameter line of 600 px at ' +
      '0.02 mm/px measures 12.000 mm and is recorded for information only (the old code switched the limits ' +
      'to 0.84–1.80 mm). RT-02 geometry: t = 1.460 mm, inside 0.70–1.50',
    run: (m) => {
      const g = { ...ringGeometry(ringCircle(225), ringCircle(300), 1), diameterLines: [{ x1: 100, y1: 400, x2: 700, y2: 400 }] }
      const s = m.mgRing.computeRing(g, { kind: 'in_image', mmPerPx: 0.02 }, 10, RING_LIMITS)
      return [s.d_mm, s.d_source, s.d_measured_mm, s.thickness_range_low_mm, s.thickness_range_high_mm, s.thickness_in_range]
    },
    expected: [10, 'nominal', 12, 0.7, 1.5, true],
  },
  {
    id: 'RT-07',
    module: 'mgRing',
    title: 'Ring test: thickness points not applied → no valid point, FAIL even when the TM share is in range',
    source:
      'Design 3.6 (thickness points required): RT-02 geometry (TM 43.75 %, in 30–50 %) with thicknessApplied ' +
      'false → 0 of 8 thickness points, thickness not in range, overall FAIL; the summary is not complete',
    run: (m) => {
      const g = { ...ringGeometry(ringCircle(225), ringCircle(300), 1), thicknessApplied: false }
      const s = m.mgRing.computeRing(g, { kind: 'in_image', mmPerPx: 0.02 }, 12, RING_LIMITS)
      return [s.valid_point_count, s.thickness_in_range, s.tm_share_in_range, s.overall_pass, m.mgRing.ringSummaryComplete(s)]
    },
    expected: [0, false, true, false, false],
  },
  {
    id: 'RT-08',
    module: 'mgRing',
    title: 'Ring test: thickness exactly 0.15 d → in range when limits are inclusive, out when exclusive',
    source:
      'Hand: d 12 mm → 0.15 d = 1.80 mm = 90 px at 0.02 mm/px; outer r 300, inner r 208, 1 px gaps → ' +
      't = 299 − 209 = 90 px = 1.800 mm at all 8 points. Inclusive (≤ high) → in range; exclusive (< high) → out',
    run: (m) => {
      const g = ringGeometry(ringCircle(208), ringCircle(300), 1)
      const scale = { kind: 'in_image', mmPerPx: 0.02 }
      const inc = m.mgRing.computeRing(g, scale, 12, { ...RING_LIMITS, limits_inclusive: true })
      const exc = m.mgRing.computeRing(g, scale, 12, { ...RING_LIMITS, limits_inclusive: false })
      return [inc.thickness_min_mm, inc.thickness_max_mm, inc.thickness_in_range, exc.thickness_in_range]
    },
    expected: [1.8, 1.8, true, false],
  },
  {
    id: 'RT-09',
    module: 'mgRing',
    title: 'Ring test: TM share exactly 50 % and 30 % → in range when inclusive, out when exclusive',
    source:
      'Hand: outer r 300 px at 0.02 mm/px → outer area 36π = 113.0973 mm². Inner r 300/√2 → F&P = 18π = ' +
      '56.5487 mm², TM = 56.5487 mm², share 50.00 % (t = 299 − 213.13 = 85.87 px = 1.717 mm, in 0.84–1.80). ' +
      'Inner r 300·√0.7 → F&P = 25.2π = 79.1681 mm², TM = 33.9292 mm², share 33.9292 / 113.0973 = 30.00 % ' +
      '(t = 299 − 252.00 = 47.00 px = 0.940 mm). Inclusive (≥ 30, ≤ 50) → in; exclusive (> 30, < 50) → out',
    run: (m) => {
      const scale = { kind: 'in_image', mmPerPx: 0.02 }
      const exc = { ...RING_LIMITS, limits_inclusive: false }
      const g50 = ringGeometry(ringCircle(300 / Math.SQRT2), ringCircle(300), 1)
      const g30 = ringGeometry(ringCircle(300 * Math.sqrt(0.7)), ringCircle(300), 1)
      const i50 = m.mgRing.computeRing(g50, scale, 12, RING_LIMITS)
      const e50 = m.mgRing.computeRing(g50, scale, 12, exc)
      const i30 = m.mgRing.computeRing(g30, scale, 12, RING_LIMITS)
      const e30 = m.mgRing.computeRing(g30, scale, 12, exc)
      return [
        i50.area_tm_mm2,
        i50.area_fp_mm2,
        i50.tm_share_pct,
        i50.tm_share_in_range,
        i50.overall_pass,
        e50.tm_share_in_range,
        i30.area_tm_mm2,
        i30.area_fp_mm2,
        i30.tm_share_pct,
        i30.tm_share_in_range,
        e30.tm_share_in_range,
      ]
    },
    expected: [56.5487, 56.5487, 50, true, true, false, 33.9292, 79.1681, 30, true, false],
    tol: 1e-9,
  },
  {
    id: 'RTD-01',
    module: 'mgRingDetect',
    title: 'Ring edge detection on a drawn ring: light core r 110 px, dark rim to r 150 px → both edges found',
    source:
      'Hand: 400 × 400 px image drawn by the case, centre (200, 200): grey 200 inside r 110 (F&P core), grey 40 ' +
      'from r 110 to r 150 (TM rim), 255 outside. The proposals (the analyst confirms every edge) must lie within ' +
      '3 px of the drawn edges and centre: inner r 110, outer r 150, centre 200, 200',
    run: (m) => {
      const W = 400
      const data = new Uint8Array(W * W)
      for (let y = 0; y < W; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const r = Math.hypot(x + 0.5 - 200, y + 0.5 - 200)
          data[y * W + x] = r <= 110 ? 200 : r <= 150 ? 40 : 255
        }
      }
      const res = m.mgRingDetect.detectRing({ width: W, height: W, data }, { which: 'both' })
      const radius = (s) => (s ? m.mgRing.shapeMeanRadiusPx(s) : null)
      return [radius(res.inner), radius(res.outer), res.outer?.cx ?? null, res.outer?.cy ?? null, res.warnings.length]
    },
    expected: [110, 150, 200, 200, 0],
    tol: 3,
  },

  // ------------------------------------------------------------- metallography: reported value
  {
    id: 'MF-01',
    module: 'mgFormat',
    title: 'Metallography single value: G 7.46 at 1 decimal → "7.5" (IS 2 rounding)',
    source: 'IS 2:1960: dropped part 0.06 of 0.1 is more than half → round up → 7.5',
    run: (m) => m.mgFormat.formatSingleValue(7.46, 1),
    expected: '7.5',
  },
  {
    id: 'MF-02',
    module: 'mgFormat',
    title: 'Ring test reported value at the precision of the verdict: t 1.805 mm, d 12, method decimals 2 → "1.805 mm", FAIL',
    source:
      'Hand: outer r 300, inner r 207.75, 1 px gaps, 0.02 mm/px → t = 299 − 208.75 = 90.25 px = 1.805 mm at all 8 ' +
      'points, above 0.15 × 12 = 1.80 → FAIL. The text keeps 3 decimals whatever the method decimals ' +
      '(re-rounding to 2 would print "1.80 mm", which reads as on the limit). TM share = 1 − (207.75 / 300)² = ' +
      '52.04 %',
    run: (m) => {
      const s = m.mgRing.computeRing(
        ringGeometry(ringCircle(207.75), ringCircle(300), 1),
        { kind: 'in_image', mmPerPx: 0.02 },
        12,
        RING_LIMITS,
      )
      const r = m.mgFormat.formatMetallographyResult({ kind: 'ring_test', summary: s, reportedUnit: 'mm', decimals: 2 })
      return [r.reportedText, r.verdict, r.structured?.decimals ?? null]
    },
    expected: [
      't1 1.805 mm, t2 1.805 mm, t3 1.805 mm, t4 1.805 mm, t5 1.805 mm, t6 1.805 mm, t7 1.805 mm, t8 1.805 mm; TM 52.04 %',
      'FAIL',
      3,
    ],
  },
]

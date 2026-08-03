export const ITEM_TYPES = ['Product', 'Service'] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export const ITEM_CATEGORIES = ['Calibration', 'Testing'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export type ProductServiceRow = {
  id: string
  item_type: ItemType
  item_code: string
  item_category: ItemCategory
  item_name: string
  item_description: string | null
  hsn_code: string | null
  sale_price: number
  purchase_price: number
  gst_percent: number
  discount: number
  unit_of_measurement: string | null
  opening_stock: number
  low_stock_alert: number
  created_at?: string
  updated_at?: string
}

export type ProductServiceForm = {
  itemType: ItemType
  itemCode: string
  itemCategory: ItemCategory
  itemName: string
  itemDescription: string
  hsnCode: string
  salePrice: string
  purchasePrice: string
  gstPercent: string
  discount: string
  unitOfMeasurement: string
  openingStock: string
  lowStockAlert: string
}

export function emptyProductServiceForm(itemType: ItemType = 'Product'): ProductServiceForm {
  return {
    itemType,
    itemCode: '',
    itemCategory: 'Testing',
    itemName: '',
    itemDescription: '',
    hsnCode: '',
    salePrice: '0',
    purchasePrice: '0',
    gstPercent: '0',
    discount: '0',
    unitOfMeasurement: '',
    openingStock: '0',
    lowStockAlert: '0',
  }
}

export function normalizeText(value: string): string {
  return value.trim()
}

export function isValidNumberOrEmpty(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isFinite(n)
}

export function parseMoney(value: string): number {
  const n = Number(value.trim())
  return Number.isFinite(n) ? n : 0
}

export function formatMoney(value: number | null | undefined): string {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Next code: Product → P-0001, Service → S-0001 */
export function nextItemCode(itemType: ItemType, existingCodes: string[]): string {
  const prefix = itemType === 'Product' ? 'P-' : 'S-'
  let max = 0
  for (const code of existingCodes) {
    const m = code.trim().toUpperCase().match(new RegExp(`^${prefix}(\\d+)$`, 'i'))
    if (!m) continue
    const n = Number.parseInt(m[1]!, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/** Product-only stock fields — hidden when Service is selected */
export function isProductStockFieldVisible(itemType: ItemType): boolean {
  return itemType === 'Product'
}

export type ItemCategory = 'Product' | 'Service'

export type ProductServiceRow = {
  id: string
  category: ItemCategory
  item_code: string
  make: string | null
  serial_model_no: string | null
  item_name: string
  item_description: string | null
  hsn_code: string | null
  gst_rate: number | null
  unit_of_item: string | null
  low_stock_value: number | null
  purchase_price: number | null
  sale_price: number | null
  maximum_retail_price: number | null
  opening_stock: number | null
  created_at?: string
}

export type ProductServiceForm = {
  category: ItemCategory
  itemCode: string
  make: string
  serialModelNo: string
  itemName: string
  itemDescription: string
  hsnCode: string
  gstRate: string
  unitOfItem: string
  lowStockValue: string
  purchasePrice: string
  salePrice: string
  maximumRetailPrice: string
  openingStock: string
}

export const emptyProductServiceForm = (): ProductServiceForm => ({
  category: 'Service',
  itemCode: '',
  make: '',
  serialModelNo: '',
  itemName: '',
  itemDescription: '',
  hsnCode: '',
  gstRate: '',
  unitOfItem: '',
  lowStockValue: '',
  purchasePrice: '',
  salePrice: '',
  maximumRetailPrice: '',
  openingStock: '',
})

export const normalizeText = (value: string) => value.trim()

export const isValidNumberOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isFinite(n)
}

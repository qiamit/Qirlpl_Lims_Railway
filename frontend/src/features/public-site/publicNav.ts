export const PUBLIC_SITE_PATHS = [
  '/home',
  '/about',
  '/testing',
  '/calibration',
  '/resources',
  '/news',
  '/contact',
  '/auth',
] as const

export type PublicSitePath = (typeof PUBLIC_SITE_PATHS)[number]

export const PUBLIC_NAV_ITEMS: Array<{ to: PublicSitePath; label: string }> = [
  { to: '/home', label: 'Home' },
  { to: '/auth', label: 'Login' },
]

export const PUBLIC_SECTION_LINKS: Array<{ href: string; label: string }> = [
  { href: '/home', label: 'Home' },
  { href: '/home#about', label: 'About' },
  { href: '/home#contact', label: 'Contact Us' },
  { href: '/auth', label: 'Login' },
]

export function isPublicSitePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return (PUBLIC_SITE_PATHS as readonly string[]).includes(path)
}

export const PUBLIC_LAB_NAME = 'Quality International Research & Laboratories Private Limited'
export const PUBLIC_TAGLINE_LEAD = 'Reliability For'
export const PUBLIC_TAGLINE_ACCENT = 'Precision'
export const PUBLIC_TAGLINE_SUB =
  'We Are an NABL-Accredited Laboratory as per ISO/IEC 17025:2017 for Testing (TC-15442) and Calibration (CC-3039), and a BIS Authorized Testing Centre (Lab Code 5197006). Our Work Covers Metals, Construction Materials, Plywood, Textiles and Precision Calibration with Full Measurement Traceability. Manufacturers and Quality Teams Rely on QIRLPL for Independent, Timely Reports that Support Compliance, Audits and Everyday Production Decisions.'
export const PUBLIC_EMAIL = 'info@qirlpl.com'
export const PUBLIC_SUPPORT_EMAIL = 'support@qirl.co.in'
export const PUBLIC_PHONE_PRIMARY = '+91 99816 33040'
export const PUBLIC_PHONE_SECONDARY = '+91 99146 63040'
export const PUBLIC_ADDRESS =
  'Plot No 7A, Avinash Logistic Park, SKS Road, Siltara Industrial Area, Phase II, Raipur 493221, Chhattisgarh, India'
export const PUBLIC_MAP_LAT = 21.384439868124627
export const PUBLIC_MAP_LNG = 81.66191600236276
export const PUBLIC_NABL_TESTING = 'NABL TC-15442'
export const PUBLIC_NABL_CALIBRATION = 'NABL CC-3039'
export const PUBLIC_CIN = 'U70200CT2024PTC015802'
export const PUBLIC_BIS = 'Lab Code 5197006'
export const PUBLIC_DOC_NABL_CALIBRATION =
  'https://www.qirlpl.com/assets/documents/NABL%20Certificate%20Calibration.pdf'
export const PUBLIC_DOC_NABL_TESTING = 'https://www.qirlpl.com/assets/documents/NABL%20Certificate.pdf'
export const PUBLIC_DOC_BIS = 'https://www.qirlpl.com/assets/documents/BIS%20QIRLPL.pdf'

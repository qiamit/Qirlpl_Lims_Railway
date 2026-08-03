import ManagementDocumentsMasterPage from './ManagementDocumentsMasterPage'
import type { ManagementDocLevel } from './types'

export function ManagementDocsLevelPage({ level }: { level: ManagementDocLevel }) {
  return <ManagementDocumentsMasterPage level={level} />
}

export default ManagementDocsLevelPage

import React from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from '@/components/ui/file-upload'
import type { RegistrationDocument } from './types'

type LegalDocumentsTabProps = {
  saveMessage: string | null
  saveLoading: boolean
  onSave: () => void

  registrationDocs: RegistrationDocument[]
  setRegistrationDocs: React.Dispatch<React.SetStateAction<RegistrationDocument[]>>

  registrationDialogOpen: boolean
  setRegistrationDialogOpen: (open: boolean) => void
  newRegistrationName: string
  setNewRegistrationName: (value: string) => void
  onAddRegistrationDocument: () => void

  registrationDeleteTarget: { id: string; name: string } | null
  setRegistrationDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteRegistrationCard: () => void
}

export function LegalDocumentsTab(props: LegalDocumentsTabProps) {
  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-end gap-3 pt-4">
          {props.saveMessage && (
            <p
              className={
                props.saveMessage.toLowerCase().includes('saved')
                  ? 'text-sm text-emerald-700'
                  : 'text-sm text-destructive'
              }
            >
              {props.saveMessage}
            </p>
          )}
          <Button className="gap-2" onClick={props.onSave} disabled={props.saveLoading}>
            <Save size={16} />
            {props.saveLoading ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between mt-4">
            <h3 className="text-sm font-semibold text-foreground">Registration Documents</h3>
            <Dialog open={props.registrationDialogOpen} onOpenChange={props.setRegistrationDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus size={14} />
                  Add New Document
                </Button>
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Add Registration Document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="registration-name">Document Name</Label>
                    <Input
                      id="registration-name"
                      placeholder="e.g., Fire Safety Certificate"
                      value={props.newRegistrationName}
                      onChange={(e) => props.setNewRegistrationName(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      props.setRegistrationDialogOpen(false)
                      props.setNewRegistrationName('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={props.onAddRegistrationDocument}
                    disabled={!props.newRegistrationName.trim()}
                  >
                    Save Document
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {props.registrationDocs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {props.registrationDocs.map((doc) => (
                <div key={doc.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Label htmlFor={`reg-${doc.id}`}>{doc.name} Number</Label>
                      <Input
                        id={`reg-${doc.id}`}
                        placeholder={`Enter ${doc.name} Number`}
                        value={doc.number}
                        onChange={(e) =>
                          props.setRegistrationDocs((prev) =>
                            prev.map((entry) =>
                              entry.id === doc.id ? { ...entry, number: e.target.value } : entry,
                            ),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => props.setRegistrationDeleteTarget({ id: doc.id, name: doc.name })}
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 size={16} className="text-destructive" />
                    </Button>
                  </div>

                  <FileUpload
                    label={`${doc.name} File`}
                    accept="image/*,.pdf"
                    value={doc.fileUrl ?? undefined}
                    bucket="laboratory-files"
                    pathPrefix="registration"
                    onChange={(_file, storagePath) =>
                      props.setRegistrationDocs((prev) =>
                        prev.map((entry) =>
                          entry.id === doc.id ? { ...entry, fileUrl: storagePath } : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog
          open={!!props.registrationDeleteTarget}
          onOpenChange={(open) => !open && props.setRegistrationDeleteTarget(null)}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Registration Card</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{props.registrationDeleteTarget?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => props.setRegistrationDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={props.onDeleteRegistrationCard}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

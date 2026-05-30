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
import type { AccreditationCard } from './types'

type RegistrationDocumentsTabProps = {
  saveMessage: string | null
  saveLoading: boolean
  onSave: () => void

  accreditationDialogOpen: boolean
  setAccreditationDialogOpen: (open: boolean) => void
  newAccreditationName: string
  setNewAccreditationName: (value: string) => void
  onAddAccreditationCard: () => void

  accreditationCards: AccreditationCard[]
  setAccreditationCards: React.Dispatch<React.SetStateAction<AccreditationCard[]>>

  accreditationDeleteTarget: { id: string; name: string } | null
  setAccreditationDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteAccreditationCard: () => void
}

export function RegistrationDocumentsTab(props: RegistrationDocumentsTabProps) {
  return (
    <Card>
      <CardContent className="space-y-4">
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
            <h3 className="text-sm font-semibold text-foreground">Accreditation Certificate Numbers</h3>
            <Dialog open={props.accreditationDialogOpen} onOpenChange={props.setAccreditationDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus size={14} />
                  Add New Registration
                </Button>
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Add Accreditation Registration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="accreditation-name">Accreditation Name</Label>
                    <Input
                      id="accreditation-name"
                      placeholder="e.g., QAI Testing"
                      value={props.newAccreditationName}
                      onChange={(e) => props.setNewAccreditationName(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      props.setAccreditationDialogOpen(false)
                      props.setNewAccreditationName('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={props.onAddAccreditationCard}
                    disabled={!props.newAccreditationName.trim()}
                  >
                    Save Registration
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {props.accreditationCards.map((card) => (
              <div key={card.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor={card.inputId}>{card.inputLabel}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => props.setAccreditationDeleteTarget({ id: card.id, name: card.inputLabel })}
                    aria-label={`Delete ${card.inputLabel}`}
                  >
                    <Trash2 size={16} className="text-destructive" />
                  </Button>
                </div>

                <Input
                  id={card.inputId}
                  placeholder="Enter Certificate Number"
                  value={card.certificateNo}
                  onChange={(e) =>
                    props.setAccreditationCards((prev) =>
                      prev.map((entry) =>
                        entry.id === card.id ? { ...entry, certificateNo: e.target.value } : entry,
                      ),
                    )
                  }
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${card.id}-valid-from`}>Validity Start</Label>
                    <Input
                      id={`${card.id}-valid-from`}
                      type="date"
                      value={card.validityStart ?? ''}
                      onChange={(e) =>
                        props.setAccreditationCards((prev) =>
                          prev.map((entry) =>
                            entry.id === card.id
                              ? { ...entry, validityStart: e.target.value || null }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${card.id}-valid-to`}>Validity End</Label>
                    <Input
                      id={`${card.id}-valid-to`}
                      type="date"
                      value={card.validityEnd ?? ''}
                      onChange={(e) =>
                        props.setAccreditationCards((prev) =>
                          prev.map((entry) =>
                            entry.id === card.id
                              ? { ...entry, validityEnd: e.target.value || null }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FileUpload
                    label={card.certificateLabel}
                    accept="image/*,.pdf"
                    value={card.certificateFilePath ?? undefined}
                    bucket="laboratory-files"
                    pathPrefix="accreditation"
                    onChange={(_file, storagePath) =>
                      props.setAccreditationCards((prev) =>
                        prev.map((entry) =>
                          entry.id === card.id
                            ? {
                                ...entry,
                                certificateFilePath: storagePath ?? entry.certificateFilePath,
                              }
                            : entry,
                        ),
                      )
                    }
                  />
                  <FileUpload
                    label={card.scopeLabel}
                    accept="image/*,.pdf"
                    value={card.scopeFilePath ?? undefined}
                    bucket="laboratory-files"
                    pathPrefix="accreditation"
                    onChange={(_file, storagePath) =>
                      props.setAccreditationCards((prev) =>
                        prev.map((entry) =>
                          entry.id === card.id
                            ? { ...entry, scopeFilePath: storagePath ?? entry.scopeFilePath }
                            : entry,
                        ),
                      )
                    }
                  />
                  <FileUpload
                    label={card.logoLabel}
                    accept="image/*"
                    value={card.logoFilePath ?? undefined}
                    bucket="laboratory-files"
                    pathPrefix="accreditation"
                    onChange={(_file, storagePath) =>
                      props.setAccreditationCards((prev) =>
                        prev.map((entry) =>
                          entry.id === card.id
                            ? { ...entry, logoFilePath: storagePath ?? entry.logoFilePath }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Dialog
          open={!!props.accreditationDeleteTarget}
          onOpenChange={(open) => !open && props.setAccreditationDeleteTarget(null)}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Accreditation Card</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{props.accreditationDeleteTarget?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => props.setAccreditationDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={props.onDeleteAccreditationCard}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

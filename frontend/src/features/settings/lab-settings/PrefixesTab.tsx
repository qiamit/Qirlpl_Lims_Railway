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
import type { PrefixItem } from './types'

type PrefixesTabProps = {
  saveMessage: string | null
  saveLoading: boolean
  onSave: () => void

  prefixDialogOpen: boolean
  setPrefixDialogOpen: (open: boolean) => void
  newPrefixName: string
  setNewPrefixName: (value: string) => void
  newPrefixValue: string
  setNewPrefixValue: (value: string) => void
  onAddPrefix: () => void

  prefixes: PrefixItem[]
  setPrefixes: React.Dispatch<React.SetStateAction<PrefixItem[]>>

  prefixDeleteTarget: { id: string; name: string } | null
  setPrefixDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeletePrefix: () => void
}

export function PrefixesTab(props: PrefixesTabProps) {
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

        <div className="flex items-center justify-between mt-4">
          <h3 className="text-sm font-semibold text-foreground">Prefix's</h3>
          <Dialog open={props.prefixDialogOpen} onOpenChange={props.setPrefixDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus size={14} />
                Add New Prefix
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Add New Prefix</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prefix-name">Prefix Name</Label>
                  <Input
                    id="prefix-name"
                    placeholder="e.g., Invoice"
                    value={props.newPrefixName}
                    onChange={(e) => props.setNewPrefixName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefix-value">Prefix</Label>
                  <Input
                    id="prefix-value"
                    placeholder="e.g., INV-"
                    value={props.newPrefixValue}
                    onChange={(e) => props.setNewPrefixValue(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    props.setPrefixDialogOpen(false)
                    props.setNewPrefixName('')
                    props.setNewPrefixValue('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={props.onAddPrefix}
                  disabled={!props.newPrefixName.trim() || !props.newPrefixValue.trim()}
                >
                  Save Prefix
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {props.prefixes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {props.prefixes.map((p) => (
              <div key={p.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`prefix-name-${p.id}`}>{p.name}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => props.setPrefixDeleteTarget({ id: p.id, name: p.name })}
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 size={16} className="text-destructive" />
                  </Button>
                </div>
                <Input
                  id={`prefix-name-${p.id}`}
                  value={p.prefix}
                  onChange={(e) =>
                    props.setPrefixes((prev) =>
                      prev.map((entry) =>
                        entry.id === p.id ? { ...entry, prefix: e.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Enter Prefix"
                />
              </div>
            ))}
          </div>
        )}

        <Dialog
          open={!!props.prefixDeleteTarget}
          onOpenChange={(open) => !open && props.setPrefixDeleteTarget(null)}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Prefix</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{props.prefixDeleteTarget?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => props.setPrefixDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={props.onDeletePrefix}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AiModelsPanel } from './AiModelsPanel'
import { AiSkillsPanel } from './AiSkillsPanel'
import { AiGeneralPanel } from './AiGeneralPanel'

export default function AiSettingsMasterPage() {
  const [activeTab, setActiveTab] = useState('models')

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">AI Settings</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage AI models, API keys, skills, and lab-wide AI preferences
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="models">AI Models</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <AiModelsPanel />
        </TabsContent>

        <TabsContent value="skills" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <AiSkillsPanel />
        </TabsContent>

        <TabsContent value="general" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <AiGeneralPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

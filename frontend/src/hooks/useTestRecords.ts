import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { TestRecord } from '@/types'

const QUERY_KEY = 'test_records'

export function useTestRecordsBySample(sampleId: string) {
  return useQuery({
    queryKey: [QUERY_KEY, 'sample', sampleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_records')
        .select('*')
        .eq('sample_id', sampleId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TestRecord[]
    },
    enabled: Boolean(sampleId),
  })
}

export function useTestRecordById(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_records')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as TestRecord
    },
    enabled: Boolean(id),
  })
}

export function useUpdateTestRecordStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TestRecord['status'] }) => {
      const { data, error } = await supabase
        .from('test_records')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as TestRecord
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}

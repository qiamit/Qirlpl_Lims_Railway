import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Sample } from '@/types'

const QUERY_KEY = 'samples'

export function useSampleList(status?: Sample['status']) {
  return useQuery({
    queryKey: [QUERY_KEY, status],
    queryFn: async () => {
      let query = supabase.from('samples').select('*').order('created_at', { ascending: false })
      if (status) query = query.eq('status', status)
      const { data, error } = await query
      if (error) throw error
      return data as Sample[]
    },
  })
}

export function useSampleById(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('samples')
        .select('*, chain_of_custody(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Sample
    },
    enabled: Boolean(id),
  })
}

export function useCreateSample() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Sample, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('samples').insert(payload).select().single()
      if (error) throw error
      return data as Sample
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}

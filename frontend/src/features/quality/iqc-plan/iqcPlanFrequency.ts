export const IQC_PLAN_FREQUENCY_OPTIONS = [
  'Monthly',
  'Quarterly',
  'Half Yearly',
  'Yearly',
  'Random Check',
] as const

export type IqcPlanFrequency = (typeof IQC_PLAN_FREQUENCY_OPTIONS)[number]

export function frequencySelectOptions(current?: string | null): string[] {
  const options = [...IQC_PLAN_FREQUENCY_OPTIONS]
  const value = current?.trim()
  if (value && !options.includes(value as IqcPlanFrequency)) {
    return [value, ...options]
  }
  return options
}

export function isIqcPlanFrequency(value: string): value is IqcPlanFrequency {
  return (IQC_PLAN_FREQUENCY_OPTIONS as readonly string[]).includes(value)
}

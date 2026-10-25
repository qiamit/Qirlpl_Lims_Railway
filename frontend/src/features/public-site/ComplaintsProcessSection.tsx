import { Mail, MessageSquareWarning, Phone } from 'lucide-react'
import { PublicSection } from './PublicChrome'
import {
  PUBLIC_ADDRESS,
  PUBLIC_COMPLAINT_ACK_WORKING_DAYS,
  PUBLIC_EMAIL,
  PUBLIC_LAB_NAME,
  PUBLIC_PHONE_PRIMARY,
  PUBLIC_PHONE_SECONDARY,
  PUBLIC_SUPPORT_EMAIL,
} from './publicNav'

const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: '1. Tell us',
    body: 'Send your complaint by email, phone, letter or in person. Please give your name and contact details, the SRF / report / certificate number, what went wrong and what you expect from us.',
  },
  {
    title: '2. Acknowledgement',
    body: `We record every complaint and acknowledge it, normally within ${PUBLIC_COMPLAINT_ACK_WORKING_DAYS} working days, with a complaint reference number.`,
  },
  {
    title: '3. Validation and investigation',
    body: 'We check whether the complaint relates to our laboratory activities. If it does, we gather and verify the information needed and investigate the cause. Where needed, corrective action is taken.',
  },
  {
    title: '4. Progress and outcome',
    body: 'You can ask us for progress at any time and we will keep you informed. The decision is reviewed and approved by a person who was not involved in the activity in question.',
  },
  {
    title: '5. Formal closure',
    body: 'We tell you the outcome and give formal notice when the complaint is closed. If you are not satisfied, you can ask for the decision to be reviewed by the Laboratory Director.',
  },
]

/**
 * Complaint handling process for interested parties (ISO/IEC 17025 7.9.1 /
 * 7.9.3). Information only: no form, nothing is written to the database by
 * visitors. Contact details are the public ones used on the home page.
 */
export function ComplaintsProcessSection({ id = 'complaints' }: { id?: string }) {
  return (
    <PublicSection
      id={id}
      title="Complaints & Feedback"
      subtitle="How we handle complaints and feedback about our testing and calibration services"
    >
      <p className="text-sm leading-relaxed text-stone-700">
        {PUBLIC_LAB_NAME} welcomes complaints, appeals and feedback. Every complaint is handled impartially,
        confidentially and without charge, and is used to improve our services. Raising a complaint never
        affects how your samples or instruments are tested or calibrated.
      </p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.title} className="rounded-none border border-stone-500 bg-stone-50 p-3">
            <h3 className="text-sm font-semibold text-stone-900">{s.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="rounded-none border border-amber-600/60 bg-amber-50/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <MessageSquareWarning size={16} className="text-amber-700" />
          Where to send a complaint or feedback
        </h3>
        <div className="mt-2 grid gap-1.5 text-sm text-stone-700 sm:grid-cols-2">
          <a className="inline-flex items-center gap-2 break-all hover:text-amber-800" href={`mailto:${PUBLIC_EMAIL}?subject=${encodeURIComponent('Complaint / feedback')}`}>
            <Mail size={14} /> {PUBLIC_EMAIL}
          </a>
          <a className="inline-flex items-center gap-2 break-all hover:text-amber-800" href={`mailto:${PUBLIC_SUPPORT_EMAIL}?subject=${encodeURIComponent('Complaint / feedback')}`}>
            <Mail size={14} /> {PUBLIC_SUPPORT_EMAIL}
          </a>
          <a className="inline-flex items-center gap-2 hover:text-amber-800" href={telHref(PUBLIC_PHONE_PRIMARY)}>
            <Phone size={14} /> {PUBLIC_PHONE_PRIMARY}
          </a>
          <a className="inline-flex items-center gap-2 hover:text-amber-800" href={telHref(PUBLIC_PHONE_SECONDARY)}>
            <Phone size={14} /> {PUBLIC_PHONE_SECONDARY}
          </a>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">By post or in person: {PUBLIC_ADDRESS}</p>
        <p className="mt-1 text-xs text-stone-500">
          A description of this process is available on request (ISO/IEC 17025:2017 clause 7.9).
        </p>
      </div>
    </PublicSection>
  )
}

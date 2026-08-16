-- Return to service: store date+time (was date-only).
alter table public.equipment_breakdown_register
  alter column return_to_service_date type timestamptz
  using (
    case
      when return_to_service_date is null then null
      else return_to_service_date::timestamp at time zone 'UTC'
    end
  );

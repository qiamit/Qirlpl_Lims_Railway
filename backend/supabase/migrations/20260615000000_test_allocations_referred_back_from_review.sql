-- Per-section flag: referred back from Results Under Review; stays in Pending until Send for Review.
alter table test_allocations
  add column if not exists referred_back_from_review boolean not null default false;

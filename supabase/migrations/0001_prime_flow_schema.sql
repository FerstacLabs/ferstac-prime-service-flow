create extension if not exists "pgcrypto";

create type funding_source as enum ('CUSTOMER_FUNDED', 'INSURANCE_CLAIM');
create type service_job_status as enum ('RECEIVED', 'WAITING', 'IN_PROGRESS', 'WAITING_PARTS', 'READY', 'DELIVERED', 'PAUSED');
create type work_item_status as enum ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
create type supplier_entity_type as enum ('INDIVIDUAL', 'LEGAL_ENTITY');
create type purchase_source_type as enum ('SUPPLIER', 'INTERNAL_STOCK', 'CUSTOMER_PROVIDED');
create type payment_status as enum ('PAID', 'UNPAID', 'PARTIAL');

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  plate text not null,
  make text not null,
  model text not null,
  vehicle_type text,
  body_type text,
  manufacturer text,
  production_year int,
  first_registration_date date,
  vin_body_number text,
  chassis_number text,
  engine_number text,
  engine_power_hp numeric,
  engine_power_kw numeric,
  color text,
  registration_certificate_series_no text,
  registration_valid_until date,
  max_permitted_mass_kg numeric,
  unladen_mass_kg numeric,
  registered_owner_full_name text,
  registered_owner_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(owner_user_id, plate),
  constraint vehicles_plate_format check (plate ~ '^[0-9]{2}-[A-Z]{2}-[0-9]{3}$')
);

create table service_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  job_no text not null,
  customer_name text,
  customer_phone text,
  funding_source funding_source not null default 'CUSTOMER_FUNDED',
  insurance_company text,
  insurance_claim_no text,
  insurance_approved_amount numeric,
  agreed_budget numeric not null default 0 check (agreed_budget >= 0),
  status service_job_status not null default 'RECEIVED',
  received_at timestamptz not null default now(),
  target_delivery_date date,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(owner_user_id, job_no)
);

create table work_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0
);

create table worker_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  father_name text,
  phone text,
  role_id uuid not null references worker_roles(id),
  active boolean not null default true,
  hire_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type supplier_entity_type not null,
  first_name text,
  last_name text,
  father_name text,
  company_name text,
  shop_name text,
  tax_id_voen text,
  phone text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table part_catalog (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  unique(category, name)
);

create table job_work_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  service_job_id uuid not null references service_jobs(id) on delete cascade,
  work_catalog_id uuid references work_catalog(id),
  custom_title text,
  assigned_worker_id uuid references workers(id),
  status work_item_status not null default 'TODO',
  labor_cost numeric not null default 0 check (labor_cost >= 0),
  notes text,
  planned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_catalog_or_custom_title check (work_catalog_id is not null or nullif(custom_title, '') is not null)
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  service_job_id uuid not null references service_jobs(id) on delete cascade,
  part_catalog_id uuid references part_catalog(id),
  custom_item_name text,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  total_price numeric generated always as (quantity * unit_price) stored,
  source_type purchase_source_type not null default 'SUPPLIER',
  supplier_id uuid references suppliers(id),
  purchased_by_worker_id uuid references workers(id),
  purchased_by_admin boolean not null default false,
  payment_status payment_status not null default 'UNPAID',
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  part_code_oem text,
  brand_model text,
  serial_no text,
  document_no text,
  purchase_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_part_or_custom check (part_catalog_id is not null or nullif(custom_item_name, '') is not null),
  constraint supplier_required_when_supplier check (source_type <> 'SUPPLIER' or supplier_id is not null),
  constraint partial_payment_bounds check (
    (payment_status = 'UNPAID' and paid_amount = 0)
    or (payment_status = 'PAID' and paid_amount = quantity * unit_price)
    or (payment_status = 'PARTIAL' and paid_amount > 0 and paid_amount < quantity * unit_price)
  )
);

create index vehicles_owner_plate_idx on vehicles(owner_user_id, plate);
create index service_jobs_owner_status_received_idx on service_jobs(owner_user_id, status, received_at desc);
create index purchases_job_payment_date_idx on purchases(service_job_id, payment_status, purchase_date desc);
create index purchases_owner_date_idx on purchases(owner_user_id, purchase_date desc);
create index work_items_job_status_worker_idx on job_work_items(service_job_id, status, assigned_worker_id);
create index suppliers_owner_names_idx on suppliers(owner_user_id, company_name, shop_name, last_name, first_name);
create index workers_owner_active_role_idx on workers(owner_user_id, active, role_id);

alter table vehicles enable row level security;
alter table service_jobs enable row level security;
alter table workers enable row level security;
alter table suppliers enable row level security;
alter table job_work_items enable row level security;
alter table purchases enable row level security;
alter table work_catalog enable row level security;
alter table worker_roles enable row level security;
alter table part_catalog enable row level security;

create policy "vehicles are owned rows" on vehicles for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "service jobs are owned rows" on service_jobs for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "workers are owned rows" on workers for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "suppliers are owned rows" on suppliers for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "work items are owned rows" on job_work_items for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "purchases are owned rows" on purchases for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "master work catalog readable" on work_catalog for select using (true);
create policy "master worker roles readable" on worker_roles for select using (true);
create policy "master part catalog readable" on part_catalog for select using (true);

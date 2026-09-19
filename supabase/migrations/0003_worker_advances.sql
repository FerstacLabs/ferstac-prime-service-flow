begin;

-- Keep the existing ledger, allocation locks, idempotency RPC and audit trail.
create or replace function validate_cash_transaction() returns trigger language plpgsql set search_path = public as $$
declare cap numeric; settled numeric; j service_jobs; w job_work_items; p purchases;
begin
  select * into j from service_jobs where id=new.service_job_id for update;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'voided_at' - 'void_reason' - 'direction') is distinct from (to_jsonb(old) - 'voided_at' - 'void_reason' - 'direction')
      or old.voided_at is not null or new.voided_at is null or nullif(trim(new.void_reason),'') is null then
      raise exception 'Ödəniş yalnız səbəb göstərilməklə ləğv edilə bilər';
    end if;
    return new;
  end if;
  if new.voided_at is not null then raise exception 'Yeni ödəniş ləğv edilmiş ola bilməz'; end if;
  if new.work_item_id is not null then
    select * into w from job_work_items where id=new.work_item_id and service_job_id=j.id;
    if not found then raise exception 'İş tapılmadı'; end if;
    if new.allocation_type='CUSTOMER_WORK' then
      cap := w.quoted_price;
    else
      if w.status='CANCELLED' then raise exception 'Ləğv edilmiş iş üzrə yeni usta ödənişi edilə bilməz'; end if;
      if w.assigned_worker_id is null then raise exception 'Əvvəlcə işə usta təyin edin'; end if;
      if not w.labor_cost_known then raise exception 'Usta mayası daxil edilməyib'; end if;
      cap := w.labor_cost;
    end if;
  elsif new.required_part_id is not null then
    select quoted_price into cap from job_required_parts where id=new.required_part_id and service_job_id=j.id;
  elsif new.purchase_id is not null then
    select * into p from purchases where id=new.purchase_id and service_job_id=j.id and source_type='SUPPLIER' and voided_at is null;
    if not found then raise exception 'Alış tapılmadı'; end if;
    cap := p.total_price;
  else
    if j.has_line_quotes then raise exception 'Ödənişi iş və ya detal üzrə bölüşdürün'; end if;
    cap := j.agreed_budget;
  end if;
  if cap is null then raise exception 'Qiymət daxil edilməyib'; end if;
  select coalesce(sum(amount),0) into settled from cash_transactions
    where service_job_id=j.id and allocation_type=new.allocation_type and voided_at is null
      and work_item_id is not distinct from new.work_item_id and required_part_id is not distinct from new.required_part_id
      and purchase_id is not distinct from new.purchase_id;
  if new.amount + settled > cap then
    if new.allocation_type='WORKER_WORK_ITEM' then
      raise exception 'Bu iş üzrə ustaya maksimum % AZN əlavə ödəniş edilə bilər.',
        replace(to_char(greatest(cap-settled,0),'FM9999999990.00'),'.',',');
    end if;
    raise exception 'Ödəniş qalıq məbləğdən artıqdır';
  end if;
  return new;
end $$;

create or replace function guard_financial_edits() returns trigger language plpgsql set search_path = public as $$
declare paid numeric;
begin
  perform 1 from service_jobs where id=coalesce(new.service_job_id,old.service_job_id) for update;
  if tg_op='DELETE' then raise exception 'Maliyyə tarixçəsi silinə bilməz; arxiv və ya ləğv istifadə edin'; end if;
  if tg_table_name='purchases' then
    if pg_trigger_depth() < 2 and ((tg_op='INSERT' and new.source_type='SUPPLIER' and new.paid_amount <> 0)
      or (tg_op='UPDATE' and (new.paid_amount <> old.paid_amount or new.payment_status <> old.payment_status))) then
      raise exception 'Ödənişi Kassa vasitəsilə daxil edin';
    end if;
    select coalesce(sum(amount),0) into paid from cash_transactions where purchase_id=new.id and voided_at is null;
    if new.quantity*new.unit_price <> round(new.quantity*new.unit_price,2) then raise exception 'Alış cəmi ən çox iki onluq rəqəm ola bilər'; end if;
    if paid > new.quantity*new.unit_price then raise exception 'Maya ödənilmiş məbləğdən az ola bilməz'; end if;
    if new.source_type='SUPPLIER' then
      new.paid_amount:=paid;
      new.payment_status:=case when paid=0 then 'UNPAID'::payment_status when paid=new.quantity*new.unit_price then 'PAID'::payment_status else 'PARTIAL'::payment_status end;
    end if;
    if tg_op='UPDATE' and paid>0 and (new.supplier_id is distinct from old.supplier_id or new.source_type<>old.source_type or new.required_part_id is distinct from old.required_part_id or new.voided_at is distinct from old.voided_at) then
      raise exception 'Əvvəlcə bağlı ödənişləri səbəb göstərərək ləğv edin';
    end if;
  elsif tg_table_name='job_work_items' then
    if new.labor_cost <> round(new.labor_cost,2) or new.labor_cost > 9999999999.99 then raise exception 'Usta mayası düzgün pul formatında olmalıdır'; end if;
    select coalesce(sum(amount),0) into paid from cash_transactions where work_item_id=new.id and allocation_type='WORKER_WORK_ITEM' and voided_at is null;
    if paid>new.labor_cost or (paid>0 and (not new.labor_cost_known or new.assigned_worker_id is distinct from old.assigned_worker_id)) then raise exception 'Ödənilmiş usta məbləği qorunmalıdır'; end if;
    -- Preserve the existing paid-work cancellation guard; never reverse cash implicitly.
    if paid>0 and new.status='CANCELLED' and old.status<>'CANCELLED' then
      raise exception 'Ödənişi olan iş ləğv edilə bilməz; əvvəlcə bağlı ödənişləri yoxlayın';
    end if;
    select coalesce(sum(amount),0) into paid from cash_transactions where work_item_id=new.id and allocation_type='CUSTOMER_WORK' and voided_at is null;
    if paid>coalesce(new.quoted_price,0) then raise exception 'Qiymət ödənişdən az ola bilməz'; end if;
  elsif tg_table_name='job_required_parts' then
    select coalesce(sum(amount),0) into paid from cash_transactions where required_part_id=new.id and voided_at is null;
    if paid>new.quoted_price then raise exception 'Qiymət ödənişdən az ola bilməz'; end if;
  end if;
  return new;
end $$;

commit;

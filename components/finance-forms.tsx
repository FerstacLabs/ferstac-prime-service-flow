"use client";
import { createContext, useContext, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Check,
  X,
  Trash2,
} from "lucide-react";
import { ActionForm as BaseActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { DecimalInput } from "@/components/decimal-input";
import { SearchSelect } from "@/components/search-select";
import {
  recordLedgerAction,
  settleVehicleAction,
  transferLedgerAction,
  deleteSupplierPermanentlyAction,
} from "@/app/actions/ledger";
import type {
  FinanceAccount,
  FinanceData,
  FinanceJob,
  MoneyChannel,
} from "@/lib/finance";
import { vehicleSettlement } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
const nowBaku = () =>
  new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 16);
const CloseFinanceDialog = createContext<() => void>(() => {});
function ActionForm(props: React.ComponentProps<typeof BaseActionForm>) {
  const close = useContext(CloseFinanceDialog);
  return <BaseActionForm {...props} onSuccess={close} />;
}
export function FinanceDialog({
  label,
  children,
  danger = false,
  icon = "in",
}: {
  label: string;
  children: React.ReactNode;
  danger?: boolean;
  icon?: "in" | "out" | "transfer" | "settle";
}) {
  const [open, setOpen] = useState(false);
  const Icon = danger
    ? Trash2
    : icon === "out"
      ? ArrowUpRight
      : icon === "transfer"
        ? ArrowLeftRight
        : icon === "settle"
          ? Check
          : ArrowDownLeft;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={`btn ${danger ? "btn-danger" : "btn-secondary"}`}
      >
        <Icon size={16} />
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl"
          aria-describedby={undefined}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold">
              {label}
            </Dialog.Title>
            <Dialog.Close
              className="btn btn-secondary shrink-0"
              aria-label="Bağla"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <CloseFinanceDialog.Provider value={() => setOpen(false)}>
            {children}
          </CloseFinanceDialog.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function PaymentSource({
  accounts,
  initial = "CASH",
  defaultAccount = "",
}: {
  accounts: FinanceAccount[];
  initial?: MoneyChannel;
  defaultAccount?: string;
}) {
  const [channel, setChannel] = useState<MoneyChannel>(initial);
  return (
    <>
      <label className="text-sm">
        Ödəniş kanalı
        <select
          className="field mt-1"
          name="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as MoneyChannel)}
        >
          <option value="CASH">Nağd Kassa</option>
          <option value="BANK">Bank / Hesab</option>
        </select>
      </label>
      {channel === "BANK" ? (
        <>
          <SearchSelect
            label="Bizim bank hesabı"
            name="financial_account_id"
            required
            defaultValue={defaultAccount}
            options={accounts
              .filter((a) => a.active)
              .map((a) => ({ id: a.id, name: a.name }))}
          />
          <label className="text-sm">
            Ödəniş üsulu
            <select name="payment_method" className="field mt-1">
              <option value="TRANSFER">Bank köçürməsi</option>
              <option value="POS">POS / Kart</option>
              <option value="ONLINE">Online payment</option>
              <option value="OTHER">Digər nağdsız</option>
            </select>
          </label>
          <label className="text-sm">
            Bank reference
            <input
              name="bank_reference"
              className="field mt-1"
              maxLength={120}
            />
          </label>
        </>
      ) : null}
    </>
  );
}
export function MovementDetails({
  purpose,
  party = "",
}: {
  purpose: string;
  party?: string;
}) {
  return (
    <>
      <label className="text-sm">
        Tarix / vaxt
        <input
          type="datetime-local"
          name="occurred_at"
          defaultValue={nowBaku()}
          required
          className="field mt-1"
        />
      </label>
      <label className="text-sm">
        Təyinat
        <input
          name="purpose"
          defaultValue={purpose}
          required
          maxLength={500}
          className="field mt-1"
        />
      </label>
      <label className="text-sm">
        Kimdən / Kimə
        <input
          name="counterparty_name"
          defaultValue={party}
          maxLength={250}
          className="field mt-1"
        />
      </label>
      <label className="text-sm">
        Sənəd / qəbz №
        <input name="reference_number" maxLength={120} className="field mt-1" />
      </label>
      <details className="col-span-full">
        <summary className="cursor-pointer text-sm">Əlavə rekvizitlər</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ["tax_id", "Tərəfin VÖEN-i"],
            ["iban", "Tərəfin IBAN / hesabı"],
            ["bank", "Tərəfin bankı"],
            ["identity", "Şəxsiyyət sənədi"],
            ["payment_order_number", "Ödəniş tapşırığı №"],
            ["supporting_reference", "Əlavə sənəd / reference"],
          ].map(([name, label]) => (
            <label key={name} className="text-sm">
              {label}
              <input name={name} maxLength={250} className="field mt-1" />
            </label>
          ))}
        </div>
      </details>
      <label className="col-span-full text-sm">
        Qeyd
        <textarea
          name="notes"
          maxLength={250}
          rows={2}
          className="field mt-1"
        />
      </label>
    </>
  );
}
export function NewMovement({
  data,
  direction,
  channel,
  account,
  job,
  opening = false,
}: {
  data: FinanceData;
  direction: "IN" | "OUT";
  channel: MoneyChannel;
  account?: string;
  job?: FinanceJob;
  opening?: boolean;
}) {
  const [selected, setSelected] = useState(job?.id || "");
  const linked = data.jobs.find((j) => j.id === selected);
  return (
    <FinanceDialog
      label={
        opening
          ? "Başlanğıc qalıq"
          : job
            ? "Müştəridən ödəniş qəbul et"
            : direction === "IN"
              ? "Yeni mədaxil"
              : "Yeni məxaric"
      }
      icon={direction === "IN" ? "in" : "out"}
    >
      <ActionForm
        action={recordLedgerAction}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input
          type="hidden"
          name="allocation_type"
          value={
            opening
              ? "OPENING_" + direction
              : job
                ? "CUSTOMER_VEHICLE"
                : direction === "OUT" && selected
                  ? "VEHICLE_EXPENSE"
                  : "GENERAL_" + direction
          }
        />
        {job ? (
          <input type="hidden" name="service_job_id" value={job.id} />
        ) : !opening ? (
          <label className="text-sm">
            Avtomobil / servis kartı
            <select
              name="service_job_id"
              className="field mt-1"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Ümumi / avtomobilsiz</option>
              {data.jobs
                .filter((j) => !j.closed_at && !j.inactive)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.plate} · {j.job_no}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm">
          Məbləğ (AZN)
          <DecimalInput
            name="amount"
            required
            min="0.01"
            max={job?.customer_due}
            className="field mt-1"
          />
        </label>
        <PaymentSource
          accounts={data.accounts}
          initial={channel}
          defaultAccount={account}
        />
        {!opening && !job ? (
          <SearchSelect
            label="Kateqoriya"
            name="category_id"
            required
            options={data.categories
              .filter((c) => c.active && c.direction === direction)
              .map((c) => ({ id: c.id, name: c.name }))}
          />
        ) : null}
        <MovementDetails
          key={selected}
          purpose={
            linked
              ? `${linked.plate} avtomobili üzrə ${job ? "servis ödənişi" : "əməliyyat"}`
              : opening
                ? "Başlanğıc qalıq"
                : ""
          }
          party={linked?.customer_name || ""}
        />
        <SubmitButton pendingText="Qeydə alınır...">Qeydə al</SubmitButton>
      </ActionForm>
    </FinanceDialog>
  );
}
export function SettlementDialog({
  data,
  job,
}: {
  data: FinanceData;
  job: FinanceJob;
}) {
  const n = vehicleSettlement(data, job.id);
  return (
    <FinanceDialog label="Maşın ödənişlərini bağla" icon="settle">
      <dl className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {[
          ["Detal mayası", n.partsCost],
          ["Usta mayası", n.workerCost],
          ["Əlavə xərclər", n.otherCost],
          ["Ümumi maya", n.totalCost],
          ["Nağddan ödənilib", n.cashPaid],
          ["Bankdan ödənilib", n.bankPaid],
          ["Cəmi ödənilib", n.cashPaid + n.bankPaid],
          ["Qalan öhdəlik", n.remaining],
          ["Artıq ödəniş / uzlaşdırılacaq", n.overpaid],
          ["Müştəridən nağd alınıb", n.cashReceived],
          ["Müştəridən banka alınıb", n.bankReceived],
          ["Müştəridən cəmi alınıb", n.cashReceived + n.bankReceived],
          [
            job.customer_due < 0
              ? "Müştəri artıq ödənişi"
              : "Müştəri qalıq borcu",
            Math.abs(job.customer_due),
          ],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 font-semibold">{formatMoney(Number(value))}</dd>
          </div>
        ))}
      </dl>
      {job.missing_costs > 0 ? (
        <p className="mb-4 text-[var(--warning)]">
          Maya dəyəri daxil edilməyib ({job.missing_costs})
        </p>
      ) : null}
      <ActionForm
        action={settleVehicleAction}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="service_job_id" value={job.id} />
        {n.obligations
          .filter((o) => o.remaining < 0)
          .map((o) => (
            <p
              key={o.id}
              className="col-span-full text-sm text-[var(--warning)]"
            >
              {o.party} · {o.title}: artıq ödəniş {formatMoney(-o.remaining)}.
              Uzlaşdırma tələb olunur.
            </p>
          ))}
        <div className="col-span-full divide-y divide-[var(--border)]">
          {n.obligations
            .filter((o) => o.remaining > 0)
            .map((o) => (
              <div
                key={o.id}
                className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
              >
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="obligation"
                    value={`${o.type}:${o.id}`}
                    disabled={!o.known}
                    defaultChecked={o.known}
                  />
                  <span className="min-w-0 break-words">
                    <strong>{o.party}</strong> ·{" "}
                    {o.type === "SUPPLIER_PURCHASE" ? "Detal" : "İş"}
                    <br />
                    {o.title}
                    <br />
                    <span className="text-[var(--muted)]">
                      Maya: {formatMoney(o.cost)} · Ödənilib:{" "}
                      {formatMoney(o.paid)} · Qalıq: {formatMoney(o.remaining)}
                    </span>
                  </span>
                </label>
                <label className="text-xs">
                  Ödənəcək (AZN)
                  <DecimalInput
                    name={"amount_" + o.id}
                    defaultValue={o.remaining}
                    min="0.01"
                    max={o.remaining}
                    className="field mt-1"
                  />
                </label>
              </div>
            ))}
        </div>
        {n.obligations.some((o) => o.remaining > 0) ? (
          <>
            <PaymentSource accounts={data.accounts} />
            <MovementDetails
              purpose={`${job.plate} avtomobili üzrə hesablaşma`}
            />
          </>
        ) : null}
        <label className="col-span-full flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="close"
            disabled={
              n.overpaid > 0 || job.customer_due !== 0 || job.missing_costs > 0
            }
          />
          Maliyyəni bağla
        </label>
        <SubmitButton pendingText="Hesablaşma aparılır...">
          Hesablaşmanı təsdiqlə
        </SubmitButton>
      </ActionForm>
    </FinanceDialog>
  );
}
export function TransferForm({ accounts }: { accounts: FinanceAccount[] }) {
  return (
    <FinanceDialog label="Daxili köçürmə" icon="transfer">
      <ActionForm
        action={transferLedgerAction}
        className="grid gap-4 sm:grid-cols-2"
      >
        {[
          ["from_account", "Haradan"],
          ["to_account", "Haraya"],
        ].map(([name, label]) => (
          <label key={name} className="text-sm">
            {label}
            <select name={name} className="field mt-1">
              <option value="">Nağd Kassa</option>
              {accounts
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <label className="text-sm">
          Məbləğ (AZN)
          <DecimalInput
            name="amount"
            required
            min="0.01"
            className="field mt-1"
          />
        </label>
        <label className="text-sm">
          Tarix / vaxt
          <input
            type="datetime-local"
            name="occurred_at"
            defaultValue={nowBaku()}
            required
            className="field mt-1"
          />
        </label>
        <label className="col-span-full text-sm">
          Qeyd
          <input name="notes" maxLength={250} className="field mt-1" />
        </label>
        <SubmitButton>Köçür</SubmitButton>
      </ActionForm>
    </FinanceDialog>
  );
}
export function DeleteSupplierDialog({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <FinanceDialog label="Həmişəlik sil" danger>
      <p className="mb-4 text-sm">
        {name} silinəcək. Maliyyə tarixçəsi saxlanılacaq.
      </p>
      <ActionForm
        action={deleteSupplierPermanentlyAction}
        className="grid gap-4"
      >
        <input type="hidden" name="id" value={id} />
        <label>
          Təsdiq üçün SİL yazın
          <input
            name="confirmation"
            pattern="SİL"
            required
            className="field mt-1"
            autoComplete="off"
          />
        </label>
        <SubmitButton variant="danger">Həmişəlik sil</SubmitButton>
      </ActionForm>
    </FinanceDialog>
  );
}

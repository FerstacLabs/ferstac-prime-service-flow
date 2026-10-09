"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import {
  FinanceDialog,
  PaymentSource,
  MovementDetails,
} from "@/components/finance-forms";
import { DecimalInput } from "@/components/decimal-input";
import {
  changePurchaseAction,
  refundSupplierAction,
  applySupplierCreditAction,
} from "@/app/actions/purchase-lifecycle";
import type { DbPurchase } from "@/lib/supabase/queries";
import type { FinanceAccount, FinanceData } from "@/lib/finance";
import {
  multiplyMoney,
  parseLocalizedDecimal,
  decimalMinor,
  fromMinor,
} from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { vatPricing, type VatAmounts } from "@/lib/vat";
import { VatMode } from "@/components/vat-mode";
export function PurchaseChange({
  purchase: p,
  accounts = [],
  exchange = false,
}: {
  purchase: DbPurchase;
  accounts?: FinanceAccount[];
  exchange?: boolean;
}) {
  const [handling, setHandling] = useState("CREDIT");
  const remainingQuantity =
    Number(p.quantity) - Number(p.returned_quantity ?? 0);
  const [quantity, setQuantity] = useState(
    String(exchange ? 1 : remainingQuantity),
  );
  const [price, setPrice] = useState("");
  const [vatEnabled, setVatEnabled] = useState(!!p.vat_enabled);
  let preview: VatAmounts | null = null;
  let refundable = 0;
  try {
    const qty = parseLocalizedDecimal(quantity, 3);
    if (exchange) {
      preview = vatPricing(
        multiplyMoney(qty, parseLocalizedDecimal(price, 2)),
        vatEnabled,
      );
      refundable = Math.max(
        0,
        Number(p.settled ?? p.paid_amount) - Number(preview.gross),
      );
    } else {
      const cumulative = vatPricing(
        multiplyMoney(
          fromMinor(
            decimalMinor(p.returned_quantity ?? 0, 3) + decimalMinor(qty, 3),
            3,
          ),
          p.unit_price,
        ),
        !!p.vat_enabled,
      );
      const net =
        decimalMinor(cumulative.net) -
        decimalMinor(p.returned_net ?? p.returned ?? 0);
      const gross =
        decimalMinor(cumulative.gross) - decimalMinor(p.returned ?? 0);
      preview = {
        net: fromMinor(net),
        vat: fromMinor(gross - net),
        gross: fromMinor(gross),
      };
      refundable = Math.max(
        0,
        Number(preview.gross) -
          Math.max(
            0,
            Number(
              p.remaining ??
                Number(p.gross_amount ?? p.total_price) - Number(p.paid_amount),
            ),
          ),
      );
    }
  } catch {
    /* Incomplete numeric input has no settlement preview. */
  }
  return (
    <FinanceDialog label={exchange ? "Dəyişdir" : "Qaytar"}>
      <dl className="mb-4 grid gap-2 text-sm">
        <div>
          <dt className="text-[var(--muted)]">İlkin detal</dt>
          <dd>{p.custom_item_name || p.part_catalog?.name || "Detal"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Təchizatçı</dt>
          <dd>
            {p.suppliers?.company_name ||
              p.suppliers?.shop_name ||
              [p.suppliers?.first_name, p.suppliers?.last_name]
                .filter(Boolean)
                .join(" ") ||
              "Təchizatçı"}
          </dd>
        </div>
      </dl>
      <ActionForm
        action={changePurchaseAction}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="purchase_id" value={p.id} />
        <input
          type="hidden"
          name="operation"
          value={exchange ? "exchange" : "return"}
        />
        {exchange ? (
          <>
            <div className="sm:col-span-2">
              <VatMode
                name="new_vat_enabled"
                value={vatEnabled}
                onChange={setVatEnabled}
              />
            </div>
            <label className="text-sm sm:col-span-2">
              Yeni detal
              <input
                name="new_name"
                required
                maxLength={120}
                className="field mt-1"
              />
            </label>
            <label className="text-sm">
              Yeni miqdar
              <DecimalInput
                name="new_quantity"
                scale={3}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.001"
                required
                className="field mt-1"
              />
            </label>
            <label className="text-sm">
              Ölçü vahidi
              <input
                name="unit_name"
                defaultValue={p.unit_name || "Ədəd"}
                required
                maxLength={30}
                className="field mt-1"
              />
            </label>
            <label className="text-sm">
              Vahid alış qiyməti (AZN)
              <DecimalInput
                name="new_unit_price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0"
                required
                className="field mt-1"
              />
            </label>
            <label className="text-sm">
              Qaimə
              <input
                name="document_no"
                maxLength={120}
                className="field mt-1"
              />
            </label>
            <label className="text-sm">
              OEM
              <input
                name="part_code_oem"
                maxLength={120}
                className="field mt-1"
              />
            </label>
          </>
        ) : (
          <label className="text-sm">
            Qaytarılan miqdar
            <DecimalInput
              name="quantity"
              scale={3}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0.001"
              max={remainingQuantity}
              required
              className="field mt-1"
            />
          </label>
        )}
        {preview && (
          <dl className="grid grid-cols-3 gap-3 text-sm sm:col-span-2">
            <div>
              <dt>Net {exchange ? "yeni alış" : "qaytarma"}</dt>
              <dd>{formatMoney(Number(preview.net))}</dd>
            </div>
            <div>
              <dt>ƏDV</dt>
              <dd>{formatMoney(Number(preview.vat))}</dd>
            </div>
            <div>
              <dt>Yekun</dt>
              <dd>{formatMoney(Number(preview.gross))}</dd>
            </div>
            {exchange && (
              <>
                <div>
                  <dt>Net fərq</dt>
                  <dd>
                    {formatMoney(
                      Number(
                        fromMinor(
                          decimalMinor(preview.net) -
                            decimalMinor(p.net_amount ?? p.total_price),
                        ),
                      ),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>ƏDV fərqi</dt>
                  <dd>
                    {formatMoney(
                      Number(
                        fromMinor(
                          decimalMinor(preview.vat) -
                            decimalMinor(p.vat_amount ?? 0),
                        ),
                      ),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Yekun fərq</dt>
                  <dd>
                    {formatMoney(
                      Number(
                        fromMinor(
                          decimalMinor(preview.gross) -
                            decimalMinor(p.gross_amount ?? p.total_price),
                        ),
                      ),
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
        )}
        {refundable > 0 ? (
          <>
            <p className="text-sm sm:col-span-2">
              Geri alınacaq məbləğ: <strong>{formatMoney(refundable)}</strong>
            </p>
            <label className="text-sm">
              Qalıq kreditin hesablaşması
              <select
                name="handling"
                value={handling}
                onChange={(e) => setHandling(e.target.value)}
                className="field mt-1"
              >
                <option value="CREDIT">Təchizatçı krediti</option>
                <option value="REFUND">Pul geri alındı</option>
              </select>
            </label>
          </>
        ) : (
          <input type="hidden" name="handling" value="CREDIT" />
        )}
        {refundable > 0 && handling === "REFUND" ? (
          <PaymentSource accounts={accounts} />
        ) : (
          <input type="hidden" name="channel" value="CASH" />
        )}
        <label className="text-sm sm:col-span-2">
          Səbəb
          <textarea
            name="reason"
            required
            maxLength={500}
            className="field mt-1"
          />
        </label>
        <MovementDetails hideParty direction="IN" purpose="" />
        <SubmitButton pendingText="Qeydə alınır...">Təsdiqlə</SubmitButton>
      </ActionForm>
    </FinanceDialog>
  );
}
export function SupplierCreditActions({
  data,
  credit,
  admin,
}: {
  data: FinanceData;
  credit: NonNullable<FinanceData["purchaseReturns"]>[number];
  admin: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <FinanceDialog label="Geri ödənişi qəbul et">
        <ActionForm
          action={refundSupplierAction}
          className="grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="return_id" value={credit.id} />
          <label className="text-sm">
            Məbləğ (AZN)
            <DecimalInput
              name="amount"
              required
              min="0.01"
              max={credit.available}
              defaultValue={credit.available}
              className="field mt-1"
            />
          </label>
          <PaymentSource accounts={data.accounts} />
          <MovementDetails
            hideParty
            direction="IN"
            purpose="Təchizatçıdan geri qaytarma"
          />
          <SubmitButton>Qeydə al</SubmitButton>
        </ActionForm>
      </FinanceDialog>
      {admin && (
        <FinanceDialog label="Krediti alışa tətbiq et">
          <ActionForm action={applySupplierCreditAction} className="grid gap-4">
            <input type="hidden" name="return_id" value={credit.id} />
            <label className="text-sm">
              Alış
              <select name="purchase_id" required className="field mt-1">
                <option value="">Seçin</option>
                {data.purchases
                  .filter(
                    (p) =>
                      p.supplier_id === credit.supplier_id &&
                      p.id !== credit.purchase_id &&
                      Number(p.remaining ?? 0) > 0 &&
                      data.jobs.some(
                        (j) =>
                          j.id === p.service_job_id &&
                          !j.closed_at &&
                          !j.inactive,
                      ),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {data.jobs.find((j) => j.id === p.service_job_id)?.plate}{" "}
                      · {p.title} · {p.remaining} AZN
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm">
              Məbləğ (AZN)
              <DecimalInput
                name="amount"
                required
                min="0.01"
                max={credit.available}
                className="field mt-1"
              />
            </label>
            <SubmitButton>Tətbiq et</SubmitButton>
          </ActionForm>
        </FinanceDialog>
      )}
    </div>
  );
}

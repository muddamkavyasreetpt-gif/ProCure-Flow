import crypto from 'crypto';
import { supabase, rpcCommitBudgetSpend } from '../db/supabase';
import { recomputeTotal } from '../guardrails';
import { PurchaseOrder } from '../types';

export interface CreatePurchaseOrderInput {
  runId: string;
  requestId: string;
  departmentId: string;
  vendorId: string;
  vendorName: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  leadTimeDays: number;
  expectedDelivery?: string;
}

export async function createPurchaseOrderForRun(
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const totalAmount = recomputeTotal(input.unitPrice, input.quantity);
  const suffix = String(crypto.randomInt(100000, 999999));
  const poNumber = `PO-2026-${suffix}`;

  const expectedDeliveryDate =
    input.expectedDelivery ||
    new Date(Date.now() + input.leadTimeDays * 86400_000).toISOString().slice(0, 10);

  const lineItems = [
    {
      item_name: input.itemName,
      description: input.itemName,
      quantity: input.quantity,
      unit_price: input.unitPrice,
      total: totalAmount
    }
  ];

  // Commit reserved budget to spent_amount atomically
  await rpcCommitBudgetSpend(input.departmentId, totalAmount, 2026);

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      id: crypto.randomUUID(),
      po_number: poNumber,
      request_id: input.requestId,
      run_id: input.runId,
      vendor_id: input.vendorId,
      line_items: lineItems,
      total_amount: totalAmount,
      expected_delivery: expectedDeliveryDate,
      status: 'issued'
    })
    .select('*')
    .single();

  if (error || !po) {
    throw new Error(`Failed to create Purchase Order: ${error?.message || 'unknown error'}`);
  }

  return {
    ...po,
    vendor_name: input.vendorName,
    total_amount: Number(po.total_amount)
  } as PurchaseOrder;
}

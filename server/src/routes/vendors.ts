import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uuidParamSchema } from '../schemas';
import { supabase } from '../db/supabase';

const router = Router();

router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const { data: vendors, error: vErr } = await supabase
    .from('vendors')
    .select('*')
    .order('rating', { ascending: false });

  if (vErr) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: vErr.message } });
    return;
  }

  const { data: catalogItems, error: cErr } = await supabase
    .from('vendor_catalog')
    .select('*')
    .order('category', { ascending: true });

  if (cErr) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: cErr.message } });
    return;
  }

  const catalogByVendor = new Map<string, any[]>();
  for (const item of catalogItems || []) {
    const list = catalogByVendor.get(item.vendor_id) || [];
    list.push({
      ...item,
      unit_price: Number(item.unit_price),
      stock_qty: Number(item.stock_qty),
      lead_time_days: Number(item.lead_time_days)
    });
    catalogByVendor.set(item.vendor_id, list);
  }

  const enriched = (vendors || []).map((v: any) => ({
    ...v,
    rating: Number(v.rating),
    catalog: catalogByVendor.get(v.id) || []
  }));

  res.json({ vendors: enriched });
});

router.get(
  '/:id',
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const vendorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .maybeSingle();

    if (error || !vendor) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } });
      return;
    }

    const { data: catalog } = await supabase
      .from('vendor_catalog')
      .select('*')
      .eq('vendor_id', vendor.id);

    res.json({
      vendor: {
        ...vendor,
        rating: Number(vendor.rating),
        catalog: catalog || []
      }
    });
  }
);

export default router;

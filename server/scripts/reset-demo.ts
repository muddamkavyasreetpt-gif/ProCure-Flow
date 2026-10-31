import { supabase } from '../src/db/supabase';
import { localDb } from '../src/db/localStore';

const ORIGINAL_BUDGETS: Array<{ dept: string; total: number; spent: number }> = [
  { dept: 'Engineering', total: 4000000, spent: 1200000 },
  { dept: 'Design', total: 2000000, spent: 500000 },
  { dept: 'Marketing', total: 800000, spent: 700000 },
  { dept: 'HR', total: 600000, spent: 100000 },
  { dept: 'Operations', total: 1000000, spent: 200000 }
];

async function resetDemo() {
  console.log('🔄 Resetting ProcureFlow demo data (preserving immutable audit_logs)...');

  // Reset in-memory localDb (preserves audit_logs)
  localDb.resetDemo();

  // Also reset in Supabase when connected
  const { data: departments } = await supabase.from('departments').select('id, name');
  if (departments && departments.length > 0) {
    for (const b of ORIGINAL_BUDGETS) {
      const dept = departments.find((d: any) => d.name === b.dept);
      if (dept) {
        await supabase
          .from('budgets')
          .update({
            total_amount: b.total,
            reserved_amount: 0,
            spent_amount: b.spent,
            updated_at: new Date().toISOString()
          })
          .eq('department_id', dept.id)
          .eq('fiscal_year', 2026);
      }
    }
  }

  // Delete workflow rows (cascade handles children in Postgres; explicit deletes for completeness)
  // Never touch audit_logs!
  await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('purchase_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('approvals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('agent_steps').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('agent_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('purchase_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('✅ Demo state reset complete! Budgets restored; audit_logs untouched.');
}

resetDemo().catch((err) => {
  console.error('❌ Reset demo error:', err);
  process.exit(1);
});

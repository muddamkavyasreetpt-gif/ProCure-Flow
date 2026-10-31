import bcrypt from 'bcryptjs';
import { supabase } from '../src/db/supabase';

const DEMO_USERS = [
  {
    email: 'employee@procureflow.demo',
    full_name: 'Priya Sharma (Design Employee)',
    role: 'employee' as const,
    departmentName: 'Design'
  },
  {
    email: 'manager@procureflow.demo',
    full_name: 'Rohan Mehta (Design Manager)',
    role: 'manager' as const,
    departmentName: 'Design'
  },
  {
    email: 'finance@procureflow.demo',
    full_name: 'Ananya Iyer (Finance Controller)',
    role: 'finance' as const,
    departmentName: 'Operations'
  },
  {
    email: 'eng.employee@procureflow.demo',
    full_name: 'Vikram Rao (Engineering Employee)',
    role: 'employee' as const,
    departmentName: 'Engineering'
  },
  {
    email: 'mkt.employee@procureflow.demo',
    full_name: 'Neha Kapoor (Marketing Employee)',
    role: 'employee' as const,
    departmentName: 'Marketing'
  }
];

async function seedUsers() {
  console.log('🌱 Seeding ProcureFlow demo users (bcrypt cost 12)...');

  const passwordHash = await bcrypt.hash('Demo@1234', 12);

  // Ensure departments exist
  const deptNames = ['Engineering', 'Design', 'Marketing', 'HR', 'Operations'];
  for (const name of deptNames) {
    await supabase.from('departments').upsert({ name }, { onConflict: 'name' });
  }

  const { data: departments, error: deptErr } = await supabase.from('departments').select('id, name');
  if (deptErr || !departments) {
    console.error('❌ Could not fetch departments:', deptErr?.message);
    process.exit(1);
  }

  const deptByName = new Map<string, string>();
  for (const d of departments) {
    deptByName.set(d.name, d.id);
  }

  for (const u of DEMO_USERS) {
    const department_id = deptByName.get(u.departmentName);
    if (!department_id) {
      throw new Error(`Department ${u.departmentName} not found`);
    }

    const { error } = await supabase.from('users').upsert(
      {
        email: u.email,
        password_hash: passwordHash,
        full_name: u.full_name,
        role: u.role,
        department_id
      },
      { onConflict: 'email' }
    );

    if (error) {
      console.error(`❌ Failed to upsert ${u.email}:`, error.message);
      process.exit(1);
    }
    console.log(`  ✔ ${u.email} (${u.role}, ${u.departmentName})`);
  }

  console.log('✅ All 5 demo users seeded idempotently!');
}

seedUsers().catch((err) => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});

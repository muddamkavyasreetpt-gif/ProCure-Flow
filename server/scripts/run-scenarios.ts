import path from 'path';
import dotenv from 'dotenv';
import http from 'http';
import { Duplex } from 'stream';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = Number(process.env.PORT || 5000);
let BASE_URL = `http://127.0.0.1:${PORT}/api`;
let expressApp: any = null;
let useInMemoryDispatch = false;

interface ScenarioResult {
  id: number;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const results: ScenarioResult[] = [];
let scenario2RunData: any = null;
const scenarioRuns: Array<{ id: number; name: string; runData: any }> = [];

async function dispatchInMemory(
  method: 'GET' | 'POST',
  endpoint: string,
  options: { token?: string; body?: unknown } = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = options.body ? JSON.stringify(options.body) : '';
    const socket = new Duplex({
      read() {},
      write(_chunk, _enc, cb) {
        cb();
      }
    });
    (socket as any).remoteAddress = '127.0.0.1';

    const req = new http.IncomingMessage(socket as any);
    req.method = method;
    req.url = `/api${endpoint}`;
    req.headers = {
      host: `127.0.0.1:${PORT}`,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(bodyStr))
    };
    if (options.token) {
      req.headers.authorization = `Bearer ${options.token}`;
    }

    const res = new http.ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    (res as any).write = (chunk: any, encoding?: any, cb?: any) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      }
      return origWrite(chunk, encoding, cb);
    };

    (res as any).end = (chunk?: any, encoding?: any, cb?: any) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      }
      origEnd(chunk, encoding, cb);
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed: any = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = { raw };
      }
      resolve({ status: res.statusCode || 200, data: parsed });
      return res;
    };

    expressApp(req, res, (err: any) => {
      if (err) reject(err);
    });

    if (bodyStr) {
      req.push(bodyStr);
    }
    req.push(null);
  });
}

async function apiRequest(
  method: 'GET' | 'POST',
  endpoint: string,
  options: { token?: string; body?: unknown } = {}
): Promise<{ status: number; data: any }> {
  if (useInMemoryDispatch && expressApp) {
    return dispatchInMemory(method, endpoint, options);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    if (expressApp) {
      useInMemoryDispatch = true;
      return dispatchInMemory(method, endpoint, options);
    }
    throw err;
  }
}

async function loginUser(email: string): Promise<string> {
  const { status, data } = await apiRequest('POST', '/auth/login', {
    body: {
      email,
      password: 'Demo@1234'
    }
  });
  if (status !== 200 || !data.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function waitForRunPauseOrFinish(
  token: string,
  runId: string,
  timeoutMs = 180000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, data } = await apiRequest('GET', `/runs/${runId}`, { token });
    if (status === 200 && data?.run) {
      const runStatus = data.run.status;
      if (['completed', 'awaiting_approval', 'rejected', 'failed'].includes(runStatus)) {
        return data;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timeout waiting for run ${runId}`);
}

async function waitForRunTerminal(
  token: string,
  runId: string,
  timeoutMs = 180000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, data } = await apiRequest('GET', `/runs/${runId}`, { token });
    if (status === 200 && data?.run) {
      const runStatus = data.run.status;
      if (['completed', 'rejected', 'failed'].includes(runStatus)) {
        return data;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timeout waiting for terminal status on run ${runId}`);
}

async function runScenario1(): Promise<void> {
  console.log('\n--- Scenario 1: 20 Ergonomic Office Chairs (Manager Escalation & Approval) ---');
  const empToken = await loginUser('employee@procureflow.demo');
  const createRes = await apiRequest('POST', '/requests', {
    token: empToken,
    body: {
      requestText: 'Order 20 ergonomic office chairs for the Design studio.',
      urgency: 'normal'
    }
  });

  const { runId } = createRes.data;
  const pausedData = await waitForRunPauseOrFinish(empToken, runId);

  const isAwaiting = pausedData.run.status === 'awaiting_approval';
  const approval = pausedData.approvals.find((a: any) => a.required_role === 'manager');

  // Verify employee cannot approve (403)
  let selfApprovalBlocked = false;
  if (approval) {
    const empAttempt = await apiRequest('POST', `/approvals/${approval.id}/decide`, {
      token: empToken,
      body: { decision: 'approved', comment: 'Trying self-approval' }
    });
    if (empAttempt.status === 403) {
      selfApprovalBlocked = true;
    }
  }

  // Manager approves
  let completedData = pausedData;
  if (isAwaiting && approval) {
    const mgrToken = await loginUser('manager@procureflow.demo');
    const decideRes = await apiRequest('POST', `/approvals/${approval.id}/decide`, {
      token: mgrToken,
      body: {
        decision: 'approved',
        comment: 'Approved by Design Manager for Design studio seating.'
      }
    });
    if (decideRes.status !== 200) {
      throw new Error(`Manager approval failed: ${JSON.stringify(decideRes.data)}`);
    }
    // Wait for async resume to finish to terminal status
    completedData = await waitForRunTerminal(empToken, runId);
  }

  const poTotal = Number(completedData.purchaseOrder?.total_amount ?? 0);
  const vendorName = completedData.purchaseOrder?.vendor_name;
  const passed =
    isAwaiting &&
    Boolean(approval) &&
    selfApprovalBlocked &&
    completedData.run.status === 'completed' &&
    vendorName === 'OfficeMart India' &&
    poTotal === 170000;

  results.push({
    id: 1,
    name: '20 Chairs → Manager Floor → PO ₹1,70,000',
    expected: 'OfficeMart ₹1,70,000, Manager approval (403 on employee), PO issued',
    actual: `Vendor: ${vendorName}, Total: ₹${poTotal.toLocaleString('en-IN')}, Role: ${
      approval?.required_role
    }, Status: ${completedData.run.status}`,
    passed
  });
  scenarioRuns.push({ id: 1, name: '20 Chairs (Manager Approval)', runData: completedData });
}

async function runScenario2(): Promise<void> {
  console.log('\n--- Scenario 2: 10 Laptops (TechNova Stock Failure → Re-plan → Prime Infotech → Finance PO) ---');
  const empToken = await loginUser('employee@procureflow.demo');
  const createRes = await apiRequest('POST', '/requests', {
    token: empToken,
    body: {
      requestText: '10 laptops for the new design team, around ₹12 lakh, needed in 3 weeks.',
      urgency: 'high'
    }
  });

  const { runId } = createRes.data;
  const pausedData = await waitForRunPauseOrFinish(empToken, runId);
  scenario2RunData = pausedData;

  const hasReplan =
    pausedData.steps.some((s: any) => s.kind === 'replan') &&
    Number(pausedData.run.replan_count) >= 1;
  const approval = pausedData.approvals.find((a: any) => a.required_role === 'finance');
  const isAwaitingFinance = pausedData.run.status === 'awaiting_approval' && Boolean(approval);

  let completedData = pausedData;
  if (isAwaitingFinance && approval) {
    const finToken = await loginUser('finance@procureflow.demo');
    const decideRes = await apiRequest('POST', `/approvals/${approval.id}/decide`, {
      token: finToken,
      body: {
        decision: 'approved',
        comment: 'Finance approved ₹10,40,000 laptop order with Prime Infotech.'
      }
    });
    if (decideRes.status !== 200) {
      throw new Error(`Finance approval failed: ${JSON.stringify(decideRes.data)}`);
    }
    completedData = await waitForRunTerminal(empToken, runId);
    scenario2RunData = completedData;
  }

  const poTotal = Number(completedData.purchaseOrder?.total_amount ?? 0);
  const vendorName = completedData.purchaseOrder?.vendor_name;
  const passed =
    hasReplan &&
    isAwaitingFinance &&
    completedData.run.status === 'completed' &&
    vendorName === 'Prime Infotech' &&
    poTotal === 1040000;

  results.push({
    id: 2,
    name: '10 Laptops → Re-plan → Finance PO ₹10,40,000',
    expected: 'TechNova stock fail → Re-plan → Prime Infotech ₹10,40,000 → Finance PO',
    actual: `Replans: ${completedData.run.replan_count}, Vendor: ${vendorName}, Total: ₹${poTotal.toLocaleString(
      'en-IN'
    )}, PO: ${completedData.purchaseOrder?.po_number}`,
    passed
  });
  scenarioRuns.push({ id: 2, name: '10 Laptops (Re-plan + Finance)', runData: completedData });
}

async function runScenario3(): Promise<void> {
  console.log('\n--- Scenario 3: 5 Software Licenses (Auto-Approved ₹24,000) ---');
  const engToken = await loginUser('eng.employee@procureflow.demo');
  const createRes = await apiRequest('POST', '/requests', {
    token: engToken,
    body: {
      requestText: 'Buy 5 annual project-management software licenses for Engineering.',
      urgency: 'normal'
    }
  });

  const { runId } = createRes.data;
  const runData = await waitForRunPauseOrFinish(engToken, runId);

  const poTotal = Number(runData.purchaseOrder?.total_amount ?? 0);
  const vendorName = runData.purchaseOrder?.vendor_name;
  const passed =
    runData.run.status === 'completed' &&
    runData.approvals.length === 0 &&
    vendorName === 'SoftSuite Reseller' &&
    poTotal === 24000;

  results.push({
    id: 3,
    name: '5 SaaS Licenses → Auto-Approved ₹24,000',
    expected: 'Auto-approved (≤ ₹25,000), SoftSuite Reseller ₹24,000 PO issued',
    actual: `Status: ${runData.run.status}, Vendor: ${vendorName}, Total: ₹${poTotal.toLocaleString(
      'en-IN'
    )}, PO: ${runData.purchaseOrder?.po_number}`,
    passed
  });
  scenarioRuns.push({ id: 3, name: '5 Software Licenses (Auto-Approve)', runData: runData });
}

async function runScenario4(): Promise<void> {
  console.log('\n--- Scenario 4: 200 Gift Cards (Prohibited Items Blocked) ---');
  const empToken = await loginUser('employee@procureflow.demo');
  const createRes = await apiRequest('POST', '/requests', {
    token: empToken,
    body: {
      requestText: 'Purchase 200 gift cards worth ₹500 each as employee rewards.',
      urgency: 'normal'
    }
  });

  const { runId } = createRes.data;
  const runData = await waitForRunPauseOrFinish(empToken, runId);

  const policyStep = runData.steps.find((s: any) => s.agent === 'policy' && s.kind === 'decision');
  const auditorStep = runData.steps.find((s: any) => s.agent === 'auditor' && s.kind === 'summary');
  const budgetSteps = runData.steps.filter((s: any) => s.agent === 'budget');

  const passed =
    runData.run.status === 'rejected' &&
    policyStep?.output?.status === 'blocked' &&
    budgetSteps.length === 0 &&
    Boolean(auditorStep);

  results.push({
    id: 4,
    name: '200 Gift Cards → Policy Blocked',
    expected: 'Blocked by Policy Agent (Prohibited Items), 0 budget steps, Auditor ran',
    actual: `Status: ${runData.run.status}, Policy: ${policyStep?.output?.status}, BudgetSteps: ${budgetSteps.length}`,
    passed
  });
  scenarioRuns.push({ id: 4, name: '200 Gift Cards (Policy Block)', runData: runData });
}

async function runScenario5(): Promise<void> {
  console.log('\n--- Scenario 5: Marketing 10 Laptops (Budget Insufficient Rejection) ---');
  const mktToken = await loginUser('mkt.employee@procureflow.demo');
  const createRes = await apiRequest('POST', '/requests', {
    token: mktToken,
    body: {
      requestText: 'I need 10 laptops for the marketing team.',
      urgency: 'normal'
    }
  });

  const { runId } = createRes.data;
  const runData = await waitForRunPauseOrFinish(mktToken, runId);

  const budgetStep = runData.steps.find((s: any) => s.agent === 'budget' && s.kind === 'decision');
  const auditorStep = runData.steps.find((s: any) => s.agent === 'auditor' && s.kind === 'summary');

  const passed =
    runData.run.status === 'rejected' &&
    budgetStep?.output?.status === 'insufficient' &&
    Number(budgetStep?.output?.available) === 100000 &&
    Boolean(auditorStep);

  results.push({
    id: 5,
    name: 'Marketing 10 Laptops → Budget Rejected',
    expected: 'Rejected by Budget Agent (₹1,00,000 available < ₹9,50,000 min estimate)',
    actual: `Status: ${runData.run.status}, Budget: ${budgetStep?.output?.status} (Avail: ₹${Number(
      budgetStep?.output?.available || 0
    ).toLocaleString('en-IN')})`,
    passed
  });
  scenarioRuns.push({ id: 5, name: 'Marketing 10 Laptops (Budget Reject)', runData: runData });
}

async function runScenario6(): Promise<void> {
  console.log('\n--- Scenario 6: QuickDeals Traders Excluded ("Vendor not approved") + Audit Chain ---');
  const finToken = await loginUser('finance@procureflow.demo');
  const vendorsRes = await apiRequest('GET', '/vendors', { token: finToken });

  const quickDealsInDir = (vendorsRes.data.vendors || []).find(
    (v: any) => v.name === 'QuickDeals Traders'
  );

  // Check Scenario 2's considered vendor list
  const vendorSteps = (scenario2RunData?.steps || []).filter(
    (s: any) => s.agent === 'vendor' && s.kind === 'decision'
  );
  const lastVendorStep = vendorSteps[vendorSteps.length - 1];
  const considered = (lastVendorStep?.output?.considered || []) as any[];
  const quickDealsInComparison = considered.find(
    (c: any) => c.vendorName === 'QuickDeals Traders'
  );

  // Verify audit chain integrity
  const auditRes = await apiRequest('GET', '/audit', { token: finToken });
  const chainValid = Boolean(auditRes.data.chainValid);

  const passed =
    Boolean(quickDealsInDir && quickDealsInDir.approved === false) &&
    Boolean(
      quickDealsInComparison &&
        quickDealsInComparison.excludedReason === 'Vendor not approved' &&
        Number(quickDealsInComparison.unitPrice) === 85000
    ) &&
    chainValid;

  results.push({
    id: 6,
    name: 'QuickDeals Excluded ("Vendor not approved") & Audit Chain',
    expected: 'QuickDeals in Scenario 2 considered list with excludedReason="Vendor not approved" & chainValid=true',
    actual: `ExcludedReason: "${quickDealsInComparison?.excludedReason}", Price: ₹${Number(
      quickDealsInComparison?.unitPrice || 0
    ).toLocaleString('en-IN')}, AuditChainValid: ${chainValid}`,
    passed
  });
}

async function main() {
  console.log('===============================================================');
  console.log('ProcureFlow End-to-End Scenario Verification Test Suite (INR ₹)');
  console.log(`LLM_MODE=${process.env.LLM_MODE || 'mock'}`);
  console.log('===============================================================');

  let selfHostedServer: http.Server | null = null;
  const { default: app } = await import('../src/app');
  const { localDb } = await import('../src/db/localStore');
  expressApp = app;

  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) throw new Error('Not OK');
    console.log(`Connected to running server at ${BASE_URL}`);
  } catch {
    localDb.resetDemo();
    try {
      selfHostedServer = await new Promise<http.Server>((resolve, reject) => {
        const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
        srv.on('error', reject);
      });
      const addr = selfHostedServer.address();
      if (addr && typeof addr === 'object') {
        BASE_URL = `http://127.0.0.1:${addr.port}/api`;
      }
    } catch {
      useInMemoryDispatch = true;
    }
  }

  try {
    await runScenario1();
    await runScenario2();
    await runScenario3();
    await runScenario4();
    await runScenario5();
    await runScenario6();
  } catch (err: any) {
    console.error('Scenario execution error:', err.message);
  } finally {
    if (selfHostedServer) {
      await new Promise<void>((resolve) => selfHostedServer!.close(() => resolve()));
    }
  }

  console.log('\n===============================================================');
  console.log('SCENARIO TEST RESULTS');
  console.log('===============================================================');
  console.table(
    results.map((r) => ({
      Scenario: `0${r.id} - ${r.name}`,
      Passed: r.passed ? 'PASS' : 'FAIL',
      Actual: r.actual
    }))
  );

  console.log('\n===============================================================');
  console.log('LLM EXECUTION BREAKDOWN (REAL GEMINI VS DETERMINISTIC FALLBACK)');
  console.log('===============================================================');
  const llmTable = scenarioRuns.map((sr) => {
    const steps = sr.runData?.steps || [];
    const agentDecisions = steps.filter((s: any) =>
      ['plan', 'decision', 'summary', 'replan'].includes(s.kind) &&
      s.agent !== 'human' &&
      s.agent !== 'system'
    );
    const realTurns = agentDecisions.filter((s: any) => s.output?.fallback === false);
    const fallbackTurns = agentDecisions.filter((s: any) => s.output?.fallback === true);
    const fallbackDetails = fallbackTurns
      .map((s: any) => `${s.agent}: ${s.output?.fallbackReason || 'Deterministic fallback triggered'}`)
      .join('; ');

    return {
      Scenario: `0${sr.id} - ${sr.name}`,
      TotalAgentSteps: agentDecisions.length,
      RealGeminiCalls: realTurns.length,
      FallbackSteps: fallbackTurns.length,
      FallbackDetails: fallbackDetails || 'None (100% Real Gemini)'
    };
  });
  console.table(llmTable);

  const allPassed = results.length === 6 && results.every((r) => r.passed);
  if (allPassed) {
    console.log('ALL 6 DEMO SCENARIOS PASSED WITH FULL POLICY, BUDGET & AUDIT COMPLIANCE!\n');
    process.exit(0);
  } else {
    console.error('Some scenarios failed or did not run.\n');
    process.exit(1);
  }
}

main();

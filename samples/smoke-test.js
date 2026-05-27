#!/usr/bin/env node
'use strict';

/**
 * Smoke-test harness for the Smobilpay Node.js client against a real
 * partner environment.
 *
 * Configuration
 * -------------
 * All settings are read from a single JSON config file. The path is
 * resolved in this order:
 *
 *   1. The first command-line argument, if present.
 *   2. The SMOBILPAY_SMOKE_CONFIG environment variable, if set.
 *   3. ./smoke-test.json in the current working directory.
 *
 * See smoke-test.example.json at the repo root for a fully populated
 * template. baseUrl, publicKey and secretKey are required; every per-flow
 * block is optional and an absent block simply skips the corresponding
 * scenario.
 *
 * Spec terminology
 * ----------------
 *   - cashout = collection (money flows OUT of customer's wallet)
 *   - cashin  = disbursement (money flows INTO recipient's wallet)
 *
 * What it does
 * ------------
 * The harness is read-only by default. Collection-style scenarios stop
 * at the quote and never call /v2/collectstd unless the corresponding
 * flow block opts in with `"collect": true` plus the required customer
 * fields (see below).
 *
 *   1. Ping — proves OAuth 2.0 mint + bearer + x-api-version work end-to-end.
 *   2. Token refresh — forces a fresh mint, re-pings.
 *   3. Account profile — agent identity, balance, daily limit.
 *   4. Merchant list — discovery of merchants supported by the system.
 *   5. Service list — discovery and type distribution.
 *   6. Per-flow discovery + quote for every configured service type
 *      (cashout, bill, topup, voucher, product, subscription, cashin).
 *   7. (Opt-in) `/v2/collectstd` against the issued quote, followed by a
 *      one-shot `/v2/verifytx` poll. Requires `collect: true` plus
 *      `customerPhonenumber` and `customerEmailaddress` on the flow
 *      block. Moves real money — leave disabled in CI.
 *   8. Pre-payment serviceNumber verification (optional).
 *   9. Account validation by destination (optional, restricted endpoint).
 *  10. History over the last 7 days.
 *
 * Opting into a real collect
 * --------------------------
 * Add the following fields to any flow block in smoke-test.json:
 *
 *   "collect": true,
 *   "customerPhonenumber": "699999999",      // payer for collections, recipient for cash-in
 *   "customerEmailaddress": "you@example.com",
 *   "serviceNumber": "699999999"             // optional; needed only when the
 *                                            // service has isReqServiceNumber=true
 *   // Optional pass-through fields: customerName, customerAddress,
 *   // customerNumber, trid (auto-generated otherwise), tag, callbackUrl, cdata.
 *
 * How to run
 * ----------
 *   cp smoke-test.example.json smoke-test.json
 *   # edit smoke-test.json to fill in baseUrl, publicKey, secretKey,
 *   # and the per-flow blocks you want exercised.
 *   npm run smoke
 *   # or with an explicit path:
 *   node samples/smoke-test.js path/to/my-config.json
 *
 * Exit code is 0 when every non-skipped scenario passes, 1 on any failure,
 * 2 on configuration errors before the client could start.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  createClient,
  SmobilpayApiException,
  SmobilpayAuthException,
} = require('../src');

const SEP = '----------------------------------------------------------------------';
const BANNER = '======================================================================';

class SkipError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipError';
  }
}

function main(argv) {
  let cfg;
  try {
    cfg = loadConfig(argv);
    validateRequired(cfg);
  } catch (e) {
    process.stderr.write(`Configuration error: ${e.message}\n`);
    process.exit(2);
    return;
  }

  const client = createClient({
    baseUrl: cfg.baseUrl,
    publicKey: cfg.publicKey,
    secretKey: cfg.secretKey,
    apiVersion: cfg.apiVersion || undefined,
  });

  const runner = new Runner();
  runner.banner(
    `Smobilpay smoke test  —  baseUrl=${stripTrailingSlash(cfg.baseUrl)}` +
      `, apiVersion=${client.config.apiVersion}` +
      `, publicKey=${redactKey(cfg.publicKey)}`,
  );

  runScenarios(runner, client, cfg)
    .then(() => {
      runner.printSummary();
      process.exit(runner.failed === 0 ? 0 : 1);
    })
    .catch((e) => {
      process.stderr.write(`Unhandled harness error: ${e.stack || e.message}\n`);
      process.exit(1);
    });
}

async function runScenarios(runner, client, cfg) {
  await runner.run('Ping (auth probe)', async () => {
    const pong = await client.verify.ping();
    expect(pong != null && pong.version != null, 'empty response');
    runner.detail(`server time:    ${pong.time}`);
    runner.detail(`server version: ${pong.version}`);
    runner.detail(`nonce echo:     ${pong.nonce}`);
    runner.detail(`public key:     ${pong.key}`);
  });

  await runner.run('OAuth 2.0 token refresh', async () => {
    const first = await client.tokens.accessToken();
    const forced = await client.tokens.refresh();
    expect(forced != null && forced.length > 0, 'refresh returned empty token');
    const pong = await client.verify.ping();
    expect(pong != null, 'ping after refresh returned null');
    runner.detail(`first  bearer prefix: ${first.slice(0, 12)}...`);
    runner.detail(`forced bearer prefix: ${forced.slice(0, 12)}...`);
    runner.detail(`identical: ${first === forced}`);
  });

  await runner.run('Account profile', async () => {
    const account = await client.verify.account();
    expect(account != null, 'empty response');
    runner.detail(`agent:           ${account.agentName} (id=${account.agentId})`);
    runner.detail(`company:         ${account.companyName}`);
    runner.detail(`balance:         ${account.balance} ${account.currency}`);
    runner.detail(`daily limit max: ${account.limitMax}`);
    runner.detail(`limit remaining: ${account.limitRemaining}`);
  });

  await runner.run('Merchant catalog', async () => {
    const merchants = await client.masterdata.merchants();
    expect(merchants != null, 'null response');
    runner.detail(`merchants: ${merchants.length}`);
    const sample = Math.min(5, merchants.length);
    for (let i = 0; i < sample; i++) {
      const m = merchants[i];
      runner.detail(`  - ${m.merchant} : ${m.name} (${m.country}, ${m.status})`);
    }
    if (merchants.length > sample) {
      runner.detail(`  ...and ${merchants.length - sample} more`);
    }
  });

  await runner.run('Service catalog', async () => {
    const services = await client.masterdata.services();
    expect(services != null, 'null response');
    runner.detail(`services: ${services.length}`);

    const byType = new Map();
    for (const s of services) byType.set(s.type, (byType.get(s.type) || 0) + 1);
    runner.detail('distribution by type:');
    for (const type of [...byType.keys()].sort()) {
      runner.detail(`  - ${type}: ${byType.get(type)}`);
    }
    listServicesOfType(runner, services, 'VOUCHER', 'VOUCHER services');
    listServicesOfType(runner, services, 'SUBSCRIPTION', 'SUBSCRIPTION services');
    listVerifiableServices(runner, services);
  });

  await runner.run('Collection — cash-out (discover + quote)', async () => {
    const c = cfg.cashout;
    if (c == null) throw new SkipError("no 'cashout' block in config");
    const items = await client.masterdata.cashouts(c.serviceId);
    expect(items != null && items.length > 0, `no cashout items for serviceId=${c.serviceId}`);
    const item = items[0];
    describeItem(runner, item);
    await quoteAndReport(runner, client, item, c.amount, c);
  });

  await runner.run('Collection — bill payment (discover + quote)', async () => {
    const c = cfg.bill;
    if (c == null) throw new SkipError("no 'bill' block in config");
    const bills = await client.initiate.bills(c.merchant, c.serviceId, c.serviceNumber);
    expect(
      bills != null && bills.length > 0,
      `no bills for ${c.merchant}/${c.serviceId}/${c.serviceNumber}`,
    );
    const bill = bills[0];
    runner.detail(
      `picked: ${bill.payItemId} (${bill.billType}, amount=${bill.amountLocalCur} ${bill.localCur}, due=${bill.billDueDate})`,
    );
    await quoteAndReport(runner, client, bill, Math.trunc(bill.amountLocalCur), c);
  });

  await runner.run('Collection — airtime top-up (discover + quote)', async () => {
    const c = cfg.topup;
    if (c == null) throw new SkipError("no 'topup' block in config");
    const items = await client.masterdata.topups(c.serviceId);
    expect(items != null && items.length > 0, `no topup items for serviceId=${c.serviceId}`);
    const item = items[0];
    describeItem(runner, item);
    await quoteAndReport(runner, client, item, c.amount, c);
  });

  await runner.run('Collection — voucher purchase (discover + quote)', async () => {
    const c = cfg.voucher;
    if (c == null) throw new SkipError("no 'voucher' block in config");
    let items;
    try {
      items = await client.masterdata.vouchers(c.serviceId);
    } catch (e) {
      if (e instanceof SmobilpayApiException && e.respCode === 41004) {
        throw new SkipError(
          `/v2/voucher rejects serviceId=${c.serviceId} (respCode 41004) even though the catalog labels it VOUCHER`,
        );
      }
      throw e;
    }
    expect(items != null && items.length > 0, `no vouchers for serviceId=${c.serviceId}`);
    const item = items[0];
    describeItem(runner, item);
    await quoteAndReport(runner, client, item, resolveAmount(item, c.amount), c);
  });

  await runner.run('Collection — product purchase (discover + quote)', async () => {
    const c = cfg.product;
    if (c == null) throw new SkipError("no 'product' block in config");
    const items = await client.masterdata.products(c.serviceId);
    expect(items != null && items.length > 0, `no products for serviceId=${c.serviceId}`);
    const item = items[0];
    describeItem(runner, item);
    await quoteAndReport(runner, client, item, resolveAmount(item, c.amount), c);
  });

  await runner.run('Collection — subscription top-up (discover + quote)', async () => {
    const c = cfg.subscription;
    if (c == null) throw new SkipError("no 'subscription' block in config");
    if (c.serviceNumber == null && c.customerNumber == null) {
      throw new SkipError("subscription block needs either 'serviceNumber' or 'customerNumber'");
    }
    const subs = await client.initiate.subscriptions(
      c.merchant,
      c.serviceId,
      c.serviceNumber,
      c.customerNumber,
    );
    expect(
      subs != null && subs.length > 0,
      `no subscriptions for ${c.merchant}/${c.serviceId} (serviceNumber=${c.serviceNumber}, customerNumber=${c.customerNumber})`,
    );
    const sub = subs[0];
    runner.detail(
      `picked: ${sub.payItemId} (${sub.name}, customer=${sub.customerName}, amount=${sub.amountLocalCur} ${sub.localCur}, due=${sub.dueDate})`,
    );
    await quoteAndReport(runner, client, sub, resolveAmount(sub, c.amount), c);
  });

  await runner.run('Disbursement — cash-in (discover + quote)', async () => {
    const c = cfg.cashin;
    if (c == null) throw new SkipError("no 'cashin' block in config");
    const items = await client.masterdata.cashins(c.serviceId);
    expect(items != null && items.length > 0, `no cashin items for serviceId=${c.serviceId}`);
    const item = items[0];
    describeItem(runner, item);
    await quoteAndReport(runner, client, item, c.amount, c);
  });

  await runner.run('Account validation — verify serviceNumber', async () => {
    const c = cfg.verify;
    if (c == null) throw new SkipError("no 'verify' block in config");
    try {
      const valid = await client.accountValidation.verifyServiceNumber(
        c.merchant,
        c.serviceId,
        c.serviceNumber,
      );
      runner.detail(
        `${c.serviceNumber} for ${c.merchant}/${c.serviceId} -> ${valid ? 'valid' : 'invalid'}`,
      );
    } catch (e) {
      if (e instanceof SmobilpayApiException && e.respCode === 40408) {
        throw new SkipError(
          `service ${c.merchant}/${c.serviceId} does not support pre-payment verification (respCode 40408)`,
        );
      }
      throw e;
    }
  });

  await runner.run('Account validation — validate destination', async () => {
    const c = cfg.validate;
    if (c == null) throw new SkipError("no 'validate' block in config");
    try {
      const account = await client.accountValidation.validateAccount(c.destination, c.serviceId);
      expect(account != null, 'empty response');
      runner.detail(`destination: ${account.destination}`);
      runner.detail(`status:      ${account.status}`);
      runner.detail(`name:        ${account.name}`);
    } catch (e) {
      if (e instanceof SmobilpayApiException && e.httpStatus === 401) {
        throw new SkipError(
          'GET /v2/validate is a restricted endpoint and is not enabled for this partner (HTTP 401). Compliance review is required — contact your Maviance integration manager.',
        );
      }
      throw e;
    }
  });

  await runner.run('History - last 7 days', async () => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await client.verify.historyByDateRange(weekAgo, today);
    expect(rows != null, 'null response');
    const fmt = (d) => d.toISOString().slice(0, 10);
    runner.detail(`range:        ${fmt(weekAgo)} -> ${fmt(today)}`);
    runner.detail(`transactions: ${rows.length}`);
    const sample = Math.min(3, rows.length);
    for (let i = 0; i < sample; i++) {
      const s = rows[i];
      runner.detail(`  - ${s.ptn} : ${s.status}, ${s.priceLocalCur} ${s.localCur}, trid=${s.trid}`);
    }
  });
}

class Runner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }

  detail(line) {
    process.stdout.write(`     ${line}\n`);
  }

  banner(message) {
    process.stdout.write('\n');
    process.stdout.write(`${BANNER}\n`);
    process.stdout.write(`${message}\n`);
    process.stdout.write(`${BANNER}\n`);
  }

  async run(name, scenario) {
    process.stdout.write(`${SEP}\n`);
    process.stdout.write(`RUN  ${name}\n`);
    try {
      await scenario();
      this.passed++;
      process.stdout.write(`PASS ${name}\n`);
    } catch (e) {
      if (e instanceof SkipError) {
        this.skipped++;
        process.stdout.write(`SKIP ${name} - ${e.message}\n`);
      } else if (e instanceof SmobilpayAuthException) {
        this.failed++;
        const oauth = e.oauthError ? `, error=${e.oauthError}` : '';
        process.stdout.write(
          `FAIL ${name} - auth error (HTTP ${e.httpStatus}${oauth}): ${e.message}\n`,
        );
      } else if (e instanceof SmobilpayApiException) {
        this.failed++;
        process.stdout.write(`FAIL ${name} - API error (HTTP ${e.httpStatus})\n`);
        if (e.apiError) this.printApiError(e.apiError);
      } else {
        this.failed++;
        process.stdout.write(`FAIL ${name} - ${e.constructor.name}: ${e.message}\n`);
      }
    }
  }

  printApiError(err) {
    this.detail(`respCode: ${err.respCode}`);
    this.detail(`devMsg:   ${err.devMsg}`);
    if (err.usrMsg) this.detail(`usrMsg:   ${err.usrMsg}`);
    if (err.link) this.detail(`link:     ${err.link}`);
  }

  printSummary() {
    process.stdout.write(`${SEP}\n`);
    process.stdout.write(
      `Summary: ${this.passed} passed, ${this.skipped} skipped, ${this.failed} failed\n`,
    );
    process.stdout.write(`${SEP}\n`);
  }
}

function describeItem(runner, item) {
  runner.detail(
    `picked: ${item.payItemId} (${item.name}, ${item.amountType}, local=${item.amountLocalCur} ${item.localCur})`,
  );
}

function listServicesOfType(runner, services, type, label) {
  const matches = services.filter((s) => s.type === type);
  if (matches.length === 0) return;
  runner.detail(`${label}:`);
  for (const s of matches) {
    runner.detail(`  - serviceId=${s.serviceid} merchant=${s.merchant} title=${s.title}`);
  }
}

function listVerifiableServices(runner, services) {
  const matches = services.filter((s) => s.isVerifiable === true);
  if (matches.length === 0) return;
  runner.detail("verifiable services (isVerifiable=true) — candidates for the 'verify' block:");
  for (const s of matches) {
    runner.detail(`  - serviceId=${s.serviceid} merchant=${s.merchant} title=${s.title}`);
  }
}

async function quoteAndReport(runner, client, item, amount, c) {
  const quote = await client.initiate.quote({ amount, payItemId: item.payItemId });
  expect(quote != null && quote.quoteId != null, 'empty quote');
  runner.detail(`quoteId:        ${quote.quoteId}`);
  runner.detail(`expiresAt:      ${quote.expiresAt}`);
  runner.detail(`price (local):  ${quote.priceLocalCur} ${quote.localCur}`);
  runner.detail(`price (system): ${quote.priceSystemCur} ${quote.systemCur}`);
  runner.detail(`promotion:      ${quote.promotion}`);

  if (c && c.collect === true) {
    await collectAndReport(runner, client, quote, c);
  } else {
    runner.detail('(intentionally NOT calling /v2/collectstd — set "collect": true on this block to enable)');
  }
}

/**
 * Execute /v2/collectstd against an unexpired quote. Opt-in per flow:
 * set `"collect": true` on the flow block in smoke-test.json AND provide
 * `customerPhonenumber` + `customerEmailaddress` (required by the spec).
 *
 *   - For COLLECTION flows (cashout/bill/topup/voucher/product/subscription)
 *     customerPhonenumber is the PAYER's MSISDN.
 *   - For DISBURSEMENT flows (cashin) customerPhonenumber is the
 *     RECIPIENT's MSISDN — money flows INTO that wallet.
 *
 * After the collect succeeds the harness sleeps briefly and polls
 * `/v2/verifytx` once to surface the latest server-side status.
 *
 * WARNING: this moves real money on the partner balance. Acceptance
 * transactions are not reversible from the client; if you collect by
 * mistake, contact your Maviance integration manager.
 */
async function collectAndReport(runner, client, quote, c) {
  expect(
    typeof c.customerPhonenumber === 'string' && c.customerPhonenumber.length > 0,
    "'collect: true' requires 'customerPhonenumber' on the same block",
  );
  expect(
    typeof c.customerEmailaddress === 'string' && c.customerEmailaddress.length > 0,
    "'collect: true' requires 'customerEmailaddress' on the same block",
  );

  const request = {
    quoteId: quote.quoteId,
    customerPhonenumber: c.customerPhonenumber,
    customerEmailaddress: c.customerEmailaddress,
  };
  // Optional fields — passed through only when present so the server's
  // `isReq*` rules can do the right thing.
  for (const field of [
    'customerName',
    'customerAddress',
    'customerNumber',
    'serviceNumber',
    'tag',
    'callbackUrl',
    'cdata',
  ]) {
    if (c[field] != null && c[field] !== '') request[field] = c[field];
  }
  request.trid = c.trid && c.trid.length > 0 ? c.trid : generateTrid();

  runner.detail(`-> POST /v2/collectstd`);
  runner.detail(`   trid:    ${request.trid}`);

  const response = await client.confirm.collect(request);
  runner.detail(`ptn:             ${response.ptn}`);
  runner.detail(`status:          ${response.status}`);
  runner.detail(`receiptNumber:   ${response.receiptNumber}`);
  if (response.veriCode) runner.detail(`veriCode:        ${response.veriCode}`);
  runner.detail(`agentBalance:    ${response.agentBalance}`);
  runner.detail(`price (local):   ${response.priceLocalCur} ${response.localCur}`);
  runner.detail(`price (system):  ${response.priceSystemCur} ${response.systemCur}`);
  runner.detail(`timestamp:       ${response.timestamp}`);
  if (response.pin) runner.detail(`pin:             ${response.pin}`);

  // Brief poll so the server has a moment to settle before we re-check.
  await sleep(2000);
  const verifications = await client.verify.verifyTransaction(response.ptn, null);
  if (verifications && verifications.length > 0) {
    const v = verifications[0];
    runner.detail(`verifytx:        status=${v.status} clearingDate=${v.clearingDate}`);
  } else {
    runner.detail('verifytx:        no rows yet (final status will land via callbackUrl or a later poll)');
  }
}

function generateTrid() {
  return `nodejs-smoke-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAmount(item, configAmount) {
  if (configAmount != null && configAmount > 0) return configAmount;
  const local = item.amountLocalCur;
  if (local != null && local >= 1) return Math.trunc(local);
  throw new Error(
    `item ${item.payItemId} has no fixed catalog amount (got ${local}). Set "amount" in this block of smoke-test.json.`,
  );
}

function expect(ok, message) {
  if (!ok) throw new Error(message);
}

function loadConfig(argv) {
  const configPath = resolveConfigPath(argv);
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    throw new Error(
      `config file not found at ${path.resolve(configPath)}. Pass a path as the first argument, set SMOBILPAY_SMOKE_CONFIG, or create ./smoke-test.json (see smoke-test.example.json).`,
    );
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`could not parse ${path.resolve(configPath)}: ${e.message}`);
  }
}

function resolveConfigPath(argv) {
  const args = argv.slice(2);
  if (args.length > 0 && args[0].trim()) return args[0].trim();
  const envPath = process.env.SMOBILPAY_SMOKE_CONFIG;
  if (envPath && envPath.trim()) return envPath.trim();
  return 'smoke-test.json';
}

function validateRequired(cfg) {
  if (cfg == null || typeof cfg !== 'object') throw new Error('config is empty');
  for (const field of ['baseUrl', 'publicKey', 'secretKey']) {
    if (typeof cfg[field] !== 'string' || cfg[field].trim() === '') {
      throw new Error(`missing required field '${field}'`);
    }
  }
}

function stripTrailingSlash(s) {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function redactKey(key) {
  if (!key || key.length <= 4) return '****';
  return `${key.slice(0, 4)}...${key.slice(-2)}`;
}

if (require.main === module) {
  main(process.argv);
}

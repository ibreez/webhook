/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { EwityApiClient } from './src/server/ewityClient';
import { EwityWebhookService } from './src/server/ewityWebhook';
import { EwityReconciliationWorker } from './src/server/ewityReconciliation';
import { runEwityMockTestSuite, MOCK_EWITY_BILLS } from './src/server/ewityMockFixtures';
import { mapEwityBillToOrder } from './src/services/ewityMapper';
import { EwityLocation, EwityBillSummary, EwityConnectionInfo, EwityConnectionStatus } from './src/types/ewity';
import { Order } from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Initialize Ewity services with environment variables
const ewityConfig = {
  baseUrl: process.env.EWITY_API_BASE_URL || 'https://api.ewitypos.com/apps-v1',
  apiKey: process.env.EWITY_APP_API_KEY || '',
  storeId: process.env.EWITY_STORE_ID || '',
  timeoutMs: 10000,
  maxRetries: 3,
};

const ewityClient = new EwityApiClient(ewityConfig);
const ewityWebhook = new EwityWebhookService(process.env.EWITY_WEBHOOK_SECRET || '');

// In-memory store for reconciled live orders & bills
let liveBillsCache: EwityBillSummary[] = [...MOCK_EWITY_BILLS];
let liveOrdersCache: Order[] = liveBillsCache.map((b) => mapEwityBillToOrder(b));
let lastSyncTimestamp: number | null = null;
let currentConnectionStatus: EwityConnectionStatus = 'Demo Mode';
let currentCompanyInfo: any = null;
let currentAuthorities: string[] = [];
let cachedLocations: EwityLocation[] = [];
let lastErrorMessage: string | undefined = undefined;

// Periodic reconciliation worker
const reconciler = new EwityReconciliationWorker(
  ewityClient,
  60000,
  (reconciledBills) => {
    liveBillsCache = reconciledBills;
    liveOrdersCache = reconciledBills.map((b) => {
      const existing = liveOrdersCache.find((o) => o.id === `ewity-${b.id}`);
      return mapEwityBillToOrder(b, undefined, existing);
    });
    lastSyncTimestamp = Date.now();
  }
);

async function startServer() {
  const app = express();

  // Raw body capture middleware for webhook signature verification
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // ---------------------------------------------------------
  // EWITY API ROUTES
  // ---------------------------------------------------------

  /**
   * GET /api/ewity/status
   * Reports live connection state, permissions, and available locations.
   * "Never show Connected unless a real authenticated API request succeeds."
   */
  app.get('/api/ewity/status', async (_req, res) => {
    const masked = ewityClient.getMaskedCredentials();
    const hasRequiredPerm = currentAuthorities.some((a) =>
      a.includes('p/r-bill-history') || a.includes('p/r-bill')
    );

    const info: EwityConnectionInfo = {
      mode: currentConnectionStatus === 'Connected' ? 'live' : 'demo',
      status: currentConnectionStatus,
      isConnected: currentConnectionStatus === 'Connected',
      storeId: masked.storeId,
      hasApiKey: masked.hasApiKey,
      hasSigningSecret: ewityWebhook.hasSecret(),
      company: currentCompanyInfo,
      authorities: currentAuthorities,
      hasBillHistoryPermission: hasRequiredPerm,
      availableLocations: cachedLocations,
      lastSyncedAt: lastSyncTimestamp || undefined,
      lastError: lastErrorMessage,
      reconciliationActive: reconciler.getStats().isRunning,
      lastReconciliationAt: reconciler.getStats().lastRunAt || undefined,
    };

    res.json(info);
  });

  /**
   * POST /api/ewity/connect
   * Initiates authentication against Ewity Apps API (GET /users/me).
   * Validates credentials and verifies required permissions.
   */
  app.post('/api/ewity/connect', async (req, res) => {
    const { apiKey, storeId, baseUrl, webhookSecret } = req.body || {};

    if (apiKey || storeId) {
      ewityClient.updateCredentials(
        apiKey || process.env.EWITY_APP_API_KEY || '',
        storeId || process.env.EWITY_STORE_ID || '',
        baseUrl
      );
    }
    if (webhookSecret) {
      ewityWebhook.setSigningSecret(webhookSecret);
    }

    if (!ewityClient.hasCredentials()) {
      currentConnectionStatus = 'Connection Error';
      lastErrorMessage =
        'Missing Ewity API credentials. Both EWITY_APP_API_KEY and EWITY_STORE_ID are required.';
      return res.status(400).json({
        success: false,
        status: currentConnectionStatus,
        error: lastErrorMessage,
      });
    }

    currentConnectionStatus = 'Connecting';

    try {
      // 1. Authenticate calling user & retrieve authorities (GET /users/me)
      const user = await ewityClient.getCurrentUser();
      currentCompanyInfo = user.company;
      currentAuthorities = user.authorities || [];

      // 2. Fetch locations (GET /locations/user)
      cachedLocations = await ewityClient.getLocations();

      // 3. Permission checks
      const hasBillPerm = currentAuthorities.some((a) =>
        a.includes('p/r-bill-history') || a.includes('p/r-bill')
      );

      if (!hasBillPerm) {
        currentConnectionStatus = 'Connection Error';
        lastErrorMessage =
          'Connected, but merchant did not approve required role: "p/r-bill-history". Bills cannot be read.';
        return res.status(403).json({
          success: false,
          status: currentConnectionStatus,
          error: lastErrorMessage,
          authorities: currentAuthorities,
        });
      }

      currentConnectionStatus = 'Connected';
      lastErrorMessage = undefined;
      lastSyncTimestamp = Date.now();

      // Start periodic reconciliation worker
      reconciler.start();

      return res.json({
        success: true,
        status: currentConnectionStatus,
        company: currentCompanyInfo,
        authorities: currentAuthorities,
        locations: cachedLocations,
      });
    } catch (err: any) {
      currentConnectionStatus = 'Connection Error';
      lastErrorMessage = err.message || 'Failed to authenticate with Ewity Apps API';
      return res.status(502).json({
        success: false,
        status: currentConnectionStatus,
        error: lastErrorMessage,
      });
    }
  });

  /**
   * POST /api/ewity/disconnect
   * Reverts to Demo Mode
   */
  app.post('/api/ewity/disconnect', (_req, res) => {
    reconciler.stop();
    currentConnectionStatus = 'Demo Mode';
    lastErrorMessage = undefined;
    res.json({ success: true, status: 'Demo Mode' });
  });

  /**
   * GET /api/ewity/locations
   * Lists locations available to the app
   */
  app.get('/api/ewity/locations', async (_req, res) => {
    if (currentConnectionStatus !== 'Connected') {
      return res.json({
        locations: [
          { id: 1, name: 'Harbor Wharf Bistro (Store #101)', type: 'restaurant' },
          { id: 2, name: 'Ewity Downtown Flagship (Store #102)', type: 'restaurant' },
          { id: 3, name: 'The Garden Terrace (Store #103)', type: 'restaurant' },
        ],
      });
    }

    try {
      const locations = await ewityClient.getLocations();
      cachedLocations = locations;
      res.json({ locations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/ewity/bills
   * Proxies bill listing with pagination, search, and KOT filtering.
   * Path: GET /sales/bills/location/{id}
   */
  app.get('/api/ewity/bills', async (req, res) => {
    const {
      location_id = 'all',
      page = 1,
      limit = 20,
      order_by = 'created_at:desc',
      q_kot_number,
      q_number,
      q_status,
      q_type,
      q_payment_status,
    } = req.query as Record<string, string>;

    // If in Demo Mode, return mock bills
    if (currentConnectionStatus !== 'Connected') {
      let filtered = [...MOCK_EWITY_BILLS];
      if (q_kot_number) {
        filtered = filtered.filter((b) =>
          b.kot_number?.toLowerCase().includes(q_kot_number.toLowerCase())
        );
      }
      if (q_status && q_status !== 'ALL') {
        filtered = filtered.filter((b) => b.status === q_status);
      }
      if (q_number) {
        filtered = filtered.filter((b) =>
          b.number.toLowerCase().includes(q_number.toLowerCase())
        );
      }

      const mappedOrders = filtered.map((b) => mapEwityBillToOrder(b));
      return res.json({
        data: filtered,
        mappedOrders,
        pagination: {
          pageSize: Number(limit),
          current: Number(page),
          total: filtered.length,
          hasMorePages: false,
        },
        mode: 'demo',
      });
    }

    try {
      const billResponse = await ewityClient.listBills(location_id, {
        page: Number(page),
        limit: Number(limit),
        order_by,
        q_kot_number,
        q_number,
        q_status,
        q_type,
        q_payment_status,
      });

      // Map real bills into internal Order model
      const mappedOrders = billResponse.data.map((bill) => {
        const existing = liveOrdersCache.find((o) => o.id === `ewity-${bill.id}`);
        return mapEwityBillToOrder(bill, undefined, existing);
      });

      res.json({
        ...billResponse,
        mappedOrders,
        mode: 'live',
      });
    } catch (err: any) {
      res.status(502).json({
        error: err.message,
        fallbackData: MOCK_EWITY_BILLS,
      });
    }
  });

  /**
   * GET /api/ewity/bills/:id
   * Retrieves single bill detail including line items and payments
   */
  app.get('/api/ewity/bills/:id', async (req, res) => {
    const { id } = req.params;

    if (currentConnectionStatus !== 'Connected') {
      const found = MOCK_EWITY_BILLS.find((b) => String(b.id) === id);
      if (found) {
        return res.json({ data: found });
      }
      return res.status(404).json({ error: 'Bill not found' });
    }

    try {
      const detail = await ewityClient.getBillDetail(id);
      res.json({ data: detail });
    } catch (err: any) {
      res.status(502).json({ error: err.message });
    }
  });

  /**
   * POST /api/ewity/webhooks
   * Official Webhook endpoint receiving Ewity event notifications.
   * Headers: X-Ewity-Event, X-Ewity-Delivery, X-Ewity-Signature
   */
  app.post('/api/ewity/webhooks', (req: any, res) => {
    const sigHeader = req.headers['x-ewity-signature'] as string;
    const deliveryId = (req.headers['x-ewity-delivery'] || req.body?.id) as string;
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // 1. Verify Signature
    const verification = ewityWebhook.verifySignature(sigHeader, rawBody);
    if (!verification.isValid) {
      console.warn(`[EWITY-WEBHOOK] Rejected unverified webhook delivery ${deliveryId}: ${verification.reason}`);
      return res.status(401).json({
        error: 'invalid_signature',
        message: verification.reason,
      });
    }

    // 2. Process Envelope Idempotently
    const envelope = req.body;
    const result = ewityWebhook.processEnvelope(deliveryId, envelope);

    // 3. Update in-memory orders if applicable
    if (result.success && envelope.data) {
      if (envelope.event === 'bill.created' && envelope.data.bill) {
        const bill = envelope.data.bill;
        const mappedOrder = mapEwityBillToOrder(bill);
        const existingIdx = liveOrdersCache.findIndex((o) => o.id === mappedOrder.id);
        if (existingIdx >= 0) {
          liveOrdersCache[existingIdx] = mappedOrder;
        } else {
          liveOrdersCache.unshift(mappedOrder);
        }
      } else if (envelope.event === 'bill.voided' && envelope.data.bill_id) {
        const billId = `ewity-${envelope.data.bill_id}`;
        liveOrdersCache = liveOrdersCache.map((ord) => {
          if (ord.id === billId) {
            return { ...ord, orderStatus: 'Voided' };
          }
          return ord;
        });
      }
    }

    // Always respond 200 OK quickly within 5s
    return res.status(200).json({
      status: 'received',
      delivery_id: deliveryId,
      result: result.action,
    });
  });

  /**
   * GET /api/ewity/webhooks/recent
   * Returns recent webhooks for inspector UI
   */
  app.get('/api/ewity/webhooks/recent', (_req, res) => {
    res.json({
      events: ewityWebhook.getRecentEvents(),
      processedCount: ewityWebhook.getProcessedCount(),
    });
  });

  /**
   * POST /api/ewity/reconcile
   * Triggers immediate reconciliation
   */
  app.post('/api/ewity/reconcile', async (_req, res) => {
    const result = await reconciler.reconcile();
    res.json(result);
  });

  /**
   * POST /api/ewity/tests/run
   * Runs the complete 9-part mock API test suite
   */
  app.post('/api/ewity/tests/run', async (_req, res) => {
    const results = await runEwityMockTestSuite();
    res.json({
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
    });
  });

  /**
   * GET /api/ewity/logs
   * Returns structured request logs (without secrets)
   */
  app.get('/api/ewity/logs', (_req, res) => {
    res.json({ logs: ewityClient.getLogs() });
  });

  // ---------------------------------------------------------
  // VITE DEV SERVER INTEGRATION
  // ---------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EWITY-WATCHDOG] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[EWITY-WATCHDOG] Server failed to start:', err);
  process.exit(1);
});

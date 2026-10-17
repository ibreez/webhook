# PHASE 1: Build the Ewity Kitchen Watchdog UI Prototype

Act as a senior full-stack engineer and UI/UX designer.

Build a professional restaurant POS monitoring dashboard named **Ewity Kitchen Watchdog**.

This is Phase 1 of a larger application that will eventually integrate with the Ewity POS API and run as a Windows desktop application.

## 1. Objective

Create a working, interactive prototype that monitors simulated restaurant orders and displays reminders when orders appear incomplete or their KOT printing has not been confirmed.

For this phase, use mock data only. Do not invent API responses or pretend to be connected to a live Ewity POS.

## 2. Technology

Use React, TypeScript and a clean component-based architecture.

Use a professional dashboard layout suitable for a restaurant manager or cashier.

Keep the application architecture ready for future integration with:
- Ewity Apps API
- Ewity webhooks
- A Node.js backend
- A Windows Electron desktop application
- Native Windows notifications

Do not place API keys, credentials or secrets in frontend code.

## 3. Dashboard layout

Create the following sections:

### Header
- Application name: Ewity Kitchen Watchdog
- Connection indicator: Demo Mode
- Restaurant/location selector using mock locations
- Monitoring status indicator
- Settings button

### Summary cards
- Active orders
- Orders requiring attention
- KOTs awaiting confirmation
- Overdue orders
- Resolved alerts

### Active orders table

Include these columns:
- Order number
- Order source: POS or Online
- Order type: Dine-in, Takeaway or Delivery
- Table number, when applicable
- Order creation time
- Elapsed time
- KOT number
- KOT status
- Order status
- Alert severity
- Available actions

Use realistic fictional sample data.

### Alert panel

Display alerts for:
- KOT confirmation timeout
- Order taking longer than expected
- Order status not updating
- Connection interruption

Distinguish clearly between confirmed failures and unconfirmed conditions.

Do not label a KOT as "not printed" unless actual print-failure evidence exists. For simulated or unavailable print evidence, use "KOT not confirmed".

### Alert actions

Each alert must support:
- Acknowledge
- Snooze
- Resolve
- View order details

Show who acknowledged or resolved an alert using a mock staff identity.

### Order details

Clicking an order opens a detail panel containing:
- Order ID
- Order source
- Order creation time
- Current mock status
- KOT number
- KOT confirmation status
- Elapsed time
- Alert history

Do not expose sensitive customer information.

### Settings

Add configurable settings for:
- KOT confirmation timeout, default 60 seconds
- Order completion warning, default 10 minutes
- Alert repeat interval, default 2 minutes
- Sound enabled/disabled
- Desktop notifications enabled/disabled
- Monitoring enabled/disabled

Allow these settings to be changed interactively.

## 4. Demo behaviour

The prototype must be interactive, not a static screenshot.

Implement:
- Simulated incoming orders
- A running elapsed-time display
- Automatic mock alerts when thresholds are crossed
- Alert acknowledgement
- Snooze and resolution
- Filtering by source, status and severity
- Search by order number
- Settings persistence for the prototype
- A reset-demo-data action

Use a clearly labeled simulated-data mode. Never suggest that mock print confirmation is a real printer event.

## 5. Visual design

Use a modern, polished restaurant operations dashboard.

Design characteristics:
- Clean and compact layout
- Dark charcoal sidebar
- Light neutral main workspace
- Clear typography
- Green for healthy states
- Amber for warnings
- Red for urgent alerts
- High-contrast alert labels
- Large, readable order numbers
- Responsive layout
- Suitable for a 1366 × 768 desktop screen

Avoid excessive animations and unnecessary decorative elements.

## 6. Architecture

Separate the code into components and services, including:
- Dashboard
- OrderTable
- AlertList
- AlertToast
- OrderDetails
- SettingsPanel
- MockOrderService
- MonitoringRules
- AlertManager

Use TypeScript interfaces for Order, KOTStatus, Alert, MonitoringSettings and ConnectionStatus.

Keep mock data isolated so it can later be replaced by an actual Ewity API adapter.

## 7. Acceptance criteria

The phase is complete only when:
1. The application runs without compilation errors.
2. The dashboard renders successfully.
3. Search and filters work.
4. Simulated orders can be added.
5. Timers update correctly.
6. Crossing a configured threshold creates the appropriate alert.
7. Acknowledging, snoozing and resolving alerts work.
8. Settings update the monitoring behaviour.
9. No real API credentials are required.
10. The interface clearly indicates that it is in Demo Mode.

Build the application now. Do not just describe how it should be built.

After implementation, report which features work, any remaining limitations, and how to run the prototype.








# PHASE 2: Integrate Ewity POS Apps API

Extend the existing Ewity Kitchen Watchdog project. Preserve the current UI and working functionality.

Before writing integration code, inspect the official documentation:

https://ewity-api.readme.io/docs/getting-started

Also inspect the official Apps API, authentication, bill listing, bill detail and webhook documentation.

## Objectives

1. Authenticate with the officially supported Ewity Apps API.
2. Allow authorized merchant installation and location selection.
3. Retrieve real bill/order records available to the installed app.
4. Map real API data into the existing Order interface.
5. Receive supported webhook events through a secure backend.
6. Reconcile recent records periodically to recover missed events.

## Implementation requirements

Create a backend API adapter rather than calling privileged Ewity endpoints directly from the browser.

Implement:
- Configuration through environment variables
- Secure credential storage
- Request authentication according to the official documentation
- Permission checks and useful error messages
- Pagination
- Rate-limit handling
- Request timeouts
- Retry with backoff for transient failures
- Structured logs without secrets
- Webhook signature verification
- Idempotent event processing
- Duplicate-event handling
- Periodic reconciliation

Use only endpoints, permissions, event names and payload fields verified in the official documentation.

Do not guess endpoint paths, authentication headers or permission names.

Use the documented bill listing endpoint and investigate the supported KOT-number filter.

## Data handling

Create an explicit mapping layer between Ewity API responses and the internal Order model.

Distinguish:
- POS-originated records
- Online-order records
- Bill creation
- Payment status
- Order lifecycle status
- KOT number
- KOT print confirmation

Do not assume that bill creation means kitchen preparation has started, or that payment means the order is complete.

Do not assume that the existence of a KOT number proves that it printed successfully.

## Development and testing

Keep Demo Mode available.

Add a separate connection status indicator:
- Demo Mode
- Connecting
- Connected
- Connection Error

Never show Connected unless a real authenticated API request succeeds.

Create mocked API fixtures and tests for:
- Valid responses
- Empty bill lists
- Pagination
- Expired or invalid credentials
- Permission errors
- Rate limits
- Duplicate webhooks
- Out-of-order webhook delivery
- Temporary connection failures

If credentials or required API permissions are unavailable, build the adapter interface and mocked tests, clearly identify the missing configuration, and do not pretend that live integration works.

Inspect the documentation and existing project before making changes.






# PHASE 3: Implement Reliable Order and KOT Monitoring

Extend the existing Ewity Kitchen Watchdog codebase without breaking existing features.

Implement a reliable monitoring engine that consumes normalized Ewity records and events.

## Rule A: Uncompleted orders

Create configurable rules that:
- Track eligible orders using reliable creation timestamps
- Track the best available order lifecycle status
- Raise a warning when an order exceeds its configured threshold
- Stop or update alerts when the order is completed, cancelled or voided according to verified business rules
- Avoid treating payment completion as kitchen completion
- Allow different thresholds by order type or kitchen station when supported

## Rule B: KOT confirmation

Create a separate KOT monitoring interface.

Support these states:
- Unknown
- Pending confirmation
- Confirmed printed
- Confirmed print failure
- Manually resolved

Only set Confirmed printed when supported evidence exists.

Only set Confirmed print failure when an actual failure signal is available.

If no verified print-status integration exists, raise "KOT not confirmed" after the configured timeout. Explain that staff should check the ticket and printer.

Do not infer successful printing from a KOT number or bill creation event.

## Alert lifecycle

Implement:
- New
- Acknowledged
- Snoozed
- Resolved

Each alert must include a stable ID, order ID, alert type, creation time, severity, acknowledgement time and resolution details where applicable.

Deduplicate alerts using stable business identifiers and rule IDs.

Ensure that replayed or delayed webhook events do not create repeated notifications.

Reconcile against current API state so resolved orders do not remain overdue indefinitely.

## Reliability

Add unit and integration tests for:
- Threshold crossings
- Boundary conditions
- Duplicate events
- Delayed events
- Cancelled orders
- Completed orders
- Unknown print status
- Confirmed print failure
- Snoozed and acknowledged alerts
- Recovery after application restart

Use the existing configured thresholds.

Do not fabricate any API fields or printer events.

Run tests and report any remaining limitations.






# PHASE 4: Package Ewity Kitchen Watchdog for Windows

Extend the existing project to run as a Windows desktop application using Electron and TypeScript.

Preserve the existing React dashboard and monitoring engine.

## Desktop requirements

Implement:
- Windows system-tray icon
- Start minimized option
- Minimize to tray
- Persistent monitoring while the desktop application is running
- Native Windows toast notifications
- A prominent alert window for urgent alerts
- Configurable alert sound
- Acknowledge button
- Snooze button
- Open order details action
- Reopen dashboard from the tray
- Graceful handling of application shutdown and restart

Urgent alerts should remain visible until acknowledged or resolved, subject to configurable behaviour.

Do not repeatedly show identical popups for the same alert.

## Security

- Keep Ewity API secrets on the backend.
- Enable Electron context isolation.
- Disable Node.js integration in the renderer.
- Validate IPC messages.
- Do not expose privileged APIs to the React renderer.
- Secure all communication with the backend.

## Offline behaviour

When the internet connection is interrupted:
- Display a connection warning.
- Preserve existing alerts locally.
- Avoid pretending that current Ewity order data is up to date.
- Resume synchronization when the connection returns.

Do not assume the app can discover new remote orders while offline.

## Packaging

Provide:
- Windows development instructions
- A production build command
- A Windows installer configuration
- An application icon placeholder
- Environment configuration instructions
- A troubleshooting guide

Test the packaged application, not just the browser preview.

Report any Windows features that cannot be validated in the current environment.




# PHASE 5: Implement Verified KOT Printer Monitoring

Investigate and implement the best supported mechanism to determine whether kitchen order tickets have actually printed.

First, inspect the Ewity API documentation and any official clarification supplied by Ewity.

Investigate:
1. Ewity print-status endpoints or webhooks.
2. Official local POS integration capabilities.
3. Printer status and job monitoring for supported Windows-connected printers.
4. Whether print events can be correlated reliably with Ewity bill IDs, order IDs and KOT numbers.
5. Whether multiple kitchen stations and printers are supported.

Do not assume that generic Windows printer queue information proves a ticket was physically printed.

If implementing local printer monitoring, isolate it behind a KOTPrinterAdapter interface.

The adapter should return:
- Available or unavailable
- Printer identifier
- Print job identifier, if available
- Correlated order/KOT identifier, if available
- Print submission timestamp
- Success, failure or unknown status
- Evidence source

Distinguish between:
- Ticket generated
- Job submitted to printer
- Printer accepted the job
- Job reported complete
- Physical output independently confirmed, if possible

Do not treat these states as equivalent.

Support duplicate tickets, reprints, printer disconnection, paper-out conditions where detectable, and multiple printers.

If no reliable print-confirmation mechanism is available, keep the warning as "KOT not confirmed" and provide a manual staff confirmation action.

Do not claim this phase is complete until the integration is tested against actual supported hardware and real Ewity orders.

Provide a test report describing exactly what the available printer signals prove and what they cannot prove.




# PHASE 6: Production Readiness and Deployment

Prepare Ewity Kitchen Watchdog for real restaurant use.

Audit the complete application for correctness, reliability, security and operational usability.

## Required checks

- Validate the Ewity API authentication flow.
- Confirm only approved permissions are requested.
- Verify webhook signatures and duplicate-event handling.
- Check all order and bill status mappings.
- Confirm alert deduplication.
- Test timeouts and recovery from delayed events.
- Test Windows notifications and sound.
- Test application restart and local alert recovery.
- Test backend and database recovery.
- Test internet and API outages.
- Test multiple restaurant locations if authorized.
- Ensure secrets are never logged or embedded in the desktop client.
- Ensure customer information is minimized.
- Document how to rotate credentials and revoke an installation.

## Pilot testing

Run in a non-intrusive monitoring mode first.

Compare:
- Orders created in Ewity
- Bills and available lifecycle states
- KOTs actually generated
- KOTs printed or failed, where verified
- Alerts generated
- False positive and missed-alert rates

Have restaurant staff validate the results before enabling urgent notifications.

## Deliverables

Produce:
1. Tested application source code.
2. Backend deployment instructions.
3. Database schema and migrations.
4. Windows installer build instructions.
5. Environment variable example without real secrets.
6. Ewity app installation and authorization guide.
7. Monitoring configuration guide.
8. Troubleshooting documentation.
9. Test results and known limitations.
10. A rollback and recovery plan.

Do not claim production readiness if live API access, webhook verification, Windows packaging or printer monitoring remains untested.

Implement the remaining work, run the available tests and report honestly what is complete.



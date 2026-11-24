# Cloud Multi-Site Upgrade Plan

## Working branch
`cloud-multisite-v2` is based on the current `main` branch. The production/default branch is not modified.

## Current implementation findings
- The application currently keeps its working datasets in browser `localStorage`.
- `firebase-sync.js` can initialize Firestore from a config stored separately in each browser and can write/read documents.
- The current real-time listeners subscribe to whole `attendance`, `pendingApprovals`, and `employees` collections. This is not a safe multi-branch access model.
- The current login checks role passwords in client-side JavaScript/localStorage. It includes a hard-coded shared bypass. Client-side role checks are not a security boundary.
- The employee portal reads employee records from Firestore/client storage and verifies the last four digits in the browser. That must be replaced before exposing the portal to the internet.
- Several datasets (including leave ledger, rosters, special attendance and departments) are not consistently synchronized by the current listener/write layer.
- Suez/Alexandria attendance edits can currently be routed to manager approval. The agreed target is independent branch editing; the manager retains cross-branch oversight. Overtime must be separately constrained.

## Target architecture

### Authentication and authorization
- Firebase Authentication for the four staff accounts.
- Server-controlled custom claims: `role` and `branch`.
- `admin` can access all branches; branch users can read/write only their own branch.
- Firestore Security Rules enforce permissions. Hiding UI controls is never treated as security.
- Remove hard-coded passwords and shared bypass credentials.
- Employee self-service must use a server-side verification endpoint with throttling/App Check. The browser must never download full national IDs or verify them locally. The endpoint returns only the employee's approved profile fields and current leave balance.

### Data model
Use branch-scoped paths so a branch account cannot query another branch's data:
- `branches/{branchId}/employees/{employeeCode}`
- `branches/{branchId}/attendance/{date_employeeCode}`
- `branches/{branchId}/leaveLedger/{entryId}`
- `branches/{branchId}/departments/{departmentId}`
- `branches/{branchId}/variableShifts/{shiftId}`
- `branches/{branchId}/weeklyRosters/{rosterId}`
- `branches/{branchId}/specialAttendance/{date_employeeCode}`
- `branches/{branchId}/auditLogs/{logId}`

Manager access is granted by authenticated admin claims and rules, not by downloading all data into a branch user's browser.

### Concurrent editing and durability
- Real-time listeners subscribe only to the signed-in user's branch; admin subscribes to selected branches.
- Every write is awaited and reports success/failure. Do not show “saved” before Firestore confirms the write.
- Use document version/update timestamps and conflict detection for simultaneous edits to the same record.
- Keep local cache as a convenience only; Firestore is the source of truth.
- Add scheduled/exportable backups and a tested restore procedure before migration.

### Attendance and overtime
- Branch users can edit their own branch without manager approval for ordinary attendance changes.
- Overtime is derived from actual check-in/check-out and the employee's assigned shift; the UI cannot increase it beyond the computed entitlement.
- An overtime reduction by a branch user is allowed; manager can review/adjust.
- Overnight shift 23:00–07:00 is one shift spanning two calendar dates. Pairing and duration calculations must use shift boundaries, not midnight as a reset.
- Preserve the existing special-shift and Friday rules; verify each rule against test cases before changing calculation code.

### Excel import
- Read workbook headers and sample values, normalize Arabic/English header variants, and suggest field mappings.
- Show a preview with matched, ambiguous, missing, and extra columns.
- Require user confirmation for ambiguous mappings.
- Validate required fields and employee-code duplicates before writing.
- Save approved mapping templates per branch/source format for repeat imports.

## Safe implementation sequence
1. Build and test the branch-scoped data/auth foundation and rules.
2. Add branch-aware read/write adapters while preserving the existing UI and local backup.
3. Add a one-time, dry-run migration with counts and duplicate/conflict report. No automatic overwrite.
4. Replace staff login with Firebase Authentication and enforce claims/rules.
5. Replace employee portal verification with a server-side endpoint; do not expose national IDs to the browser.
6. Add overnight attendance/overtime validation and branch-only editing.
7. Add Excel smart mapping preview and import.
8. Test four simultaneous staff sessions, branch isolation, failed/offline writes, and restore before publishing.

## Migration safety
- Never migrate from a browser's localStorage automatically.
- First export a JSON backup from the authoritative device, inspect counts, and run a dry-run.
- Preserve the current `main` branch and its data format until the new version passes acceptance tests.
- No live national IDs, passwords, Firebase secrets, or employee records belong in this repository.

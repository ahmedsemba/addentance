# Firebase rollout notes — elbarwy-hr

Target project: `elbarwy-hr`
Firestore database: `(default)`
Region selected in Firebase Console: `me-west1`
Working branch: `cloud-multisite-v2`

## Important: not deployed
The rules in `firestore.rules` are a proposed secure policy. They have NOT been deployed to Firebase. The live database currently remains in production mode with deny-all rules.

Do not replace the live rules until Firebase Authentication is enabled, the four staff accounts exist, and trusted server-side custom claims have been assigned and tested.

## Required identity claims
Custom claims must be assigned only by a trusted Admin SDK environment (never by browser JavaScript):

- Manager: `{ role: "admin" }`
- Obour operator: `{ role: "branch", branch: "obour" }`
- Suez operator: `{ role: "branch", branch: "suez" }`
- Alexandria operator: `{ role: "branch", branch: "alex" }`

The rules intentionally deny access to users without these claims.

## Firestore paths
All operational data must be migrated to branch-scoped paths:
- `branches/{branchId}/employees/{employeeCode}`
- `branches/{branchId}/attendance/{attendanceId}`
- `branches/{branchId}/leaveLedger/{entryId}`
- `branches/{branchId}/departments/{departmentId}`
- `branches/{branchId}/variableShifts/{shiftId}`
- `branches/{branchId}/weeklyRosters/{rosterId}`
- `branches/{branchId}/specialAttendance/{attendanceId}`
- `branches/{branchId}/auditLogs/{logId}`

Legacy root collections are deliberately denied by the proposed rules.

## Before deployment checklist
1. Enable Firebase Authentication (Email/Password or another selected provider).
2. Provision the four staff accounts through a trusted Admin SDK process.
3. Assign and verify the custom claims above.
4. Add a server-side employee self-service verification endpoint. Never download the employee collection or national-ID values into a public browser.
5. Update the app's data adapter to use only branch-scoped paths and authenticated sessions.
6. Run branch-isolation tests with four separate test accounts.
7. Back up/export current data and perform a dry-run migration with duplicate/conflict reporting.
8. Only then deploy these rules and migrate test data. Do not migrate live employee records until acceptance tests pass.

## Security note
The employee portal's employee-code + last-four-national-ID check is not safe to perform in client-side JavaScript. The verification must happen server-side with rate limiting/App Check, and the endpoint must return only the permitted employee profile and leave balance.

/**
 * Firebase Real-Time Synchronization Module for HR Attendance & Leave System
 * Multi-Branch Cloud Sync (Manager, Obour, Suez, Alexandria, Employee Portal)
 */
(function(window) {
  'use strict';

  const STORAGE_KEY_CONFIG = 'hr_firebase_config';
  const STORAGE_KEY_SYNC_ENABLED = 'hr_firebase_sync_enabled';

  const FirebaseSync = {
    app: null,
    db: null,
    auth: null,
    isInitialized: false,
    isConnected: false,
    listeners: {},
    syncStatusCallback: null,

    // Default or user-provided config
    getConfig: function() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn('Error reading stored Firebase config', e);
      }
      return null;
    },

    saveConfig: function(config) {
      if (!config) {
        localStorage.removeItem(STORAGE_KEY_CONFIG);
        this.isInitialized = false;
        this.isConnected = false;
        return;
      }
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    },

    init: async function() {
      const config = this.getConfig();
      if (!config || !config.apiKey || !config.projectId) {
        this.updateStatus(false, 'العمل في الوضع المحلي (أوفلاين) - لم يتم ضبط إعدادات Firebase بعد');
        return false;
      }

      try {
        // Check if firebase is loaded from CDN
        if (typeof firebase === 'undefined') {
          console.warn('Firebase SDK not loaded yet.');
          this.updateStatus(false, 'مكتبة Firebase لم تُحمّل بعد');
          return false;
        }

        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(config);
        } else {
          this.app = firebase.app();
        }

        this.db = firebase.firestore();
        // Enable offline persistence if possible
        try {
          await this.db.enablePersistence({ synchronizeTabs: true });
        } catch (persErr) {
          // Persistence might already be enabled or not supported in this tab/mode
          console.log('Persistence note:', persErr.code);
        }

        this.isInitialized = true;
        this.isConnected = true;
        this.updateStatus(true, 'متصل سحابياً (Firebase Realtime) - مزامنة حية');
        return true;
      } catch (err) {
        console.error('Firebase init error:', err);
        this.isInitialized = false;
        this.isConnected = false;
        this.updateStatus(false, 'خطأ في الاتصال بـ Firebase: ' + (err.message || err));
        return false;
      }
    },

    onStatusChange: function(cb) {
      this.syncStatusCallback = cb;
    },

    updateStatus: function(connected, message) {
      this.isConnected = connected;
      if (typeof this.syncStatusCallback === 'function') {
        this.syncStatusCallback(connected, message);
      }
    },

    // Save a single document to a collection
    setDoc: async function(collectionName, docId, data) {
      if (!this.isInitialized || !this.db) {
        return false;
      }
      try {
        const cleanDocId = String(docId).replace(/[\/\\]/g, '_');
        await this.db.collection(collectionName).doc(cleanDocId).set(data, { merge: true });
        return true;
      } catch (err) {
        console.error(`Error saving to ${collectionName}/${docId}:`, err);
        return false;
      }
    },

    // Get a document
    getDoc: async function(collectionName, docId) {
      if (!this.isInitialized || !this.db) return null;
      try {
        const cleanDocId = String(docId).replace(/[\/\\]/g, '_');
        const snap = await this.db.collection(collectionName).doc(cleanDocId).get();
        if (snap.exists) {
          return snap.data();
        }
        return null;
      } catch (err) {
        console.error(`Error getting doc from ${collectionName}/${docId}:`, err);
        return null;
      }
    },

    // Real-time listener for a collection
    listenCollection: function(collectionName, onDataReceived) {
      if (!this.isInitialized || !this.db) return null;
      try {
        // Unsubscribe existing listener if any
        if (this.listeners[collectionName]) {
          this.listeners[collectionName]();
        }

        const unsubscribe = this.db.collection(collectionName).onSnapshot((snapshot) => {
          const items = [];
          snapshot.forEach(doc => {
            items.push({ _id: doc.id, ...doc.data() });
          });
          if (typeof onDataReceived === 'function') {
            onDataReceived(items);
          }
        }, (err) => {
          console.error(`Error listening to ${collectionName}:`, err);
        });

        this.listeners[collectionName] = unsubscribe;
        return unsubscribe;
      } catch (err) {
        console.error(`Failed to setup listener for ${collectionName}:`, err);
        return null;
      }
    },

    // Batch upload / sync all data (for initial migration or backup upload)
    uploadFullData: async function(data, onProgress) {
      if (!this.isInitialized || !this.db) {
        throw new Error('Firebase غير متصل');
      }

      const db = this.db;
      let totalOps = 0;
      let completedOps = 0;

      // Calculate total operations
      if (Array.isArray(data.emps)) totalOps += data.emps.length;
      if (Array.isArray(data.depts)) totalOps += data.depts.length;
      if (data.attendance && typeof data.attendance === 'object') totalOps += Object.keys(data.attendance).length;
      if (Array.isArray(data.leaveLedger)) totalOps += data.leaveLedger.length;
      if (Array.isArray(data.variableShifts)) totalOps += data.variableShifts.length;
      if (Array.isArray(data.weeklyRosters)) totalOps += data.weeklyRosters.length;
      if (data.employeeMaster) {
        totalOps += (data.employeeMaster.active || []).length;
        totalOps += (data.employeeMaster.former || []).length;
      }

      const updateProgress = () => {
        completedOps++;
        if (typeof onProgress === 'function') {
          onProgress(completedOps, totalOps);
        }
      };

      // Helper for batched writes (up to 400 operations per batch)
      const commitBatches = async (items, collectionName, idKey) => {
        const chunkSize = 400;
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          const batch = db.batch();
          chunk.forEach(item => {
            const id = String(item[idKey] || item.id || item.code || Math.random().toString(36).slice(2)).replace(/[\/\\]/g, '_');
            const ref = db.collection(collectionName).doc(id);
            batch.set(ref, item, { merge: true });
          });
          await batch.commit();
          chunk.forEach(() => updateProgress());
        }
      };

      // 1. Employees
      if (Array.isArray(data.emps) && data.emps.length) {
        await commitBatches(data.emps, 'employees', 'code');
      }

      // 2. Departments
      if (Array.isArray(data.depts) && data.depts.length) {
        await commitBatches(data.depts, 'departments', 'id');
      }

      // 3. Attendance
      if (data.attendance && typeof data.attendance === 'object') {
        const attList = Object.keys(data.attendance).map(k => ({ id: k, ...data.attendance[k] }));
        await commitBatches(attList, 'attendance', 'id');
      }

      // 4. Leave Ledger
      if (Array.isArray(data.leaveLedger) && data.leaveLedger.length) {
        await commitBatches(data.leaveLedger, 'leaveLedger', 'id');
      }

      // 5. Variable Shifts
      if (Array.isArray(data.variableShifts) && data.variableShifts.length) {
        await commitBatches(data.variableShifts, 'variableShifts', 'id');
      }

      // 6. Weekly Rosters
      if (Array.isArray(data.weeklyRosters) && data.weeklyRosters.length) {
        await commitBatches(data.weeklyRosters, 'weeklyRosters', 'id');
      }

      // 7. Employee Master
      if (data.employeeMaster) {
        const masterList = [
          ...(data.employeeMaster.active || []).map(x => ({ ...x, masterGroup: 'active' })),
          ...(data.employeeMaster.former || []).map(x => ({ ...x, masterGroup: 'former' }))
        ];
        if (masterList.length) {
          await commitBatches(masterList, 'employeeMaster', 'code');
        }
      }

      return true;
    }
  };

  window.FirebaseSync = FirebaseSync;
})(window);

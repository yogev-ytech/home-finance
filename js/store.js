// Cloud store: Google sign-in (Firebase Auth) + household data in Cloud Firestore.
// Every family member reads and writes the same household: households/home.
// Access is enforced by firestore.rules (allow-list of e-mail addresses), not by this code.
import { initializeApp } from '../vendor/firebase/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from '../vendor/firebase/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch } from '../vendor/firebase/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const HOUSEHOLD = 'home';
const COLLECTIONS = ['tx', 'statements', 'imports'];
const BATCH_LIMIT = 400;

export function createStore({ onAuth, onData, onError }) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  auth.languageCode = 'he';
  let db;
  try {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  const base = doc(db, 'households', HOUSEHOLD);
  const settingsRef = doc(base, 'meta', 'settings');
  let unsubs = [];
  let data = null;

  function stop() { unsubs.forEach(u => u()); unsubs = []; data = null; }

  function start() {
    stop();
    data = { tx: [], statements: [], imports: [], rules: {}, links: {} };
    const ready = new Set();
    const emit = () => { if (ready.size === COLLECTIONS.length + 1) onData({ ...data }); };
    const fail = err => {
      stop();
      onError(err && err.code === 'permission-denied' ? { code: 'denied' } : { code: 'error', message: err && err.message });
    };
    for (const name of COLLECTIONS) {
      unsubs.push(onSnapshot(collection(base, name), snap => {
        data[name] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        ready.add(name); emit();
      }, fail));
    }
    unsubs.push(onSnapshot(settingsRef, snap => {
      const s = snap.exists() ? snap.data() : {};
      data.rules = Object.fromEntries((s.rules || []).map(r => [r.k, r.cat]));
      data.links = Object.fromEntries((s.links || []).map(l => [l.s, l.b]));
      ready.add('settings'); emit();
    }, fail));
  }

  onAuthStateChanged(auth, user => {
    if (user) { onAuth({ signedIn: true, email: user.email, name: user.displayName }); start(); }
    else { stop(); onAuth({ signedIn: false }); }
  });

  // ops: [{ op: 'set' | 'delete', col: 'tx' | 'statements' | 'imports', id, data }]
  //      [{ op: 'settings', rules: {k: cat}, links: {s: b} }]
  async function apply(ops) {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const o of ops.slice(i, i + BATCH_LIMIT)) {
        if (o.op === 'settings') {
          batch.set(settingsRef, {
            rules: Object.entries(o.rules || {}).map(([k, cat]) => ({ k, cat })),
            links: Object.entries(o.links || {}).map(([s, b]) => ({ s, b }))
          });
        } else {
          const ref = doc(base, o.col, o.id);
          if (o.op === 'delete') batch.delete(ref);
          else { const { id, ...rest } = o.data; batch.set(ref, rest); }
        }
      }
      await batch.commit();
    }
  }

  async function signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }

  return { signIn, signOut: () => fbSignOut(auth), apply };
}

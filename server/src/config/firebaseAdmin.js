import admin from 'firebase-admin';

let initialized = false;

function getServiceAccountFromEnv() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (sa) {
    try {
      return JSON.parse(sa);
    } catch {}
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey && privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
  }
  return null;
}

export function initFirebaseAdmin() {
  if (initialized) return admin;
  const sa = getServiceAccountFromEnv();
  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
    });
  } else {
    // fallback to application default credentials if available
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } catch {}
  }
  initialized = true;
  return admin;
}

export function getAuthAdmin() {
  initFirebaseAdmin();
  return admin.auth();
}

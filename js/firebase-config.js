// PANEL POP — Firebase config for online features (leaderboards + versus).
//
// This is a CLIENT config: it is safe to be public (security is enforced by
// the Realtime Database rules, not by hiding these values). Until it's filled
// in, all online features stay disabled and the game falls back to local —
// nothing breaks.
//
// To enable online play, create a free Firebase project (see README /
// the setup steps), then replace null with the config object Firebase gives
// you, e.g.:
//   window.FIREBASE_CONFIG = {
//     apiKey: "…", authDomain: "…", databaseURL: "https://….firebaseio.com",
//     projectId: "…", appId: "…"
//   };
window.FIREBASE_CONFIG = null;

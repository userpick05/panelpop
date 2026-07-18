// PANEL POP — Firebase config for online features (leaderboards + versus).
//
// This is a CLIENT config: it is safe to be public (security is enforced by
// the Realtime Database rules in database.rules.json, not by hiding these).
//
// NOTE: databaseURL is required for the Realtime Database. It only appears in
// the console's config snippet AFTER you create the database
// (Build -> Realtime Database -> Create Database). It looks like one of:
//   https://panel-pop-online-default-rtdb.firebaseio.com                (US)
//   https://panel-pop-online-default-rtdb.<region>.firebasedatabase.app (other)
// Replace the databaseURL below with the exact URL shown at the top of your
// Realtime Database page. Until it's correct, online stays disabled (the game
// runs normally, offline).
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCx455swsmt7B2iQS9YDjMo2lvd_4WMO2M',
  authDomain: 'panel-pop-online.firebaseapp.com',
  databaseURL: 'https://panel-pop-online-default-rtdb.firebaseio.com',
  projectId: 'panel-pop-online',
  storageBucket: 'panel-pop-online.firebasestorage.app',
  messagingSenderId: '683499402085',
  appId: '1:683499402085:web:17289ce5debc8d30eaa78c'
};

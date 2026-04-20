import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyALoZ9yZW0N6DVC57Z4otZWON34llS5uc4",
  authDomain: "rbacfyp.firebaseapp.com",
  projectId: "rbacfyp",
  storageBucket: "rbacfyp.appspot.com",
  messagingSenderId: "979367048735",
  appId: "1:979367048735:web:da03c3b87595fdb0dc472a",
  measurementId: "G-N6LRPKV320"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const db = getFirestore(app);

export default app;
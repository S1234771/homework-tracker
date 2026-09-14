import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Вставьте сюда объект firebaseConfig из консоли Firebase:
// Project settings → General → "Your apps" → веб-приложение → SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyApdTz7AJEPH6UmooUOCUfFoy5HTY1rmw4",
  authDomain: "homework-traker-7ac6b.firebaseapp.com",
  projectId: "homework-traker-7ac6b",
  storageBucket: "homework-traker-7ac6b.firebasestorage.app",
  messagingSenderId: "1090898216482",
  appId: "1:1090898216482:web:e2d7f6bb313e0008d36c7b",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

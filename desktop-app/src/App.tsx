import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Billing from "./pages/Billing";
import Reports from "./pages/Reports";
import Customers from "./pages/Customers";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { startSync, stopSync } from "./lib/sync";
import { ToastProvider } from "./components/ui/toast";

// We use HashRouter because BrowserRouter can cause issues with file:// protocol in Tauri
export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    // Initialize the local SQLite DB on app start
    invoke("init_db")
      .then(() => {
        setDbReady(true);
        // Start background sync once DB is available
        startSync();
      })
      .catch((err) => {
        console.error("Failed to init DB:", err);
        setDbError(err as string);
      });

    return () => { stopSync(); };
  }, []);

  if (dbError) {
    return (
      <div className="flex h-screen items-center justify-center bg-destructive/10 p-4 text-destructive text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Database Error</h1>
          <p>{dbError}</p>
        </div>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-primary">
        <p className="animate-pulse font-medium text-lg">Starting local database...</p>
      </div>
    );
  }

  return (
    <ToastProvider>
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Simple auth guard: if no JWT, go to login */}
        <Route 
          path="/" 
          element={
            localStorage.getItem("jwt") ? <Billing /> : <Navigate to="/login" />
          } 
        />
        <Route path="/reports" element={localStorage.getItem("jwt") ? <Reports /> : <Navigate to="/login" />} />
        <Route path="/customers" element={localStorage.getItem("jwt") ? <Customers /> : <Navigate to="/login" />} />
      </Routes>
    </HashRouter>
    </ToastProvider>
  );
}

import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import Search from "./components/Search";
import { Login, Register } from "./components/Auth";

function Header({ isAuthed, user, onLogout }) {
  return (
    <header className="bg-white shadow">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link to="/" className="font-bold">PDF Search</Link>
        <nav className="space-x-4 flex items-center">
          <Link to="/" className="text-blue-600">Recherche</Link>
          {!isAuthed ? (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          ) : (
            <>
              <span className="text-gray-700 mr-2">Bonjour, {user?.name || user?.email || 'Utilisateur'}</span>
              <button onClick={onLogout} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">Déconnexion</button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function AppInner() {
  const [isAuthed, setIsAuthed] = useState(!!localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  const navigate = useNavigate();

  // Keep isAuthed and user in sync:
  // - if other tabs change localStorage (storage event)
  // - if this tab changes auth (custom 'auth-changed' event)
  useEffect(() => {
    const syncFromStorage = () => {
      setIsAuthed(!!localStorage.getItem("token"));
      try {
        setUser(JSON.parse(localStorage.getItem("user") || "null"));
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("auth-changed", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("auth-changed", syncFromStorage);
    };
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    try {
      if (token) {
        await axios.post("http://localhost:3000/api/auth/logout", {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (e) {
      // ignore server errors for logout; still clear client token
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // notify same-tab listeners
      window.dispatchEvent(new Event("auth-changed"));
      setUser(null);
      setIsAuthed(false);
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header isAuthed={isAuthed} user={user} onLogout={handleLogout} />
      <main className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

export default App;

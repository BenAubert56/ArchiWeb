import { useState } from "react";
import axios from "axios";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:3000/api/auth/login", { email, password });
      const { token } = res.data;
      if (token) localStorage.setItem("token", token);
      alert("Connecté");
    } catch (err) {
      setError(err.response?.data?.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Connexion</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="border p-2 rounded w-full" type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <input className="border p-2 rounded w-full" type="password" placeholder="Mot de passe" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded w-full">{loading?"Connexion...":"Se connecter"}</button>
      </form>
    </div>
  );
}

export function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Le nom est requis");
      return;
    }
    setLoading(true);
    try {
      await axios.post("http://localhost:3000/api/auth/register", { name, email, password });
      alert("Compte créé. Vous pouvez vous connecter.");
    } catch (err) {
      setError(err.response?.data?.message || "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Inscription</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="border p-2 rounded w-full" type="text" placeholder="Nom" value={name} onChange={(e)=>setName(e.target.value)} required />
        <input className="border p-2 rounded w-full" type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <input className="border p-2 rounded w-full" type="password" placeholder="Mot de passe" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded w-full">{loading?"Création...":"Créer le compte"}</button>
      </form>
    </div>
  );
}

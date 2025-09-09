import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Search from "./components/Search";
import { Login, Register } from "./components/Auth";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <div className="container mx-auto px-4 py-3 flex justify-between items-center">
            <Link to="/" className="font-bold">PDF Search</Link>
            <nav className="space-x-4">
              <Link to="/" className="text-blue-600">Recherche</Link>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </nav>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

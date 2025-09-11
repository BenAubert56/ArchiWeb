import { useEffect, useState, useRef } from "react";
import axios from "axios";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const searchRef = useRef();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [duration, setDuration] = useState(0);

  // Fermer suggestions si clic en dehors
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Récupère les suggestions à chaque frappe
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      if (ignoreNextSuggestions.current) {
        ignoreNextSuggestions.current = false; // reset
        return;
      }
      try {
        const token = localStorage.getItem("token"); // ou autre méthode pour récupérer le token
        const res = await axios.get(
          `http://localhost:3000/api/pdfs/suggestions?q=${encodeURIComponent(query)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSuggestions(res.data);
      } catch {
        setSuggestions([]);
      }
    };
    fetchSuggestions();
  }, [query]);

  const fetchSearch = async (pageToLoad = 1, searchQuery) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;
    // Reset previous results so a new search replaces instead of appearing appended
    setResults([]);
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const url = `http://localhost:3000/api/pdfs/search?q=${encodeURIComponent(q)}&page=${pageToLoad}`;
      const res = await axios.get(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      const data = res.data;
      if (Array.isArray(data)) {
        // Legacy shape: array of items only
        setResults(data);
        setTotal(data.length);
        setTotalPages(1);
        setDuration(0);
        setPage(pageToLoad);
      } else {
        const hits = Array.isArray(data?.hits) ? data.hits : [];
        setResults(hits);
        const respTotal = Number(data?.total ?? hits.length);
        const computedPages = respTotal > 0 ? Math.ceil(respTotal / 20) : 0;
        const serverPages = Number(data?.totalPages ?? 0);
        const respTotalPages = Math.max(serverPages, computedPages);
        setTotal(respTotal);
        setTotalPages(respTotalPages);
        setDuration(Number(data?.duration ?? 0));
        // prefer server-reported page if present
        setPage(Number(data?.page ?? pageToLoad));
      }
    } catch (e) {
      setError("Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    // New search resets to first page
    setResults([]);
    setPage(1);
    await fetchSearch(1);
  };

  useEffect(() => {
    if (!query) {
      setResults([]);
      setError("");
      setTotal(0);
      setTotalPages(0);
      setPage(1);
    }
  }, [query]);

  const onKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const canPrev = page > 1;
  const canNext = totalPages > 0 && page < totalPages;
  const ignoreNextSuggestions = useRef(false);

  // Quand on clique sur une suggestion
  const handleSuggestionClick = (s) => {
    // Empêche la récupération des suggestions lors de la recherche déclenchée par ce clic
    ignoreNextSuggestions.current = true;

    setQuery(s);
    setSuggestions([]);
    handleSearch(s);
  };

  return (
    <div className="p-6">
      <div ref={searchRef} className="mt-4 relative w-full max-w-xl mx-auto">
        <h1 className="text-xl font-bold">Recherche de documents</h1>
        <div className="flex gap-2 mt-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Rechercher des PDF..."
            className="border p-2 rounded w-full"
          />
          <button onClick={handleSearch} className="bg-blue-500 text-white px-4 py-2 rounded" disabled={loading}>
            {loading ? "Recherche..." : "Rechercher"}
          </button>
          {/* Suggestions */}
          {suggestions.length > 0 && (
            <ul className="absolute left-0 top-full w-full bg-white border rounded shadow z-10 mt-1">
              {suggestions.map((s, idx) => (
                <li
                  key={idx}
                  className="p-2 cursor-pointer hover:bg-blue-50"
                  onClick={() => handleSuggestionClick(s)}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {error && <div className="text-red-600 mt-3">{error}</div>}

      {(total > 0 || totalPages > 0) && (
        <div className="mt-4 text-sm text-gray-700">
          {total} résultat{total > 1 ? 's' : ''} — Page {page}{Number.isFinite(totalPages) && totalPages > 0 ? `/${totalPages}` : ''}
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {results.map((r, idx) => {
          const id = r.id || idx;
          const title = r.fileName || "(Sans nom)";
          const link = r.link || r.url || (r.filePath ? `/pdfs/${r.filePath}` : undefined);
          return (
            <li key={id} className="border rounded p-3 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold truncate max-w-[60ch]" title={title}>{title}</div>
                  <div className="text-xs text-gray-500">{r.uploadedAt ? new Date(r.uploadedAt).toLocaleString() : ''}</div>
                </div>
                {link && (
                  <a className="text-blue-600 underline" href={link} target="_blank" rel="noreferrer">
                    Ouvrir
                  </a>
                )}
              </div>
              {r.content && (
                <p
                  className="text-sm text-gray-700 mt-2"
                  dangerouslySetInnerHTML={{ __html: String(r.content) }}
                />
              )}
            </li>
          );
        })}
        {!loading && results.length === 0 && query && <div>Aucun résultat</div>}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-6">
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={!canPrev || loading}
            onClick={() => fetchSearch(page - 1)}
          >
            Précédent
          </button>
          <span className="text-sm">Page {page} / {totalPages}</span>
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={!canNext || loading}
            onClick={() => fetchSearch(page + 1)}
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

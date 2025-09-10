import { useEffect, useState } from "react";
import axios from "axios";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [duration, setDuration] = useState(0);

  const fetchSearch = async (pageToLoad = 1) => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const url = `http://localhost:3000/api/pdfs/search?q=${encodeURIComponent(query)}&page=${pageToLoad}`;
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

  return (
    <div className="p-6">
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

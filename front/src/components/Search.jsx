import { useEffect, useState } from "react";
import axios from "axios";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    // Reset previous results so a new search replaces instead of appearing appended
    setResults([]);
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`http://localhost:3000/api/pdfs/search?q=${encodeURIComponent(query)}`);
      // L'API renvoie un tableau à plat de snippets: [{ id, fileName, uploadedAt, content }]
      const data = Array.isArray(res.data) ? res.data : (res.data?.hits ?? []);
      setResults(data);
    } catch (e) {
      setError("Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!query) {
      setResults([]);
      setError("");
    }
  }, [query]);

  const onKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

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
      <ul className="mt-6 space-y-3">
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
    </div>
  );
}

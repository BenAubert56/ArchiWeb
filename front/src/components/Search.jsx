import { useState } from "react";
import axios from "axios";

export default function Search() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);

    const handleSearch = async () => {
        const res = await axios.get(`http://localhost:3000/search?q=${query}`);
        setResults(res.data.hits); // suppose que backend retourne { hits: [...] }
    };

    return (
        <div className="p-6">
            <h1 className="text-xl font-bold">Recherche de documents</h1>
            <div className="flex gap-2 mt-4">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Rechercher..."
                    className="border p-2 rounded w-full"
                />
                <button onClick={handleSearch} className="bg-blue-500 text-white px-4 py-2 rounded">
                    Rechercher
                </button>
            </div>
            <ul className="mt-6">
                {results.map(r => (
                    <li key={r.id} className="border-b py-2">
                        <strong>{r.id}</strong>
                        <p className="text-sm text-gray-600">{r.content.slice(0, 150)}...</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}

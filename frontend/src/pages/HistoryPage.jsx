import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import HistoryItem from "../components/HistoryItem";
import { fetchHistory } from "../services/supabase";

export default function HistoryPage({ session }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const data = await fetchHistory(session.user.id);
        setRecords(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [session]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">History</h1>
          <p className="text-gray-500 mt-1 text-sm">Your past transcriptions and summaries.</p>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <svg className="animate-spin w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="text-center py-20">
            <div className="flex justify-center mb-4">
              <div className="bg-gray-100 rounded-full p-5">
                <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-500 font-medium">No transcripts yet</p>
            <p className="text-gray-400 text-sm mt-1">Upload an audio file to get started.</p>
          </div>
        )}

        {!loading && records.length > 0 && (
          <div className="flex flex-col gap-4">
            {records.map((record) => (
              <HistoryItem key={record.id} record={record} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

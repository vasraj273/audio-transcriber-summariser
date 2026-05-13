import { useState, useRef } from "react";

export default function AudioUploader({ onSubmit, loading }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  function handleFile(selected) {
    if (!selected) return;
    const allowed = ["audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4", "audio/m4a"];
    if (!allowed.includes(selected.type) && !selected.name.match(/\.(mp3|wav|m4a)$/i)) {
      alert("Please upload an mp3, wav, or m4a file.");
      return;
    }
    setFile(selected);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  function handleSubmit() {
    if (file) onSubmit(file);
  }

  const fileSizeMB = file ? (file.size / (1024 * 1024)).toFixed(2) : null;

  return (
    <div className="w-full">
      <div
        onClick={() => !loading && inputRef.current.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"}
          ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,.m4a"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {file ? (
          <div>
            <div className="flex justify-center mb-3">
              <div className="bg-indigo-100 rounded-full p-3">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            </div>
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-400 mt-1">{fileSizeMB} MB</p>
            <p className="text-xs text-indigo-500 mt-2">Click to change file</p>
          </div>
        ) : (
          <div>
            <div className="flex justify-center mb-3">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">Drop your audio file here</p>
            <p className="text-sm text-gray-400 mt-1">or click to browse</p>
            <p className="text-xs text-gray-300 mt-2">MP3, WAV, M4A — up to 25MB</p>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="mt-4 w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl
          hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
          flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Processing...
          </>
        ) : (
          "Transcribe & Summarise"
        )}
      </button>
    </div>
  );
}

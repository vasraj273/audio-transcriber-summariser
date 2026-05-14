import { useState } from "react";
import { copyText } from "../utils/copyText";
import Markdown from "./Markdown";

export default function KeyPointsList({ keyPoints }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n");
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Key Points</h2>
        <button
          onClick={handleCopy}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <ul className="space-y-2">
        {keyPoints.map((point, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold flex items-center justify-center">
              {index + 1}
            </span>
            <div className="text-gray-700 text-sm leading-relaxed flex-1">
              <Markdown>{point}</Markdown>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

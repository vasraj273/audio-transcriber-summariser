import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function downloadPDF({ audioName, createdAt, transcript, summary, keyPoints }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const state = { y: margin };

  function ensureSpace(needed) {
    if (state.y + needed > pageHeight - margin) {
      doc.addPage();
      state.y = margin;
    }
  }

  function writeLine(text, { fontSize = 11, bold = false, rgb = [30, 30, 30], indent = 0 } = {}) {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...rgb);
    const lines = doc.splitTextToSize(String(text), maxWidth - indent);
    lines.forEach((line) => {
      ensureSpace(fontSize * 0.6);
      doc.text(line, margin + indent, state.y);
      state.y += fontSize * 0.5;
    });
  }

  function gap(n = 4) { state.y += n; }

  function divider() {
    ensureSpace(6);
    doc.setDrawColor(210, 210, 210);
    doc.line(margin, state.y, pageWidth - margin, state.y);
    gap(6);
  }

  function renderMarkdown(md) {
    const lines = (md || "").split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        gap(2);
        i++;
        continue;
      }

      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i].trim());
          i++;
        }
        const { head, body } = parseTable(tableLines);
        if (head && body) {
          ensureSpace(20);
          autoTable(doc, {
            head: [head],
            body,
            startY: state.y,
            margin: { left: margin, right: margin },
            styles: { fontSize: 9, cellPadding: 3, textColor: [30, 30, 30] },
            headStyles: { fillColor: [243, 244, 246], textColor: [30, 30, 30], fontStyle: "bold" },
            theme: "grid",
          });
          state.y = doc.lastAutoTable.finalY + 4;
        }
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = stripInline(headingMatch[2]);
        const sizes = { 1: 14, 2: 12, 3: 11 };
        writeLine(text, { fontSize: sizes[level], bold: true });
        gap(2);
        i++;
        continue;
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const bulletText = stripInline(trimmed.slice(2));
        writeLine(`•  ${bulletText}`, { indent: 4 });
        i++;
        continue;
      }

      writeLine(stripInline(trimmed));
      i++;
    }
  }

  function parseTable(rows) {
    if (rows.length < 2) return { head: null, body: null };
    const splitRow = (r) => r.slice(1, -1).split("|").map((c) => stripInline(c.trim()));
    const head = splitRow(rows[0]);
    const isSeparator = /^[\s|:-]+$/.test(rows[1]);
    const bodyRows = isSeparator ? rows.slice(2) : rows.slice(1);
    const body = bodyRows.map(splitRow);
    return { head, body };
  }

  function stripInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1");
  }

  // ----- Build PDF -----
  writeLine("Audio Transcript Report", { fontSize: 18, bold: true, rgb: [67, 56, 202] });
  gap(2);
  writeLine(`File: ${audioName || "Unknown"}`, { fontSize: 10, rgb: [100, 100, 100] });
  if (createdAt) {
    const date = new Date(createdAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
    writeLine(`Date: ${date}`, { fontSize: 10, rgb: [100, 100, 100] });
  }
  gap(4);
  divider();

  writeLine("Summary", { fontSize: 13, bold: true });
  gap(2);
  renderMarkdown(summary || "");
  gap(6);
  divider();

  writeLine("Key Points", { fontSize: 13, bold: true });
  gap(2);
  (keyPoints || []).forEach((point, i) => {
    writeLine(`${i + 1}.  ${stripInline(point)}`, { indent: 2 });
    gap(1);
  });
  gap(4);
  divider();

  writeLine("Full Transcript", { fontSize: 13, bold: true });
  gap(2);
  writeLine(transcript || "");

  const safeName = (audioName || "report").replace(/\.[^/.]+$/, "");
  doc.save(`transcript-${safeName}.pdf`);
}

export function downloadMergedNotesPDF({ notes, records = [], generatedAt = new Date() }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const state = { y: margin };

  function ensureSpace(needed) {
    if (state.y + needed > pageHeight - margin) {
      addFooter();
      doc.addPage();
      state.y = margin;
    }
  }

  function writeLine(text, { fontSize = 11, bold = false, rgb = [30, 30, 30], indent = 0, lineGap = 0.5 } = {}) {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...rgb);
    const lines = doc.splitTextToSize(String(text), maxWidth - indent);
    lines.forEach((line) => {
      ensureSpace(fontSize * 0.65);
      doc.text(line, margin + indent, state.y);
      state.y += fontSize * lineGap;
    });
  }

  function gap(n = 4) { state.y += n; }

  function divider() {
    ensureSpace(7);
    doc.setDrawColor(220, 224, 232);
    doc.line(margin, state.y, pageWidth - margin, state.y);
    gap(7);
  }

  function addFooter() {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text("Generated by Audio Transcriber", margin, pageHeight - 10);
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: "right" });
  }

  function renderMarkdown(md) {
    const lines = (md || "").split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        gap(2);
        i++;
        continue;
      }

      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i].trim());
          i++;
        }
        const { head, body } = parseTable(tableLines);
        if (head && body) {
          ensureSpace(22);
          autoTable(doc, {
            head: [head],
            body,
            startY: state.y,
            margin: { left: margin, right: margin },
            styles: { fontSize: 8.5, cellPadding: 3, textColor: [35, 35, 35], overflow: "linebreak" },
            headStyles: { fillColor: [238, 242, 255], textColor: [49, 46, 129], fontStyle: "bold" },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            theme: "grid",
          });
          state.y = doc.lastAutoTable.finalY + 5;
        }
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = stripInline(headingMatch[2]);
        const sizes = { 1: 16, 2: 13, 3: 11.5, 4: 10.5 };
        gap(level === 1 ? 5 : 3);
        writeLine(text, {
          fontSize: sizes[level] || 11,
          bold: true,
          rgb: level <= 2 ? [49, 46, 129] : [55, 65, 81],
          lineGap: 0.65,
        });
        gap(2);
        i++;
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        writeLine(`•  ${stripInline(trimmed.slice(2))}`, { indent: 5, lineGap: 0.58 });
        gap(1);
        i++;
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        writeLine(stripInline(trimmed), { indent: 3, lineGap: 0.58 });
        gap(1);
        i++;
        continue;
      }

      writeLine(stripInline(trimmed), { lineGap: 0.58 });
      i++;
    }
  }

  function parseTable(rows) {
    if (rows.length < 2) return { head: null, body: null };
    const splitRow = (r) => r.slice(1, -1).split("|").map((c) => stripInline(c.trim()));
    const head = splitRow(rows[0]);
    const isSeparator = /^[\s|:-]+$/.test(rows[1]);
    const bodyRows = isSeparator ? rows.slice(2) : rows.slice(1);
    const body = bodyRows.map(splitRow);
    return { head, body };
  }

  function stripInline(text) {
    return String(text)
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1");
  }

  const date = new Date(generatedAt);
  const dateText = date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const metadata = buildMergedNotesMetadata(records);

  doc.setFillColor(238, 242, 255);
  doc.rect(0, 0, pageWidth, 36, "F");
  writeLine("Merged Transcript Notes", { fontSize: 20, bold: true, rgb: [49, 46, 129], lineGap: 0.75 });
  writeLine("AI-generated consolidated notes from selected transcripts.", { fontSize: 10, rgb: [85, 85, 105] });
  state.y = 44;

  writeLine("Metadata", { fontSize: 13, bold: true, rgb: [55, 65, 81] });
  gap(2);
  writeMetadataRow("Generated", dateText);
  writeMetadataRow("Merged transcripts", String(records.length || metadata.sourceTitles.length));
  if (metadata.languages) writeMetadataRow("Languages", metadata.languages);
  if (metadata.totalDuration) writeMetadataRow("Duration", metadata.totalDuration);
  if (metadata.speakerSummary) writeMetadataRow("Speakers", metadata.speakerSummary);

  if (metadata.sourceTitles.length) {
    gap(3);
    writeLine("Sources", { fontSize: 10.5, bold: true, rgb: [55, 65, 81] });
    metadata.sourceTitles.forEach((title) => {
      writeLine(`•  ${title}`, { fontSize: 9.5, rgb: [80, 80, 80], indent: 4, lineGap: 0.56 });
    });
  }
  gap(4);
  divider();

  renderMarkdown(notes || "");

  addFooter();
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    addFooter();
  }

  const safeDate = date.toISOString().slice(0, 10);
  doc.save(`merged-transcript-notes-${safeDate}.pdf`);

  function writeMetadataRow(label, value) {
    writeLine(`${label}: ${value}`, { fontSize: 10, rgb: [80, 80, 80], lineGap: 0.56 });
  }
}

function buildMergedNotesMetadata(records) {
  const sourceTitles = uniqueCleanTitles(records);
  const languages = uniqueValues(records.map((record) => normaliseLanguage(record.detected_language))).join(", ");
  const totalSeconds = records.reduce((sum, record) => sum + Number(record.duration_seconds || 0), 0);
  const speakerCounts = records
    .map((record) => Number(record.speaker_count || 0))
    .filter((count) => count > 0);
  const maxSpeakers = speakerCounts.length ? Math.max(...speakerCounts) : 0;

  return {
    sourceTitles,
    languages,
    totalDuration: totalSeconds > 0 ? formatDuration(totalSeconds) : "",
    speakerSummary: maxSpeakers > 0
      ? `${maxSpeakers} speaker${maxSpeakers === 1 ? "" : "s"} detected`
      : "",
  };
}

function uniqueCleanTitles(records) {
  const seen = new Set();
  const titles = [];

  records.forEach((record, index) => {
    const title = cleanTranscriptTitle(record.audio_name, index + 1);
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    titles.push(title);
  });

  return titles;
}

function cleanTranscriptTitle(value, fallbackIndex) {
  let name = String(value || "").trim();
  if (!name) return `Transcript ${fallbackIndex}`;

  try {
    name = decodeURIComponent(name);
  } catch {
    // Keep original string if it is not valid URI-encoded text.
  }

  name = name
    .replace(/^.*[\\/]/, "")
    .replace(/\.(mp3|wav|m4a|mp4|mpeg|aac|ogg|webm)$/i, "")
    .replace(/\s*\(\d+\)\s*$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(final|copy|audio|recording)\b\s*\d*$/i, (match) => match.trim())
    .trim();

  if (!name) return `Transcript ${fallbackIndex}`;

  const title = toTitleCase(name);
  return title.length > 70 ? `${title.slice(0, 67).trim()}...` : title;
}

function toTitleCase(value) {
  const smallWords = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
  return value
    .split(" ")
    .map((word, index) => {
      if (!word) return word;
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value) return false;
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normaliseLanguage(value) {
  if (!value) return "";
  return toTitleCase(String(value).replace(/[_-]+/g, " ").trim());
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

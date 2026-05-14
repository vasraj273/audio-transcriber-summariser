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

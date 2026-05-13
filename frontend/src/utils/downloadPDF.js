import jsPDF from "jspdf";

export function downloadPDF({ audioName, createdAt, transcript, summary, keyPoints }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  function write(text, fontSize = 11, bold = false, rgb = [30, 30, 30]) {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...rgb);
    const lines = doc.splitTextToSize(String(text), maxWidth);
    lines.forEach((line) => {
      if (y + 8 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += fontSize * 0.45;
    });
  }

  function gap(n = 6) { y += n; }

  function divider() {
    doc.setDrawColor(210, 210, 210);
    doc.line(margin, y, pageWidth - margin, y);
    gap(6);
  }

  // Header
  write("Audio Transcript Report", 18, true, [67, 56, 202]);
  gap(2);
  write(`File: ${audioName || "Unknown"}`, 10, false, [100, 100, 100]);
  if (createdAt) {
    const date = new Date(createdAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
    write(`Date: ${date}`, 10, false, [100, 100, 100]);
  }
  gap(4);
  divider();

  // Summary
  write("Summary", 13, true);
  gap(2);
  write(summary || "");
  gap(6);
  divider();

  // Key Points
  write("Key Points", 13, true);
  gap(2);
  (keyPoints || []).forEach((point, i) => {
    write(`${i + 1}.  ${point}`);
    gap(1);
  });
  gap(4);
  divider();

  // Transcript
  write("Full Transcript", 13, true);
  gap(2);
  write(transcript || "");

  const safeName = (audioName || "report").replace(/\.[^/.]+$/, "");
  doc.save(`transcript-${safeName}.pdf`);
}

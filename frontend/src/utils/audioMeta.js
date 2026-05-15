export function readAudioDuration(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No audio file provided."));
      return;
    }
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const url = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read audio duration."));
    };
    audio.src = url;
  });
}

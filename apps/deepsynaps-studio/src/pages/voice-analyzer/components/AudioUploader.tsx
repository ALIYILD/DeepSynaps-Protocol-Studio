type AudioUploaderProps = {
  onSelect: (file: File) => void;
};

export function AudioUploader({ onSelect: _onSelect }: AudioUploaderProps) {
  // TODO: drag-and-drop zone, accept WAV/MP3/M4A, validate size, fire onSelect.
  return (
    <section className="rounded border p-4">
      <h2 className="text-lg font-medium">Upload audio</h2>
      <input type="file" accept=".wav,.mp3,.m4a" />
      <button type="button">Upload</button>
    </section>
  );
}

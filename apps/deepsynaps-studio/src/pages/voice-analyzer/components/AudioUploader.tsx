type AudioUploaderProps = {
  onSelect: (file: File) => void;
};

export function AudioUploader({ onSelect: _onSelect }: AudioUploaderProps) {
  // TODO: drag-and-drop zone, accept WAV/MP3/M4A, validate size, fire onSelect.
  return (
    <section className="rounded border p-4">
      <h2 className="text-lg font-medium">Upload audio</h2>
      <p className="text-xs text-yellow-700">
        Audio will be transmitted and stored under the active patient record.
        Ensure patient consent for audio capture is documented before upload.
      </p>
      <input type="file" accept=".wav,.mp3,.m4a" />
      <button type="button">Upload</button>
    </section>
  );
}

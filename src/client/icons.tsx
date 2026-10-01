/** Altavoz dibujado (centrado de verdad, a diferencia del emoji); tachado si está silenciado. */
export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" />
      ) : (
        <>
          <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
          <path d="M19 7a7 7 0 0 1 0 10" />
        </>
      )}
    </svg>
  );
}

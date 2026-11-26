export function speakBrandPhrase(
  displayName: string,
  mode: 'word' | 'team' = 'word',
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const text = mode === 'team' ? `I work at ${displayName}.` : displayName;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

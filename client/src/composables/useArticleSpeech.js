import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { getRenderedArticleText } from '../services/articleContentService.js';

// Speech synthesis has one browser-wide queue; only its current owner may cancel it.
let stopActiveSpeech = null;

export function useArticleSpeech({ articleId, getContent, language }) {
  const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const supported = Boolean(synthesis && typeof window.SpeechSynthesisUtterance === 'function');
  const state = ref('idle');
  let utterance = null;

  const stop = () => {
    utterance = null;
    state.value = 'idle';
    if (stopActiveSpeech !== stop) return;
    stopActiveSpeech = null;
    synthesis.cancel();
  };

  const toggle = () => {
    if (!supported) return;
    if (utterance) {
      if (state.value === 'paused') {
        synthesis.resume();
        state.value = 'speaking';
      } else {
        synthesis.pause();
        state.value = 'paused';
      }
      return;
    }
    const text = getRenderedArticleText(getContent());
    if (!text) return;
    // Clear any queued utterances before starting this article, including external callers.
    if (stopActiveSpeech) stopActiveSpeech();
    else synthesis.cancel();
    if (synthesis.paused) synthesis.resume();
    const next = new window.SpeechSynthesisUtterance(text);
    if (language()) next.lang = language();
    utterance = next;
    stopActiveSpeech = stop;
    state.value = 'speaking';
    const finish = () => {
      if (utterance !== next) return;
      utterance = null;
      state.value = 'idle';
      if (stopActiveSpeech === stop) stopActiveSpeech = null;
    };
    next.onend = finish;
    next.onerror = finish;
    next.onpause = () => { if (utterance === next) state.value = 'paused'; };
    next.onresume = () => { if (utterance === next) state.value = 'speaking'; };
    try {
      synthesis.speak(next);
    } catch {
      stop();
    }
  };

  watch(articleId, stop, { flush: 'sync' });
  onBeforeUnmount(stop);
  return { supported, speaking: computed(() => state.value === 'speaking'), paused: computed(() => state.value === 'paused'), toggle };
}

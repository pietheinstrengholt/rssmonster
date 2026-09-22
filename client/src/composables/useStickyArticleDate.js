import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

// Tracks the first visible row below the shell toolbar, independently of reading/mark-read state.
export function useStickyArticleDate(props, barElement) {
  const activeDate = ref(null);
  const stickyTop = ref(0);
  let activeId = null;
  let observer;
  let resizeObserver;
  let mounted = false;
  let scheduled = false;
  let generation = 0;
  const sizedElements = new Set();

  const connect = () => {
    if (!mounted || !barElement.value) return;
    const bar = barElement.value;
    let root = bar.parentElement;
    while (root && !/(auto|scroll|overlay)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;

    // Shell toolbars share the scroll surface in compact/mobile layouts; Reader and Expanded have their own roots.
    const stickyElements = [];
    for (let node = bar; node && node !== root; node = node.parentElement) {
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (getComputedStyle(sibling).position === 'sticky') stickyElements.push(sibling);
      }
    }
    stickyTop.value = stickyElements.reduce((top, element) => Math.max(
      top, (parseFloat(getComputedStyle(element).top) || 0) + element.getBoundingClientRect().height
    ), 0);
    const nextSizedElements = new Set(stickyElements);
    for (const element of sizedElements) {
      if (!nextSizedElements.has(element)) { resizeObserver?.unobserve(element); sizedElements.delete(element); }
    }
    for (const element of nextSizedElements) {
      if (!sizedElements.has(element)) { resizeObserver?.observe(element); sizedElements.add(element); }
    }

    observer?.disconnect();
    const currentGeneration = ++generation;
    const articles = props.articles;
    const current = articles.find(article => String(article.id) === activeId) || articles[0];
    activeId = current ? String(current.id) : null;
    activeDate.value = current?.publishedAt ?? null;
    if (typeof IntersectionObserver === 'undefined') return;

    const rows = new Map();
    const visible = new Set();
    observer = new IntersectionObserver(entries => {
      if (currentGeneration !== generation) return;
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      let first;
      for (const element of visible) {
        const row = rows.get(element);
        if (row && (!first || row.index < first.index)) first = row;
      }
      if (first) {
        activeId = String(first.article.id);
        activeDate.value = first.article.publishedAt ?? null;
      }
    }, { root, rootMargin: `-${stickyTop.value}px 0px 0px 0px`, threshold: 0 });
    articles.forEach((article, index) => {
      const element = props.getArticleElement(article.id);
      if (!element) return;
      rows.set(element, { article, index });
      observer.observe(element);
    });
  };

  const scheduleConnect = () => {
    if (scheduled || !mounted) return;
    scheduled = true;
    nextTick(() => { scheduled = false; connect(); });
  };
  watch(() => JSON.stringify(props.articles.map(article => [article.id, article.publishedAt])), scheduleConnect, { flush: 'post' });
  onMounted(() => {
    mounted = true;
    if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(scheduleConnect);
    window.addEventListener('resize', scheduleConnect);
    scheduleConnect();
  });
  onBeforeUnmount(() => {
    mounted = false;
    generation++;
    observer?.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener('resize', scheduleConnect);
  });
  return { activeDate };
}

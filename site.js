(() => {
  'use strict';
  const cfg = window.NOSSA_HISTORIA || { fotos: {}, gravacao: '', tipoGravacao: 'audio' };
  const scenes = [...document.querySelectorAll('.scene')];
  const labels = ['Capa', 'Prólogo', 'Biblioteca', 'Piquenique', 'A história continua', 'Continua…'];
  const bottom = document.getElementById('bottom-ui');
  const prev = document.getElementById('prev-btn');
  const next = document.getElementById('next-btn');
  const progressName = document.getElementById('progress-name');
  const progressCount = document.getElementById('progress-count');
  const progressFill = document.getElementById('progress-fill');
  let current = 0;
  let navigationLocked = false;

  for (const img of document.querySelectorAll('[data-photo]')) {
    const newSrc = cfg.fotos?.[img.dataset.photo];
    if (newSrc) img.src = newSrc;
    img.addEventListener('error', () => {
      const fallback = 'midia/fotos/' + img.dataset.photo + '.svg';
      if (!img.src.endsWith(fallback)) img.src = fallback;
    });
  }

  function showScene(number, updateHash = true) {
    const target = Math.max(0, Math.min(number, scenes.length - 1));
    if (target === current && scenes[target].classList.contains('is-active')) return;
    scenes[current].classList.remove('is-active');
    scenes[current].setAttribute('aria-hidden', 'true');
    scenes[target].classList.add('is-active');
    scenes[target].removeAttribute('aria-hidden');
    current = target;
    bottom.hidden = target === 0 || target === scenes.length - 1;
    prev.disabled = target <= 1;
    next.disabled = target >= scenes.length - 1;
    progressName.textContent = labels[target];
    progressCount.textContent = String(target).padStart(2, '0') + ' / 05';
    progressFill.style.width = (target / 5 * 100) + '%';
    document.title = (target ? labels[target] + ' · ' : '') + 'Nossa história';
    if (updateHash) history.replaceState(null, '', '#' + scenes[target].id);
    window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }

  scenes.slice(1).forEach(s => s.setAttribute('aria-hidden', 'true'));
  document.querySelectorAll('[data-next]').forEach(btn => btn.addEventListener('click', () => showScene(+btn.dataset.next)));
  prev.addEventListener('click', () => showScene(current - 1));
  next.addEventListener('click', () => showScene(current + 1));
  document.getElementById('restart-button').addEventListener('click', () => showScene(0));
  document.getElementById('home-link').addEventListener('click', e => {e.preventDefault();showScene(0);});
  document.addEventListener('keydown', event => {
    if (/INPUT|TEXTAREA|BUTTON|VIDEO/.test(document.activeElement?.tagName ?? '')) return;
    if (event.key === 'ArrowRight') showScene(current + 1);
    if (event.key === 'ArrowLeft') showScene(current - 1);
  });
  window.addEventListener('hashchange', () => {
    const target = scenes.findIndex(s => '#' + s.id === location.hash);
    if (target !== -1) showScene(target, false);
  });
  const initialIndex = scenes.findIndex(s => '#' + s.id === location.hash);
  if (initialIndex > 0) showScene(initialIndex, false);

  const dock = document.getElementById('voice-dock');
  const playBtn = document.getElementById('voice-toggle');
  const status = document.getElementById('voice-status');
  const transcript = window.NOSSA_HISTORIA_LEGENDA || { paginas: [], frases: [] };
  if (cfg.gravacao) {
    dock.hidden = false;
    let audioContext;
    let audioBuffer;
    let source;
    let startedAt = 0;
    let playbackOffset = 0;
    let playbackEnded = false;
    let playbackTimer;
    let isStarting = false;
    let activePhrase = -1;
    let activeWord = -1;
    let activeWords = [];

    function sceneForTime(time) {
      return transcript.paginas.reduce((page, marker) => time >= marker.inicio ? marker : page, null);
    }

    function renderTranscript() {
      const scenePhrases = new Map(scenes.map((scene, index) => [index, []]));
      transcript.frases.forEach((phrase, index) => {
        const page = sceneForTime(phrase.tempos[0]);
        if (page) scenePhrases.get(page.cena)?.push({ phrase, index });
      });

      for (const [sceneIndex, entries] of scenePhrases) {
        if (!entries.length) continue;
        const scene = scenes[sceneIndex];
        const copy = scene.querySelector('.chapter-copy');
        const transcriptBlock = document.createElement('div');
        transcriptBlock.className = 'spoken-copy';

        entries.forEach(({ phrase, index }, entryIndex) => {
          const line = document.createElement('p');
          line.className = 'spoken-line';
          if (entryIndex === 0) line.classList.add('spoken-line-lead');
          if (entryIndex === entries.length - 1) line.classList.add('spoken-line-signoff');
          line.dataset.phrase = String(index);
          phrase.palavras.forEach((word, wordIndex) => {
            const span = document.createElement('span');
            span.className = 'spoken-word';
            span.textContent = word + (wordIndex < phrase.palavras.length - 1 ? ' ' : '');
            line.append(span);
          });
          transcriptBlock.append(line);
        });

        if (copy) {
          copy.querySelectorAll('p:not(.section-kicker)').forEach(paragraph => paragraph.remove());
          copy.querySelector('.chapter-footer')?.before(transcriptBlock);
        } else {
          scene.querySelector('.ending-message')?.remove();
          scene.querySelector('.ending-love')?.remove();
          transcriptBlock.classList.add('spoken-copy-ending');
          scene.querySelector('#restart-button')?.before(transcriptBlock);
        }
      }
    }

    renderTranscript();

    function updateStory(time) {
      const page = sceneForTime(time);
      if (page && current !== page.cena) showScene(page.cena);

      let phraseIndex = -1;
      for (let index = 0; index < transcript.frases.length; index += 1) {
        if (time >= transcript.frases[index].tempos[0]) phraseIndex = index;
        else break;
      }
      if (phraseIndex !== activePhrase) {
        activeWords[activeWord]?.classList.remove('is-current');
        activePhrase = phraseIndex;
        activeWord = -1;
        if (phraseIndex < 0) {
          activeWords = [];
          return;
        }
        activeWords = [...(scenes[page.cena]?.querySelector(`[data-phrase="${phraseIndex}"]`)?.querySelectorAll('.spoken-word') ?? [])];
        activeWords[0]?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      }

      if (phraseIndex < 0) return;
      const times = transcript.frases[phraseIndex].tempos;
      let wordIndex = 0;
      for (let index = 1; index < times.length; index += 1) {
        if (time < times[index]) break;
        wordIndex = index;
      }
      if (wordIndex !== activeWord) {
        activeWords[activeWord]?.classList.remove('is-current');
        activeWords[wordIndex]?.classList.add('is-current');
        activeWord = wordIndex;
      }
    }

    function playbackTime() {
      return source ? playbackOffset + performance.now() / 1000 - startedAt : playbackOffset;
    }

    function sync() {
      const playing = Boolean(source);
      dock.classList.toggle('is-playing', playing);
      playBtn.textContent = playing ? 'Ⅱ' : '▶';
      playBtn.setAttribute('aria-label', playing ? 'Pausar gravação' : 'Reproduzir gravação');
      status.textContent = isStarting ? 'Preparando a gravação…' : playbackEnded ? 'Gravação concluída ♡' : playing ? 'Reproduzindo sua mensagem…' : 'Aperte play para ouvir';
    }

    async function startPlayback() {
      if (isStarting) return;
      isStarting = true;
      playbackEnded = false;
      sync();
      try {
        audioContext ??= new AudioContext();
        await audioContext.resume();
        if (!audioBuffer) {
          const response = await fetch(cfg.gravacao);
          if (!response.ok) throw new Error('Falha ao carregar o arquivo de áudio');
          audioBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
        }
        if (playbackOffset === 0) showScene(transcript.paginas[0]?.cena ?? 1);
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        startedAt = performance.now() / 1000;
        source.onended = () => {
          if (!source) return;
          source = null;
          playbackOffset = 0;
          playbackEnded = true;
          window.clearInterval(playbackTimer);
          updateStory(audioBuffer.duration);
          activeWords[activeWord]?.classList.remove('is-current');
          activeWords = [];
          activePhrase = -1;
          activeWord = -1;
          sync();
        };
        source.start(0, playbackOffset);
        isStarting = false;
        updateStory(playbackTime());
        playbackTimer = window.setInterval(() => updateStory(playbackTime()), 60);
        sync();
      } catch (error) {
        isStarting = false;
        status.textContent = 'Não foi possível abrir a gravação';
      }
    }

    playBtn.addEventListener('click', () => {
      if (source) {
        playbackOffset = playbackTime();
        source.onended = null;
        source.stop();
        source = null;
        window.clearInterval(playbackTimer);
        sync();
        return;
      }
      startPlayback();
    });
  }
})();

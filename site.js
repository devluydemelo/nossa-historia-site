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
  const audio = document.getElementById('voice-audio');
  const video = document.getElementById('voice-video');
  const caption = document.getElementById('voice-caption');
  const transcript = window.NOSSA_HISTORIA_LEGENDA || { paginas: [], frases: [] };
  if (cfg.gravacao) {
    const isVideo = cfg.tipoGravacao === 'video' || /\.mp4(?:[?#]|$)/i.test(cfg.gravacao);
    const media = isVideo ? video : audio;
    media.src = cfg.gravacao;
    if (isVideo) { video.hidden = false; video.style.display = 'none'; }
    dock.hidden = false;
    let audioContext;
    let audioBuffer;
    let fallbackSource;
    let fallbackStartedAt = 0;
    let fallbackOffset = 0;
    let fallbackEnded = false;
    let fallbackTimer;
    let activePhrase = -1;
    let activeWord = -1;
    let captionWords = [];

    function updateStory(time) {
      const page = transcript.paginas.reduce((currentPage, marker) => time >= marker.inicio ? marker : currentPage, null);
      if (page && current !== page.cena) showScene(page.cena);

      let phraseIndex = -1;
      for (let index = 0; index < transcript.frases.length; index += 1) {
        if (time >= transcript.frases[index].tempos[0]) phraseIndex = index;
        else break;
      }
      if (phraseIndex !== activePhrase) {
        activePhrase = phraseIndex;
        activeWord = -1;
        caption.replaceChildren();
        captionWords = [];
        if (phraseIndex < 0) {
          caption.hidden = true;
          return;
        }
        const phrase = transcript.frases[phraseIndex];
        phrase.palavras.forEach((word, index) => {
          const span = document.createElement('span');
          span.className = 'voice-caption-word';
          span.textContent = word + (index < phrase.palavras.length - 1 ? ' ' : '');
          caption.append(span);
          captionWords.push(span);
        });
        caption.hidden = false;
      }

      if (phraseIndex < 0) return;
      const times = transcript.frases[phraseIndex].tempos;
      let wordIndex = 0;
      for (let index = 1; index < times.length; index += 1) {
        if (time < times[index]) break;
        wordIndex = index;
      }
      if (wordIndex !== activeWord) {
        captionWords[activeWord]?.classList.remove('is-current');
        captionWords[wordIndex]?.classList.add('is-current');
        activeWord = wordIndex;
      }
    }

    function currentPlaybackTime() {
      return fallbackSource ? fallbackOffset + performance.now() / 1000 - fallbackStartedAt : media.currentTime;
    }

    function sync() {
      const playing = Boolean(fallbackSource) || (!media.paused && !media.ended);
      const ended = fallbackEnded || media.ended;
      dock.classList.toggle('is-playing', playing);
      playBtn.textContent = playing ? 'Ⅱ' : '▶';
      playBtn.setAttribute('aria-label', playing ? 'Pausar gravação' : 'Reproduzir gravação');
      status.textContent = ended ? 'Gravação concluída ♡' : playing ? 'Reproduzindo sua mensagem…' : 'Aperte play para ouvir';
    }
    playBtn.addEventListener('click', async () => {
      if (fallbackSource) {
        fallbackOffset += performance.now() / 1000 - fallbackStartedAt;
        fallbackSource.onended = null;
        fallbackSource.stop();
        fallbackSource = null;
        window.clearInterval(fallbackTimer);
        sync();
        return;
      }
      if (!media.paused) { media.pause(); return; }
      if (media.currentTime === 0 && fallbackOffset === 0) showScene(transcript.paginas[0]?.cena ?? 1);
      if (isVideo) video.style.display = 'block';
      try {
        await media.play();
      } catch (error) {
        try {
          status.textContent = 'Preparando a gravação…';
          audioContext ??= new AudioContext();
          await audioContext.resume();
          if (!audioBuffer) {
            const response = await fetch(cfg.gravacao);
            if (!response.ok) throw new Error('Falha ao carregar o arquivo de áudio');
            audioBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
          }
          fallbackOffset %= audioBuffer.duration;
          fallbackSource = audioContext.createBufferSource();
          fallbackSource.buffer = audioBuffer;
          fallbackSource.connect(audioContext.destination);
          fallbackStartedAt = performance.now() / 1000;
          fallbackSource.onended = () => {
            if (!fallbackSource) return;
            fallbackSource = null;
            window.clearInterval(fallbackTimer);
            fallbackOffset = 0;
            fallbackEnded = true;
            sync();
          };
          fallbackEnded = false;
          fallbackSource.start(0, fallbackOffset);
          updateStory(currentPlaybackTime());
          fallbackTimer = window.setInterval(() => updateStory(currentPlaybackTime()), 60);
          sync();
        } catch (fallbackError) {
          status.textContent = 'Não foi possível abrir a gravação';
        }
      }
    });
    media.addEventListener('play', () => { sync(); updateStory(media.currentTime); });
    media.addEventListener('pause', sync);
    media.addEventListener('timeupdate', () => updateStory(media.currentTime));
    media.addEventListener('ended', () => { sync(); updateStory(media.duration); });
    media.addEventListener('error', () => {status.textContent = 'Aperte play para tentar outra forma de reprodução';});
  }
})();

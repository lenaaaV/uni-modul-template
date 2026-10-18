document$.subscribe(() => {
  const article = document.querySelector(".md-content__inner");
  if (!article) return;

  function triggerCleanPdfPrint(includeCards = true) {
    const body = document.body;
    const prevScheme = body.getAttribute("data-md-color-scheme");
    body.setAttribute("data-md-color-scheme", "default");

    const questionBoxes = document.querySelectorAll("details.question, details.tip");
    questionBoxes.forEach(d => {
      if (includeCards) {
        d.style.display = "";
        d.setAttribute("open", "");
      } else {
        d.style.display = "none";
      }
    });

    setTimeout(() => {
      window.print();
      if (prevScheme) body.setAttribute("data-md-color-scheme", prevScheme);
      questionBoxes.forEach(d => { d.style.display = ""; });
    }, 150);
  }

  if (window.location.pathname.includes("print_page")) {
    if (!document.getElementById("pdf-export-bar")) {
      const pdfBar = document.createElement("div");
      pdfBar.id = "pdf-export-bar";
      pdfBar.className = "srs-dashboard";
      pdfBar.innerHTML = `
        <div>
          <div style="font-size: 1rem; font-weight: 700;">Gesamtskript (PDF-Export)</div>
          <div style="font-size: 0.82rem; opacity: 0.8; margin-top: 2px;">
            Wähle, ob du das Skript <b>mit</b> oder <b>ohne</b> Lernkarten als kompaktes A4-PDF speichern möchtest.
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="btn-pdf-no-cards" class="md-button">PDF (Nur Zusammenfassung)</button>
          <button id="btn-pdf-with-cards" class="md-button md-button--primary">PDF (Inkl. Lernkarten)</button>
        </div>
      `;
      article.insertBefore(pdfBar, article.firstChild);

      document.querySelectorAll("details").forEach(d => d.setAttribute("open", ""));

      pdfBar.querySelector("#btn-pdf-no-cards").onclick = () => triggerCleanPdfPrint(false);
      pdfBar.querySelector("#btn-pdf-with-cards").onclick = () => triggerCleanPdfPrint(true);
    }
    return;
  }

  const questionBoxes = document.querySelectorAll("details.question, details.tip");
  if (questionBoxes.length === 0) return;

  const STORAGE_KEY = "uni_srs_v2_" + window.location.pathname;
  let srsData = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

  const cards = Array.from(questionBoxes).map((box, idx) => {
    const summary = box.querySelector("summary");
    const title = summary ? summary.innerHTML : "Karte " + (idx + 1);
    const clone = box.cloneNode(true);
    const s = clone.querySelector("summary");
    if (s) s.remove();
    const bodyHtml = clone.innerHTML;
    const rawText = (title + bodyHtml).replace(/<[^>]*>/g, "").trim();
    const id = "card_" + idx + "_" + rawText.length;
    return { id, title, bodyHtml, isCloze: box.classList.contains("tip") };
  });

  const getDueCards = () => cards.filter(c => !srsData[c.id] || srsData[c.id].due <= Date.now());
  const getLearnedCount = () => cards.filter(c => srsData[c.id] && srsData[c.id].due > Date.now()).length;

  if (document.getElementById("srs-launcher")) {
    document.getElementById("srs-launcher").remove();
  }

  const launcher = document.createElement("div");
  launcher.id = "srs-launcher";
  launcher.className = "srs-dashboard";

  const updateLauncher = () => {
    const dueCount = getDueCards().length;
    const learnedCount = getLearnedCount();
    launcher.innerHTML = `
      <div>
        <div style="font-size: 0.95rem; font-weight: 700;">
          🧠 Karteikarten-Trainer (Spaced Repetition)
        </div>
        <div class="srs-badge-row">
          <span class="srs-badge">📚 ${cards.length} Karten</span>
          <span class="srs-badge ${dueCount > 0 ? 'due' : 'done'}">
            ${dueCount > 0 ? `${dueCount} fällig` : `Alle aktuell gelernt`}
          </span>
          <span class="srs-badge done">✓ ${learnedCount} im Langzeitgedächtnis</span>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <button id="srs-start-due" class="md-button md-button--primary" style="margin:0;">
          ▶ Fällige lernen (${dueCount})
        </button>
        <button id="srs-start-all" class="md-button" style="margin:0;">
          Alle üben
        </button>
        <button id="srs-pdf-page" class="md-button" style="margin:0;" title="Dieses Kapitel als kompaktes PDF speichern">
          📄 Kapitel-PDF
        </button>
      </div>
    `;
    launcher.querySelector("#srs-start-due").onclick = () => {
      const due = getDueCards();
      startSession(due.length > 0 ? due : [...cards]);
    };
    launcher.querySelector("#srs-start-all").onclick = () => startSession([...cards]);
    launcher.querySelector("#srs-pdf-page").onclick = () => triggerCleanPdfPrint(true);
  };

  const h1 = article.querySelector("h1");
  if (h1 && h1.nextSibling) {
    article.insertBefore(launcher, h1.nextSibling);
  } else {
    article.insertBefore(launcher, article.firstChild);
  }
  updateLauncher();


  function startSession(queue) {
    let currentIndex = 0;
    let isAnswerShown = false;

    const overlay = document.createElement("div");
    overlay.className = "srs-overlay";

    const modal = document.createElement("div");
    modal.className = "srs-card-modal";
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeSession = () => {
      window.removeEventListener("keydown", handleKeys);
      overlay.remove();
      updateLauncher();
    };

    const handleKeys = (e) => {
      if (e.key === "Escape") {
        closeSession();
      } else if ((e.code === "Space" || e.key === "Enter") && !isAnswerShown && currentIndex < queue.length) {
        e.preventDefault();
        const showBtn = modal.querySelector("#srs-show");
        if (showBtn) showBtn.click();
      } else if (isAnswerShown && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        rateCard(queue[currentIndex], parseInt(e.key) - 1);
      }
    };
    window.addEventListener("keydown", handleKeys);

    function renderCard() {
      isAnswerShown = false;
      const progressPct = Math.round((currentIndex / queue.length) * 100);

      if (currentIndex >= queue.length) {
        modal.innerHTML = `
          <div class="srs-progress-bar"><div class="srs-progress-fill" style="width:100%"></div></div>
          <div style="text-align:center; padding: 16px 0;">
            <div style="font-size: 2.4rem; margin-bottom: 8px;">🎓</div>
            <h3 style="margin-top:0;">Durchgang abgeschlossen!</h3>
            <p style="opacity:0.8; font-size:0.88rem; max-width:420px; margin: 0 auto 20px auto;">
              Alle Karten dieser Sitzung wurden wiederholt. Die nächsten Intervalle sind gespeichert.
            </p>
            <button id="srs-close" class="md-button md-button--primary">Schließen (Esc)</button>
          </div>
        `;
        modal.querySelector("#srs-close").onclick = closeSession;
        return;
      }

      const card = queue[currentIndex];
      const badgeLabel = card.isCloze ? "Lückentext" : "Frage & Antwort";

      const frontContent = card.isCloze
        ? `<div style="font-weight:650; font-size:0.95rem; margin-bottom:10px; color:var(--accent-main);">${card.title}</div>
           <div style="font-size:0.95rem; line-height:1.65;">
             ${card.bodyHtml.replace(/<mark>(.*?)<\/mark>/g, "<span style='background:var(--accent-pastel-bg); color:var(--accent-main); padding:1px 8px; border-radius:4px; font-weight:600; border:1px solid var(--accent-pastel-border);'>[ ... ]</span>")}
           </div>`
        : `<div style="font-size:1.1rem; font-weight:650; line-height:1.5;">${card.title}</div>`;

      const backContent = card.isCloze
        ? `<div style="font-size:0.95rem; line-height:1.65;">
             ${card.bodyHtml.replace(/<mark>(.*?)<\/mark>/g, "<span style='background:var(--pastel-mint-bg); color:var(--pastel-mint-text); padding:1px 7px; border-radius:4px; font-weight:650; border:1px solid var(--pastel-mint-border);'>$1</span>")}
           </div>`
        : `<div style="font-size:0.95rem; line-height:1.65;">${card.bodyHtml}</div>`;

      modal.innerHTML = `
        <div class="srs-progress-bar">
          <div class="srs-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; margin-bottom:16px;">
          <span class="srs-badge">${badgeLabel} • ${currentIndex + 1} / ${queue.length}</span>
          <span style="cursor:pointer; font-weight:600; color:var(--text-secondary);" id="srs-exit">✕ Esc</span>
        </div>

        <div id="srs-front" style="padding: 6px 0;">${frontContent}</div>

        <div id="srs-back" style="display:none; margin-top:18px; padding-top:18px; border-top:1px solid var(--border-hairline);">
          <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--pastel-mint-text); font-weight:700; margin-bottom:6px;">
            Antwort
          </div>
          ${backContent}
        </div>

        <div id="srs-actions" style="margin-top:24px;">
          <button id="srs-show" class="md-button md-button--primary" style="width:100%; padding:0.75em !important;">
            Antwort anzeigen (Leertaste)
          </button>
        </div>
      `;

      if (window.MathJax) MathJax.typesetPromise([modal]);

      modal.querySelector("#srs-exit").onclick = closeSession;
      modal.querySelector("#srs-show").onclick = () => {
        isAnswerShown = true;
        modal.querySelector("#srs-back").style.display = "block";
        modal.querySelector("#srs-actions").innerHTML = `
          <div class="srs-rate-grid">
            <button data-q="0" class="srs-rate-btn again">
              <span>1 • Nochmal</span>
              <small>&lt; 10 Min</small>
            </button>
            <button data-q="1" class="srs-rate-btn hard">
              <span>2 • Schwer</span>
              <small>1 Tag</small>
            </button>
            <button data-q="2" class="srs-rate-btn good">
              <span>3 • Gut</span>
              <small>3 Tage</small>
            </button>
            <button data-q="3" class="srs-rate-btn easy">
              <span>4 • Leicht</span>
              <small>7+ Tage</small>
            </button>
          </div>
        `;
        modal.querySelectorAll("[data-q]").forEach(btn => {
          btn.onclick = () => rateCard(card, parseInt(btn.dataset.q));
        });
      };
    }

    function rateCard(card, quality) {
      let state = srsData[card.id] || { interval: 0, ease: 2.5, reps: 0 };
      if (quality === 0) {
        state.reps = 0;
        state.interval = 0.007;
        queue.push(card);
      } else {
        state.reps += 1;
        if (state.reps === 1) state.interval = quality === 1 ? 1 : (quality === 2 ? 3 : 7);
        else state.interval = Math.round(state.interval * (state.ease + (quality - 2) * 0.15));
        state.ease = Math.max(1.3, state.ease + (0.1 - (3 - quality) * 0.08));
      }
      state.due = Date.now() + state.interval * 24 * 60 * 60 * 1000;
      srsData[card.id] = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(srsData));

      currentIndex++;
      renderCard();
    }

    renderCard();
  }
});
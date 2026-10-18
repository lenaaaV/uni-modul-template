document$.subscribe(() => {
  const article = document.querySelector(".md-content__inner");
  if (!article) return;


  if (window.location.pathname.includes("print_page")) {
    if (!document.getElementById("pdf-export-bar")) {
      const pdfBar = document.createElement("div");
      pdfBar.id = "pdf-export-bar";
      pdfBar.className = "srs-dashboard";
      pdfBar.innerHTML = `
        <div>
          <div style="font-size: 1.1rem; font-weight: 750;">📄 Gesamtskript & PDF-Export</div>
          <div style="font-size: 0.88rem; opacity: 0.8; margin-top: 4px;">
            Alle Kapitel auf einer Seite. Klicke rechts auf den Button und wähle im Druckfenster <b>„Als PDF speichern“</b>.
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn-toggle-details" class="md-button">Alle Karten auf-/zuklappen</button>
          <button id="btn-save-pdf" class="md-button md-button--primary">📥 Als PDF speichern</button>
        </div>
      `;
      article.insertBefore(pdfBar, article.firstChild);

      let allOpen = true;
      document.querySelectorAll("details").forEach(d => d.setAttribute("open", ""));

      pdfBar.querySelector("#btn-toggle-details").onclick = () => {
        allOpen = !allOpen;
        document.querySelectorAll("details").forEach(d => {
          if (allOpen) d.setAttribute("open", "");
          else d.removeAttribute("open");
        });
      };

      pdfBar.querySelector("#btn-save-pdf").onclick = () => {
        // Vor dem PDF-Druck alle Antworten sichtbar machen
        document.querySelectorAll("details").forEach(d => d.setAttribute("open", ""));
        window.print();
      };
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
        <div style="font-size: 1.05rem; font-weight: 750; display:flex; align-items:center; gap:8px;">
          <span>Anki Web-Trainer (Spaced Repetition)</span>
        </div>
        <div class="srs-badge-row">
          <span class="srs-badge">${cards.length} Karten im Kapitel</span>
          <span class="srs-badge ${dueCount > 0 ? 'due' : 'done'}">
            ${dueCount > 0 ? ` ${dueCount} heute fällig` : `Alles gelernt!`}
          </span>
          <span class="srs-badge done">🏆 ${learnedCount} gemeistert</span>
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <button id="srs-start-due" class="md-button md-button--primary" style="margin:0;">
          ▶ Fällige lernen (${dueCount})
        </button>
        <button id="srs-start-all" class="md-button" style="margin:0;">
          Alle wiederholen
        </button>
        <button id="srs-pdf-page" class="md-button" style="margin:0;" title="Kapitel als PDF drucken">
          PDF
        </button>
      </div>
    `;
    launcher.querySelector("#srs-start-due").onclick = () => {
      const due = getDueCards();
      startSession(due.length > 0 ? due : [...cards]);
    };
    launcher.querySelector("#srs-start-all").onclick = () => startSession([...cards]);
    launcher.querySelector("#srs-pdf-page").onclick = () => {
      document.querySelectorAll("details").forEach(d => d.setAttribute("open", ""));
      window.print();
    };
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
        const q = parseInt(e.key) - 1;
        rateCard(queue[currentIndex], q);
      }
    };
    window.addEventListener("keydown", handleKeys);

    function renderCard() {
      isAnswerShown = false;
      const progressPct = Math.round((currentIndex / queue.length) * 100);

      if (currentIndex >= queue.length) {
        modal.innerHTML = `
          <div class="srs-progress-bar"><div class="srs-progress-fill" style="width:100%"></div></div>
          <div style="text-align:center; padding: 20px 0;">
            <div style="font-size: 3rem; margin-bottom: 10px;">🎉</div>
            <h2 style="margin-top:0; border:none;">Stark! Runde abgeschlossen</h2>
            <p style="opacity:0.8; max-width:440px; margin: 0 auto 24px auto;">
              Alle Karten dieser Einheit sind durchgearbeitet. Dein Lernstand wurde automatisch gespeichert.
            </p>
            <button id="srs-close" class="md-button md-button--primary">Zurück zum Kapitel (Esc)</button>
          </div>
        `;
        modal.querySelector("#srs-close").onclick = closeSession;
        return;
      }

      const card = queue[currentIndex];
      const badgeLabel = card.isCloze ? "Lückentext-Karte" : "Frage & Antwort";

      const frontContent = card.isCloze
        ? `<div style="font-weight:700; font-size:1.1rem; margin-bottom:14px; color:var(--theme-color);">${card.title}</div>
           <div style="font-size:1.05rem; line-height:1.7;">
             ${card.bodyHtml.replace(/<mark>(.*?)<\/mark>/g, "<span style='background:var(--theme-color-light); color:var(--theme-color); padding:2px 10px; border-radius:6px; font-weight:700; border:1px dashed var(--theme-color);'>[ ... ]</span>")}
           </div>`
        : `<div style="font-size:1.25rem; font-weight:700; line-height:1.5;">${card.title}</div>`;

      const backContent = card.isCloze
        ? `<div style="font-size:1.05rem; line-height:1.7;">
             ${card.bodyHtml.replace(/<mark>(.*?)<\/mark>/g, "<span style='background:rgba(16,185,129,0.18); color:#10b981; padding:2px 8px; border-radius:6px; font-weight:700; border:1px solid #10b981;'>$1</span>")}
           </div>`
        : `<div style="font-size:1.05rem; line-height:1.7;">${card.bodyHtml}</div>`;

      modal.innerHTML = `
        <div class="srs-progress-bar">
          <div class="srs-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; opacity:0.75; margin-bottom:18px;">
          <span class="srs-badge">${badgeLabel} • Karte ${currentIndex + 1} / ${queue.length}</span>
          <span style="cursor:pointer; font-weight:600; padding:4px 8px;" id="srs-exit">✕ Schließen (Esc)</span>
        </div>

        <div id="srs-front" style="padding: 10px 0;">${frontContent}</div>

        <div id="srs-back" style="display:none; margin-top:22px; padding-top:22px; border-top:2px dashed rgba(148,163,184,0.25);">
          <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:#10b981; font-weight:700; margin-bottom:8px;">
            Lösung / Antwort
          </div>
          ${backContent}
        </div>

        <div id="srs-actions" style="margin-top:28px;">
          <button id="srs-show" class="md-button md-button--primary" style="width:100%; padding:0.85em !important; font-size:0.95rem;">
            👁️ Antwort aufdecken <span style="opacity:0.75; font-weight:400; margin-left:6px;">(Leertaste)</span>
          </button>
        </div>
      `;

      if (window.MathJax) MathJax.typesetPromise([modal]);

      modal.querySelector("#srs-exit").onclick = closeSession;
      modal.querySelector("#srs-show").onclick = () => {
        isAnswerShown = true;
        modal.querySelector("#srs-back").style.display = "block";
        modal.querySelector("#srs-actions").innerHTML = `
          <div style="text-align:center; font-size:0.78rem; opacity:0.65; margin-bottom:8px;">
            Wie gut wusstest du die Antwort? (Tasten 1 – 4)
          </div>
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
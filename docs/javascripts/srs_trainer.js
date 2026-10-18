document$.subscribe(() => {
  const questionBoxes = document.querySelectorAll(
    "details.question, details.tip",
  );
  if (questionBoxes.length === 0) return;

  const STORAGE_KEY = "uni_srs_" + window.location.pathname;
  let srsData = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

  const cards = Array.from(questionBoxes).map((box, idx) => {
    const summary = box.querySelector("summary");
    const title = summary ? summary.innerHTML : "Frage " + (idx + 1);
    const clone = box.cloneNode(true);
    const s = clone.querySelector("summary");
    if (s) s.remove();
    // Falls Lückentext (<mark>), auf Vorderseite verdecken, auf Rückseite zeigen
    const bodyHtml = clone.innerHTML;
    const id = btoa(
      encodeURIComponent(title.replace(/<[^>]*>/g, "").slice(0, 40)),
    ).slice(0, 16);
    return { id, title, bodyHtml, isCloze: box.classList.contains("tip") };
  });

  const now = Date.now();
  const getDueCards = () =>
    cards.filter((c) => !srsData[c.id] || srsData[c.id].due <= Date.now());

  // Start-Button oben auf der Seite einfügen
  const article = document.querySelector(".md-content__inner");
  if (!article || document.getElementById("srs-launcher")) return;

  const launcher = document.createElement("div");
  launcher.id = "srs-launcher";
  launcher.style.cssText =
    "margin: 16px 0; padding: 14px 18px; border-radius: 10px; background: var(--theme-color-light); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;";

  const updateLauncher = () => {
    const dueCount = getDueCards().length;
    launcher.innerHTML = `
      <div>
        <strong>🧠 Interaktiver Lern-Modus (Spaced Repetition)</strong><br>
        <span style="font-size: 0.85em; opacity: 0.85;">
          ${cards.length} Karten in diesem Kapitel • <b>${dueCount} aktuell fällig</b>
        </span>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="srs-start-due" class="md-button md-button--primary" style="margin:0;">
          Fällige lernen (${dueCount})
        </button>
        <button id="srs-start-all" class="md-button" style="margin:0;">
          Alle üben (${cards.length})
        </button>
      </div>
    `;
    launcher.querySelector("#srs-start-due").onclick = () =>
      startSession(getDueCards());
    launcher.querySelector("#srs-start-all").onclick = () =>
      startSession([...cards]);
  };

  article.insertBefore(launcher, article.firstChild.nextSibling);
  updateLauncher();

  // Lern-Modal / Trainer
  function startSession(queue) {
    if (queue.length === 0) {
      alert(
        "Super! Aktuell sind keine Karten fällig. Klicke auf 'Alle üben', wenn du trotzdem wiederholen möchtest.",
      );
      return;
    }

    let currentIndex = 0;
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(15,23,42,0.8); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;";

    const modal = document.createElement("div");
    modal.style.cssText =
      "background:var(--md-default-bg-color); color:var(--md-default-fg-color); max-width:680px; width:100%; border-radius:14px; padding:24px; box-shadow:0 10px 30px rgba(0,0,0,0.3); border-top: 5px solid var(--theme-color); max-height: 90vh; overflow-y: auto;";
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function renderCard() {
      if (currentIndex >= queue.length) {
        modal.innerHTML = `
          <h3 style="margin-top:0;">🎉 Lernsession abgeschlossen!</h3>
          <p>Du hast alle ${queue.length} Karten dieser Runde durchgearbeitet. Dein Fortschritt wurde im Browser gespeichert.</p>
          <button id="srs-close" class="md-button md-button--primary">Schließen</button>
        `;
        modal.querySelector("#srs-close").onclick = () => {
          overlay.remove();
          updateLauncher();
        };
        return;
      }

      const card = queue[currentIndex];
      const frontContent = card.isCloze
        ? `<div style="font-weight:600; margin-bottom:10px;">${card.title}</div><div>${card.bodyHtml.replace(/<mark>(.*?)<\/mark>/g, "<span style='background:var(--theme-color-light); color:var(--theme-color); padding:2px 8px; border-radius:4px; font-weight:bold;'>[...]</span>")}</div>`
        : `<div style="font-size:1.15em; font-weight:600;">${card.title}</div>`;

      modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:0.8em; opacity:0.7; margin-bottom:12px;">
          <span>Karte ${currentIndex + 1} von ${queue.length}</span>
          <span style="cursor:pointer;" id="srs-exit">✕ Beenden</span>
        </div>
        <div id="srs-front">${frontContent}</div>
        <div id="srs-back" style="display:none; margin-top:18px; padding-top:18px; border-top:1px solid rgba(148,163,184,0.3);">
          ${card.bodyHtml.replace(/<mark>/g, "<strong style='color:var(--theme-color);'>").replace(/<\/mark>/g, "</strong>")}
        </div>
        <div id="srs-actions" style="margin-top:24px; text-align:center;">
          <button id="srs-show" class="md-button md-button--primary" style="width:100%;">Antwort anzeigen (Leertaste)</button>
        </div>
      `;

      if (window.MathJax) MathJax.typesetPromise([modal]);

      modal.querySelector("#srs-exit").onclick = () => {
        overlay.remove();
        updateLauncher();
      };
      modal.querySelector("#srs-show").onclick = () => {
        modal.querySelector("#srs-back").style.display = "block";
        modal.querySelector("#srs-actions").innerHTML = `
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
            <button data-q="0" class="md-button" style="background:#ef4444; color:white; border:none;">Nochmal<br><small>&lt; 10 Min</small></button>
            <button data-q="1" class="md-button" style="background:#f59e0b; color:white; border:none;">Schwer<br><small>1 Tag</small></button>
            <button data-q="2" class="md-button" style="background:#10b981; color:white; border:none;">Gut<br><small>3 Tage</small></button>
            <button data-q="3" class="md-button" style="background:#3b82f6; color:white; border:none;">Leicht<br><small>7+ Tage</small></button>
          </div>
        `;
        modal.querySelectorAll("[data-q]").forEach((btn) => {
          btn.onclick = () => rateCard(card, parseInt(btn.dataset.q));
        });
      };
    }

    function rateCard(card, quality) {
      // SM-2 inspirierter Spaced Repetition Algorithmus
      let state = srsData[card.id] || { interval: 0, ease: 2.5, reps: 0 };
      if (quality === 0) {
        state.reps = 0;
        state.interval = 0.007; // ~10 Minuten
        queue.push(card); // Karte in dieser Sitzung nochmal hinten anstellen!
      } else {
        state.reps += 1;
        if (state.reps === 1)
          state.interval = quality === 1 ? 1 : quality === 2 ? 3 : 5;
        else
          state.interval = Math.round(
            state.interval * (state.ease + (quality - 2) * 0.15),
          );
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

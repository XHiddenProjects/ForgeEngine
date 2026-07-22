"use strict";
(async () => {
  const slug = new URLSearchParams(location.search).get("game");
  const error = document.querySelector("#error");
  if (!slug) { error.textContent = "No game was selected."; return; }
  try {
    let response = await fetch(`/api/games/${encodeURIComponent(slug)}`);
    if (response.status === 401) { await fetch("/api/account/bootstrap", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); response = await fetch(`/api/games/${encodeURIComponent(slug)}`); }
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load game");
    document.querySelector("#title").textContent = body.game.config.name;
    document.querySelector("#meta").textContent = `${body.game.config.template} · ${body.game.config.slug}`;
    document.querySelector("#config").textContent = JSON.stringify(body.game.config, null, 2);
    document.querySelector("#source").textContent = body.game.files["src/main.js"];
  } catch (e) { error.textContent = e.message; }
})();

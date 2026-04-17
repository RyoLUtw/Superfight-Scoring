const STORAGE_KEY = "superfight-scoring-store-v1";
const DEFAULT_PLAYER_COUNT = 3;
const DEFAULT_SLIDER_VALUE = 5;

const appRoot = document.getElementById("app");
const modalRoot = document.getElementById("modalRoot");
const homeButton = document.getElementById("homeButton");

const store = loadStore();

homeButton.addEventListener("click", () => {
  if (store.view === "home") {
    return;
  }

  const shouldLeave = window.confirm(
    "Return to the main menu? Current progress is already saved and can be loaded again."
  );

  if (!shouldLeave) {
    return;
  }

  store.view = "home";
  persistStore();
  render();
});

window.addEventListener("beforeunload", (event) => {
  if (!hasProgressToProtect()) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});

render();

function createDefaultStore() {
  return {
    version: 1,
    view: "home",
    activeSaveId: null,
    setupDraft: createSetupDraft(DEFAULT_PLAYER_COUNT),
    fighterModal: createDefaultFighterModal(),
    scoreModal: createDefaultScoreModal(),
    opponentDraft: {
      fighterId: null,
      opponentId: null,
    },
    saves: [],
  };
}

function createSetupDraft(playerCount) {
  return {
    playerCount,
    playerNames: Array.from({ length: playerCount }, () => ""),
  };
}

function createDefaultFighterModal() {
  return {
    isOpen: false,
    character: "",
    attributeOne: "",
    attributeTwo: "",
    error: "",
  };
}

function createDefaultScoreModal() {
  return {
    isOpen: false,
    fighterId: null,
    scorerSequence: [],
    currentIndex: 0,
    offense: DEFAULT_SLIDER_VALUE,
    defense: DEFAULT_SLIDER_VALUE,
    error: "",
  };
}

function loadStore() {
  const fallback = createDefaultStore();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (error) {
    console.error("Failed to load Superfight store", error);
    return fallback;
  }
}

function normalizeStore(input) {
  const base = createDefaultStore();
  const normalized = {
    ...base,
    ...input,
    setupDraft: normalizeSetupDraft(input?.setupDraft),
    fighterModal: { ...createDefaultFighterModal(), ...(input?.fighterModal || {}) },
    scoreModal: normalizeScoreModal(input?.scoreModal),
    opponentDraft: {
      fighterId: input?.opponentDraft?.fighterId ?? null,
      opponentId: input?.opponentDraft?.opponentId ?? null,
    },
    saves: Array.isArray(input?.saves) ? input.saves.map(normalizeSave) : [],
  };

  if (!normalized.saves.some((save) => save.id === normalized.activeSaveId)) {
    normalized.activeSaveId = normalized.saves[0]?.id ?? null;
  }

  if (!["home", "setup", "game"].includes(normalized.view)) {
    normalized.view = normalized.activeSaveId ? "game" : "home";
  }

  return normalized;
}

function normalizeSetupDraft(draft) {
  const playerCount = clampNumber(draft?.playerCount ?? DEFAULT_PLAYER_COUNT, 2, 10);
  const playerNames = Array.isArray(draft?.playerNames) ? [...draft.playerNames] : [];

  while (playerNames.length < playerCount) {
    playerNames.push("");
  }

  return {
    playerCount,
    playerNames: playerNames.slice(0, playerCount),
  };
}

function normalizeScoreModal(scoreModal) {
  const base = createDefaultScoreModal();

  return {
    ...base,
    ...(scoreModal || {}),
    scorerSequence: Array.isArray(scoreModal?.scorerSequence) ? [...scoreModal.scorerSequence] : [],
    offense: clampNumber(scoreModal?.offense ?? DEFAULT_SLIDER_VALUE, 1, 10),
    defense: clampNumber(scoreModal?.defense ?? DEFAULT_SLIDER_VALUE, 1, 10),
  };
}

function normalizeSave(save) {
  const players = Array.isArray(save?.players) ? save.players.map(normalizePlayer) : [];
  const fighters = Array.isArray(save?.fighters) ? save.fighters.map(normalizeFighter) : [];
  const revealQueue = Array.isArray(save?.revealQueue) ? save.revealQueue.map(normalizeMatch) : [];
  const maxRevealIndex = revealQueue.length > 0 ? revealQueue.length - 1 : 0;

  return {
    id: save?.id ?? createId("save"),
    createdAt: save?.createdAt ?? new Date().toISOString(),
    updatedAt: save?.updatedAt ?? new Date().toISOString(),
    title: save?.title ?? buildSaveTitle(players),
    roundNumber: clampNumber(save?.roundNumber ?? 1, 1, 999),
    phase: normalizePhase(save?.phase),
    players,
    fighters,
    revealQueue,
    currentRevealIndex: clampNumber(save?.currentRevealIndex ?? 0, 0, maxRevealIndex),
  };
}

function normalizePlayer(player, index) {
  return {
    id: player?.id ?? createId(`player-${index + 1}`),
    name: (player?.name || `Player ${index + 1}`).trim() || `Player ${index + 1}`,
    victoryPoints: Number.isFinite(player?.victoryPoints) ? player.victoryPoints : 0,
  };
}

function normalizeFighter(fighter) {
  const scores = Array.isArray(fighter?.scores) ? fighter.scores.map(normalizeJudgeScore) : [];
  const averages = calculateAverages(scores);

  return {
    id: fighter?.id ?? createId("fighter"),
    ownerId: fighter?.ownerId ?? null,
    character: (fighter?.character || "").trim(),
    attributes: Array.isArray(fighter?.attributes) ? fighter.attributes.slice(0, 2) : [],
    scores,
    averages,
    opponentChoiceId: fighter?.opponentChoiceId ?? null,
  };
}

function normalizeJudgeScore(score) {
  return {
    scorerId: score?.scorerId ?? null,
    offense: clampNumber(score?.offense ?? DEFAULT_SLIDER_VALUE, 1, 10),
    defense: clampNumber(score?.defense ?? DEFAULT_SLIDER_VALUE, 1, 10),
  };
}

function normalizeMatch(match) {
  return {
    id: match?.id ?? createId("match"),
    fighterAId: match?.fighterAId ?? null,
    fighterBId: match?.fighterBId ?? null,
    mutual: Boolean(match?.mutual),
    revealed: Boolean(match?.revealed),
    result: match?.result || null,
  };
}

function normalizePhase(phase) {
  const valid = ["fighterCreation", "opponentSelection", "reveal"];
  return valid.includes(phase) ? phase : "fighterCreation";
}

function persistStore() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function getActiveSave() {
  return store.saves.find((save) => save.id === store.activeSaveId) || null;
}

function updateActiveSave(mutator) {
  const save = getActiveSave();

  if (!save) {
    return;
  }

  mutator(save);
  save.updatedAt = new Date().toISOString();
  save.title = buildSaveTitle(save.players);
  persistStore();
}

function hasProgressToProtect() {
  const hasSave = store.saves.length > 0;
  const hasDraftNames = store.setupDraft.playerNames.some((name) => name.trim());
  const hasDraftFighter =
    store.fighterModal.character.trim() ||
    store.fighterModal.attributeOne.trim() ||
    store.fighterModal.attributeTwo.trim();

  return hasSave || hasDraftNames || Boolean(hasDraftFighter);
}

function buildSaveTitle(players) {
  if (!players.length) {
    return "Untitled Superfight";
  }

  return players.map((player) => player.name).join(" vs ");
}

function calculateAverages(scores) {
  if (!scores.length) {
    return {
      offense: null,
      defense: null,
    };
  }

  const totals = scores.reduce(
    (accumulator, score) => {
      accumulator.offense += score.offense;
      accumulator.defense += score.defense;
      return accumulator;
    },
    { offense: 0, defense: 0 }
  );

  return {
    offense: Number((totals.offense / scores.length).toFixed(1)),
    defense: Number((totals.defense / scores.length).toFixed(1)),
  };
}

function getPlayerById(save, playerId) {
  return save.players.find((player) => player.id === playerId) || null;
}

function getFighterById(save, fighterId) {
  return save.fighters.find((fighter) => fighter.id === fighterId) || null;
}

function getNextCreator(save) {
  return save.players[save.fighters.length] || null;
}

function fighterScoreCount(save, fighter) {
  return fighter.scores.filter((score) => save.players.some((player) => player.id === score.scorerId)).length;
}

function isFighterScored(save, fighter) {
  return fighterScoreCount(save, fighter) === Math.max(save.players.length - 1, 0);
}

function canAdvanceToStageTwo(save) {
  return (
    save.fighters.length === save.players.length &&
    save.fighters.every((fighter) => isFighterScored(save, fighter))
  );
}

function getCurrentChooser(save) {
  return save.fighters.find((fighter) => !fighter.opponentChoiceId) || null;
}

function allOpponentsChosen(save) {
  return save.fighters.length > 0 && save.fighters.every((fighter) => fighter.opponentChoiceId);
}

function buildRevealQueue(save) {
  const matches = [];
  const seenPairs = new Set();

  save.fighters.forEach((fighter) => {
    if (!fighter.opponentChoiceId) {
      return;
    }

    const sortedKey = [fighter.id, fighter.opponentChoiceId].sort().join("::");

    if (seenPairs.has(sortedKey)) {
      return;
    }

    const opponent = getFighterById(save, fighter.opponentChoiceId);
    const mutual = Boolean(opponent && opponent.opponentChoiceId === fighter.id);

    seenPairs.add(sortedKey);
    matches.push({
      id: createId("match"),
      fighterAId: fighter.id,
      fighterBId: fighter.opponentChoiceId,
      mutual,
      revealed: false,
      result: null,
    });
  });

  return matches;
}

function compareFight(fighterA, fighterB) {
  const aBreaks = fighterA.averages.offense > fighterB.averages.defense;
  const bBreaks = fighterB.averages.offense > fighterA.averages.defense;

  if (aBreaks && bBreaks) {
    if (fighterA.averages.offense > fighterB.averages.offense) {
      return { winner: "A", aBreaks, bBreaks };
    }

    if (fighterB.averages.offense > fighterA.averages.offense) {
      return { winner: "B", aBreaks, bBreaks };
    }

    return { winner: "draw", aBreaks, bBreaks };
  }

  if (aBreaks) {
    return { winner: "A", aBreaks, bBreaks };
  }

  if (bBreaks) {
    return { winner: "B", aBreaks, bBreaks };
  }

  return { winner: "draw", aBreaks, bBreaks };
}

function revealCurrentMatch() {
  updateActiveSave((save) => {
    const match = save.revealQueue[save.currentRevealIndex];

    if (!match || match.revealed) {
      return;
    }

    const fighterA = getFighterById(save, match.fighterAId);
    const fighterB = getFighterById(save, match.fighterBId);

    if (!fighterA || !fighterB) {
      return;
    }

    const result = compareFight(fighterA, fighterB);
    match.revealed = true;
    match.result = result;

    const playerA = getPlayerById(save, fighterA.ownerId);
    const playerB = getPlayerById(save, fighterB.ownerId);

    if (!playerA || !playerB) {
      return;
    }

    if (result.winner === "A") {
      playerA.victoryPoints += 2;
      return;
    }

    if (result.winner === "B") {
      playerB.victoryPoints += 2;
      return;
    }

    playerA.victoryPoints += 1;
    playerB.victoryPoints += 1;
  });

  render();
}

function advanceRevealQueue() {
  updateActiveSave((save) => {
    const nextIndex = save.currentRevealIndex + 1;

    if (nextIndex < save.revealQueue.length) {
      save.currentRevealIndex = nextIndex;
    }
  });

  render();
}

function startNewRound() {
  const confirmed = window.confirm(
    "Start a new round? Existing victory points stay on the board, and the next round will return to fighter creation."
  );

  if (!confirmed) {
    return;
  }

  updateActiveSave((save) => {
    save.roundNumber += 1;
    save.phase = "fighterCreation";
    save.fighters = [];
    save.revealQueue = [];
    save.currentRevealIndex = 0;
  });

  store.scoreModal = createDefaultScoreModal();
  store.fighterModal = createDefaultFighterModal();
  store.opponentDraft = { fighterId: null, opponentId: null };
  store.view = "game";
  persistStore();
  render();
}

function beginNewGame() {
  const activeSave = getActiveSave();

  if (activeSave) {
    const shouldContinue = window.confirm(
      "Create a new save game? Your current game stays saved and can still be loaded later."
    );

    if (!shouldContinue) {
      return;
    }
  }

  store.view = "setup";
  persistStore();
  render();
}

function loadLastProgress() {
  if (!store.saves.length) {
    return;
  }

  const latest = [...store.saves].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  })[0];

  if (!latest) {
    return;
  }

  store.activeSaveId = latest.id;
  store.view = "game";
  persistStore();
  render();
}

function submitSetup() {
  const playerCount = clampNumber(store.setupDraft.playerCount, 2, 10);
  const names = store.setupDraft.playerNames.map((name, index) => {
    const trimmed = name.trim();
    return trimmed || `Player ${index + 1}`;
  });

  const players = names.map((name, index) => ({
    id: createId(`player-${index + 1}`),
    name,
    victoryPoints: 0,
  }));

  const save = {
    id: createId("save"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: buildSaveTitle(players),
    roundNumber: 1,
    phase: "fighterCreation",
    players,
    fighters: [],
    revealQueue: [],
    currentRevealIndex: 0,
  };

  store.saves.unshift(save);
  store.activeSaveId = save.id;
  store.view = "game";
  store.fighterModal = createDefaultFighterModal();
  store.scoreModal = createDefaultScoreModal();
  store.opponentDraft = { fighterId: null, opponentId: null };
  persistStore();
  render();
}

function openFighterModal() {
  store.fighterModal = {
    ...createDefaultFighterModal(),
    isOpen: true,
  };
  persistStore();
  render();
}

function closeFighterModal() {
  store.fighterModal = createDefaultFighterModal();
  persistStore();
  render();
}

function createFighter() {
  const save = getActiveSave();

  if (!save) {
    return;
  }

  const owner = getNextCreator(save);

  if (!owner) {
    return;
  }

  const character = store.fighterModal.character.trim();
  const attributeOne = store.fighterModal.attributeOne.trim();
  const attributeTwo = store.fighterModal.attributeTwo.trim();

  if (!character || !attributeOne || !attributeTwo) {
    store.fighterModal.error = "Enter one character and both attributes before creating the fighter.";
    persistStore();
    renderModal();
    return;
  }

  updateActiveSave((activeSave) => {
    activeSave.fighters.push({
      id: createId("fighter"),
      ownerId: owner.id,
      character,
      attributes: [attributeOne, attributeTwo],
      scores: [],
      averages: {
        offense: null,
        defense: null,
      },
      opponentChoiceId: null,
    });
  });

  store.fighterModal = createDefaultFighterModal();
  render();
}

function openScoreModal(fighterId) {
  const save = getActiveSave();
  const fighter = save ? getFighterById(save, fighterId) : null;

  if (!save || !fighter) {
    return;
  }

  const scorerSequence = save.players
    .filter((player) => player.id !== fighter.ownerId)
    .map((player) => player.id);

  const currentIndex = getNextScoreIndex(fighter, scorerSequence);
  const scorerId = scorerSequence[currentIndex] ?? scorerSequence[0] ?? null;
  const existingScore = fighter.scores.find((score) => score.scorerId === scorerId);

  store.scoreModal = {
    isOpen: true,
    fighterId,
    scorerSequence,
    currentIndex,
    offense: existingScore?.offense ?? DEFAULT_SLIDER_VALUE,
    defense: existingScore?.defense ?? DEFAULT_SLIDER_VALUE,
    error: "",
  };

  persistStore();
  render();
}

function getNextScoreIndex(fighter, scorerSequence) {
  const missingIndex = scorerSequence.findIndex((scorerId) => {
    return !fighter.scores.some((score) => score.scorerId === scorerId);
  });

  return missingIndex === -1 ? 0 : missingIndex;
}

function closeScoreModal() {
  store.scoreModal = createDefaultScoreModal();
  persistStore();
  render();
}

function submitScoreStep() {
  const save = getActiveSave();
  const fighter = save ? getFighterById(save, store.scoreModal.fighterId) : null;

  if (!save || !fighter) {
    return;
  }

  const scorerId = store.scoreModal.scorerSequence[store.scoreModal.currentIndex];

  if (!scorerId) {
    closeScoreModal();
    return;
  }

  updateActiveSave((activeSave) => {
    const targetFighter = getFighterById(activeSave, fighter.id);

    if (!targetFighter) {
      return;
    }

    const existingScore = targetFighter.scores.find((score) => score.scorerId === scorerId);

    if (existingScore) {
      existingScore.offense = clampNumber(store.scoreModal.offense, 1, 10);
      existingScore.defense = clampNumber(store.scoreModal.defense, 1, 10);
    } else {
      targetFighter.scores.push({
        scorerId,
        offense: clampNumber(store.scoreModal.offense, 1, 10),
        defense: clampNumber(store.scoreModal.defense, 1, 10),
      });
    }

    targetFighter.averages = calculateAverages(targetFighter.scores);

    if (canAdvanceToStageTwo(activeSave)) {
      activeSave.phase = "opponentSelection";
      activeSave.revealQueue = [];
      activeSave.currentRevealIndex = 0;
    }
  });

  const nextIndex = store.scoreModal.currentIndex + 1;

  if (nextIndex >= store.scoreModal.scorerSequence.length) {
    store.scoreModal = createDefaultScoreModal();
    persistStore();
    render();
    return;
  }

  const refreshedSave = getActiveSave();
  const refreshedFighter = refreshedSave ? getFighterById(refreshedSave, fighter.id) : null;
  const nextScorerId = store.scoreModal.scorerSequence[nextIndex];
  const nextExistingScore = refreshedFighter?.scores.find((score) => score.scorerId === nextScorerId);

  store.scoreModal = {
    ...store.scoreModal,
    currentIndex: nextIndex,
    offense: nextExistingScore?.offense ?? DEFAULT_SLIDER_VALUE,
    defense: nextExistingScore?.defense ?? DEFAULT_SLIDER_VALUE,
    error: "",
  };

  persistStore();
  render();
}

function selectOpponent(opponentId) {
  const save = getActiveSave();

  if (!save || save.phase !== "opponentSelection") {
    return;
  }

  const currentChooser = getCurrentChooser(save);

  if (!currentChooser) {
    return;
  }

  store.opponentDraft = {
    fighterId: currentChooser.id,
    opponentId,
  };

  persistStore();
  render();
}

function confirmOpponentChoice() {
  const save = getActiveSave();
  const currentChooser = save ? getCurrentChooser(save) : null;

  if (!save || !currentChooser) {
    return;
  }

  if (!store.opponentDraft.opponentId) {
    return;
  }

  updateActiveSave((activeSave) => {
    const targetFighter = getFighterById(activeSave, currentChooser.id);

    if (!targetFighter) {
      return;
    }

    targetFighter.opponentChoiceId = store.opponentDraft.opponentId;

    if (allOpponentsChosen(activeSave)) {
      activeSave.phase = "reveal";
      activeSave.revealQueue = buildRevealQueue(activeSave);
      activeSave.currentRevealIndex = 0;
    }
  });

  store.opponentDraft = { fighterId: null, opponentId: null };
  persistStore();
  render();
}

function updateSetupDraftCount(rawValue) {
  const playerCount = clampNumber(rawValue, 2, 10);
  const nextNames = [...store.setupDraft.playerNames];

  while (nextNames.length < playerCount) {
    nextNames.push("");
  }

  store.setupDraft.playerCount = playerCount;
  store.setupDraft.playerNames = nextNames.slice(0, playerCount);
  persistStore();
  render();
}

function updateSetupDraftName(index, value) {
  store.setupDraft.playerNames[index] = value;
  persistStore();
}

function render() {
  appRoot.innerHTML = renderView();
  renderModal();
  bindViewEvents();
}

function renderView() {
  if (store.view === "setup") {
    return renderSetupView();
  }

  if (store.view === "game" && getActiveSave()) {
    return renderGameView(getActiveSave());
  }

  return renderHomeView();
}

function renderHomeView() {
  const latestSave = [...store.saves].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  })[0];

  return `
    <section class="panel hero-panel">
      <div class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Round Flow</p>
          <h2 class="hero-title">Create fighters, judge them in secret, then reveal each showdown.</h2>
          <p>
            Every round, each player builds one fighter, the rest of the table scores that fighter's offense and defense,
            and the battle results stay hidden until match reveal time.
          </p>
          <div class="hero-actions">
            <button id="startGameButton" class="primary-button" type="button">Start Game</button>
            <button id="loadProgressButton" class="secondary-button" type="button" ${latestSave ? "" : "disabled"}>
              Load Last Progress
            </button>
          </div>
          <div class="warning-banner">
            Progress autosaves into local storage while you type. Refreshing or leaving the page also triggers the browser's
            confirmation warning.
          </div>
        </div>
        <aside class="sidebar-stack">
          <div class="stat-card">
            <span class="stat-label">Current saves</span>
            <p class="stat-value">${store.saves.length}</p>
          </div>
          <div class="stat-card">
            <span class="stat-label">Last autosave</span>
            <p class="stat-value">${latestSave ? formatDate(latestSave.updatedAt) : "None"}</p>
          </div>
          <div class="stat-card">
            <span class="stat-label">Battle cycle</span>
            <p class="stat-value">2 Stages</p>
          </div>
        </aside>
      </div>
      <div class="save-list" style="margin-top: 20px;">
        ${latestSave ? renderRecentSave(latestSave) : renderNoSaveCard()}
      </div>
    </section>
  `;
}

function renderRecentSave(save) {
  return `
    <article class="save-card">
      <span class="mini-label">Latest save</span>
      <h3 class="card-title">${escapeHtml(save.title)}</h3>
      <time datetime="${save.updatedAt}">Updated ${formatDate(save.updatedAt)}</time>
      <p class="muted-text">Round ${save.roundNumber} - ${phaseLabel(save.phase)} - ${save.players.length} players</p>
    </article>
  `;
}

function renderNoSaveCard() {
  return `
    <article class="save-card">
      <span class="mini-label">No save yet</span>
      <h3 class="card-title">Start the first battle</h3>
      <p class="muted-text">Set the player count, name the players, and the app will create a dedicated save file in local storage.</p>
    </article>
  `;
}

function renderSetupView() {
  const playerInputs = store.setupDraft.playerNames
    .map((name, index) => {
      return `
        <div class="field-group">
          <label for="player-name-${index}">Player ${index + 1}</label>
          <input
            id="player-name-${index}"
            type="text"
            name="player-name"
            data-player-index="${index}"
            value="${escapeAttribute(name)}"
            autocomplete="off"
          />
        </div>
      `;
    })
    .join("");

  return `
    <section class="panel setup-panel">
      <div class="setup-grid">
        <div class="setup-copy">
          <p class="eyebrow">Game Setup</p>
          <h2 class="section-title">Choose the table size and name every player.</h2>
          <p>
            Submitting this form creates a new save game. Future rounds stay inside that same save, so the running victory
            points can keep stacking.
          </p>
          <div class="field-group" style="max-width: 180px;">
            <label for="playerCountInput">Player count</label>
            <input id="playerCountInput" type="number" min="2" max="10" value="${store.setupDraft.playerCount}" />
          </div>
          <div class="player-name-grid" style="margin-top: 18px;">
            ${playerInputs}
          </div>
          <div class="inline-actions" style="margin-top: 24px;">
            <button id="createSaveButton" class="primary-button" type="button">Create Save Game</button>
            <button id="cancelSetupButton" class="ghost-button" type="button">Back to Menu</button>
          </div>
        </div>
        <aside class="setup-stats">
          <article class="info-card">
            <span class="mini-label">Save behavior</span>
            <h3 class="card-title">Autosave always on</h3>
            <p class="muted-text">Names, fighter drafts, score sliders, opponent picks, and reveal progress are written into local storage.</p>
          </article>
          <article class="info-card">
            <span class="mini-label">Round rule</span>
            <h3 class="card-title">One fighter per player</h3>
            <p class="muted-text">Stage 2 begins only after the table has one fully scored fighter for each player.</p>
          </article>
          <article class="info-card">
            <span class="mini-label">Refresh guard</span>
            <h3 class="card-title">Browser warning enabled</h3>
            <p class="muted-text">Refreshing or closing the page triggers the browser confirmation dialog while data is present.</p>
          </article>
        </aside>
      </div>
    </section>
  `;
}

function renderGameView(save) {
  const leaderboard = rankPlayers(save.players);
  const phaseIndex = save.phase === "fighterCreation" ? 1 : save.phase === "opponentSelection" ? 2 : 3;
  const stepIndicator = renderStepIndicator(save, phaseIndex);

  if (save.phase === "fighterCreation") {
    return `
      <div class="game-grid streamlined-grid">
        ${stepIndicator}
        ${renderFighterCreationView(save)}
      </div>
    `;
  }

  if (save.phase === "opponentSelection") {
    return `
      <div class="game-grid streamlined-grid">
        ${stepIndicator}
        ${renderOpponentSelectionView(save)}
      </div>
    `;
  }

  return `
    <div class="reveal-grid streamlined-grid">
      ${stepIndicator}
      ${renderRevealView(save, leaderboard)}
    </div>
  `;
}

function renderStepIndicator(save, phaseIndex) {
  const phaseLabelText =
    save.phase === "fighterCreation"
      ? "Create + score fighters"
      : save.phase === "opponentSelection"
        ? "Pick opponents"
        : "Reveal battles";

  return `
    <section class="panel prompt-card step-indicator">
      <div class="fighter-headline">
        <div>
          <span class="mini-label">Round ${save.roundNumber}</span>
          <h3 class="card-title">Step ${phaseIndex} of 3: ${phaseLabelText}</h3>
        </div>
        <span class="tag">${save.players.length} players</span>
      </div>
      <p class="muted-text">Only actions for the current step are shown below.</p>
    </section>
  `;
}

function renderFighterCreationView(save) {
  const nextCreator = getNextCreator(save);
  const fighterCards = save.fighters.length
    ? save.fighters.map((fighter) => renderFighterCard(save, fighter)).join("")
    : `<div class="empty-state">No fighters yet. Use the + button to let ${escapeHtml(nextCreator?.name || "the next player")} build the next combatant.</div>`;

  return `
      <section class="panel stage-panel">
        <div class="stage-header">
          <div>
            <p class="eyebrow">Stage 1</p>
            <h2 class="section-title">Fighter creation and secret scoring</h2>
            <p class="stage-subtitle">
              Round ${save.roundNumber}. ${nextCreator ? `${escapeHtml(nextCreator.name)} is up to create the next fighter.` : "All fighters are created."}
            </p>
          </div>
          <button id="openFighterModalButton" class="icon-button" type="button" aria-label="Add fighter" ${nextCreator ? "" : "disabled"}>+</button>
        </div>
        <div class="stage-banner ${canAdvanceToStageTwo(save) ? "success" : ""}">
          ${save.fighters.length} / ${save.players.length} fighters created ·
          ${save.fighters.filter((fighter) => isFighterScored(save, fighter)).length} fully scored
        </div>
        <div class="fighter-list" style="margin-top: 20px;">
          ${fighterCards}
        </div>
      </section>
  `;
}

function renderFighterCard(save, fighter) {
  const owner = getPlayerById(save, fighter.ownerId);
  const scoredCount = fighterScoreCount(save, fighter);
  const neededScores = Math.max(save.players.length - 1, 0);
  const scored = isFighterScored(save, fighter);

  return `
    <article class="fighter-card">
      <div class="fighter-headline">
        <div>
          <span class="mini-label">Created by ${escapeHtml(owner?.name || "Unknown")}</span>
          <h3 class="fighter-name">${escapeHtml(fighter.character)}</h3>
        </div>
        <span class="status-pill ${scored ? "ready" : "pending"}">
          ${scored ? "Scored" : `${scoredCount}/${neededScores} judges`}
        </span>
      </div>
      <div class="fighter-attrs">
        ${fighter.attributes.map((attribute) => `<span class="pill">${escapeHtml(attribute)}</span>`).join("")}
      </div>
      <div class="fighter-meta">
        <button class="secondary-button" type="button" data-score-fighter-id="${fighter.id}">
          ${scored ? "Review Scoring" : "Score Fighter"}
        </button>
        <span class="hidden-text">
          ${scored ? "Average locked until reveal." : "Hidden average appears only during match reveal."}
        </span>
      </div>
    </article>
  `;
}

function renderLeaderboardPanel(leaderboard) {
  return `
    <section class="leaderboard-panel panel">
      <div class="leaderboard-header">
        <div>
          <p class="eyebrow">Victory Points</p>
          <h3 class="section-title">Leaderboard</h3>
        </div>
      </div>
      <div class="leaderboard-stack">
        ${leaderboard
          .map((entry, index) => {
            return `
              <div class="leaderboard-row">
                <div class="fighter-meta">
                  <span class="leaderboard-rank">${index + 1}</span>
                  <div>
                    <strong>${escapeHtml(entry.name)}</strong>
                    <div class="muted-text">Ready for the next reveal</div>
                  </div>
                </div>
                <div class="leaderboard-score">${entry.victoryPoints}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderOpponentSelectionView(save) {
  const chooser = getCurrentChooser(save);
  const chooserOwner = chooser ? getPlayerById(save, chooser.ownerId) : null;
  const availableOpponents = chooser ? save.fighters.filter((fighter) => fighter.id !== chooser.id) : [];
  const selectedOpponentId = store.opponentDraft.fighterId === chooser?.id ? store.opponentDraft.opponentId : null;

  return `
      <section class="panel stage-panel">
        <div class="stage-header">
          <div>
            <p class="eyebrow">Stage 2</p>
            <h2 class="section-title">Choose opponents</h2>
            <p class="stage-subtitle">
              ${
                chooser
                  ? `${escapeHtml(chooser.character)} (${escapeHtml(chooserOwner?.name || "Unknown")}) is choosing an opponent.`
                  : "All opponent picks are locked."
              }
            </p>
          </div>
          <span class="tag">${save.fighters.filter((fighter) => fighter.opponentChoiceId).length} / ${save.fighters.length}</span>
        </div>
        <div class="prompt-card">
          <span class="mini-label">Current prompt</span>
          <h3 class="card-title">${escapeHtml(chooser?.character || "Ready")}</h3>
          <p class="muted-text">
            Choose from every other fighter. Mutual picks collapse into one revealed match, but a fighter can still appear in more than one matchup if different challengers pick them.
          </p>
        </div>
        <div class="opponent-options" style="margin-top: 20px;">
          ${availableOpponents
            .map((fighter) => {
              const owner = getPlayerById(save, fighter.ownerId);
              const selected = fighter.id === selectedOpponentId;

              return `
                <button class="choice-button ${selected ? "is-selected" : ""}" type="button" data-opponent-id="${fighter.id}">
                  ${escapeHtml(fighter.character)} - ${escapeHtml(owner?.name || "Unknown")}
                </button>
              `;
            })
            .join("")}
        </div>
        <div class="inline-actions" style="margin-top: 20px;">
          <button id="confirmOpponentButton" class="primary-button" type="button" ${selectedOpponentId ? "" : "disabled"}>
            Confirm Opponent
          </button>
        </div>
      </section>
  `;
}

function renderRevealView(save, leaderboard) {
  const currentMatch = save.revealQueue[save.currentRevealIndex] || null;
  const fighterA = currentMatch ? getFighterById(save, currentMatch.fighterAId) : null;
  const fighterB = currentMatch ? getFighterById(save, currentMatch.fighterBId) : null;
  const allRevealed = save.revealQueue.length > 0 && save.revealQueue.every((match) => match.revealed);
  return `
      <section class="panel match-panel">
        <div class="match-header">
          <div>
            <p class="eyebrow">Fight Reveal</p>
            <h2 class="section-title">${
              currentMatch ? `Match ${save.currentRevealIndex + 1} of ${save.revealQueue.length}` : "No matches queued"
            }</h2>
            <p class="stage-subtitle">
              ${
                currentMatch
                  ? `${escapeHtml(fighterA?.character || "Unknown")} vs ${escapeHtml(fighterB?.character || "Unknown")}`
                  : "Finish opponent selection to generate reveal cards."
              }
            </p>
          </div>
          <span class="tag">Round ${save.roundNumber}</span>
        </div>
        ${
          currentMatch && fighterA && fighterB
            ? renderMatchBody(save, currentMatch, fighterA, fighterB)
            : `<div class="empty-state">No reveal data is available yet.</div>`
        }
      </section>
      ${allRevealed ? renderRevealSidebar(save, leaderboard, allRevealed) : ""}
  `;
}

function renderRevealSidebar(save, leaderboard, allRevealed) {
  return `
    <aside class="panel sidebar-panel">
      <div class="sidebar-header">
        <div>
          <p class="eyebrow">Round Summary</p>
          <h2 class="section-title">${escapeHtml(save.title)}</h2>
        </div>
        <span class="tag">Round ${save.roundNumber}</span>
      </div>
      <div class="sidebar-stack">
        <article class="prompt-card">
          <span class="mini-label">Save overview</span>
          <div class="leaderboard-list" style="margin-top: 12px;">
            ${save.players
              .map((player) => `<div>${escapeHtml(player.name)} <span class="muted-text">- ${player.victoryPoints} VP</span></div>`)
              .join("")}
          </div>
        </article>
        ${renderLeaderboardPanel(leaderboard)}
        <article class="prompt-card">
          <span class="mini-label">Reveal queue</span>
          <div class="leaderboard-list" style="margin-top: 12px;">
            ${save.revealQueue
              .map((match, index) => {
                const left = getFighterById(save, match.fighterAId);
                const right = getFighterById(save, match.fighterBId);
                return `
                  <div>
                    <strong>${index + 1}. ${escapeHtml(left?.character || "Unknown")} vs ${escapeHtml(right?.character || "Unknown")}</strong>
                    <div class="muted-text">${match.revealed ? "Revealed" : "Waiting"}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </article>
        ${
          allRevealed
            ? `
              <article class="prompt-card">
                <span class="mini-label">Round complete</span>
                <h3 class="card-title">Start the next round</h3>
                <p class="muted-text">Victory points stay on the board, while fighters and matchups reset for round ${save.roundNumber + 1}.</p>
              </article>
            `
            : ""
        }
      </div>
    </aside>
  `;
}

function renderMatchBody(save, match, fighterA, fighterB) {
  const ownerA = getPlayerById(save, fighterA.ownerId);
  const ownerB = getPlayerById(save, fighterB.ownerId);

  if (!match.revealed) {
    return `
      <div class="match-stack">
        <div class="prompt-card">
          <span class="mini-label">Hidden until reveal</span>
          <h3 class="card-title">${escapeHtml(fighterA.character)} vs ${escapeHtml(fighterB.character)}</h3>
          <p class="muted-text">
            Both fighters already have averaged scores, but the numbers stay concealed until you reveal this matchup.
          </p>
        </div>
        <div class="match-actions">
          <button id="revealMatchButton" class="primary-button" type="button">Reveal Fight Result</button>
        </div>
      </div>
    `;
  }

  const result = match.result;
  const winnerLabel =
    result.winner === "A"
      ? `${fighterA.character} wins`
      : result.winner === "B"
        ? `${fighterB.character} wins`
        : "Draw";

  return `
    <div class="result-stack">
      <div class="match-score-grid">
        <article class="score-card">
          <span class="mini-label">${escapeHtml(ownerA?.name || "Unknown")}</span>
          <h4>${escapeHtml(fighterA.character)}</h4>
          <div class="score-metric"><span>Offense</span><strong>${fighterA.averages.offense}</strong></div>
          <div class="score-metric"><span>Defense</span><strong>${fighterA.averages.defense}</strong></div>
        </article>
        <article class="score-card">
          <span class="mini-label">${escapeHtml(ownerB?.name || "Unknown")}</span>
          <h4>${escapeHtml(fighterB.character)}</h4>
          <div class="score-metric"><span>Offense</span><strong>${fighterB.averages.offense}</strong></div>
          <div class="score-metric"><span>Defense</span><strong>${fighterB.averages.defense}</strong></div>
        </article>
      </div>
      <div class="result-banner success">
        <strong>${escapeHtml(winnerLabel)}</strong>
        <div class="result-copy">${renderResultExplanation(fighterA, fighterB, result)}</div>
      </div>
      <div class="result-banner">
        ${
          result.winner === "A"
            ? `${escapeHtml(ownerA?.name || "Unknown")} gains 2 victory points. ${escapeHtml(ownerB?.name || "Unknown")} gains 0.`
            : result.winner === "B"
              ? `${escapeHtml(ownerB?.name || "Unknown")} gains 2 victory points. ${escapeHtml(ownerA?.name || "Unknown")} gains 0.`
              : `${escapeHtml(ownerA?.name || "Unknown")} and ${escapeHtml(ownerB?.name || "Unknown")} gain 1 victory point each.`
        }
      </div>
      <div class="result-actions">
        ${
          save.currentRevealIndex < save.revealQueue.length - 1
            ? `<button id="nextRevealButton" class="primary-button" type="button">Next Match</button>`
            : `<button id="startNewRoundButton" class="primary-button" type="button">Start New Round</button>`
        }
      </div>
    </div>
  `;
}

function renderResultExplanation(fighterA, fighterB, result) {
  const lineOne = `${fighterA.character} offense ${fighterA.averages.offense} vs ${fighterB.character} defense ${fighterB.averages.defense}.`;
  const lineTwo = `${fighterB.character} offense ${fighterB.averages.offense} vs ${fighterA.character} defense ${fighterA.averages.defense}.`;

  if (result.winner === "draw") {
    if (!result.aBreaks && !result.bBreaks) {
      return `${lineOne} ${lineTwo} Neither fighter breaks the other defense, so the fight ends in a draw.`;
    }

    return `${lineOne} ${lineTwo} Both fighters break through, but the offense averages are tied, so the fight ends in a draw.`;
  }

  if (result.aBreaks && result.bBreaks) {
    return `${lineOne} ${lineTwo} Both fighters beat the opposing defense, so the higher offense average decides the winner.`;
  }

  return `${lineOne} ${lineTwo} Only the winner breaks the opposing defense, so the match ends immediately.`;
}

function renderModal() {
  if (store.fighterModal.isOpen) {
    modalRoot.innerHTML = renderFighterModal();
    bindFighterModalEvents();
    return;
  }

  if (store.scoreModal.isOpen) {
    modalRoot.innerHTML = renderScoreModal();
    bindScoreModalEvents();
    return;
  }

  modalRoot.innerHTML = "";
}

function renderFighterModal() {
  const save = getActiveSave();
  const creator = save ? getNextCreator(save) : null;

  return `
    <div class="modal-overlay">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="fighter-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">New Fighter</p>
            <h2 id="fighter-modal-title" class="modal-title">Create ${escapeHtml(creator?.name || "the next player's")} fighter</h2>
            <p class="modal-copy">Enter one character card and exactly two attribute cards before the fighter joins the round.</p>
          </div>
          <button class="close-button" id="closeFighterModalButton" type="button" aria-label="Close modal">X</button>
        </div>
        <div class="form-grid">
          <div class="field-group">
            <label for="fighterCharacterInput">Character</label>
            <input id="fighterCharacterInput" type="text" value="${escapeAttribute(store.fighterModal.character)}" autocomplete="off" />
          </div>
          <div class="field-group">
            <label for="fighterAttributeOneInput">Attribute 1</label>
            <input id="fighterAttributeOneInput" type="text" value="${escapeAttribute(store.fighterModal.attributeOne)}" autocomplete="off" />
          </div>
          <div class="field-group">
            <label for="fighterAttributeTwoInput">Attribute 2</label>
            <input id="fighterAttributeTwoInput" type="text" value="${escapeAttribute(store.fighterModal.attributeTwo)}" autocomplete="off" />
          </div>
        </div>
        <p class="error-text">${escapeHtml(store.fighterModal.error)}</p>
        <div class="modal-actions">
          <button id="createFighterButton" class="primary-button" type="button">Create</button>
          <button id="cancelFighterModalButton" class="ghost-button" type="button">Cancel</button>
        </div>
      </section>
    </div>
  `;
}

function renderScoreModal() {
  const save = getActiveSave();
  const fighter = save ? getFighterById(save, store.scoreModal.fighterId) : null;
  const scorerId = store.scoreModal.scorerSequence[store.scoreModal.currentIndex];
  const scorer = save ? getPlayerById(save, scorerId) : null;
  const nextScorerId = store.scoreModal.scorerSequence[store.scoreModal.currentIndex + 1];
  const nextScorer = save ? getPlayerById(save, nextScorerId) : null;
  const submitLabel = nextScorer ? `Next Player: ${nextScorer.name}` : "Finish Scoring";

  return `
    <div class="modal-overlay">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="score-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Battle Scoring</p>
            <h2 id="score-modal-title" class="modal-title">${escapeHtml(fighter?.character || "Unknown fighter")}</h2>
            <p class="modal-copy">
              ${escapeHtml(scorer?.name || "Judge")} is scoring offense and defense. Scores stay hidden until fight reveal.
            </p>
          </div>
          <button class="close-button" id="closeScoreModalButton" type="button" aria-label="Close modal">X</button>
        </div>
        <div class="score-block">
          <label>Offense</label>
          <div class="slider-shell">
            <div class="slider-row">
              <button class="slider-step" type="button" data-score-target="offense" data-score-delta="-1">-</button>
              <input id="offenseSlider" class="slider-input" type="range" min="1" max="10" value="${store.scoreModal.offense}" />
              <button class="slider-step" type="button" data-score-target="offense" data-score-delta="1">+</button>
              <span class="slider-value" id="offenseValue">${store.scoreModal.offense}</span>
            </div>
          </div>
        </div>
        <div class="score-block" style="margin-top: 18px;">
          <label>Defense</label>
          <div class="slider-shell">
            <div class="slider-row">
              <button class="slider-step" type="button" data-score-target="defense" data-score-delta="-1">-</button>
              <input id="defenseSlider" class="slider-input" type="range" min="1" max="10" value="${store.scoreModal.defense}" />
              <button class="slider-step" type="button" data-score-target="defense" data-score-delta="1">+</button>
              <span class="slider-value" id="defenseValue">${store.scoreModal.defense}</span>
            </div>
          </div>
        </div>
        <p class="error-text">${escapeHtml(store.scoreModal.error)}</p>
        <div class="modal-actions">
          <button id="submitScoreButton" class="primary-button" type="button">${escapeHtml(submitLabel)}</button>
          <button id="cancelScoreModalButton" class="ghost-button" type="button">Cancel</button>
        </div>
      </section>
    </div>
  `;
}

function bindViewEvents() {
  const startGameButton = document.getElementById("startGameButton");
  const loadProgressButton = document.getElementById("loadProgressButton");
  const createSaveButton = document.getElementById("createSaveButton");
  const cancelSetupButton = document.getElementById("cancelSetupButton");
  const openFighterModalButton = document.getElementById("openFighterModalButton");
  const confirmOpponentButton = document.getElementById("confirmOpponentButton");
  const revealMatchButton = document.getElementById("revealMatchButton");
  const nextRevealButton = document.getElementById("nextRevealButton");
  const startNewRoundButton = document.getElementById("startNewRoundButton");
  const playerCountInput = document.getElementById("playerCountInput");

  startGameButton?.addEventListener("click", beginNewGame);
  loadProgressButton?.addEventListener("click", loadLastProgress);
  createSaveButton?.addEventListener("click", submitSetup);
  cancelSetupButton?.addEventListener("click", () => {
    store.view = "home";
    persistStore();
    render();
  });
  openFighterModalButton?.addEventListener("click", openFighterModal);
  confirmOpponentButton?.addEventListener("click", confirmOpponentChoice);
  revealMatchButton?.addEventListener("click", revealCurrentMatch);
  nextRevealButton?.addEventListener("click", advanceRevealQueue);
  startNewRoundButton?.addEventListener("click", startNewRound);

  playerCountInput?.addEventListener("input", (event) => {
    updateSetupDraftCount(event.target.value);
  });

  document.querySelectorAll("input[name='player-name']").forEach((input) => {
    input.addEventListener("input", (event) => {
      updateSetupDraftName(Number(event.target.dataset.playerIndex), event.target.value);
    });
  });

  document.querySelectorAll("[data-score-fighter-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openScoreModal(button.dataset.scoreFighterId);
    });
  });

  document.querySelectorAll("[data-opponent-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectOpponent(button.dataset.opponentId);
    });
  });
}

function bindFighterModalEvents() {
  const characterInput = document.getElementById("fighterCharacterInput");
  const attributeOneInput = document.getElementById("fighterAttributeOneInput");
  const attributeTwoInput = document.getElementById("fighterAttributeTwoInput");
  const createButton = document.getElementById("createFighterButton");
  const cancelButton = document.getElementById("cancelFighterModalButton");
  const closeButton = document.getElementById("closeFighterModalButton");

  characterInput?.addEventListener("input", (event) => {
    store.fighterModal.character = event.target.value;
    store.fighterModal.error = "";
    persistStore();
  });

  attributeOneInput?.addEventListener("input", (event) => {
    store.fighterModal.attributeOne = event.target.value;
    store.fighterModal.error = "";
    persistStore();
  });

  attributeTwoInput?.addEventListener("input", (event) => {
    store.fighterModal.attributeTwo = event.target.value;
    store.fighterModal.error = "";
    persistStore();
  });

  createButton?.addEventListener("click", createFighter);
  cancelButton?.addEventListener("click", closeFighterModal);
  closeButton?.addEventListener("click", closeFighterModal);
}

function bindScoreModalEvents() {
  const offenseSlider = document.getElementById("offenseSlider");
  const defenseSlider = document.getElementById("defenseSlider");
  const offenseValue = document.getElementById("offenseValue");
  const defenseValue = document.getElementById("defenseValue");
  const submitButton = document.getElementById("submitScoreButton");
  const cancelButton = document.getElementById("cancelScoreModalButton");
  const closeButton = document.getElementById("closeScoreModalButton");

  function syncScoreDisplay(target, value) {
    const nextValue = clampNumber(value, 1, 10);
    store.scoreModal[target] = nextValue;
    store.scoreModal.error = "";
    persistStore();

    if (target === "offense") {
      offenseSlider.value = String(nextValue);
      offenseValue.textContent = String(nextValue);
      return;
    }

    defenseSlider.value = String(nextValue);
    defenseValue.textContent = String(nextValue);
  }

  offenseSlider?.addEventListener("input", (event) => {
    syncScoreDisplay("offense", event.target.value);
  });

  defenseSlider?.addEventListener("input", (event) => {
    syncScoreDisplay("defense", event.target.value);
  });

  document.querySelectorAll("[data-score-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.scoreTarget;
      const delta = Number(button.dataset.scoreDelta);
      syncScoreDisplay(target, store.scoreModal[target] + delta);
    });
  });

  submitButton?.addEventListener("click", submitScoreStep);
  cancelButton?.addEventListener("click", closeScoreModal);
  closeButton?.addEventListener("click", closeScoreModal);
}

function rankPlayers(players) {
  return [...players].sort((left, right) => {
    if (right.victoryPoints !== left.victoryPoints) {
      return right.victoryPoints - left.victoryPoints;
    }

    return left.name.localeCompare(right.name);
  });
}

function phaseLabel(phase) {
  if (phase === "fighterCreation") {
    return "Stage 1";
  }

  if (phase === "opponentSelection") {
    return "Choosing opponents";
  }

  return "Fight reveals";
}

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleString();
  } catch (error) {
    return isoString;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

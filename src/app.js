const STORAGE_KEY = "jmo-ancestry-family-data";
const VIEW_STATE_KEY = "jmo-ancestry-view-state";
const COMPACT_BREAKPOINT = 1180;

const state = {
  data: null,
  hasStoredData: false,
  selectedId: null,
  rootId: null,
  collapseCollateral: true,
  expandedAncestors: new Set(),
  expandedSiblings: new Set(),
  expandedChildren: new Set(),
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  peopleCollapsed: false,
  profileCollapsed: false,
  sourcesExpanded: false,
  notesExpanded: false,
  peopleById: new Map(),
  relationshipIndex: null,
  searchIndex: null,
  cachedPeople: null,
};

const NODE = {
  width: 214,
  height: 76,
  photoSize: 44,
  portraitX: -72,
  textX: 28,
};

const NODE_HALF_WIDTH = NODE.width / 2;
const NODE_HALF_HEIGHT = NODE.height / 2;
let storeRequestId = 0;

// The tree has grown a lot of invisible interactions (double-click refocus,
// shift-click reveal-all, arrow-key walking, Enter match cycling); this list
// feeds the Tips popover so they are discoverable without reading commits.
const HELP_TIPS = [
  {
    area: "Tree",
    tips: [
      { keys: ["Click"], does: "Open a person's profile and keep their line to the tree focus lit" },
      { keys: ["Double-click"], does: "Make that person the tree focus" },
      { keys: ["Drag / scroll"], does: "Pan and zoom the tree (pinch on touch)" },
      { keys: ["Hover"], does: "Trace that person's connectors and their line back to the tree focus" },
      { keys: ["Shift", "click"], does: "On a “Show parents” pill with more generations above: reveal the whole branch at once" },
      { keys: ["Stripe"], does: "The colored edge on ancestor cards marks which parent's branch they hang from — the legend names each side" },
    ],
  },
  {
    area: "Keyboard",
    tips: [
      { keys: ["Tab"], does: "Focus a tree card without the mouse" },
      { keys: ["↑", "↓", "←", "→"], does: "Walk from a focused card to parents, children, and along the generation row" },
      { keys: ["Enter"], does: "Open the focused card's profile" },
      { keys: ["Shift", "Enter"], does: "Make the focused card the tree focus" },
      { keys: ["+", "−"], does: "Zoom the tree in and out (same as the corner buttons)" },
      { keys: ["?"], does: "Open or close these tips" },
    ],
  },
  {
    area: "Profile",
    tips: [
      { keys: ["Click photo"], does: "View it full size; ← → cycle a multi-photo profile, Esc closes" },
      { keys: ["⌘", "P"], does: "Print (or save as PDF) the open profile as a clean document — story, timeline, relationships, and sources" },
    ],
  },
  {
    area: "Search",
    tips: [
      { keys: ["Enter"], does: "Jump to the best match; press again to cycle through the rest" },
      { keys: ["Esc"], does: "Clear the search and restore the tree" },
    ],
  },
];

const els = {
  search: document.querySelector("#person-search"),
  list: document.querySelector("#person-list"),
  loadJson: document.querySelector("#load-json"),
  clearData: document.querySelector("#clear-data"),
  importJson: document.querySelector("#import-json"),
  focusDirect: document.querySelector("#focus-direct"),
  legendBranches: document.querySelector("#legend-branches"),
  fit: document.querySelector("#fit-tree"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  collapseBranches: document.querySelector("#collapse-branches"),
  exportJson: document.querySelector("#export-json"),
  title: document.querySelector("#tree-title"),
  treeSubtitle: document.querySelector("#tree-subtitle"),
  count: document.querySelector("#tree-count"),
  treeFocusName: document.querySelector("#tree-focus-name"),
  selectedName: document.querySelector("#selected-name"),
  selectedContext: document.querySelector("#selected-context"),
  viewport: document.querySelector("#tree-viewport"),
  svg: document.querySelector("#tree-svg"),
  workspaceTitle: document.querySelector("#workspace-title"),
  workspaceMeta: document.querySelector("#workspace-meta"),
  peopleSummary: document.querySelector("#people-summary"),
  detailName: document.querySelector("#detail-name"),
  detailContext: document.querySelector("#detail-context"),
  detailPath: document.querySelector("#detail-path"),
  detailMeta: document.querySelector("#detail-meta"),
  detailPhoto: document.querySelector("#detail-photo"),
  detailStory: document.querySelector("#detail-story"),
  detailFacts: document.querySelector("#detail-facts"),
  detailEvidence: document.querySelector("#detail-evidence"),
  detailTimeline: document.querySelector("#detail-timeline"),
  detailNotes: document.querySelector("#detail-notes"),
  detailRelations: document.querySelector("#detail-relations"),
  detailSources: document.querySelector("#detail-sources"),
  relationsHeading: document.querySelector("#relations-heading"),
  sourcesHeading: document.querySelector("#sources-heading"),
  sourcesPanel: document.querySelector("#sources-panel"),
  toggleSources: document.querySelector("#toggle-sources"),
  dataStatus: document.querySelector("#data-status"),
  centerPerson: document.querySelector("#center-person"),
  homePerson: document.querySelector("#home-person"),
  copyLink: document.querySelector("#copy-link"),
  togglePeople: document.querySelector("#toggle-people"),
  toggleProfile: document.querySelector("#toggle-profile"),
  closeProfile: document.querySelector("#close-profile"),
  dropOverlay: document.querySelector("#drop-overlay"),
  treeHelp: document.querySelector("#tree-help"),
  helpOverlay: document.querySelector("#help-overlay"),
  helpClose: document.querySelector("#help-close"),
  helpBody: document.querySelector("#help-body"),
  photoLightbox: document.querySelector("#photo-lightbox"),
  photoLightboxImage: document.querySelector("#photo-lightbox-image"),
  photoLightboxCaption: document.querySelector("#photo-lightbox-caption"),
  photoLightboxClose: document.querySelector("#photo-lightbox-close"),
  detailsShell: document.querySelector(".details-shell"),
};

async function init() {
  const stored = loadStoredData();
  if (stored) {
    state.data = stored;
    state.hasStoredData = true;
  } else {
    state.data = await fetchSampleData();
  }
  state.selectedId = state.data.meta?.defaultPersonId || state.data.people[0]?.id;
  state.rootId = state.selectedId;
  const hashId = personIdFromHash();
  if (hashId) {
    state.selectedId = hashId;
    state.rootId = hashId;
  }
  // Anchor the starting person in the URL (no history entry) so the first
  // Back press after browsing returns here instead of doing nothing.
  syncHash();
  restoreViewState();

  window.addEventListener("hashchange", () => {
    const id = personIdFromHash();
    if (id && id !== state.selectedId) selectPerson(id, false, true);
  });

  els.search.addEventListener("input", () => {
    renderPeople();
    renderTree();
  });
  els.search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const term = els.search.value.trim().toLowerCase();
      if (!term) return;
      const next = nextSearchMatch(searchMatches(term), state.selectedId);
      if (next) selectPerson(next.id, false, true);
    } else if (event.key === "Escape" && els.search.value) {
      event.stopPropagation();
      els.search.value = "";
      renderPeople();
      renderTree();
    }
  });
  els.loadJson.addEventListener("click", () => els.importJson.click());
  els.importJson.addEventListener("change", importData);
  els.clearData.addEventListener("click", forgetStoredData);
  els.focusDirect.addEventListener("click", () => {
    state.collapseCollateral = !state.collapseCollateral;
    if (state.collapseCollateral) {
      state.rootId = state.selectedId;
      resetExpandedAncestors();
    }
    saveViewState();
    fitTree({ renderNow: false });
    render();
  });
  els.fit.addEventListener("click", fitTree);
  for (const button of [els.zoomIn, els.zoomOut]) {
    // Keep presses on the buttons from starting a viewport pan underneath.
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
  }
  els.zoomIn.addEventListener("click", () => zoomStep(1));
  els.zoomOut.addEventListener("click", () => zoomStep(-1));
  els.collapseBranches.addEventListener("click", () => {
    resetExpandedAncestors();
    fitTree();
    render();
  });
  els.exportJson.addEventListener("click", exportData);
  els.centerPerson.addEventListener("click", () => {
    state.rootId = state.selectedId;
    resetExpandedAncestors();
    fitTree({ renderNow: false });
    render();
  });
  els.homePerson.addEventListener("click", () => {
    state.selectedId = state.data.meta?.defaultPersonId || state.data.people[0]?.id;
    state.rootId = state.selectedId;
    syncHash(true);
    resetExpandedAncestors();
    fitTree({ renderNow: false });
    render();
  });
  els.copyLink.addEventListener("click", async () => {
    if (!state.selectedId) return;
    showCopyLinkFeedback(await copyText(personLink(state.selectedId)));
  });
  els.togglePeople.addEventListener("click", () => {
    state.peopleCollapsed = !state.peopleCollapsed;
    if (isCompactViewport() && !state.peopleCollapsed) state.profileCollapsed = true;
    syncPanelState();
    fitTreeAfterLayout();
  });
  els.toggleProfile.addEventListener("click", () => {
    state.profileCollapsed = !state.profileCollapsed;
    if (isCompactViewport() && !state.profileCollapsed) state.peopleCollapsed = true;
    syncPanelState();
    fitTreeAfterLayout();
  });
  els.closeProfile.addEventListener("click", () => {
    state.profileCollapsed = true;
    syncPanelState();
  });
  els.toggleSources.addEventListener("click", () => {
    state.sourcesExpanded = !state.sourcesExpanded;
    els.sourcesPanel.hidden = !state.sourcesExpanded;
    els.toggleSources.setAttribute("aria-expanded", String(state.sourcesExpanded));
    if (state.sourcesExpanded) els.sourcesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.viewport.addEventListener("wheel", onZoom, { passive: false });
  enableDrag();
  enableDropImport();
  enableHelpOverlay();
  enablePhotoLightbox();
  window.addEventListener("resize", fitTreeAfterLayout);

  // Expand long research notes when printing so the full text appears in
  // the PDF rather than the 480-char preview. Restore the previous state
  // after the print dialog closes.
  let printNotesWasExpanded = false;
  window.addEventListener("beforeprint", () => {
    printNotesWasExpanded = state.notesExpanded;
    if (!state.notesExpanded) {
      state.notesExpanded = true;
      const person = personById(state.selectedId);
      if (person) renderNotes(person);
    }
  });
  window.addEventListener("afterprint", () => {
    if (!printNotesWasExpanded) {
      state.notesExpanded = false;
      const person = personById(state.selectedId);
      if (person) renderNotes(person);
    }
  });

  applyDefaultPanelState();
  syncPanelState();
  render();
  fitTreeAfterLayout();
}

async function fetchSampleData() {
  const response = await fetch("./data/sample-family.json");
  return response.json();
}

function isCompactViewport() {
  return window.innerWidth <= COMPACT_BREAKPOINT;
}

function applyDefaultPanelState() {
  const compact = isCompactViewport();
  state.peopleCollapsed = compact;
  state.profileCollapsed = compact;
}

function loadStoredData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    validateData(data);
    return data;
  } catch {
    return null;
  }
}

function storeData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Reloading used to collapse every ancestor branch back to the minimal view,
// so a long expansion session had to be rebuilt pill by pill. Persist the
// reveal set (plus minimal/full mode) and restore it on load; ids that are
// not in the current dataset are dropped rather than kept as dead weight.
function saveViewState() {
  try {
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
      collapseCollateral: state.collapseCollateral,
      expanded: [...state.expandedAncestors],
      siblings: [...state.expandedSiblings],
      children: [...state.expandedChildren],
    }));
  } catch {
    // Storage may be unavailable; the view simply resets next visit.
  }
}

function restoreViewState() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(VIEW_STATE_KEY));
  } catch {
    return;
  }
  if (!stored || typeof stored !== "object") return;
  if (typeof stored.collapseCollateral === "boolean") {
    state.collapseCollateral = stored.collapseCollateral;
  }
  if (Array.isArray(stored.expanded)) {
    state.expandedAncestors = new Set(stored.expanded.filter((id) => personById(id)));
  }
  if (Array.isArray(stored.siblings)) {
    state.expandedSiblings = new Set(stored.siblings.filter((id) => personById(id)));
  }
  if (Array.isArray(stored.children)) {
    state.expandedChildren = new Set(stored.children.filter((id) => personById(id)));
  }
}

async function forgetStoredData() {
  storeRequestId += 1;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable; still fall back to sample data.
  }
  state.hasStoredData = false;
  adoptData(await fetchSampleData());
  renderDataStatus("Saved family data removed from this browser. Sample data loaded.", "success");
}

function afterNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function scheduleStoreData(data, onStored) {
  const requestId = ++storeRequestId;
  const run = () => {
    if (requestId !== storeRequestId) return;
    const stored = storeData(data);
    if (requestId !== storeRequestId) return;
    onStored(stored);
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 0);
  }
}

function adoptData(data, place = null) {
  state.data = data;
  rebuildDataCaches();
  state.selectedId = place?.selectedId || data.meta?.defaultPersonId || data.people[0]?.id;
  state.rootId = place?.rootId || state.selectedId;
  syncHash();
  state.collapseCollateral = place ? place.collapseCollateral : true;
  resetExpandedAncestors();
  if (place) {
    state.expandedAncestors = new Set(place.expandedAncestors);
    state.expandedSiblings = new Set(place.expandedSiblings);
    state.expandedChildren = new Set(place.expandedChildren);
    saveViewState();
  }
  applyDefaultPanelState();
  syncPanelState();
  els.search.value = "";
  fitTree({ renderNow: false });
  render();
  fitTreeAfterLayout();
}

function people() {
  return state.data.people;
}

function personById(id) {
  ensureDataCaches();
  return state.peopleById.get(id);
}

function relationshipIndex() {
  ensureDataCaches();
  if (state.relationshipIndex) return state.relationshipIndex;
  const index = new Map(people().map((person) => [
    person.id,
    {
      parents: new Set(person.parents || []),
      spouses: new Set(person.spouses || []),
      children: new Set(person.children || []),
    },
  ]));

  for (const person of people()) {
    for (const parentId of person.parents || []) {
      index.get(parentId)?.children.add(person.id);
    }
    for (const spouseId of person.spouses || []) {
      index.get(spouseId)?.spouses.add(person.id);
    }
    for (const childId of person.children || []) {
      index.get(childId)?.parents.add(person.id);
    }
  }

  state.relationshipIndex = index;
  return index;
}

function rebuildDataCaches() {
  state.peopleById = new Map(people().map((person) => [person.id, person]));
  state.relationshipIndex = null;
  state.searchIndex = null;
  state.cachedPeople = state.data?.people || null;
}

function ensureDataCaches() {
  if (state.cachedPeople !== state.data?.people) rebuildDataCaches();
}

function render() {
  syncPanelState();
  renderWorkspaceSummary();
  renderPeople();
  renderDetails();
  renderTree();
  renderDataStatus();
}

function syncPanelState() {
  document.body.classList.toggle("people-collapsed", state.peopleCollapsed);
  document.body.classList.toggle("profile-collapsed", state.profileCollapsed);
  document.body.classList.toggle("has-split-focus", state.selectedId !== state.rootId);
  els.togglePeople.textContent = "People";
  els.toggleProfile.textContent = "Profile";
  els.togglePeople.setAttribute("aria-pressed", String(!state.peopleCollapsed));
  els.toggleProfile.setAttribute("aria-pressed", String(!state.profileCollapsed));
  els.togglePeople.title = state.peopleCollapsed ? "Show people directory" : "Hide people directory";
  els.toggleProfile.title = state.profileCollapsed ? "Show profile panel" : "Hide profile panel";
}

function renderDataStatus(message, tone = "neutral") {
  const isSample = people().some((person) => (person.tags || []).includes("sample"));
  const summary = message || (isSample
    ? "Sample data loaded. Load your private family.json to replace it with your private research set."
    : `${people().length} people loaded${state.hasStoredData ? " from this browser's saved copy" : ""}. Nothing leaves this browser.`);
  els.dataStatus.className = `data-status ${tone}`;
  els.dataStatus.textContent = summary;
  els.clearData.hidden = !state.hasStoredData;
}

function renderWorkspaceSummary() {
  const meta = state.data?.meta || {};
  els.workspaceTitle.textContent = meta.title || "Family tree";
  els.workspaceMeta.textContent = formatMetaDate(meta.updated) || `${people().length} people`;
  els.treeSubtitle.textContent = state.collapseCollateral
    ? "Minimal tree view with manual ancestor reveals. Double-click a card to refocus."
    : "Full connected family network around the current tree focus. Double-click a card to refocus.";
  if (!els.search.value.trim()) {
    els.peopleSummary.textContent = defaultPeopleSummary();
  }
}

// The written life story (profile summary or article) as plain text, so
// search can match occupations, towns, and events that only appear in the
// narrative. Story fields may be a string or an array of paragraphs.
function storyText(person) {
  return [person.profile?.article, person.lifeStory, person.profile?.summary]
    .flat()
    .filter((part) => typeof part === "string")
    .join(" ");
}

function searchMatches(term) {
  const matches = personSearchIndex().filter((entry) => !term || entry.haystack.includes(term));
  if (!term) {
    return matches
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.person.name.localeCompare(b.person.name))
      .map((entry) => entry.person);
  }
  return matches
    .map((entry) => ({ entry, rank: searchEntryRank(entry, term) }))
    .sort((a, b) => a.rank - b.rank || a.entry.person.name.localeCompare(b.entry.person.name))
    .map(({ entry }) => entry.person);
}

function personSearchIndex() {
  ensureDataCaches();
  if (!state.searchIndex) {
    state.searchIndex = people().map((person) => ({
      person,
      haystack: [
        person.name,
        person.birth?.place,
        person.burial?.place,
        person.death?.place,
        person.birth?.date,
        person.death?.date,
        formatYears(person),
        person.notes,
        storyText(person),
        ...(person.aliases || []),
        ...(person.tags || []),
        ...profileSources(person).flatMap((source) => [
          source.label,
          source.title,
          source.repository,
          source.type,
          source.confidence,
        ]),
      ].join(" ").toLowerCase(),
      name: person.name.toLowerCase(),
      aliases: (person.aliases || []).map((alias) => alias.toLowerCase()),
      sortKey: surnameSortKey(person.name),
    }));
  }
  return state.searchIndex;
}

function searchEntryRank(entry, term) {
  if (entry.name.startsWith(term)) return 0;
  if (entry.name.split(/\s+/).some((word) => word.startsWith(term))) return 1;
  if (entry.name.includes(term)) return 2;
  if (entry.aliases.some((alias) => alias.includes(term))) return 3;
  return 4;
}

// Directory browse order groups families together: sort by surname, then the
// rest of the name. Nicknames in quotes, maiden names in parentheses, and
// generational suffixes (Jr., III) never count as the surname.
const NAME_SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

function surnameSortKey(name) {
  const words = String(name || "")
    .replace(/"[^"]*"|\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  if (!words.length) return "";
  const surname = words[words.length - 1];
  return [surname, ...words.slice(0, -1)].join(" ").toLowerCase();
}

// Display form of the surname the sort key files a person under, for the
// directory group headers. Mirrors surnameSortKey's nickname/maiden-name/
// suffix handling so the header always matches the grouping.
function surnameLabel(name) {
  const words = String(name || "")
    .replace(/"[^"]*"|\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return words.length ? words[words.length - 1] : "";
}

// Rank name hits above place/note/tag hits so typing a name surfaces that
// person first and Enter selects who the user actually typed.
function searchRank(person, term) {
  const name = person.name.toLowerCase();
  if (name.startsWith(term)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(term))) return 1;
  if (name.includes(term)) return 2;
  if ((person.aliases || []).some((alias) => alias.toLowerCase().includes(term))) return 3;
  return 4;
}

// Why a search result matched when the term isn't in the person's name:
// hits inside long life stories, notes, places, or tags otherwise look like
// mistakes in the directory. Returns the matched field plus a short excerpt
// around the hit, or null when the name itself explains the match.
function searchMatchReason(person, term) {
  if (!term || person.name.toLowerCase().includes(term)) return null;
  const alias = (person.aliases || []).find((entry) => entry.toLowerCase().includes(term));
  if (alias) return { field: "Also known as", snippet: alias };
  const tag = (person.tags || []).find((entry) => entry.toLowerCase().includes(term));
  if (tag) return { field: "Tag", snippet: tag };
  const fields = [
    ["Birth", person.birth?.place],
    ["Death", person.death?.place],
    ["Birth date", person.birth?.date],
    ["Death date", person.death?.date],
    ["Notes", person.notes],
    ["Life story", storyText(person)],
    ["Source", profileSources(person).map((source) =>
      [source.label, source.title, source.repository, source.type, source.confidence].filter(Boolean).join(" ")).join(" ")],
  ];
  for (const [field, text] of fields) {
    const value = String(text || "");
    const at = value.toLowerCase().indexOf(term);
    if (at !== -1) return { field, snippet: matchSnippet(value, at, term.length) };
  }
  return null;
}

// Excerpt around a match, widened to word boundaries with ellipses on cut
// edges, so "carpenter" reads as "…worked as a carpenter in Galesburg…".
function matchSnippet(text, at, length, radius = 36) {
  let start = Math.max(0, at - radius);
  if (start > 0) {
    const space = text.lastIndexOf(" ", start);
    if (space !== -1) start = space + 1;
  }
  let end = Math.min(text.length, at + length + radius);
  if (end < text.length) {
    const space = text.indexOf(" ", end);
    end = space === -1 ? text.length : space;
  }
  const clipped = text.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${clipped}${end < text.length ? "…" : ""}`;
}

// Enter in the search box walks the ranked matches: the first press selects
// the top hit and each following press advances to the next match, wrapping
// at the end — so five same-named cousins can be stepped through one Enter at
// a time while the tree pans/reveals each. The walk is keyed off whichever
// person is currently selected, so clicking elsewhere restarts it cleanly.
function nextSearchMatch(matches, selectedId) {
  if (!matches.length) return null;
  const currentIndex = matches.findIndex((person) => person.id === selectedId);
  return matches[(currentIndex + 1) % matches.length];
}

function defaultPeopleSummary() {
  const isSample = people().some((person) => (person.tags || []).includes("sample"));
  return isSample ? "Sample dataset" : `${people().length} people`;
}

function renderPeople() {
  const term = els.search.value.trim().toLowerCase();
  const matches = searchMatches(term);

  els.peopleSummary.textContent = term
    ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
    : defaultPeopleSummary();

  if (!matches.length) {
    els.list.replaceChildren(
      emptyState("No people matched that search.", "Try another name, place, life-story word, note, or tag from your family JSON."),
    );
    return;
  }

  if (term) {
    els.list.replaceChildren(...matches.map((person) => renderPersonRow(person, term)));
    return;
  }
  els.list.replaceChildren(...groupedDirectoryRows(matches));
}

// Browse mode reads like a contact list: a sticky surname header before each
// family block so scanning for "the Edwards side" doesn't mean reading every
// card. Search results skip the headers — rank order matters more there.
function groupedDirectoryRows(matches) {
  const rows = [];
  let lastKey = null;
  for (const person of matches) {
    const surname = surnameLabel(person.name) || "No surname";
    const key = surname.toLowerCase();
    if (key !== lastKey) {
      const header = document.createElement("h3");
      header.className = "person-group-header";
      header.textContent = surname;
      rows.push(header);
      lastKey = key;
    }
    rows.push(renderPersonRow(person));
  }
  return rows;
}

function renderDetails() {
  const person = personById(state.selectedId);
  if (!person) return;
  const root = personById(state.rootId);
  const sources = profileSources(person);
  const relations = profileRelations(person);
  const relationTotal = new Set([
    ...relations.parents,
    ...relations.siblings,
    ...relations.halfSiblings,
    ...relations.spouses,
    ...relations.children,
  ]).size;

  const kinship = root ? kinshipLabel(person.id, root.id) : "";
  const age = ageAtDeath(person);
  const liveAge = currentAgeLabel(person);
  els.detailName.textContent = person.name;
  els.detailContext.textContent = person.id === root?.id
    ? "Selected person and current tree focus."
    : kinship
      ? `${root.name}'s ${kinship}.`
      : `Selected profile while the tree stays focused on ${root?.name || person.name}.`;
  els.detailMeta.replaceChildren(
    ...[
      metaPill(formatYears(person) || "Dates pending"),
      person.birth?.place ? placeSearchPill("Born", person.birth.place) : null,
      person.death?.place ? placeSearchPill("Died", person.death.place) : null,
      age ? metaPill(age.approx ? `Died about age ${age.years}` : `Died aged ${age.years}`) : null,
      liveAge ? metaPill(liveAge) : null,
      sources.length ? evidencePill(sources, person) : null,
      relationTotal ? metaPill(`${relationTotal} relationship${relationTotal === 1 ? "" : "s"}`) : null,
      ...researchStatusPills(person),
    ].filter(Boolean),
  );
  renderRelationPath(person, root);
  renderProfilePhoto(person);
  renderLifeStory(person);
  els.detailFacts.replaceChildren(
    fact("Born", formatEvent(person.birth)),
    fact("Died", formatEvent(person.death)),
    fact("Buried", formatEvent(person.burial)),
    fact("Known as", person.aliases?.join(", ")),
    tagListFact(person),
  );
  renderTimeline(person);
  renderEvidenceCoverage(person);
  renderNotes(person);
  els.centerPerson.textContent = person.id === root?.id ? "Tree focus" : "Make tree focus";
  els.centerPerson.disabled = person.id === root?.id;

  // When a person has children from multiple spouses, show which parent each
  // child shares — mirrors the "with [spouse]" label already used in the
  // life timeline so the relationship list tells the same story.
  const spouseSet = new Set(relations.spouses);
  // Label each child with birth order among this person's children. For parents
  // with multiple spouses, also note which partner the child shares so each
  // union's children are distinguishable without opening each profile.
  let childNoteById = null;
  if (relations.children.length) {
    const map = new Map();
    const total = relations.children.length;
    for (let i = 0; i < total; i++) {
      const childId = relations.children[i];
      const child = personById(childId);
      const orderLabel = total === 1 ? "Only child" : `${ordinal(i + 1)} child`;
      const parts = [orderLabel];
      if (spouseSet.size > 1) {
        const otherParentId = (child?.parents || []).find(
          (pid) => pid !== person.id && spouseSet.has(pid),
        );
        if (otherParentId) parts.push(`with ${givenName(personById(otherParentId)?.name)}`);
      }
      const childBirthYear = yearLabel(child?.birth?.date);
      const childBirthNum = numericYear(child?.birth?.date);
      if (childBirthYear) parts.push(`b. ${childBirthYear}`);
      const childDeathYear = yearLabel(child?.death?.date);
      const childDeathNum = numericYear(child?.death?.date);
      if (childDeathYear) {
        const childAgeAtDeath = childBirthNum !== null && childDeathNum !== null ? childDeathNum - childBirthNum : null;
        const ageTag = childAgeAtDeath === 0 ? " (infant)" : childAgeAtDeath !== null && childAgeAtDeath > 0 && childAgeAtDeath <= 110 ? ` (aged ${childAgeAtDeath})` : "";
        parts.push(`d. ${childDeathYear}${ageTag}`);
      }
      const placeMeta = personListMeta(child);
      if (placeMeta) parts.push(placeMeta);
      map.set(childId, parts.join(" · "));
    }
    childNoteById = map;
  }

  // For each spouse, show their birth year and shared-children count so each
  // union is distinguishable at a glance — especially when a person had
  // multiple partners or two spouses have similar names.
  let spouseNoteById = null;
  if (relations.spouses.length) {
    spouseNoteById = new Map();
    for (const spouseId of relations.spouses) {
      const spouse = personById(spouseId);
      const sharedCount = relations.children.filter((childId) => {
        const child = personById(childId);
        return (child?.parents || []).includes(spouseId);
      }).length;
      const spouseYearLabel = yearLabel(spouse?.birth?.date);
      const spouseBirthNum = numericYear(spouse?.birth?.date);
      const yearNote = spouseYearLabel ? `b. ${spouseYearLabel}` : "";
      const spouseDeathYearLabel = yearLabel(spouse?.death?.date);
      const spouseDeathNum = numericYear(spouse?.death?.date);
      const spouseAgeAtDeath = spouseBirthNum !== null && spouseDeathNum !== null ? spouseDeathNum - spouseBirthNum : null;
      const spouseAgeTag = spouseAgeAtDeath === 0 ? " (infant)" : spouseAgeAtDeath !== null && spouseAgeAtDeath > 0 && spouseAgeAtDeath <= 110 ? ` (aged ${spouseAgeAtDeath})` : "";
      const deathNote = spouseDeathYearLabel ? `d. ${spouseDeathYearLabel}${spouseAgeTag}` : "";
      const baseMeta = personListMeta(spouse);
      const childNote = sharedCount > 0 ? `${sharedCount} ${sharedCount === 1 ? "child" : "children"} together` : "";
      spouseNoteById.set(spouseId, [yearNote, deathNote, baseMeta, childNote].filter(Boolean).join(" · "));
    }
  }

  // Label each sibling and half-sibling as "Older" or "Younger" relative to
  // the current person so birth order is visible without opening each profile.
  // Falls back to place meta when neither birth year is known.
  const personBirthYear = numericYear(person.birth?.date);
  function siblingNoteMap(ids, type = "sibling") {
    const map = new Map();
    for (const sibId of ids) {
      const sib = personById(sibId);
      const sibYear = numericYear(sib?.birth?.date);
      const sibYearLabel = yearLabel(sib?.birth?.date);
      const placeMeta = personListMeta(sib);
      let orderLabel = "";
      if (personBirthYear !== null && sibYear !== null) {
        orderLabel = sibYear < personBirthYear ? `Older ${type}` : sibYear > personBirthYear ? `Younger ${type}` : "Same birth year";
      }
      const yearNote = sibYearLabel ? `b. ${sibYearLabel}` : "";
      const sibDeathYearLabel = yearLabel(sib?.death?.date);
      const sibDeathNum = numericYear(sib?.death?.date);
      const sibAgeAtDeath = sibYear !== null && sibDeathNum !== null ? sibDeathNum - sibYear : null;
      const sibAgeTag = sibAgeAtDeath === 0 ? " (infant)" : sibAgeAtDeath !== null && sibAgeAtDeath > 0 && sibAgeAtDeath <= 110 ? ` (aged ${sibAgeAtDeath})` : "";
      const deathNote = sibDeathYearLabel ? `d. ${sibDeathYearLabel}${sibAgeTag}` : "";
      const note = [orderLabel, yearNote, deathNote, placeMeta].filter(Boolean).join(" · ");
      if (note) map.set(sibId, note);
    }
    return map.size ? map : null;
  }
  const siblingNoteById = siblingNoteMap(relations.siblings);
  const halfSiblingNoteById = siblingNoteMap(relations.halfSiblings, "half-sibling");

  // For each parent, show how old they were when this person was born — gives
  // generational context at a glance without opening the parent's profile.
  // Falls back to the parent's birth year when the age cannot be computed,
  // keeping parents consistent with siblings and spouses (which always show b. YYYY).
  let parentNoteById = null;
  if (relations.parents.length) {
    const map = new Map();
    for (const parentId of relations.parents) {
      const parent = personById(parentId);
      const py = numericYear(parent?.birth?.date);
      const parentYearLabel = yearLabel(parent?.birth?.date);
      if (py !== null && personBirthYear !== null) {
        const parentAge = personBirthYear - py;
        if (parentAge >= 12 && parentAge <= 80) {
          map.set(parentId, `Age ${parentAge} when ${givenName(person.name)} was born`);
        } else if (parentYearLabel) {
          map.set(parentId, `b. ${parentYearLabel}`);
        }
      } else if (parentYearLabel) {
        map.set(parentId, `b. ${parentYearLabel}`);
      }
    }
    if (map.size) parentNoteById = map;
  }

  const relationItems = [
    ...linkGroup("Parents", relations.parents, parentNoteById),
    ...linkGroup("Siblings", relations.siblings, siblingNoteById),
    ...linkGroup("Half-siblings", relations.halfSiblings, halfSiblingNoteById),
    ...linkGroup("Spouses", relations.spouses, spouseNoteById),
    ...linkGroup("Children", relations.children, childNoteById),
  ];
  els.relationsHeading.textContent = `Relationships (${relationTotal})`;
  els.detailRelations.replaceChildren(
    ...relationItems.length
      ? relationItems
      : [emptyState("No relationships recorded yet.", "Add parents, spouses, or children in the JSON when those connections are confirmed.")],
  );

  const sourceItems = chronologicalSources(sources, person)
    .map(({ source, year }) => renderSourceItem(source, year, personBirthYear));
  els.sourcesHeading.textContent = `Sources (${sourceItems.length})`;
  els.toggleSources.hidden = sourceItems.length === 0;
  els.toggleSources.textContent = `Sources${sourceItems.length ? ` (${sourceItems.length})` : ""}`;
  els.toggleSources.setAttribute("aria-expanded", String(state.sourcesExpanded));
  els.sourcesPanel.hidden = !state.sourcesExpanded;
  els.detailSources.replaceChildren(
    ...sourceItems.length
      ? sourceItems
      : [emptyState("No sources attached yet.", "Add links, citations, photos, or obituary records in the JSON profile when they are ready.")],
  );
}

// Show the chain of people behind the kinship label ("2nd great-grandparent"
// says how far; this says through whom). Each name jumps to that profile.
// Hidden for direct parent/child/spouse, where the chain adds nothing.
function renderRelationPath(person, root) {
  const index = relationshipIndex();
  const path = root && person.id !== root.id ? relationPath(person.id, root.id, index) : [];
  if (path.length < 3) {
    els.detailPath.hidden = true;
    els.detailPath.replaceChildren();
    return;
  }
  const parts = [];
  path.forEach((id, position) => {
    if (position > 0) parts.push(relationHop(path[position - 1], id, index));
    const step = personById(id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "path-step";
    button.textContent = step?.name || id;
    if (id === person.id) {
      button.disabled = true;
    } else {
      button.title = `Open ${step?.name || "this profile"}`;
      button.addEventListener("click", () => selectPerson(id, false, true));
    }
    parts.push(button);
  });
  els.detailPath.replaceChildren(...parts);
  els.detailPath.hidden = false;
}

function relationHop(fromId, toId, index) {
  const hop = document.createElement("span");
  hop.className = "path-hop";
  if (index.get(fromId)?.parents?.has(toId)) {
    hop.textContent = "child of";
  } else if (index.get(toId)?.parents?.has(fromId)) {
    hop.textContent = "parent of";
  } else {
    hop.textContent = "married";
  }
  return hop;
}

const NOTES_PREVIEW_LIMIT = 480;

// Long research notes are working logs, not prose: label them and clamp to a
// preview so they stop reading as part of the life story.
function renderNotes(person) {
  const notes = String(person.notes || "").trim();
  els.detailNotes.hidden = !notes;
  els.detailNotes.replaceChildren();
  if (!notes) return;

  const label = document.createElement("p");
  label.className = "notes-label";
  label.textContent = "Research notes";
  els.detailNotes.append(label);

  const needsClamp = notes.length > NOTES_PREVIEW_LIMIT && !state.notesExpanded;
  let shown = notes;
  if (needsClamp) {
    const cut = notes.lastIndexOf(" ", NOTES_PREVIEW_LIMIT);
    shown = `${notes.slice(0, cut > NOTES_PREVIEW_LIMIT / 2 ? cut : NOTES_PREVIEW_LIMIT).trimEnd()}…`;
  }

  const nameIndex = storyNameIndex();
  const closeIds = closeRelativeIds(person);
  for (const paragraphText of splitParagraphs(shown)) {
    const paragraph = document.createElement("p");
    paragraph.className = "notes-body";
    appendStoryParagraph(paragraph, paragraphText, person.id, nameIndex, closeIds);
    els.detailNotes.append(paragraph);
  }

  if (notes.length > NOTES_PREVIEW_LIMIT) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "notes-toggle";
    toggle.textContent = state.notesExpanded ? "Show less" : "Show full notes";
    toggle.setAttribute("aria-expanded", String(state.notesExpanded));
    toggle.addEventListener("click", () => {
      state.notesExpanded = !state.notesExpanded;
      renderNotes(person);
    });
    els.detailNotes.append(toggle);
  }
}

// Chronological life events for the profile: birth, children's births, deaths
// of parents and spouses during the person's lifetime, dated source records
// (censuses, obituaries), and death, sorted by year. Rank keeps same-year ties
// sensible: birth first, then family events, then death, then records (so an
// obituary lands after "Died", a birth-year census after "Born").
function lifeTimeline(person, index = relationshipIndex()) {
  const events = [];
  const birthYear = numericYear(person.birth?.date);
  const deathYear = numericYear(person.death?.date);
  if (birthYear !== null) {
    const bornParentIds = [...(index.get(person.id)?.parents || [])];
    const parentAgeEntries = bornParentIds
      .map((pid) => {
        const parent = personById(pid);
        const py = numericYear(parent?.birth?.date);
        if (py === null || birthYear - py < 12 || birthYear - py > 80) return null;
        return { name: givenName(parent?.name), age: birthYear - py };
      })
      .filter(Boolean);
    const parentAgeDetail = parentAgeEntries.length === 1
      ? `${parentAgeEntries[0].name} aged ${parentAgeEntries[0].age}`
      : parentAgeEntries.length >= 2
      ? parentAgeEntries.map(({ name, age }) => `${name} aged ${age}`).join(" · ")
      : "";
    const seenSibs = new Set([person.id]);
    let olderSibCount = 0;
    for (const ppId of bornParentIds) {
      for (const sibId of (index.get(ppId)?.children || [])) {
        if (seenSibs.has(sibId)) continue;
        seenSibs.add(sibId);
        const sibBirthYear = numericYear(personById(sibId)?.birth?.date);
        if (sibBirthYear !== null && sibBirthYear < birthYear) olderSibCount++;
      }
    }
    const olderSibDetail = olderSibCount === 1 ? "1 older sibling" : olderSibCount >= 2 ? `${olderSibCount} older siblings` : "";
    events.push({ year: birthYear, rank: 0, label: "Born", detail: [formatEvent(person.birth), parentAgeDetail, olderSibDetail].filter(Boolean).join(" · ") });
  }

  const personSpouses = index.get(person.id)?.spouses || new Set();

  // Marriage events: pull a year from a marriage source label when one is
  // available, otherwise estimate from the first shared child's birth year.
  // Only emit an event when a year can be resolved — undated unions already
  // appear in the relationships panel so the timeline adds nothing without it.
  const personSources = profileSources(person);
  const marriedSpousesSeen = new Set();
  for (const spouseId of personSpouses) {
    const spouse = personById(spouseId);
    if (!spouse) continue;

    // Try to lift a year from a marriage-record source on either person.
    const spouseSources = profileSources(spouse);
    let marriageYear = null;
    let estimated = false;
    for (const source of [...personSources, ...spouseSources]) {
      const label = String(source.label || source.title || "").toLowerCase();
      if (!/marriage|married|wedding/.test(label)) continue;
      const year = sourceEventYear(source, birthYear, deathYear);
      if (year === null) continue;
      if (birthYear !== null && year < birthYear) continue;
      if (deathYear !== null && year > deathYear) continue;
      marriageYear = year;
      break;
    }

    // Fall back to one year before the earliest shared child's birth.
    if (marriageYear === null) {
      const sharedChildren = orderedChildren([person.id], index).filter((cid) => {
        const child = personById(cid);
        return (child?.parents || []).includes(spouseId);
      });
      for (const cid of sharedChildren) {
        const childYear = numericYear(personById(cid)?.birth?.date);
        if (childYear === null) continue;
        const candidate = childYear - 1;
        if (birthYear !== null && candidate < birthYear) continue;
        if (deathYear !== null && candidate > deathYear) continue;
        marriageYear = candidate;
        estimated = true;
        break;
      }
    }

    if (marriageYear === null) continue;
    marriedSpousesSeen.add(spouseId);
    const age = birthYear !== null && marriageYear >= birthYear ? marriageYear - birthYear : null;
    events.push({
      year: marriageYear,
      rank: 1,
      marriage: true,
      personId: spouseId,
      label: `Married ${spouse.name}`,
      detail: [
        age !== null ? `around age ${age}` : "",
        estimated ? "year estimated" : "",
      ].filter(Boolean).join(" · "),
    });
  }

  for (const childId of orderedChildren([person.id], index)) {
    const child = personById(childId);
    const year = numericYear(child?.birth?.date);
    if (year === null) continue;
    const age = birthYear !== null && year >= birthYear ? year - birthYear : null;
    const otherParentId = personSpouses.size > 1
      ? (child.parents || []).find((pid) => pid !== person.id && personSpouses.has(pid))
      : null;
    const otherParent = otherParentId ? personById(otherParentId) : null;
    events.push({
      year,
      rank: 1,
      personId: childId,
      label: `${child.name} born`,
      detail: [
        age !== null ? `around age ${age}` : "",
        otherParent ? `with ${givenName(otherParent.name)}` : "",
        child.birth?.place || "",
      ].filter(Boolean).join(" · "),
    });
  }

  // Siblings born after this person and within their lifetime — shows when
  // younger brothers/sisters arrived, giving birth-order context to childhood.
  const personParentIds = [...(index.get(person.id)?.parents || [])];
  if (personParentIds.length > 0) {
    for (const siblingId of orderedChildren(personParentIds, index)) {
      if (siblingId === person.id) continue;
      const sibling = personById(siblingId);
      const year = numericYear(sibling?.birth?.date);
      if (year === null) continue;
      if (birthYear !== null && year <= birthYear) continue;
      if (deathYear !== null && year > deathYear) continue;
      const age = birthYear !== null ? year - birthYear : null;
      const half = isHalfSiblingPair(person.id, siblingId, index);
      const baseLabel = half ? "half-sibling" : "sibling";
      const siblingRole = birthYear !== null ? `younger ${baseLabel}` : baseLabel;
      events.push({
        year,
        rank: 1,
        personId: siblingId,
        label: `${sibling.name} born`,
        detail: [siblingRole, age !== null ? `around age ${age}` : ""].filter(Boolean).join(" · "),
      });
    }

    // Siblings who died within this person's lifetime — shows when a brother
    // or sister was lost, adding emotional context alongside sibling births.
    for (const siblingId of orderedChildren(personParentIds, index)) {
      if (siblingId === person.id) continue;
      const sibling = personById(siblingId);
      const year = numericYear(sibling?.death?.date);
      if (year === null) continue;
      if (birthYear !== null && year < birthYear) continue;
      if (deathYear !== null && year > deathYear) continue;
      const age = birthYear !== null ? year - birthYear : null;
      const half = isHalfSiblingPair(person.id, siblingId, index);
      const siblingBirthYear = numericYear(sibling?.birth?.date);
      const siblingAgeAtDeath = siblingBirthYear !== null ? year - siblingBirthYear : null;
      const baseDeathLabel = half ? "half-sibling" : "sibling";
      const siblingDeathRole = (birthYear !== null && siblingBirthYear !== null)
        ? `${siblingBirthYear < birthYear ? "older" : "younger"} ${baseDeathLabel}`
        : baseDeathLabel;
      events.push({
        year,
        rank: 1,
        personId: siblingId,
        label: `${sibling.name} died`,
        detail: [
          siblingDeathRole,
          siblingAgeAtDeath !== null ? `aged ${siblingAgeAtDeath}` : "",
          age !== null ? `around age ${age}` : "",
        ].filter(Boolean).join(" · "),
      });
    }
  }

  for (const { ids, role } of [
    { ids: index.get(person.id)?.parents, role: "parent" },
    { ids: index.get(person.id)?.spouses, role: "spouse" },
    { ids: index.get(person.id)?.children, role: "child" },
  ]) {
    for (const relativeId of ids || []) {
      const relative = personById(relativeId);
      const year = numericYear(relative?.death?.date);
      if (year === null) continue;
      if (birthYear !== null && year < birthYear) continue;
      if (deathYear !== null && year > deathYear) continue;
      const age = birthYear !== null ? year - birthYear : null;
      const relativeBirthYear = numericYear(relative?.birth?.date);
      const relativeAgeAtDeath = relativeBirthYear !== null ? year - relativeBirthYear : null;
      events.push({
        year,
        rank: 1,
        personId: relativeId,
        label: `${relative.name} died`,
        detail: [
          role,
          relativeAgeAtDeath !== null ? `aged ${relativeAgeAtDeath}` : "",
          age !== null ? `around age ${age}` : "",
        ].filter(Boolean).join(" · "),
      });
    }
  }

  if (deathYear !== null) {
    const age = ageAtDeath(person);
    // Count children and spouses who outlived this person (no recorded death, or
    // died in a year strictly after this person's death year).
    const survivingChildren = [...(index.get(person.id)?.children || [])].filter((id) => {
      const child = personById(id);
      const childDeath = numericYear(child?.death?.date);
      return childDeath === null || childDeath > deathYear;
    });
    const survivingSpouses = [...(index.get(person.id)?.spouses || [])].filter((id) => {
      const spouse = personById(id);
      const spouseDeath = numericYear(spouse?.death?.date);
      return spouseDeath === null || spouseDeath > deathYear;
    });
    const survivedBy = [];
    if (survivingChildren.length === 1) survivedBy.push("1 child");
    else if (survivingChildren.length > 1) survivedBy.push(`${survivingChildren.length} children`);
    if (survivingSpouses.length === 1) survivedBy.push(`spouse ${givenName(personById(survivingSpouses[0])?.name)}`);
    else if (survivingSpouses.length > 1) survivedBy.push(`${survivingSpouses.length} spouses`);
    events.push({
      year: deathYear,
      rank: 2,
      label: "Died",
      detail: [
        formatEvent(person.death),
        age ? (age.approx ? `about age ${age.years}` : `aged ${age.years}`) : "",
        survivedBy.length ? `survived by ${survivedBy.join(" and ")}` : "",
      ].filter(Boolean).join(" · "),
    });
  }

  for (const source of profileSources(person)) {
    const year = sourceEventYear(source, birthYear, deathYear);
    if (year === null) continue;
    const inLifetime = birthYear !== null && year >= birthYear && (deathYear === null || year <= deathYear);
    const repoName = source.repository || sourceRepositoryName(source.url);
    const rawLabel = source.label || source.title || source.url;
    events.push({
      year,
      rank: 3,
      record: true,
      label: cleanSourceLabel(rawLabel, repoName) || rawLabel,
      detail: [inLifetime ? `around age ${year - birthYear}` : "", source.publication, source.repository]
        .filter(Boolean).join(" · "),
      url: source.url || "",
    });
  }

  return events.sort((a, b) => a.year - b.year || a.rank - b.rank);
}

function numericYear(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

// Real-data sources are mostly bare label+URL pairs with no date field, yet
// the labels usually name the event year ("1950 U.S. census, Allen County").
// When no explicit date exists, pull a year out of the label — skipping years
// that are part of a collection span ("Marriage Records, 1780-2002") and only
// trusting a year inside the person's known lifetime (death year + 1 keeps
// obituaries) so research/access dates like "read Jul 2026" stay out.
function sourceEventYear(source, birthYear, deathYear) {
  const explicit = numericYear(source.date);
  if (explicit !== null) return explicit;
  if (birthYear === null) return null;
  const maxYear = deathYear !== null ? deathYear + 1 : birthYear + 110;
  const label = String(source.label || source.title || "");
  for (const match of label.matchAll(/\b(1[6-9]\d{2}|20\d{2})\b/g)) {
    const before = label[match.index - 1] || "";
    const after = label[match.index + match[1].length] || "";
    if (before === "-" || before === "–" || after === "-" || after === "–") continue;
    const year = Number(match[1]);
    if (year >= birthYear && year <= maxYear) return year;
  }
  return null;
}

// The timeline only earns its space when it adds something beyond the
// Born/Died facts already listed above it.
function renderTimeline(person) {
  const events = lifeTimeline(person);
  const extras = events.filter((event) => event.rank === 1 || event.record);
  els.detailTimeline.hidden = !extras.length;
  els.detailTimeline.replaceChildren();
  if (!extras.length) return;

  // Collapse multiple record entries for the same year into one. Multiple
  // sources (e.g. two census URLs both dated 1950) produce redundant rows that
  // clutter the timeline; the full source list is already in the Sources panel.
  const yearRecordCounts = new Map();
  for (const event of events) {
    if (event.record) yearRecordCounts.set(event.year, (yearRecordCounts.get(event.year) || 0) + 1);
  }
  const seenRecordYears = new Set();
  const displayEvents = events.map((event) => {
    if (!event.record) return event;
    if (seenRecordYears.has(event.year)) return null;
    seenRecordYears.add(event.year);
    const extra = (yearRecordCounts.get(event.year) || 1) - 1;
    if (!extra) return event;
    const extraNote = `+${extra} more record${extra === 1 ? "" : "s"}`;
    return { ...event, detail: [event.detail, extraNote].filter(Boolean).join(" · ") };
  }).filter(Boolean);

  const label = document.createElement("p");
  label.className = "notes-label";
  label.textContent = "Life timeline";
  els.detailTimeline.append(label);

  const list = document.createElement("ol");
  list.className = "timeline-list";
  for (const event of displayEvents) {
    const item = document.createElement("li");
    const typeClass = event.record ? "record" : event.rank === 0 ? "birth" : event.rank === 2 ? "death" : event.marriage ? "marriage" : "relative";
    item.className = `timeline-item timeline-item--${typeClass}`;

    const year = document.createElement("span");
    year.className = "timeline-year";
    year.textContent = String(event.year);
    item.append(year);

    const body = document.createElement("span");
    body.className = "timeline-body";
    let title;
    if (event.url) {
      title = document.createElement("a");
      title.href = event.url;
      title.target = "_blank";
      title.rel = "noreferrer";
    } else if (event.personId) {
      title = document.createElement("button");
      title.type = "button";
      title.addEventListener("click", () => selectPerson(event.personId, false, true));
    } else {
      title = document.createElement("strong");
    }
    title.className = "timeline-label";
    title.textContent = event.label;
    body.append(title);

    if (event.detail) {
      const detail = document.createElement("small");
      detail.className = "timeline-detail";
      detail.textContent = event.detail;
      body.append(detail);
    }
    item.append(body);
    list.append(item);
  }
  els.detailTimeline.append(list);
}

function renderProfilePhoto(person) {
  const photos = profilePhotos(person);
  els.detailPhoto.hidden = false;
  if (!photos.length) {
    els.detailPhoto.replaceChildren();
    els.detailPhoto.classList.add("profile-photo--no-photo");
    const placeholder = document.createElement("div");
    placeholder.className = "photo-placeholder";
    placeholder.textContent = initialsForName(person.name);
    els.detailPhoto.append(placeholder);

    const caption = document.createElement("p");
    caption.textContent = "No profile photo attached yet.";
    els.detailPhoto.append(caption);
    return;
  }
  els.detailPhoto.classList.remove("profile-photo--no-photo");
  renderPhotoViewer(person, photos, 0);
}

// When a profile has more than one attached photo, the extras render as a
// thumbnail strip under the main image; clicking a thumbnail swaps it in.
function renderPhotoViewer(person, photos, activeIndex) {
  const photo = photos[activeIndex];
  els.detailPhoto.replaceChildren();

  const image = document.createElement("img");
  image.src = photo.url;
  image.alt = photo.alt || `Photo of ${person.name}`;
  image.loading = "lazy";
  image.className = "photo-open";
  image.title = "View full size";
  image.tabIndex = 0;
  image.setAttribute("role", "button");
  image.addEventListener("click", () => openPhotoLightbox(person, photos, activeIndex));
  image.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPhotoLightbox(person, photos, activeIndex);
  });
  image.addEventListener("error", () => {
    els.detailPhoto.classList.add("profile-photo--no-photo");
    const placeholder = document.createElement("div");
    placeholder.className = "photo-placeholder";
    placeholder.textContent = initialsForName(person.name);
    const msg = document.createElement("p");
    msg.textContent = "Photo could not be loaded.";
    els.detailPhoto.replaceChildren(placeholder, msg);
  });
  els.detailPhoto.append(image);

  const captionText = [photo.caption, photo.credit].filter(Boolean).join(" - ");
  if (captionText) {
    const caption = document.createElement("p");
    caption.textContent = captionText;
    els.detailPhoto.append(caption);
  }

  if (photos.length < 2) return;
  const strip = document.createElement("div");
  strip.className = "photo-thumbs";
  photos.forEach((thumb, index) => {
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = `photo-thumb${index === activeIndex ? " active" : ""}`;
    pick.title = thumb.caption || `Photo ${index + 1} of ${photos.length}`;
    pick.setAttribute("aria-label", pick.title);
    pick.setAttribute("aria-pressed", String(index === activeIndex));
    const small = document.createElement("img");
    small.src = thumb.url;
    small.alt = "";
    small.loading = "lazy";
    small.addEventListener("error", () => pick.remove());
    pick.append(small);
    pick.addEventListener("click", () => {
      if (index !== activeIndex) renderPhotoViewer(person, photos, index);
    });
    strip.append(pick);
  });
  els.detailPhoto.append(strip);
}

// Full-size photo lightbox: opened by clicking the main profile image. The
// small viewer crops with object-fit, so tall portraits and wide group shots
// were never fully visible before. Left/Right cycle a multi-photo profile;
// Escape or a backdrop click closes.
const lightbox = { photos: [], index: 0, name: "" };

function openPhotoLightbox(person, photos, index) {
  lightbox.photos = photos;
  lightbox.name = person.name;
  showLightboxPhoto(index);
  els.photoLightbox.hidden = false;
  els.photoLightboxClose.focus?.();
}

function showLightboxPhoto(index) {
  const count = lightbox.photos.length;
  if (!count) return;
  lightbox.index = ((index % count) + count) % count;
  const photo = lightbox.photos[lightbox.index];
  els.photoLightboxImage.src = photo.url;
  els.photoLightboxImage.alt = photo.alt || `Photo of ${lightbox.name}`;
  const caption = [photo.caption, photo.credit].filter(Boolean).join(" - ");
  const position = count > 1 ? `${lightbox.index + 1} of ${count}` : "";
  els.photoLightboxCaption.textContent = [caption, position].filter(Boolean).join(" · ");
}

function enablePhotoLightbox() {
  const close = () => {
    els.photoLightbox.hidden = true;
  };
  els.photoLightboxClose.addEventListener("click", close);
  els.photoLightbox.addEventListener("click", (event) => {
    if (event.target === els.photoLightbox) close();
  });
  document.addEventListener("keydown", (event) => {
    if (els.photoLightbox.hidden) return;
    if (event.key === "Escape") {
      close();
    } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && lightbox.photos.length > 1) {
      event.preventDefault();
      showLightboxPhoto(lightbox.index + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
}

function renderLifeStory(person) {
  const obituaries = profileObituaries(person);
  // Sources labelled "obituary" that aren't already in profile.obituaries also
  // deserve kicker badges. Skip Ancestry search URLs (index records, not full
  // obituary text) and any URL already covered by profile.obituaries.
  const seenObitUrls = new Set(obituaries.map((o) => o.url).filter(Boolean));
  const sourceKickers = profileSources(person)
    .filter((src) =>
      /\bobituary\b/i.test(src.label || src.title || "") &&
      src.url &&
      !/ancestry\.com\/search\//.test(src.url) &&
      !seenObitUrls.has(src.url),
    )
    .map((src) => ({ url: src.url, title: src.label || src.title, publication: src.repository }));
  const allObituaries = [...obituaries, ...sourceKickers];
  // Summaries that are auto-generated placeholder text ("appears in the JMO Ancestry
  // working tree") read worse than the derived story — skip them so the generated
  // prose shows instead. Hand-crafted summaries don't contain this phrase.
  const rawSummary = person.profile?.summary;
  const summary = typeof rawSummary === "string" && rawSummary.includes("appears in the JMO Ancestry working tree")
    ? null
    : rawSummary;
  const story = person.profile?.article || person.lifeStory || summary || generatedLifeStory(person);
  const paragraphs = Array.isArray(story) ? story : splitParagraphs(story);

  els.detailStory.replaceChildren();
  if (allObituaries.length) {
    const row = document.createElement("div");
    row.className = "story-kickers";
    for (const obituary of allObituaries) row.append(obituaryKicker(obituary, person));
    els.detailStory.append(row);
  }

  const nameIndex = storyNameIndex();
  const closeIds = closeRelativeIds(person);
  for (const paragraphText of paragraphs) {
    const paragraph = document.createElement("p");
    appendStoryParagraph(paragraph, paragraphText, person.id, nameIndex, closeIds);
    els.detailStory.append(paragraph);
  }
}

// Obituaries that are really about a relative say so ("Mentioned in Danny
// Graves's obituary") instead of implying the person's own notice exists.
function obituaryKicker(obituary, person) {
  const badge = document.createElement(obituary.url ? "a" : "p");
  badge.className = "story-kicker";
  const subject = obituarySubject(obituary.title);
  // Treat the subject as a person's name only when it looks like one: no
  // slashes, pipes, or ampersands (publication separators) and no more than
  // five tokens. Publication strings like "Atlanta Journal-Constitution / Legacy"
  // must not trigger "Mentioned in … obituary".
  const subjectIsPersonName = subject && !/[/|&]/.test(subject) && subject.split(/\s+/).length <= 5;
  if (subjectIsPersonName && !obituarySubjectIsPerson(subject, person.name)) {
    badge.textContent = `Mentioned in ${subject}'s obituary`;
  } else {
    badge.textContent = obituary.publication
      ? `Obituary available from ${obituary.publication}`
      : "Obituary available";
  }
  if (obituary.url) {
    badge.href = obituary.url;
    badge.target = "_blank";
    badge.rel = "noreferrer";
    badge.title = obituary.title || "Open the obituary in a new tab";
    badge.textContent += " ↗";
  }
  return badge;
}

// Life stories constantly name other tree people ("child of Anderson Andrew
// Graves") as plain text; these helpers turn verbatim full-name mentions into
// links that open that relative's profile, so a story doubles as navigation.

// Nicknames in quotes and maiden names in parentheses rarely appear verbatim
// inside prose, so each person also matches under a stripped variant.
function strippedName(name = "") {
  return String(name)
    .replace(/"[^"]*"/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Map of linkable name variant -> ids sharing it. Single-word variants stay
// out: a bare given name matches far too much prose to link safely.
function storyNameIndex() {
  const map = new Map();
  for (const person of people()) {
    const full = String(person.name || "").replace(/\s+/g, " ").trim();
    for (const variant of new Set([full, strippedName(full)])) {
      if (!variant || !variant.includes(" ")) continue;
      if (!map.has(variant)) map.set(variant, new Set());
      map.get(variant).add(person.id);
    }
  }
  return map;
}

function closeRelativeIds(person) {
  const index = relationshipIndex();
  const own = index.get(person.id);
  const close = new Set([...(own?.parents || []), ...(own?.spouses || []), ...(own?.children || [])]);
  for (const parentId of own?.parents || []) {
    for (const siblingId of index.get(parentId)?.children || []) {
      if (siblingId !== person.id) close.add(siblingId);
    }
  }
  return close;
}

// A name shared by several people only links when exactly one candidate is a
// close relative of the profile person — otherwise it stays plain text
// rather than guessing which namesake was meant.
function resolveMentionId(ids, selfId, closeIds) {
  const candidates = [...ids].filter((id) => id !== selfId);
  if (candidates.length === 1) return candidates[0];
  const close = candidates.filter((id) => closeIds.has(id));
  return close.length === 1 ? close[0] : null;
}

function isWordChar(char) {
  return Boolean(char) && /[\p{L}\p{N}]/u.test(char);
}

// Non-overlapping name mentions in story text, earliest first; when mentions
// overlap the longest name wins so "Mary Ann Graves" beats "Ann Graves".
function storyMentions(text, selfId, nameIndex, closeIds) {
  const matches = [];
  for (const [name, ids] of nameIndex) {
    let at = text.indexOf(name);
    while (at !== -1) {
      const end = at + name.length;
      if (!isWordChar(text[at - 1]) && !isWordChar(text[end])) {
        const id = resolveMentionId(ids, selfId, closeIds);
        if (id) matches.push({ start: at, end, id });
      }
      at = text.indexOf(name, at + 1);
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    kept.push(match);
    cursor = match.end;
  }
  return kept;
}

function appendStoryParagraph(paragraph, text, selfId, nameIndex, closeIds) {
  let cursor = 0;
  for (const mention of storyMentions(text, selfId, nameIndex, closeIds)) {
    if (mention.start > cursor) paragraph.append(text.slice(cursor, mention.start));
    const link = document.createElement("a");
    link.className = "story-person-link";
    link.href = `#p=${encodeURIComponent(mention.id)}`;
    link.textContent = text.slice(mention.start, mention.end);
    link.title = `Open ${personById(mention.id)?.name || "this person"}'s profile`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      selectPerson(mention.id, false, true);
    });
    paragraph.append(link);
    cursor = mention.end;
  }
  if (cursor < text.length) paragraph.append(text.slice(cursor));
}

// Extract the county/state location from a census source label when present.
// Handles formats like "1950 U.S. census, Allen County, Kentucky, ED 2-18..."
// and "NARA 1950 census viewer, Allen County KY ED 2-18...". Returns null when
// no parseable location follows the "census" keyword.
function extractCensusLocation(label) {
  if (!label) return null;
  const lower = label.toLowerCase();
  const censusIdx = lower.indexOf("census");
  if (censusIdx === -1) return null;
  const afterCensus = label.slice(censusIdx + 6);
  const commaIdx = afterCensus.indexOf(",");
  if (commaIdx === -1) return null;
  let location = afterCensus.slice(commaIdx + 1).trim();
  // Trim at record-detail keywords so "Allen County, Kentucky, ED 2-18, sheet 11" → "Allen County, Kentucky"
  const stopMatch = /\b(?:ED|sheet|page|dwelling|household|serial|lines?)\s+\d/i.exec(location);
  if (stopMatch) location = location.slice(0, stopMatch.index).trim().replace(/,\s*$/, "");
  return location.length >= 4 ? location : null;
}

// Resolves a marriage year for person+spouse using the same two-pass logic as
// the timeline: (1) scan marriage-record sources on either person for a label
// year, (2) fall back to the earliest shared child's birth year minus one.
// Returns { year, estimated } or null when no year can be determined.
function resolveMarriageYear(person, spouseId) {
  const birthYear = numericYear(person.birth?.date);
  const deathYear = numericYear(person.death?.date);
  const spouse = personById(spouseId);
  if (!spouse) return null;
  const sources = [...profileSources(person), ...profileSources(spouse)];
  for (const src of sources) {
    const label = String(src.label || src.title || "").toLowerCase();
    if (!/marriage|married|wedding/.test(label)) continue;
    const yr = sourceEventYear(src, birthYear, deathYear);
    if (yr === null) continue;
    if (birthYear !== null && yr < birthYear) continue;
    if (deathYear !== null && yr > deathYear) continue;
    return { year: yr, estimated: false };
  }
  const index = relationshipIndex();
  const sharedChildren = orderedChildren([person.id], index).filter((cid) =>
    (personById(cid)?.parents || []).includes(spouseId),
  );
  for (const cid of sharedChildren) {
    const childYear = numericYear(personById(cid)?.birth?.date);
    if (childYear === null) continue;
    const candidate = childYear - 1;
    if (birthYear !== null && candidate < birthYear) continue;
    if (deathYear !== null && candidate > deathYear) continue;
    return { year: candidate, estimated: true };
  }
  return null;
}

// Returns an array of paragraph strings so renderLifeStory presents each
// phase of the generated story as its own paragraph rather than one dense
// block. Grouped as: origin (birth + parents), marriage, family life
// (children + census), and death.
function generatedLifeStory(person) {
  const index = relationshipIndex();
  const years = formatYears(person);
  const birth = formatEventProse(person.birth);
  const death = formatEventProse(person.death);
  const age = ageAtDeath(person);
  const parents = namesForIds(index.get(person.id)?.parents);
  const spouseIds = [...(index.get(person.id)?.spouses || [])];
  const spouseNames = namesForIds(spouseIds);
  const childIds = orderedChildren([person.id], index);
  const given = givenName(person.name);
  const intro = `${person.name}${years ? ` (${years})` : ""}`;
  const nicknameMatch = String(person.name || "").match(/"([^"]+)"/);
  const nickname = nicknameMatch && nicknameMatch[1] !== given ? nicknameMatch[1] : null;
  const birthNum = numericYear(person.birth?.date);
  const deathNum = numericYear(person.death?.date);

  const paragraphs = [];

  // Para 1: origin — birth fact and parentage, with sibling count when others
  // are linked through the same parents so the reader gets family-size context.
  // When the name carries a quoted nickname (e.g. Sarah Francis "Fanny" Perry),
  // add a "known as" sentence so the rest of the story's first-name references
  // make sense to a reader who only knows the familiar form.
  const originParts = [];
  originParts.push(birth ? `${intro} was born ${birth}.` : `${intro} is recorded in the family tree.`);
  if (nickname) originParts.push(`${given} was known as ${nickname}.`);
  if (parents.length) {
    const siblingIds = new Set();
    for (const parentId of (index.get(person.id)?.parents || [])) {
      for (const childId of (index.get(parentId)?.children || [])) {
        if (childId !== person.id) siblingIds.add(childId);
      }
    }
    const siblings = [...siblingIds];
    const totalChildren = siblings.length + 1;
    const siblingStr = siblings.length === 0
      ? ""
      : totalChildren <= 4
        ? `, one of ${totalChildren} children alongside ${formatNameList(namesForIds(siblings))}`
        : `, one of ${totalChildren} children`;
    originParts.push(`${given} was the child of ${formatNameList(parents)}${siblingStr}.`);
    // If a parent died while this person was still a child (under 18), name
    // the loss in the origin paragraph — early parental death often shaped the
    // rest of a person's life through guardianship, early work, or remarriage.
    if (birthNum !== null) {
      const earlyLosses = [...(index.get(person.id)?.parents || [])]
        .map((pid) => {
          const parent = personById(pid);
          if (!parent) return null;
          const pdeathNum = numericYear(parent.death?.date);
          if (pdeathNum === null) return null;
          const ageAtLoss = pdeathNum - birthNum;
          if (ageAtLoss < 0 || ageAtLoss > 17) return null;
          return { name: parent.name, year: pdeathNum, age: ageAtLoss };
        })
        .filter(Boolean)
        .sort((a, b) => a.year - b.year);
      for (const loss of earlyLosses) {
        const ageDesc = loss.age === 0
          ? `leaving ${given} an infant`
          : loss.age === 1
            ? `leaving ${given} just a year old`
            : `leaving ${given} ${loss.age} years old`;
        originParts.push(`${loss.name} died in ${loss.year}, ${ageDesc}.`);
      }
    }
  }
  paragraphs.push(originParts.join(" "));

  // Para 2: marriage(s) — include resolved year and approximate age when
  // available so the reader gets "married Jane in 1912, at age 23" rather
  // than a bare name or year-only sentence. Mirrors how age-at-death already
  // adds context to the death paragraph.
  if (spouseIds.length === 1) {
    const m = resolveMarriageYear(person, spouseIds[0]);
    const yearStr = m ? (m.estimated ? ` around ${m.year}` : ` in ${m.year}`) : "";
    const marriageAge = m && birthNum !== null ? m.year - birthNum : null;
    const ageStr = marriageAge !== null && marriageAge >= 14 && marriageAge <= 80
      ? `, at ${m.estimated ? "about " : ""}age ${marriageAge}`
      : "";
    paragraphs.push(`${given} married ${spouseNames[0]}${yearStr}${ageStr}.`);
  } else if (spouseIds.length > 1) {
    const parts = spouseIds.map((sid) => {
      const name = personById(sid)?.name;
      if (!name) return null;
      const m = resolveMarriageYear(person, sid);
      if (!m) return name;
      const marriageAge = birthNum !== null ? m.year - birthNum : null;
      const ageNote = marriageAge !== null && marriageAge >= 14 && marriageAge <= 80
        ? `, ${m.estimated ? "~" : ""}age ${marriageAge}`
        : "";
      return `${name} (${m.estimated ? "~" : ""}${m.year}${ageNote})`;
    }).filter(Boolean);
    paragraphs.push(`${given} was married to ${formatNameList(parts)}.`);
  }

  // Para 3: children and census records — documentary evidence of family life.
  // For people with multiple spouses, children are grouped by co-parent when
  // each child's parents array links back to one of the known spouses, so the
  // reader can tell which children belong to which union without opening each
  // profile. Falls back to the flat list when attribution is unavailable.
  const familyParts = [];
  if (childIds.length > 0) {
    const numWord = (n) =>
      (["one","two","three","four","five","six","seven","eight","nine","ten"][n - 1] || String(n));
    let usedGrouped = false;
    if (spouseIds.length > 1) {
      const spouseSet = new Set(spouseIds);
      const groupMap = new Map();
      const unattr = [];
      for (const cid of childIds) {
        const child = personById(cid);
        const coParent = (child?.parents || []).find((pid) => spouseSet.has(pid));
        if (coParent) {
          if (!groupMap.has(coParent)) groupMap.set(coParent, []);
          groupMap.get(coParent).push(cid);
        } else {
          unattr.push(cid);
        }
      }
      const groups = [...groupMap.entries()];
      if (groups.length >= 2 || (groups.length === 1 && unattr.length > 0)) {
        const totalStr = numWord(childIds.length);
        const groupParts = groups.map(([sid, cids]) => {
          const spouseName = personById(sid)?.name || sid;
          const n = cids.length;
          if (n > 4) {
            const preview = formatNameList(namesForIds(cids.slice(0, 3)));
            return `${numWord(n)} with ${spouseName}, including ${preview}`;
          }
          return `${numWord(n)} with ${spouseName} (${formatNameList(namesForIds(cids))})`;
        });
        if (unattr.length > 0) {
          groupParts.push(`${numWord(unattr.length)} of uncertain parentage`);
        }
        // Use semicolons to separate groups so inner commas/ands don't bleed across.
        familyParts.push(`${given} had ${totalStr} ${childIds.length === 1 ? "child" : "children"}: ${groupParts.join("; ")}.`);
        usedGrouped = true;
      }
    }
    if (!usedGrouped) {
      const childBirthYears = childIds
        .map((cid) => numericYear(personById(cid)?.birth?.date))
        .filter((y) => y !== null)
        .sort((a, b) => a - b);
      const allDated = childBirthYears.length === childIds.length;
      const spanStr = allDated && childBirthYears.length >= 2 && childBirthYears[0] !== childBirthYears[childBirthYears.length - 1]
        ? `, born between ${childBirthYears[0]} and ${childBirthYears[childBirthYears.length - 1]}`
        : "";
      if (childIds.length > 4) {
        const firstNames = namesForIds(childIds.slice(0, 3));
        familyParts.push(`${given} had ${childIds.length} children, including ${formatNameList(firstNames)}${spanStr}.`);
      } else {
        const countWord = numWord(childIds.length);
        const nameList = formatNameList(namesForIds(childIds));
        familyParts.push(childIds.length === 1
          ? `${given} had one recorded child, ${nameList}${spanStr}.`
          : `${given} had ${countWord} recorded children: ${nameList}${spanStr}.`);
      }
    }
  }

  // Add census context derived from attached sources — turns documentary
  // evidence into a readable sentence without repeating place data already
  // stated above. Uses the same year-extraction logic as the timeline so
  // both "1940 U.S. census, Allen County..." and "Ancestry source: 1950
  // United States Federal Census" labels resolve correctly. When the source
  // label includes a county/state, the sentence names the location so the
  // story carries geographic context without the reader opening each source.
  const censusSrcs = profileSources(person)
    .filter((src) => /census/i.test(src.label || src.title || ""));
  const censusYearMap = new Map();
  for (const src of censusSrcs) {
    const yr = sourceEventYear(src, birthNum, deathNum);
    if (yr === null) continue;
    if (!censusYearMap.has(yr)) {
      censusYearMap.set(yr, extractCensusLocation(src.label || src.title || ""));
    }
  }
  const censusYears = [...censusYearMap.keys()].sort((a, b) => a - b);
  if (censusYears.length === 1) {
    const loc = censusYearMap.get(censusYears[0]);
    const locStr = loc ? ` in ${loc}` : "";
    familyParts.push(`${given} appears in the ${censusYears[0]} U.S. census${locStr}.`);
  } else if (censusYears.length >= 2) {
    const last = censusYears[censusYears.length - 1];
    const rest = censusYears.slice(0, -1);
    const locations = [...new Set(censusYears.map((y) => censusYearMap.get(y)).filter(Boolean))];
    if (locations.length === 1) {
      familyParts.push(`${given} appears in U.S. census records from ${rest.join(", ")} and ${last} in ${locations[0]}.`);
    } else if (censusYears.length === 2) {
      // Two census years with different (or partially-missing) locations — name each pair so
      // geographic movement is visible ("in Allen County, Kentucky" → "in Warren County, Kentucky").
      const loc0 = censusYearMap.get(censusYears[0]);
      const loc1 = censusYearMap.get(censusYears[1]);
      const str0 = loc0 ? `the ${censusYears[0]} U.S. census in ${loc0}` : `the ${censusYears[0]} U.S. census`;
      const str1 = loc1 ? `the ${censusYears[1]} census in ${loc1}` : `the ${censusYears[1]} census`;
      familyParts.push(`${given} appears in ${str0} and ${str1}.`);
    } else {
      familyParts.push(`${given} appears in U.S. census records from ${rest.join(", ")} and ${last}.`);
    }
  }
  if (familyParts.length) paragraphs.push(familyParts.join(" "));

  // Para 4: death — include who the person left behind so the story closes
  // with the same family context the life timeline shows for the death event.
  if (death) {
    const ageStr = age ? (age.approx ? `, about age ${age.years}` : `, aged ${age.years}`) : "";
    const deathYear = numericYear(person.death?.date);
    const survivingChildren = deathYear !== null
      ? childIds.filter((cid) => {
          const child = personById(cid);
          const childDeath = numericYear(child?.death?.date);
          return childDeath === null || childDeath > deathYear;
        })
      : [];
    const survivingSpouses = deathYear !== null
      ? spouseIds.filter((sid) => {
          const spouse = personById(sid);
          const spouseDeath = numericYear(spouse?.death?.date);
          return spouseDeath === null || spouseDeath > deathYear;
        })
      : [];
    const survivedBy = [];
    if (survivingChildren.length === 1) {
      survivedBy.push(`child ${givenName(personById(survivingChildren[0])?.name)}`);
    } else if (survivingChildren.length >= 2 && survivingChildren.length <= 3) {
      const givens = survivingChildren.map((cid) => givenName(personById(cid)?.name));
      survivedBy.push(`children ${formatNameList(givens)}`);
    } else if (survivingChildren.length > 3) {
      survivedBy.push(`${survivingChildren.length} children`);
    }
    if (survivingSpouses.length === 1) survivedBy.push(`spouse ${givenName(personById(survivingSpouses[0])?.name)}`);
    else if (survivingSpouses.length > 1) survivedBy.push(`${survivingSpouses.length} spouses`);
    const survivedStr = survivedBy.length ? `, survived by ${survivedBy.join(" and ")}` : "";
    const burialProse = person.burial?.place ? ` ${given} is buried ${formatEventProse(person.burial)}.` : "";
    paragraphs.push(`${given} died ${death}${ageStr}${survivedStr}.${burialProse}`);
  } else if (person.burial?.place) {
    paragraphs.push(`${given} is buried ${formatEventProse(person.burial)}.`);
  }

  return paragraphs;
}

function profilePhotos(person) {
  return [
    ...(person.profile?.photos || []),
    ...(person.photos || []),
  ].filter((photo) => photo?.url);
}

function profileSources(person) {
  const sourceLike = [
    ...(person.sources || []),
    ...(person.profile?.sources || []),
    ...profilePhotos(person).map((photo) => ({
      label: photo.caption || `Photo of ${person.name}`,
      title: photo.caption,
      url: photo.sourceUrl || photo.url,
      repository: photo.credit,
      type: "photo",
    })),
    ...(person.profile?.obituaries || []),
    ...(person.obituaries || []),
  ];
  const seen = new Set();
  return sourceLike.filter((source) => {
    if (!source?.label && !source?.title && !source?.url) return false;
    const key = source.url || source.label || source.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The sources panel reads as a paper trail when records follow the person's
// life: anything with a resolvable year (explicit date or a year in the label,
// via the same sourceEventYear the timeline uses) sorts chronologically, and
// undated leads keep their original order after the dated run.
function chronologicalSources(sources, person) {
  const birth = numericYear(person.birth?.date);
  const death = numericYear(person.death?.date);
  return sources
    .map((source, order) => ({ source, order, year: sourceEventYear(source, birth, death) }))
    .sort((a, b) => {
      if (a.year === null || b.year === null) {
        if (a.year !== b.year) return a.year === null ? 1 : -1;
      } else if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.order - b.order;
    });
}

// A profile can carry several obituary leads — the person's own notice plus
// relatives' obituaries that mention them — so every entry becomes a badge
// instead of only the first one surviving.
function profileObituaries(person) {
  return [...(person.profile?.obituaries || []), ...(person.obituaries || [])]
    .filter((item) => item?.url || item?.title || item?.publication);
}

// The person an obituary notice is about, read from titles shaped like
// "Danny Graves obituary, Bowling Green Daily News". Empty when the title
// doesn't follow that shape (e.g. Find a Grave memorial leads).
function obituarySubject(title) {
  const match = /^(.{2,60}?)\s+obituary\b/i.exec(title || "");
  return match ? match[1].trim() : "";
}

// Loose same-person check between an obituary subject and the profile name:
// first and last name tokens both match, so middle names, initials, and
// parenthesized maiden names don't break the comparison.
function obituarySubjectIsPerson(subject, name) {
  const tokens = (value) =>
    (value || "").toLowerCase().replace(/[().,'"]/g, " ").split(/\s+/).filter(Boolean);
  const a = tokens(subject);
  const b = tokens(name);
  if (!a.length || !b.length) return false;
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

// Most real sources are bare label+URL pairs from a handful of archives, so a
// badge derived from the link's hostname carries the "where does this live"
// signal and the label no longer needs its repetitive "Ancestry source:" prefix.
const SOURCE_REPOSITORIES = [
  ["ancestry.com", "Ancestry"],
  ["ancestry.co.uk", "Ancestry"],
  ["findagrave.com", "Find a Grave"],
  ["familysearch.org", "FamilySearch"],
  ["newspapers.com", "Newspapers.com"],
  ["billiongraves.com", "BillionGraves"],
  ["fold3.com", "Fold3"],
  ["chroniclingamerica.loc.gov", "Chronicling America"],
  ["archive.org", "Internet Archive"],
  ["archives.gov", "National Archives"],
  ["legacy.com", "Legacy.com"],
  ["wikitree.com", "WikiTree"],
];

function sourceRepositoryName(url) {
  if (!url) return "";
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
  // Match on domain boundaries so "example-county-archive.org" does not badge
  // as Internet Archive.
  const known = SOURCE_REPOSITORIES.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return known ? known[1] : host.replace(/^www\./, "");
}

function sourceQuality(source) {
  const repository = source.repository || sourceRepositoryName(source.url);
  const text = [
    source.type,
    source.confidence,
    source.label,
    source.title,
    source.repository,
    repository,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/conflict|disputed|contradict/i.test(text)) return { key: "conflict", label: "Conflict", className: "source-quality-conflict" };
  if (/photo|image/.test(text)) return { key: "photo", label: "Photo", className: "source-quality-photo" };
  if (/find a grave|billiongraves|memorial|cemetery|grave/.test(text)) return { key: "memorial", label: "Memorial", className: "source-quality-memorial" };
  if (/index|kdla|sortedbyname|death file|birls/.test(text)) return { key: "index", label: "Index", className: "source-quality-index" };
  if (/^(user-provided|research log)/.test(text)) return { key: "note", label: "Note", className: "source-quality-note" };
  if (/tree lead|compiled|family tree|familysearch public|wikitree|fgs project|lead only/.test(text)) {
    return { key: "lead", label: "Lead", className: "source-quality-lead" };
  }
  if (/census|certificate|marriage|draft|record|obituary|legacy|newspaper|archives|nara|national archives/.test(text)) {
    return { key: "record", label: "Record", className: "source-quality-record" };
  }
  return { key: "source", label: "Source", className: "source-quality-source" };
}

function evidenceSummary(sources, person) {
  const counts = new Map();
  for (const source of sources) {
    const quality = sourceQuality(source);
    counts.set(quality.key, (counts.get(quality.key) || 0) + 1);
  }
  const attention = (person.tags || []).some((tag) => tagStatusTone(tag) === "status-attention");
  if (attention && !counts.has("conflict")) counts.set("conflict", 1);
  const parts = [
    ["record", "record"],
    ["index", "index"],
    ["memorial", "memorial"],
    ["lead", "lead"],
    ["conflict", "conflict"],
  ].flatMap(([key, label]) => {
    const count = counts.get(key) || 0;
    return count ? [`${count} ${label}${count === 1 ? "" : "s"}`] : [];
  });
  return parts.length ? parts.join(" · ") : `${sources.length} source${sources.length === 1 ? "" : "s"}`;
}

function placeSearchPill(prefix, place) {
  const pill = metaPill(`${prefix} ${place}`, "", () => searchByTag(place));
  pill.title = `Find others from ${place}`;
  return pill;
}

function evidencePill(sources, person) {
  const hasConflict = (person.tags || []).some((tag) => tagStatusTone(tag) === "status-attention")
    || sources.some((source) => sourceQuality(source).key === "conflict");
  const hasLead = (person.tags || []).some((tag) => tagStatusTone(tag) === "status-lead")
    || sources.some((source) => sourceQuality(source).key === "lead");
  const pill = metaPill(evidenceSummary(sources, person), hasConflict ? "status-attention" : hasLead ? "status-lead" : "status-verified", () => {
    state.sourcesExpanded = true;
    renderDetails();
    els.sourcesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  pill.title = "Open source details";
  return pill;
}

function sourceText(source) {
  return [
    source.type,
    source.confidence,
    source.label,
    source.title,
    source.repository,
    source.publication,
    source.excerpt,
    sourceRepositoryName(source.url),
  ].filter(Boolean).join(" ").toLowerCase();
}

function sourceMatches(source, pattern) {
  return pattern.test(sourceText(source));
}

function sourcedBy(sources, pattern) {
  return sources.some((source) => sourceMatches(source, pattern));
}

function leadCount(sources) {
  return sources.filter((source) => sourceQuality(source).key === "lead").length;
}

function coverageItem(key, label, status, detail) {
  return { key, label, status, detail };
}

function factCoverage({ key, label, hasFact, hasSource, hasLead, missingDetail, leadDetail, sourcedDetail }) {
  if (!hasFact) return coverageItem(key, label, "missing", missingDetail);
  if (hasSource) return coverageItem(key, label, "sourced", sourcedDetail || "Direct source attached");
  if (hasLead) return coverageItem(key, label, "lead", leadDetail || "Needs direct source");
  return coverageItem(key, label, "lead", leadDetail || "Fact present; source not identified");
}

function evidenceCoverage(person, index = relationshipIndex()) {
  const sources = profileSources(person);
  const sourceLeadCount = leadCount(sources);
  const hasAnyLead = sourceLeadCount > 0 || (person.tags || []).some((tag) => tagStatusTone(tag) === "status-lead");
  const parents = [...(index.get(person.id)?.parents || [])];
  const spouses = [...(index.get(person.id)?.spouses || [])];
  const children = [...(index.get(person.id)?.children || [])];
  const hasRecordSource = sources.some((source) => sourceQuality(source).key === "record");
  const hasConflict = sources.some((source) => sourceQuality(source).key === "conflict")
    || (person.tags || []).some((tag) => tagStatusTone(tag) === "status-attention");

  const items = [
    factCoverage({
      key: "birth",
      label: "Birth",
      hasFact: Boolean(person.birth?.date || person.birth?.place),
      hasSource: sourcedBy(sources, /\b(birth|born|baptism|baptized|christening|delayed birth|birth certificate)\b/),
      hasLead: hasAnyLead,
      missingDetail: "No birth date or place",
      leadDetail: "Birth fact needs a direct source",
      sourcedDetail: "Birth source found",
    }),
    factCoverage({
      key: "death",
      label: "Death",
      hasFact: Boolean(person.death?.date || person.death?.place),
      hasSource: sourcedBy(sources, /\b(death|died|obituary|memorial|grave|cemetery|burial|funeral)\b/),
      hasLead: hasAnyLead,
      missingDetail: currentAgeLabel(person) ? "Living or no death recorded" : "No death date or place",
      leadDetail: "Death fact needs a direct source",
      sourcedDetail: "Death source found",
    }),
    factCoverage({
      key: "parents",
      label: "Parents",
      hasFact: parents.length > 0,
      hasSource: sourcedBy(sources, /\b(parent|parents|father|mother|son of|daughter of|child of|census|obituary)\b/),
      hasLead: hasAnyLead || hasRecordSource,
      missingDetail: "No parents linked",
      leadDetail: parents.length === 1 ? "One parent linked; needs support" : "Parents linked; evidence not explicit",
      sourcedDetail: `${parents.length} parent${parents.length === 1 ? "" : "s"} linked with supporting source`,
    }),
    spouses.length
      ? factCoverage({
          key: "marriage",
          label: "Marriage",
          hasFact: true,
          hasSource: sourcedBy(sources, /\b(marriage|married|wedding|license|spouse|husband|wife|divorce)\b/),
          hasLead: hasAnyLead,
          leadDetail: spouses.length === 1 ? "Spouse linked; marriage source missing" : `${spouses.length} spouses linked; sources missing`,
          sourcedDetail: "Marriage or spouse source found",
        })
      : coverageItem("marriage", "Marriage", "not-applicable", "No spouse linked"),
    children.length
      ? factCoverage({
          key: "children",
          label: "Children",
          hasFact: true,
          hasSource: sourcedBy(sources, /\b(child|children|son|daughter|census|obituary|survived by)\b/),
          hasLead: hasAnyLead || hasRecordSource,
          leadDetail: `${children.length} child${children.length === 1 ? "" : "ren"} linked; evidence not explicit`,
          sourcedDetail: `${children.length} child${children.length === 1 ? "" : "ren"} linked with supporting source`,
        })
      : coverageItem("children", "Children", "not-applicable", "No children linked"),
    sourcedBy(sources, /\b(census|residence|resident|city directory|public records|address|lived|household)\b/)
      ? coverageItem("residence", "Census / residence", "sourced", "Residence record found")
      : coverageItem("residence", "Census / residence", hasAnyLead ? "lead" : "missing", hasAnyLead ? "No residence record identified" : "No census or residence source"),
    sourcedBy(sources, /\b(obituary|memorial|find a grave|billiongraves|legacy|grave|cemetery)\b/)
      ? coverageItem("obituary", "Obituary / memorial", "sourced", "Memorial or obituary source found")
      : coverageItem("obituary", "Obituary / memorial", hasAnyLead ? "lead" : "missing", "No obituary or memorial source"),
  ];

  if (hasConflict) {
    items.unshift(coverageItem("conflict", "Conflicts", "attention", "Review conflicting or duplicate evidence"));
  }
  return items;
}

function evidenceCoverageSummary(items) {
  const counts = items.reduce((map, item) => {
    map.set(item.status, (map.get(item.status) || 0) + 1);
    return map;
  }, new Map());
  return {
    sourced: counts.get("sourced") || 0,
    lead: counts.get("lead") || 0,
    missing: counts.get("missing") || 0,
    attention: counts.get("attention") || 0,
    notApplicable: counts.get("not-applicable") || 0,
  };
}

function renderEvidenceCoverage(person) {
  const items = evidenceCoverage(person);
  const summary = evidenceCoverageSummary(items);
  const reviewCount = summary.attention + summary.lead + summary.missing;
  const label = document.createElement("p");
  label.className = "notes-label";
  label.textContent = "Evidence coverage";

  const summaryLine = document.createElement("p");
  summaryLine.className = "evidence-summary";
  summaryLine.textContent = reviewCount
    ? `${summary.sourced} covered · ${reviewCount} to review`
    : `${summary.sourced} covered`;

  const list = document.createElement("div");
  list.className = "evidence-grid";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = `evidence-item evidence-${item.status}`;
    const name = document.createElement("strong");
    name.textContent = item.label;
    const status = document.createElement("span");
    status.className = "evidence-status";
    status.textContent = evidenceStatusLabel(item.status);
    const detail = document.createElement("small");
    detail.textContent = item.detail;
    row.append(name, status, detail);
    list.append(row);
  }

  els.detailEvidence.replaceChildren(label, summaryLine, list);
}

function evidenceStatusLabel(status) {
  return {
    sourced: "Sourced",
    lead: "Lead",
    missing: "Missing",
    attention: "Review",
    "not-applicable": "N/A",
  }[status] || status;
}

function cleanSourceLabel(label, repository) {
  if (!label || !repository) return label || "";
  const stripped = label.replace(
    new RegExp(`^${repository.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*(source|record|entry)?\\s*[:\\-–]\\s*`, "i"),
    "",
  ).trim();
  return stripped || label;
}

function renderSourceItem(source, eventYear = null, birthYear = null) {
  const item = document.createElement(source.url ? "a" : "div");
  const quality = sourceQuality(source);
  item.className = `source-item ${quality.className} ${source.type ? `source-${source.type}` : ""}`;
  if (source.url) {
    item.href = source.url;
    item.target = "_blank";
    item.rel = "noreferrer";
  }

  const repository = source.repository || sourceRepositoryName(source.url);
  const heading = document.createElement("span");
  heading.className = "source-heading";
  if (repository) {
    const badge = document.createElement("span");
    badge.className = "source-badge";
    badge.textContent = repository;
    heading.append(badge);
  }
  const qualityBadge = document.createElement("span");
  qualityBadge.className = `source-badge ${quality.className}`;
  qualityBadge.textContent = quality.label;
  heading.append(qualityBadge);
  const title = document.createElement("span");
  title.className = "source-title";
  title.textContent = cleanSourceLabel(source.label || source.title, repository) || source.url;
  heading.append(title);
  item.append(heading);

  // The repository already shows as the badge, so the meta line only carries
  // what the badge cannot: dates, publication names, and confidence notes.
  // A year lifted out of the label makes the panel's chronological order
  // visible; an explicit date already carries that signal itself. When both
  // a resolvable event year and the person's birth year are known, append
  // "age N" so the reader gets instant context without doing mental math.
  const resolvedYear = numericYear(source.date) ?? eventYear;
  const recordAge = (resolvedYear !== null && birthYear !== null)
    ? resolvedYear - birthYear
    : null;
  const ageStr = (recordAge !== null && recordAge > 0 && recordAge < 120) ? `age ${recordAge}` : null;
  const meta = [source.date || eventYear, ageStr, source.publication, source.confidence]
    .filter(Boolean)
    .join(" · ");
  if (meta) {
    const small = document.createElement("small");
    small.className = "source-meta";
    small.textContent = meta;
    item.append(small);
  }

  if (source.excerpt) {
    const excerpt = document.createElement("p");
    excerpt.textContent = source.excerpt;
    item.append(excerpt);
  }

  return item;
}

function renderTree() {
  const root = personById(state.rootId);
  if (!root) return;
  const selected = personById(state.selectedId) || root;

  const index = relationshipIndex();
  const directIds = directRelatives(root.id, index);
  const visibleIds = state.collapseCollateral ? expandedTreeIds(root.id, index) : null;
  const graph = buildBranch(root.id, index, visibleIds);
  const nodes = layoutNodes(graph, index);
  const visibleIdSet = new Set(nodes.map((node) => node.person.id));
  // While a search is typed, matching cards light up and everyone else fades,
  // so a person can be spotted inside a crowded branch without leaving the tree.
  const searchTerm = els.search.value.trim().toLowerCase();
  const searchIds = searchTerm ? new Set(searchMatches(searchTerm).map((match) => match.id)) : null;
  const branchSides = branchSideAssignments(root.id, nodes, index);
  renderBranchLegend(root.id, branchSides.size > 0, index);
  const familyUnits = layoutFamilyUnits(nodes, index, directIds);
  const links = layoutLinks(nodes, index, directIds);
  const width = Math.max(els.viewport.clientWidth, 360);
  const height = Math.max(els.viewport.clientHeight, 520);
  const visibleParents = nodes.filter((node) => generationOffset(root.id, node.person.id, index) < 0).length;
  const hiddenParentCount = state.collapseCollateral ? hiddenExpandableParentCount(nodes, index) : 0;
  const expandedBranchCount =
    state.expandedAncestors.size + state.expandedSiblings.size + state.expandedChildren.size;
  // Expansions only shape the minimal tree, so the reset button stays out of full view.
  els.collapseBranches.hidden = !state.collapseCollateral || expandedBranchCount === 0;
  const directCount = nodes.filter((node) => directIds.has(node.person.id)).length;
  const collateralCount = nodes.length - directCount;

  els.title.textContent = state.collapseCollateral ? `Minimal tree for ${root.name}` : `Full network for ${root.name}`;
  els.treeFocusName.textContent = root.name;
  els.selectedName.textContent = selected.name;
  const selectedKinship = selected.id === root.id ? "" : kinshipLabel(selected.id, root.id, index);
  els.selectedContext.textContent = selected.id === root.id
    ? "Selected person matches the current tree focus."
    : selectedKinship
      ? `${root.name}'s ${selectedKinship}.`
      : `Selected profile while tree focus stays on ${root.name}.`;
  const baseCount = state.collapseCollateral
    ? `${nodes.length} visible people, ${visibleParents} ancestors shown, ${hiddenParentCount} hidden`
    : `${directCount} direct line, ${collateralCount} collateral`;
  const searchHitCount = searchIds ? nodes.filter((node) => searchIds.has(node.person.id)).length : 0;
  els.count.textContent = searchIds
    ? `${baseCount} · ${searchHitCount} of ${searchIds.size} match${searchIds.size === 1 ? "" : "es"} in view`
    : baseCount;
  els.focusDirect.textContent = state.collapseCollateral ? "Show full tree" : "Minimal tree";
  els.focusDirect.title = state.collapseCollateral
    ? "Show every connected relative around this family"
    : "Start small and reveal ancestors manually";
  els.focusDirect.classList.toggle("active", state.collapseCollateral);
  els.focusDirect.setAttribute("aria-pressed", String(state.collapseCollateral));
  els.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.svg.replaceChildren();

  const g = svgEl("g", { transform: `translate(${state.offsetX} ${state.offsetY}) scale(${state.scale})` });
  if (state.scale < 0.5) g.classList.add("overview-scale");
  els.svg.append(g);

  const linkEls = [];
  // The selected person's whole lineage back to the tree focus stays lit, not
  // just the connectors touching them — the hover trace made this readable but
  // vanished on mouse-out and never fired on touch, where tapping selects.
  const selectedHops = lineageHops(selected.id, root.id, index);
  for (const link of links) {
    const focused = link.people?.includes(selected.id) || linkOnLineage(link.people || [], selectedHops);
    const el = svgEl("path", {
      class: `tree-link ${link.kind || ""} ${!state.collapseCollateral && !link.direct ? "dimmed" : ""} ${focused ? "focused" : ""}`,
      d: link.d,
    });
    linkEls.push({ el, people: link.people || [] });
    g.append(el);
  }
  // Hovering (or keyboard-focusing) a card lights up every connector touching
  // that person, plus the chain of connectors running back to the tree focus,
  // so a card deep in a crowded branch shows which line it hangs from.
  const setLinkTrace = (personId, on) => {
    const hops = lineageHops(personId, root.id, index);
    for (const { el, people } of linkEls) {
      if (people.includes(personId) || linkOnLineage(people, hops)) el.classList.toggle("traced", on);
    }
  };

  // Arrow keys walk the tree from a focused card: Up/Down prefer an actual
  // parent/child (nearest branch when there are several), Left/Right slide
  // along the same generation row. Falls back to the spatially nearest card
  // in that direction so navigation never dead-ends on layout quirks.
  const groupById = new Map();
  const nearestNode = (candidates, from) => candidates.reduce((best, other) => {
    const cost = (n) => Math.abs(n.x - from.x) + Math.abs(n.y - from.y) * 2;
    return !best || cost(other) < cost(best) ? other : best;
  }, null);
  const arrowTarget = (node, key) => {
    const others = nodes.filter((other) => other !== node);
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const dir = key === "ArrowLeft" ? -1 : 1;
      return nearestNode(others.filter((other) =>
        Math.abs(other.y - node.y) < NODE_HALF_HEIGHT && Math.sign(other.x - node.x) === dir), node);
    }
    const dir = key === "ArrowUp" ? -1 : 1;
    const relIds = key === "ArrowUp"
      ? index.get(node.person.id)?.parents
      : index.get(node.person.id)?.children;
    const relatives = others.filter((other) => relIds?.has(other.person.id));
    if (relatives.length) return nearestNode(relatives, node);
    return nearestNode(others.filter((other) => Math.sign(other.y - node.y) === dir), node);
  };

  for (const unit of familyUnits) {
    g.append(svgEl("rect", {
      class: `family-unit ${!state.collapseCollateral && !unit.direct ? "dimmed" : ""}`,
      x: unit.x,
      y: unit.y,
      width: unit.width,
      height: unit.height,
      rx: 10,
    }));
    if (unit.label) {
      g.append(svgText(unit.label, unit.x + 14, unit.y + 18, "family-label", "start"));
    }
  }

  for (const node of nodes) {
    const isCollateral = !state.collapseCollateral && !directIds.has(node.person.id);
    const parentIds = [...(index.get(node.person.id)?.parents || [])];
    const visibleParentIds = parentIds.filter((id) => nodes.some((candidate) => candidate.person.id === id));
    const hiddenParents = parentIds.length - visibleParentIds.length;
    if (state.collapseCollateral && hiddenParents > 0) {
      const above = hiddenAncestorsAbove(node.person.id, visibleIdSet, index);
      const deepBranch = above > hiddenParents;
      const hiddenParentIds = parentIds.filter((id) => !visibleParentIds.includes(id));
      const hiddenParentFirstNames = hiddenParentIds.map((id) => givenName(personById(id)?.name)).filter(Boolean);
      const parentNameStr = hiddenParentFirstNames.length === 1
        ? hiddenParentFirstNames[0]
        : hiddenParentFirstNames.length === 2
          ? `${hiddenParentFirstNames[0]} & ${hiddenParentFirstNames[1]}`
          : "";
      const baseLabel = hiddenParents === 1
        ? (parentNameStr ? `Show parent: ${parentNameStr}` : "Show parent")
        : (parentNameStr ? `Show parents: ${parentNameStr}` : "Show parents");
      g.append(ancestorToggle(node, {
        label: deepBranch ? `${baseLabel} · ${above} above` : baseLabel,
        ariaLabel: deepBranch
          ? `Show parents of ${node.person.name} (${above} hidden ancestors above, shift-click to reveal all)`
          : `Show parents of ${node.person.name}`,
        tooltip: deepBranch
          ? `Reveal the next generation. Shift-click to reveal all ${above} ancestors above.`
          : "",
        onToggle: (event) => {
          if (deepBranch && event?.shiftKey) expandAncestorBranch(node.person.id);
          else expandParents(node.person.id);
        },
      }));
    } else if (state.collapseCollateral && visibleParentIds.length > 0 && state.expandedAncestors.has(node.person.id)) {
      g.append(ancestorToggle(node, {
        label: `Hide parent${visibleParentIds.length === 1 ? "" : "s"}`,
        ariaLabel: `Hide parents of ${node.person.name}`,
        collapse: true,
        onToggle: () => collapseParents(node.person.id),
      }));
    }

    // Siblings expand downward from a card the same way ancestors expand
    // upward, so aunts/uncles arrive one family at a time instead of only via
    // the full-network view. The pill hangs under the card; the hide pill
    // appears once the reveal is active and everyone is on screen.
    if (state.collapseCollateral) {
      let belowPill = null;
      const hiddenSiblings = hiddenSiblingIds(node.person.id, visibleIdSet, index);
      if (hiddenSiblings.size > 0) {
        belowPill = ancestorToggle(node, {
          label: `Show sibling${hiddenSiblings.size === 1 ? "" : `s · ${hiddenSiblings.size}`}`,
          ariaLabel: `Show ${hiddenSiblings.size} hidden sibling${hiddenSiblings.size === 1 ? "" : "s"} of ${node.person.name}`,
          below: true,
          onToggle: () => expandSiblings(node.person.id),
        });
      } else if (
        state.expandedSiblings.has(node.person.id)
        && [...(index.get(node.person.id)?.parents || [])].some((parentId) =>
          visibleIdSet.has(parentId)
          && [...(index.get(parentId)?.children || [])].some((childId) =>
            childId !== node.person.id && visibleIdSet.has(childId)))
      ) {
        belowPill = ancestorToggle(node, {
          label: "Hide siblings",
          ariaLabel: `Hide siblings of ${node.person.name}`,
          collapse: true,
          below: true,
          onToggle: () => collapseSiblings(node.person.id),
        });
      }

      // Descendants expand downward the same way: grandchildren of the focus
      // or cousins under a revealed aunt arrive one family at a time. The pill
      // shares the below-card slot with the sibling pill (siblings win), and
      // only shows when every child is hidden — once any child is on screen,
      // that child's own sibling pill covers the rest of the family.
      if (!belowPill) {
        const childIds = [...(index.get(node.person.id)?.children || [])];
        const anyChildVisible = childIds.some((id) => visibleIdSet.has(id));
        const hiddenChildren = hiddenChildIds(node.person.id, visibleIdSet, index);
        if (!anyChildVisible && hiddenChildren.size > 0) {
          belowPill = ancestorToggle(node, {
            label: `Show child${hiddenChildren.size === 1 ? "" : `ren · ${hiddenChildren.size}`}`,
            ariaLabel: `Show ${hiddenChildren.size} hidden child${hiddenChildren.size === 1 ? "" : "ren"} of ${node.person.name}`,
            below: true,
            onToggle: () => expandChildren(node.person.id),
          });
        } else if (state.expandedChildren.has(node.person.id) && anyChildVisible) {
          belowPill = ancestorToggle(node, {
            label: "Hide children",
            ariaLabel: `Hide children of ${node.person.name}`,
            collapse: true,
            below: true,
            onToggle: () => collapseChildren(node.person.id),
          });
        }
      }
      if (belowPill) g.append(belowPill);
    }

    const group = svgEl("g", {
      class: `tree-node ${node.person.id === state.rootId ? "root" : ""} ${node.person.id === state.selectedId ? "selected" : ""} ${isCollateral ? "dimmed" : ""} ${searchIds ? (searchIds.has(node.person.id) ? "search-hit" : "search-miss") : ""} ${branchSides.has(node.person.id) ? `branch-side-${branchSides.get(node.person.id)}` : ""}`,
      transform: `translate(${node.x} ${node.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": node.person.name,
    });
    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    group.addEventListener("pointerenter", () => setLinkTrace(node.person.id, true));
    group.addEventListener("pointerleave", () => setLinkTrace(node.person.id, false));
    group.addEventListener("focus", () => setLinkTrace(node.person.id, true));
    group.addEventListener("blur", () => setLinkTrace(node.person.id, false));
    group.addEventListener("click", () => selectPerson(node.person.id, false, true));
    // Double-click (or Shift+Enter) refocuses the tree on that person directly,
    // skipping the select-then-"Make tree focus" round trip through the profile.
    group.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      if (node.person.id !== state.rootId) selectPerson(node.person.id, true, true);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const reroot = event.shiftKey && node.person.id !== state.rootId;
        selectPerson(node.person.id, reroot, true);
      } else if (event.key.startsWith("Arrow")) {
        const target = arrowTarget(node, event.key);
        if (target) {
          event.preventDefault();
          groupById.get(target.person.id)?.focus();
        }
      }
    });
    groupById.set(node.person.id, group);

    // Hovering a card answers "who is this relative to the focus person?"
    // so deep rows of similar names stop needing a profile click to identify.
    const hint = svgEl("title", {});
    const hintYears = formatYears(node.person);
    const hintKinship = node.person.id === root.id ? "" : kinshipLabel(node.person.id, root.id, index);
    hint.textContent = node.person.id === state.rootId
      ? [node.person.name, hintYears, "current tree focus"].filter(Boolean).join(" · ")
      : `${[node.person.name, hintYears, hintKinship ? `${root.name}'s ${hintKinship}` : ""].filter(Boolean).join(" · ")} — double-click to make tree focus`;
    group.append(hint);
    group.append(svgEl("rect", { x: -NODE_HALF_WIDTH, y: -NODE_HALF_HEIGHT, width: NODE.width, height: NODE.height, rx: 8 }));
    if (branchSides.has(node.person.id)) {
      group.append(svgEl("rect", {
        class: "branch-stripe",
        x: -NODE_HALF_WIDTH + 4,
        y: -NODE_HALF_HEIGHT + 8,
        width: 5,
        height: NODE.height - 16,
        rx: 2.5,
      }));
    }
    renderTreePortrait(group, node.person);
    const nameLines = nodeNameLines(node.person.name);
    if (nameLines.length === 1) {
      group.append(svgText(nameLines[0], NODE.textX, -7, "node-name"));
      group.append(svgText(formatYears(node.person), NODE.textX, 16, "node-years"));
    } else {
      group.append(svgText(nameLines[0], NODE.textX, -17, "node-name"));
      group.append(svgText(nameLines[1], NODE.textX, -2, "node-name"));
      group.append(svgText(formatYears(node.person), NODE.textX, 20, "node-years"));
    }
    g.append(group);
  }

  renderGenerationGutter(nodes, index, root, height);
}

// Pin a label for each generation row to the left edge of the viewport
// ("Grandparents", "2nd great-grandparents", …) so deep ancestor rows stay
// identifiable while panning through intermixed branches. Drawn outside the
// pan/zoom group in screen space; pan and zoom re-render the tree, so the
// labels track their rows.
function renderGenerationGutter(nodes, index, root, height) {
  const rows = new Map();
  for (const node of nodes) {
    const generation = generationOffset(root.id, node.person.id, index);
    if (!rows.has(generation) || node.y < rows.get(generation)) rows.set(generation, node.y);
  }
  if (rows.size < 2) return;
  for (const [generation, worldY] of rows) {
    const screenY = worldY * state.scale + state.offsetY;
    if (screenY < 18 || screenY > height - 10) continue;
    els.svg.append(svgText(generationRowLabel(generation), 14, screenY + 4, "generation-label", "start"));
  }
}

function generationRowLabel(generation) {
  if (generation === 0) return "Focus generation";
  const depth = Math.abs(generation);
  const label = generation < 0
    ? lineLabel(depth, "parents", "grandparents", "great-grandparents")
    : lineLabel(depth, "children", "grandchildren", "great-grandchildren");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ancestorToggle(node, { label, ariaLabel, tooltip = "", onToggle, collapse = false, below = false }) {
  const pillY = below ? node.y + NODE_HALF_HEIGHT + 28 : node.y - NODE_HALF_HEIGHT - 28;
  const toggle = svgEl("g", {
    class: `ancestor-expander ${collapse ? "collapse" : ""}`,
    transform: `translate(${node.x} ${pillY})`,
    tabindex: "0",
    role: "button",
    "aria-label": ariaLabel,
  });
  const width = Math.max(116, Math.round(label.length * 6.6) + 28);
  toggle.append(svgEl("rect", { x: -width / 2, y: -14, width, height: 26, rx: 13 }));
  toggle.append(svgText(label, 0, 4, "ancestor-expander-text"));
  if (tooltip) {
    const title = svgEl("title", {});
    title.textContent = tooltip;
    toggle.append(title);
  }
  toggle.addEventListener("pointerdown", (event) => event.stopPropagation());
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggle(event);
  });
  toggle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle(event);
    }
  });
  return toggle;
}

function renderTreePortrait(group, person) {
  const [photo] = profilePhotos(person);
  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const radius = NODE.photoSize / 2;
  const x = NODE.portraitX - radius;
  const y = -radius;
  const clipId = `portrait-${cssSafeId(person.id)}`;

  group.append(svgEl("circle", {
    class: "node-photo-placeholder",
    cx: NODE.portraitX,
    cy: 0,
    r: radius,
  }));
  group.append(svgText(initials || "?", NODE.portraitX, 5, "node-photo-initials"));

  if (!photo) return;

  const defs = svgEl("defs", {});
  const clip = svgEl("clipPath", { id: clipId });
  clip.append(svgEl("circle", { cx: NODE.portraitX, cy: 0, r: radius }));
  defs.append(clip);
  group.append(defs);

  const image = svgEl("image", {
    class: "node-photo",
    href: photo.url,
    x,
    y,
    width: NODE.photoSize,
    height: NODE.photoSize,
    "clip-path": `url(#${clipId})`,
    preserveAspectRatio: "xMidYMid slice",
  });
  image.addEventListener("error", () => {
    image.remove();
  });
  group.append(image);
}

function buildBranch(rootId, index, visibleIds = null) {
  const ids = connectedRelatives(rootId, index).filter((id) => !visibleIds || visibleIds.has(id));
  return ids.map((id) => personById(id)).filter(Boolean);
}

function expandedTreeIds(rootId, index) {
  const visible = new Set([rootId]);
  for (const spouseId of index.get(rootId)?.spouses || []) visible.add(spouseId);
  for (const childId of index.get(rootId)?.children || []) {
    visible.add(childId);
    for (const childSpouseId of index.get(childId)?.spouses || []) visible.add(childSpouseId);
  }

  // Anyone visible (however they got there — parent, spouse, in-law) can have
  // their expansion applied, so iterate until no expansion adds new people.
  const applied = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...visible]) {
      if (applied.has(id) || !state.expandedAncestors.has(id)) continue;
      applied.add(id);
      for (const parentId of index.get(id)?.parents || []) {
        if (!visible.has(parentId)) changed = true;
        visible.add(parentId);
        for (const spouseId of index.get(parentId)?.spouses || []) {
          if (!visible.has(spouseId)) changed = true;
          visible.add(spouseId);
        }
      }
    }
    // Sibling reveals: children of a person's visible parents join the row.
    // Gated on parent visibility so a sibling never floats in without the
    // connecting family line.
    for (const id of [...visible]) {
      if (!state.expandedSiblings.has(id)) continue;
      for (const parentId of index.get(id)?.parents || []) {
        if (!visible.has(parentId)) continue;
        for (const childId of index.get(parentId)?.children || []) {
          if (!visible.has(childId)) changed = true;
          visible.add(childId);
        }
      }
    }
    // Child reveals: a visible person's hidden children join below the card,
    // so descendants — grandchildren, cousins under a revealed aunt — expand
    // one family at a time like ancestors do above. Each child brings their
    // spouses and their other parent so the family unit stays whole.
    for (const id of [...visible]) {
      if (!state.expandedChildren.has(id)) continue;
      for (const childId of index.get(id)?.children || []) {
        if (!visible.has(childId)) changed = true;
        visible.add(childId);
        for (const relativeId of [
          ...(index.get(childId)?.spouses || []),
          ...(index.get(childId)?.parents || []),
        ]) {
          if (!visible.has(relativeId)) changed = true;
          visible.add(relativeId);
        }
      }
    }
  }
  return visible;
}

function hiddenExpandableParentCount(nodes, index) {
  const visible = new Set(nodes.map((node) => node.person.id));
  return nodes.reduce((total, node) => {
    const hiddenParents = [...(index.get(node.person.id)?.parents || [])].filter((id) => !visible.has(id));
    return total + hiddenParents.length;
  }, 0);
}

// Count the ancestors (and their spouses) still hidden above a person, so the
// expander pill can show how deep the branch goes before any clicks.
function hiddenAncestorsAbove(personId, visible, index) {
  const queue = [...(index.get(personId)?.parents || [])];
  const seen = new Set([personId]);
  let count = 0;
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !personById(id)) continue;
    seen.add(id);
    if (!visible.has(id)) count += 1;
    queue.push(...(index.get(id)?.parents || []));
    queue.push(...(index.get(id)?.spouses || []));
  }
  return count;
}

// Siblings still hidden behind a card in minimal mode: children of the
// person's *visible* parents who are not on screen. Drives the sibling pill.
function hiddenSiblingIds(personId, visible, index) {
  const hidden = new Set();
  for (const parentId of index.get(personId)?.parents || []) {
    if (!visible.has(parentId)) continue;
    for (const childId of index.get(parentId)?.children || []) {
      if (childId !== personId && !visible.has(childId) && personById(childId)) hidden.add(childId);
    }
  }
  return hidden;
}

// Children still hidden behind a card in minimal mode: the person's own
// children who are not on screen. Drives the "Show children" pill.
function hiddenChildIds(personId, visible, index) {
  const hidden = new Set();
  for (const childId of index.get(personId)?.children || []) {
    if (!visible.has(childId) && personById(childId)) hidden.add(childId);
  }
  return hidden;
}

function expandChildren(personId) {
  state.expandedChildren.add(personId);
  saveViewState();
  fitTree({ renderNow: false });
  render();
}

function collapseChildren(personId) {
  state.expandedChildren.delete(personId);
  saveViewState();
  fitTree({ renderNow: false });
  render();
}

function expandSiblings(personId) {
  state.expandedSiblings.add(personId);
  saveViewState();
  fitTree({ renderNow: false });
  render();
}

function collapseSiblings(personId) {
  state.expandedSiblings.delete(personId);
  saveViewState();
  fitTree({ renderNow: false });
  render();
}

function expandParents(personId) {
  state.expandedAncestors.add(personId);
  saveViewState();
  fitTree({ renderNow: false });
  render();
}

function expandAncestorBranch(personId) {
  const index = relationshipIndex();
  state.expandedAncestors.add(personId);
  const queue = [...(index.get(personId)?.parents || [])];
  const seen = new Set([personId]);
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !personById(id)) continue;
    seen.add(id);
    state.expandedAncestors.add(id);
    queue.push(...(index.get(id)?.parents || []), ...(index.get(id)?.spouses || []));
  }
  saveViewState();
  fitTree({ renderNow: false });
  render();
}

function collapseParents(personId) {
  // Deeper expansions are kept so re-expanding restores the branch as it was.
  state.expandedAncestors.delete(personId);
  saveViewState();
  fitTree({ renderNow: false });
  render();
}

function resetExpandedAncestors() {
  state.expandedAncestors = new Set();
  state.expandedSiblings = new Set();
  state.expandedChildren = new Set();
  saveViewState();
}

function connectedRelatives(rootId, index) {
  const queue = [rootId];
  const seen = new Set();
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    const person = personById(id);
    if (!person) continue;
    seen.add(id);
    ordered.push(id);
    queue.push(...relationshipIds(id, index));
  }
  return ordered;
}

function directRelatives(rootId, index) {
  return new Set([rootId, ...walkLine(rootId, "parents", index), ...walkLine(rootId, "children", index)]);
}

function walkLine(rootId, key, index) {
  const queue = [...(index.get(rootId)?.[key] || [])];
  const seen = new Set();
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    const person = personById(id);
    if (!person) continue;
    seen.add(id);
    ordered.push(id);
    queue.push(...(index.get(id)?.[key] || []));
  }
  return ordered;
}

function layoutNodes(branch, index) {
  const nodeGap = state.collapseCollateral ? 226 : 228;
  const groupGap = state.collapseCollateral ? 84 : 68;
  const ancestorSideGap = state.collapseCollateral ? 168 : 140;
  const laneGap = 86;
  const generationGap = 164;
  const maxGroupColumns = state.collapseCollateral ? 5 : 3;
  const root = personById(state.rootId);
  const rows = new Map();
  const directOrder = directAncestorOrder(root.id, index);

  for (const person of branch) {
    const generation = generationOffset(root.id, person.id, index);
    if (!rows.has(generation)) rows.set(generation, []);
    rows.get(generation).push(person);
  }

  const sortedRows = [...rows.entries()].sort(([a], [b]) => a - b);
  const nodes = [];
  let y = 120;
  for (const [generation, rowPeople] of sortedRows) {
    const groups = familyGroups(rowPeople, index, directOrder);
    const widths = groups.map((group) => Math.min(maxGroupColumns, Math.max(1, group.people.length)) * nodeGap);
    const groupSides = groups.map((group) => ancestorSideForGroup(root.id, group, index));
    const sideBreaks = groupSides.reduce((total, side, index) => {
      if (index === 0) return total;
      return total + (isSideBreak(groupSides[index - 1], side) ? 1 : 0);
    }, 0);
    const maxRows = Math.max(...groups.map((group) => Math.ceil(group.people.length / maxGroupColumns)), 1);
    const rowWidth = widths.reduce((total, width) => total + width, 0)
      + Math.max(0, groups.length - 1) * groupGap
      + (generation < 0 ? sideBreaks * ancestorSideGap : 0);
    let x = 450 - rowWidth / 2;

    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0 && generation < 0 && isSideBreak(groupSides[groupIndex - 1], groupSides[groupIndex])) {
        x += ancestorSideGap;
      }
      const groupWidth = widths[groupIndex];
      const groupDrift = ancestorBranchDrift(root.id, group, generation, index);
      group.people.forEach((person, index) => {
        const lane = Math.floor(index / maxGroupColumns);
        const column = index % maxGroupColumns;
        const laneLength = Math.min(maxGroupColumns, group.people.length - lane * maxGroupColumns);
        const laneWidth = laneLength * nodeGap;
        nodes.push({
          person,
          x: x + groupDrift + (groupWidth - laneWidth) / 2 + nodeGap / 2 + column * nodeGap,
          y: y + lane * laneGap,
          familyKey: group.key,
        });
      });
      x += groupWidth + groupGap;
    });
    y += generationGap + (maxRows - 1) * laneGap;
  }
  applyProgressiveAncestorLanes(nodes, index);
  separateFullViewRows(nodes);
  return nodes;
}

// Branch drift shifts whole ancestor groups sideways after row widths were
// already computed, so in the full-network view drifted groups can land on
// their neighbors. Sweep each visual row: enforce a minimum gap left to
// right, then re-center so the sweep doesn't push the whole row rightward.
// (Minimal mode has its own side-aware pass in separateAncestorRows.)
function separateFullViewRows(nodes) {
  if (state.collapseCollateral) return;
  const minGap = NODE.width + 22;
  const rowsByY = new Map();
  for (const node of nodes) {
    if (!rowsByY.has(node.y)) rowsByY.set(node.y, []);
    rowsByY.get(node.y).push(node);
  }
  for (const rowNodes of rowsByY.values()) {
    if (rowNodes.length < 2) continue;
    const sorted = [...rowNodes].sort((a, b) => a.x - b.x);
    const spanBefore = sorted[sorted.length - 1].x - sorted[0].x;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].x - sorted[i - 1].x < minGap) sorted[i].x = sorted[i - 1].x + minGap;
    }
    const spanAfter = sorted[sorted.length - 1].x - sorted[0].x;
    const shift = (spanAfter - spanBefore) / 2;
    if (!shift) continue;
    for (const node of sorted) node.x -= shift;
  }
}

function applyProgressiveAncestorLanes(nodes, index) {
  if (!state.collapseCollateral) return;

  const rootNode = nodes.find((node) => node.person.id === state.rootId);
  if (!rootNode) return;

  const rows = new Map();
  for (const node of nodes) {
    const generation = generationOffset(state.rootId, node.person.id, index);
    if (generation >= 0) continue;
    if (!rows.has(generation)) rows.set(generation, []);
    rows.get(generation).push(node);
  }

  const rootParents = orderedParentIds(state.rootId, index);
  const minGap = NODE.width + 22;

  for (const rowNodes of rows.values()) {
    for (const node of rowNodes) {
      const path = ancestorPathFromRoot(state.rootId, node.person.id, index);
      if (!path.length) continue;
      node.ancestorPath = path;
      node.ancestorSlot = ancestorPathSlot(path, rootParents.length);
      node.x = rootNode.x + node.ancestorSlot * minGap;
    }
  }

  for (const rowNodes of rows.values()) {
    placePathlessAncestorSpouses(rowNodes, rootNode, index, minGap);
  }
  separateAncestorRows(nodes, rootNode, index, minGap);
}

// Slot math can land two ancestor branches on overlapping columns (pedigree
// collapse, remarriages, uneven branch depth). Final pass: walk each visual
// row and push colliding cards outward — leftward on the father side,
// rightward on the mother side — so cards never stack while every branch
// stays on its own side of the root.
function separateAncestorRows(nodes, rootNode, index, minGap) {
  const rowsByY = new Map();
  for (const node of nodes) {
    if (generationOffset(state.rootId, node.person.id, index) >= 0) continue;
    if (!rowsByY.has(node.y)) rowsByY.set(node.y, []);
    rowsByY.get(node.y).push(node);
  }

  for (const rowNodes of rowsByY.values()) {
    const sorted = [...rowNodes].sort((a, b) => a.x - b.x);
    const left = sorted.filter((node) => node.x < rootNode.x).reverse();
    const right = sorted.filter((node) => node.x >= rootNode.x);

    for (let i = 1; i < left.length; i += 1) {
      if (left[i].x > left[i - 1].x - minGap) left[i].x = left[i - 1].x - minGap;
    }
    if (left.length && right.length && right[0].x - left[0].x < minGap) {
      right[0].x = left[0].x + minGap;
    }
    for (let i = 1; i < right.length; i += 1) {
      if (right[i].x < right[i - 1].x + minGap) right[i].x = right[i - 1].x + minGap;
    }
  }
}

function placePathlessAncestorSpouses(rowNodes, rootNode, index, minGap) {
  const rowNodeById = new Map(rowNodes.map((node) => [node.person.id, node]));
  const pathlessSpousesByAnchor = new Map();

  for (const node of rowNodes) {
    if (node.ancestorPath?.length) continue;

    const anchor = [...(index.get(node.person.id)?.spouses || [])]
      .map((spouseId) => rowNodeById.get(spouseId))
      .find((spouseNode) => spouseNode?.ancestorPath?.length);
    if (!anchor) continue;

    if (!pathlessSpousesByAnchor.has(anchor.person.id)) pathlessSpousesByAnchor.set(anchor.person.id, []);
    pathlessSpousesByAnchor.get(anchor.person.id).push(node);
  }

  for (const [anchorId, spouseNodes] of pathlessSpousesByAnchor.entries()) {
    const anchor = rowNodeById.get(anchorId);
    const cluster = [anchor, ...spouseNodes];
    const hasCollision = cluster.some((node, nodeIndex) =>
      cluster.some((candidate, candidateIndex) =>
        candidateIndex > nodeIndex && Math.abs(candidate.x - node.x) < minGap,
      ),
    );
    if (!hasCollision) continue;

    const averageX = spouseNodes.reduce((total, node) => total + node.x, 0) / spouseNodes.length;
    const fallbackDirection = Math.sign(anchor.x - rootNode.x)
      || ancestorLaneDirection(anchor.ancestorPath, orderedParentIds(state.rootId, index).length)
      || -1;
    const preferredSide = Math.sign(averageX - anchor.x) || fallbackDirection;
    const sortedSpouses = [...spouseNodes].sort((a, b) => a.x - b.x || a.person.name.localeCompare(b.person.name));
    const pending = new Set(sortedSpouses);
    const occupied = rowNodes.filter((node) => !pending.has(node));

    sortedSpouses.forEach((node) => {
      node.x = nearestOpenSpouseSlot(anchor.x, node.x, preferredSide, occupied, minGap, sortedSpouses.length + rowNodes.length);
      occupied.push(node);
    });
  }
}

function nearestOpenSpouseSlot(anchorX, originalX, preferredSide, occupied, minGap, maxSlots) {
  const originalSide = Math.sign(originalX - anchorX);
  const firstSide = originalSide || preferredSide || -1;
  const sideOrder = [firstSide, -firstSide];

  for (let slot = 1; slot <= maxSlots; slot += 1) {
    for (const side of sideOrder) {
      const x = anchorX + side * minGap * slot;
      const overlaps = occupied.some((node) => Math.abs(node.x - x) < minGap);
      if (!overlaps) return x;
    }
  }

  return anchorX + firstSide * minGap * (maxSlots + 1);
}

function ancestorPathFromRoot(rootId, targetId, index) {
  const queue = [{ id: rootId, path: [] }];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (current.id === targetId) return current.path;
    if (seen.has(current.id)) continue;
    seen.add(current.id);

    const parents = orderedParentIds(current.id, index);
    parents.forEach((parentId, order) => {
      queue.push({ id: parentId, path: [...current.path, order] });
    });
  }

  return [];
}

function ancestorPathSlot(path, rootParentCount) {
  const direction = ancestorLaneDirection(path, rootParentCount);
  if (!direction) return 0;

  const depthPastRootParent = Math.max(0, path.length - 1);
  let branchRank = 0;
  for (let index = 1; index < path.length; index += 1) {
    branchRank = branchRank * 2 + (path[index] === 0 ? 0 : 1);
  }

  const branchCount = 2 ** depthPastRootParent;
  const outwardRank = direction < 0 ? branchRank : branchCount - 1 - branchRank;
  const depthOffset = depthPastRootParent * 0.18;
  // Branches step by a full slot: adjacent slots sit one card-plus-gap apart,
  // so same-row ancestor couples never overlap (0.62 used to stack them).
  const branchOffset = outwardRank;
  return direction * (1 + depthOffset + branchOffset);
}

function ancestorLaneDirection(path, rootParentCount) {
  if (!path?.length) return 0;
  return parentLaneDirection(path[0], rootParentCount);
}

function orderedParentIds(childId, index) {
  const person = personById(childId);
  const recorded = person?.parents || [];
  const relationParents = [...(index.get(childId)?.parents || [])];
  return [
    ...recorded.filter((id) => relationParents.includes(id)),
    ...relationParents.filter((id) => !recorded.includes(id)),
  ];
}

function parentLaneDirection(order, count) {
  if (count === 1) return -1;
  if (order === 0) return -1;
  if (order === 1) return 1;
  return order % 2 === 0 ? -1 : 1;
}

function layoutFamilyUnits(nodes, index, directIds) {
  const groups = new Map();
  for (const node of nodes) {
    const key = node.familyKey || `single:${node.person.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }

  return [...groups.entries()]
    .filter(([, groupNodes]) => groupNodes.length > 1 || siblingParentIds(groupNodes[0].person.id, index).length)
    .map(([key, groupNodes]) => {
      const minX = Math.min(...groupNodes.map((node) => node.x)) - NODE_HALF_WIDTH - 16;
      const maxX = Math.max(...groupNodes.map((node) => node.x)) + NODE_HALF_WIDTH + 16;
      const minY = Math.min(...groupNodes.map((node) => node.y)) - NODE_HALF_HEIGHT - 76;
      const maxY = Math.max(...groupNodes.map((node) => node.y)) + NODE_HALF_HEIGHT + 12;
      return {
        key,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        label: familyUnitLabel(key, groupNodes, index),
        direct: groupNodes.some((node) => directIds.has(node.person.id)),
      };
    });
}

function siblingParentIds(personId, index) {
  return orderedParentIds(personId, index);
}

function familyUnitLabel(key, groupNodes, index) {
  if (key.startsWith("parents:")) {
    const surnames = siblingParentIds(groupNodes[0].person.id, index)
      .map((id) => personById(id)?.name)
      .map(surnameFromName)
      .filter(Boolean);
    const uniqueSurnames = [...new Set(surnames)].slice(0, 2);
    return uniqueSurnames.length ? `Children of ${uniqueSurnames.join(" + ")}` : "Children";
  }
  if (key.startsWith("spouses:")) return "Couple";
  return "";
}

function surnameFromName(name = "") {
  const clean = name.replace(/".*?"/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function familyGroups(rowPeople, index, directOrder) {
  const generation = generationOffset(state.rootId, rowPeople[0].id, index);
  const rowOrder = directOrder.get(generation) || new Map();
  const peopleById = new Map(rowPeople.map((person) => [person.id, person]));
  const groupMap = new Map();

  for (const person of rowPeople) {
    const parents = orderedParentIds(person.id, index);
    const key = parents.length ? `parents:${parents.join("+")}` : familyFallbackKey(person, rowPeople, index);
    if (!groupMap.has(key)) groupMap.set(key, { key, people: [], parents });
    groupMap.get(key).people.push(person);
  }

  const groups = [...groupMap.values()];
  for (const group of groups) {
    const childOrder = orderedChildren(group.parents, index).filter((id) => peopleById.has(id));
    group.people.sort((a, b) => {
      const aDirect = rowOrder.has(a.id);
      const bDirect = rowOrder.has(b.id);
      const aChildOrder = childOrder.indexOf(a.id);
      const bChildOrder = childOrder.indexOf(b.id);
      const aRank = aChildOrder === -1 ? Number.MAX_SAFE_INTEGER : aChildOrder;
      const bRank = bChildOrder === -1 ? Number.MAX_SAFE_INTEGER : bChildOrder;

      if (aDirect || bDirect) {
        return centeredFamilyRank(a.id, childOrder, rowOrder) - centeredFamilyRank(b.id, childOrder, rowOrder);
      }
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });
    group.anchor = groupAnchor(group, index, directOrder, generation);
  }

  return groups.sort((a, b) => a.anchor - b.anchor || a.key.localeCompare(b.key));
}

function ancestorBranchDrift(rootId, group, generation, index) {
  if (generation >= 0) return 0;

  const side = ancestorSideForGroup(rootId, group, index);
  if (side === null) return 0;

  const rootParents = orderedParentIds(rootId, index);
  const middle = (rootParents.length - 1) / 2;
  const direction = Math.sign(side - middle);
  if (!direction) return 0;

  const depthPastParents = Math.max(0, Math.abs(generation) - 1);
  const diagonalStep = state.collapseCollateral ? 92 : 76;
  return direction * depthPastParents * diagonalStep;
}

function ancestorSideForGroup(rootId, group, index) {
  const rootParents = orderedParentIds(rootId, index);
  if (rootParents.length < 2) return null;
  const candidates = [...group.parents, ...group.people.map((person) => person.id)];
  const sides = candidates
    .map((id) => ancestorSide(rootParents, id, index))
    .filter((side) => side !== null);
  return sides.length ? Math.min(...sides) : null;
}

function ancestorSide(rootParents, targetId, index) {
  const directSide = rootParents.indexOf(targetId);
  if (directSide !== -1) return directSide;

  for (let side = 0; side < rootParents.length; side += 1) {
    if (isAncestorOf(targetId, rootParents[side], index)) return side;
  }
  return null;
}

// Which of the tree focus's two parent branches each visible ancestor hangs
// from, so intermixed upper generations can be told apart at a glance. Blood
// ancestors match directly; ancestor-row collaterals (great-uncles) and
// ancestors' spouses inherit a side from a parent or spouse who does match.
// Descendants and the focus generation carry no side — they belong to both.
function branchSideAssignments(rootId, nodes, index) {
  const sides = new Map();
  const rootParents = orderedParentIds(rootId, index);
  if (rootParents.length < 2) return sides;
  for (const node of nodes) {
    if (generationOffset(rootId, node.person.id, index) >= 0) continue;
    const side = branchSide(rootParents, node.person.id, index);
    if (side !== null) sides.set(node.person.id, Math.min(side, 1));
  }
  return sides;
}

function branchSide(rootParents, personId, index) {
  const own = ancestorSide(rootParents, personId, index);
  if (own !== null) return own;
  for (const relatives of [index.get(personId)?.parents, index.get(personId)?.spouses]) {
    for (const relativeId of relatives || []) {
      const side = ancestorSide(rootParents, relativeId, index);
      if (side !== null) return side;
    }
  }
  return null;
}

// Names the stripe colors ("Smith side" / "Jones side") next to the existing
// Direct/Collateral legend entries, so the tint is self-explanatory.
function renderBranchLegend(rootId, visible, index) {
  els.legendBranches.replaceChildren();
  if (!visible) return;
  orderedParentIds(rootId, index).slice(0, 2).forEach((parentId, side) => {
    const parent = personById(parentId);
    if (!parent) return;
    const entry = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.className = `legend-swatch branch-${side}`;
    entry.append(swatch, `${surnameFromName(parent.name) || parent.name} side`);
    els.legendBranches.append(entry);
  });
}

function isAncestorOf(ancestorId, descendantId, index) {
  const queue = [...(index.get(descendantId)?.parents || [])];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (id === ancestorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(index.get(id)?.parents || []));
  }
  return false;
}

function isSideBreak(left, right) {
  return left !== null && right !== null && left !== right;
}

function familyFallbackKey(person, rowPeople, index) {
  const spouse = [...(index.get(person.id)?.spouses || [])].find((id) => rowPeople.some((candidate) => candidate.id === id));
  if (!spouse) return `single:${person.id}`;
  return `spouses:${[person.id, spouse].sort().join("+")}`;
}

function orderedChildren(parentIds, index) {
  const seen = new Set();
  const children = [];
  for (const parentId of parentIds) {
    for (const childId of index.get(parentId)?.children || []) {
      if (!seen.has(childId)) {
        seen.add(childId);
        children.push(childId);
      }
    }
  }
  return sortByBirthYear(children);
}

// Siblings read oldest-to-youngest like a conventional family tree. Undated
// children keep their recorded order after the dated ones (stable sort), so
// hand-ordered JSON still means something when years are missing.
function sortByBirthYear(ids) {
  return ids
    .map((id, recordedIndex) => ({ id, recordedIndex, year: birthYear(personById(id)) }))
    .sort((a, b) => (a.year - b.year) || (a.recordedIndex - b.recordedIndex))
    .map((entry) => entry.id);
}

function birthYear(person) {
  const match = String(person?.birth?.date || "").match(/\d{4}/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function centeredFamilyRank(id, childOrder, rowOrder) {
  const directChildren = childOrder.filter((childId) => rowOrder.has(childId));
  const directId = directChildren[0];
  const directIndex = directId ? childOrder.indexOf(directId) : -1;
  const ownIndex = childOrder.indexOf(id);
  if (ownIndex === -1 || directIndex === -1) return rowOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  if (id === directId) return 0;
  const side = ownIndex < directIndex ? -1 : 1;
  const distance = Math.abs(ownIndex - directIndex);
  return side * Math.ceil(distance / 2) + (side > 0 ? 0.25 : -0.25);
}

function groupAnchor(group, index, directOrder, generation) {
  const rowOrder = directOrder.get(generation) || new Map();
  const ownOrders = group.people.map((person) => rowOrder.get(person.id)).filter((order) => order !== undefined);
  if (ownOrders.length) return Math.min(...ownOrders);

  const directRows = [...directOrder.values()];
  const parentOrders = group.parents
    .map((id) => directRows.map((row) => row.get(id)).find((order) => order !== undefined))
    .filter((order) => order !== undefined);
  if (parentOrders.length) return parentOrders.reduce((total, order) => total + order, 0) / parentOrders.length;

  const spouseOrders = group.people
    .flatMap((person) => [...(index.get(person.id)?.spouses || [])])
    .map((id) => {
      const directSpouseOrder = rowOrder.get(id);
      if (directSpouseOrder === undefined) return undefined;

      const directSpouseSide = directLineSpouseSide(id, generation, index, directOrder);
      if (directSpouseSide === 0) return directSpouseOrder + 0.35;
      return directSpouseOrder - directSpouseSide * 0.35;
    })
    .filter((order) => order !== undefined);
  if (spouseOrders.length) return Math.min(...spouseOrders);

  return Math.min(...group.people.map((person) => weightedDistance(state.rootId, person.id, index) ?? 999));
}

function directLineSpouseSide(personId, generation, index, directOrder) {
  const rowOrder = directOrder.get(generation) || new Map();
  const childOrder = directOrder.get(generation + 1) || new Map();
  const personOrder = rowOrder.get(personId);
  if (personOrder === undefined || !childOrder.size) return 0;

  for (const spouseId of index.get(personId)?.spouses || []) {
    const spouseOrder = rowOrder.get(spouseId);
    if (spouseOrder === undefined) continue;

    const hasDirectChild = [...(index.get(personId)?.children || [])].some((childId) => {
      const childParents = index.get(childId)?.parents || new Set();
      return childOrder.has(childId) && childParents.has(spouseId);
    });
    if (hasDirectChild) return Math.sign(spouseOrder - personOrder);
  }

  return 0;
}

function directAncestorOrder(rootId, index) {
  const orderByGeneration = new Map([[0, new Map([[rootId, 0]])]]);
  let current = [rootId];
  let generation = -1;
  const seen = new Set([rootId]);

  while (current.length) {
    const parents = [];
    for (const id of current) {
      for (const parentId of orderedParentIds(id, index)) {
        if (!seen.has(parentId)) {
          seen.add(parentId);
          parents.push(parentId);
        }
      }
    }
    if (!parents.length) break;
    orderByGeneration.set(generation, new Map(parents.map((id, order) => [id, order])));
    current = parents;
    generation -= 1;
  }

  current = [rootId];
  generation = 1;
  while (current.length) {
    const children = [];
    for (const id of current) {
      for (const childId of index.get(id)?.children || []) {
        if (!seen.has(childId)) {
          seen.add(childId);
          children.push(childId);
        }
      }
    }
    if (!children.length) break;
    orderByGeneration.set(generation, new Map(children.map((id, order) => [id, order])));
    current = children;
    generation += 1;
  }

  return orderByGeneration;
}

function layoutLinks(nodes, index, directIds) {
  const nodeById = new Map(nodes.map((node) => [node.person.id, node]));
  const links = [];
  const seenSpouses = new Set();
  const familyMap = new Map();

  for (const childNode of nodes) {
    const parentIds = [...(index.get(childNode.person.id)?.parents || [])].filter((id) => nodeById.has(id));
    if (!parentIds.length) continue;
    const key = parentIds.slice().sort().join("+");
    if (!familyMap.has(key)) familyMap.set(key, { parentIds, children: [] });
    familyMap.get(key).children.push(childNode);
  }

  for (const { parentIds, children } of familyMap.values()) {
    const parents = parentIds.map((id) => nodeById.get(id));
    const parentBottomY = Math.max(...parents.map((parent) => parent.y)) + NODE_HALF_HEIGHT;
    const parentCenter = parents.reduce((total, parent) => total + parent.x, 0) / parents.length;
    const direct = children.some((child) => directIds.has(child.person.id)) && parentIds.some((id) => directIds.has(id));

    if (parents.length > 1) {
      const [left, right] = [...parents].sort((a, b) => a.x - b.x);
      const spouseKey = [left.person.id, right.person.id].sort().join("+");
      if (!seenSpouses.has(spouseKey)) {
        seenSpouses.add(spouseKey);
        links.push({
          kind: "spouse-link",
          direct: directIds.has(left.person.id) && directIds.has(right.person.id),
          people: [left.person.id, right.person.id],
          d: spouseLinkPath(left, right, nodes),
        });
      }
    }

    if (children.length === 1) {
      const childNode = children[0];
      const directChild = directIds.has(childNode.person.id) && parentIds.some((id) => directIds.has(id));
      const linkStartX = directChild && state.collapseCollateral
        ? directParentAnchorX(parentIds, childNode.person.id, nodeById, index, directIds, parentCenter)
        : parentCenter;
      links.push({
        kind: "family-link",
        direct: directChild,
        people: [...parentIds, childNode.person.id],
        d: directChild && state.collapseCollateral
          ? directAncestorPath(linkStartX, parentBottomY, childNode.x, childNode.y - NODE_HALF_HEIGHT)
          : familyCurvePath(linkStartX, parentBottomY, childNode.x, childNode.y - NODE_HALF_HEIGHT),
      });
      continue;
    }

    const childrenByX = [...children].sort((a, b) => a.x - b.x);
    const childTopY = Math.min(...childrenByX.map((child) => child.y)) - NODE_HALF_HEIGHT;
    const busY = childTopY - 26;
    const minChildX = Math.min(...childrenByX.map((child) => child.x));
    const maxChildX = Math.max(...childrenByX.map((child) => child.x));
    // The bus must reach the parent drop point: shifted ancestor lanes can push
    // the parents' center outside the children's horizontal span.
    const busMinX = Math.min(minChildX, parentCenter);
    const busMaxX = Math.max(maxChildX, parentCenter);

    const familyPeople = [...parentIds, ...childrenByX.map((child) => child.person.id)];
    links.push({
      kind: "family-link",
      direct,
      people: familyPeople,
      d: `M ${parentCenter} ${parentBottomY} L ${parentCenter} ${busY}`,
    });
    links.push({
      kind: "family-link",
      direct,
      people: familyPeople,
      d: `M ${busMinX} ${busY} L ${busMaxX} ${busY}`,
    });

    for (const childNode of childrenByX) {
      links.push({
        kind: "family-link",
        direct: directIds.has(childNode.person.id) && parentIds.some((id) => directIds.has(id)),
        people: [...parentIds, childNode.person.id],
        d: `M ${childNode.x} ${busY} L ${childNode.x} ${childNode.y - NODE_HALF_HEIGHT}`,
      });
    }
  }

  for (const node of nodes) {
    for (const spouseId of index.get(node.person.id)?.spouses || []) {
      const spouse = nodeById.get(spouseId);
      if (!spouse || spouse.y !== node.y) continue;
      const spouseKey = [node.person.id, spouseId].sort().join("+");
      if (seenSpouses.has(spouseKey)) continue;
      seenSpouses.add(spouseKey);
      const [left, right] = [node, spouse].sort((a, b) => a.x - b.x);
      links.push({
        kind: "spouse-link",
        direct: directIds.has(left.person.id) && directIds.has(right.person.id),
        people: [left.person.id, right.person.id],
        d: spouseLinkPath(left, right, nodes),
      });
    }
  }
  return links;
}

// A spouse link normally runs straight between the couple's card edges, but
// collision separation and remarriages can leave other cards sitting between
// the pair; arc those links over the row so the dashed line never slices
// straight through an unrelated person's card.
function spouseLinkPath(left, right, nodes) {
  const startX = left.x + NODE_HALF_WIDTH;
  const endX = right.x - NODE_HALF_WIDTH;
  const blocked = left.y === right.y && nodes.some((node) => node !== left && node !== right
    && node.y === left.y && node.x > left.x && node.x < right.x);
  if (!blocked) return `M ${startX} ${left.y} L ${endX} ${right.y}`;
  const topY = left.y - NODE_HALF_HEIGHT - 40;
  return `M ${startX} ${left.y} C ${startX + 44} ${topY}, ${endX - 44} ${topY}, ${endX} ${right.y}`;
}

function directParentAnchorX(parentIds, childId, nodeById, index, directIds, fallbackX) {
  const directParentId = orderedParentIds(childId, index)
    .find((id) => parentIds.includes(id) && directIds.has(id) && nodeById.has(id));
  return directParentId ? nodeById.get(directParentId).x : fallbackX;
}

function directAncestorPath(startX, startY, endX, endY) {
  const midY = (startY + endY) / 2;
  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
}

function familyCurvePath(startX, startY, endX, endY) {
  const midY = (startY + endY) / 2;
  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
}

function treeBounds(nodes) {
  if (!nodes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs) - NODE_HALF_WIDTH - 20;
  const maxX = Math.max(...xs) + NODE_HALF_WIDTH + 20;
  const minY = Math.min(...ys) - NODE_HALF_HEIGHT - 86;
  const maxY = Math.max(...ys) + NODE_HALF_HEIGHT + 20;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function generationOffset(rootId, targetId, index) {
  if (rootId === targetId) return 0;
  const weighted = weightedDistance(rootId, targetId, index);
  if (weighted !== null) return weighted;
  return 1;
}

function weightedDistance(startId, targetId, index) {
  const queue = [{ id: startId, generation: 0 }];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (current.id === targetId) return current.generation;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    const relations = index.get(current.id);
    for (const parentId of relations?.parents || []) queue.push({ id: parentId, generation: current.generation - 1 });
    for (const spouseId of relations?.spouses || []) queue.push({ id: spouseId, generation: current.generation });
    for (const childId of relations?.children || []) queue.push({ id: childId, generation: current.generation + 1 });
  }
  return null;
}

function relationshipIds(id, index) {
  const relations = index.get(id);
  return [...(relations?.parents || []), ...(relations?.spouses || []), ...(relations?.children || [])];
}

// Keep the selected person in the URL hash so reloads and shared links
// reopen the same profile instead of resetting to the default person.
// Selections push history entries so Back/Forward walk through visited
// profiles (the hashchange listener restores them) instead of leaving the app.
function personIdFromHash() {
  const match = window.location.hash.match(/^#p=(.+)$/);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return personById(id) ? id : null;
  } catch {
    return null;
  }
}

function syncHash(push = false) {
  const target = state.selectedId ? `#p=${encodeURIComponent(state.selectedId)}` : "";
  if (window.location.hash === target) return;
  const base = window.location.pathname + window.location.search;
  if (push) history.pushState(null, "", target || base);
  else history.replaceState(null, "", target || base);
}

// A profile deep link is just the app URL with the #p= hash the router above
// already restores, so pasting it in another browser (with the same family
// JSON loaded) reopens this exact person.
function personLink(id, base = window.location.origin + window.location.pathname + window.location.search) {
  return `${base}#p=${encodeURIComponent(id)}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The Clipboard API needs a secure context; GitHub Pages qualifies, but a
    // file:// or LAN-http open of the app does not, so fall back to the
    // selection-based copy that still works there.
    try {
      const scratch = document.createElement("textarea");
      scratch.value = text;
      scratch.setAttribute("readonly", "");
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.append(scratch);
      scratch.select();
      const copied = document.execCommand("copy");
      scratch.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

let copyLinkFeedbackTimer = null;
function showCopyLinkFeedback(copied) {
  els.copyLink.textContent = copied ? "Link copied" : "Copy failed";
  els.copyLink.classList.toggle("copy-failed", !copied);
  clearTimeout(copyLinkFeedbackTimer);
  copyLinkFeedbackTimer = setTimeout(() => {
    els.copyLink.textContent = "Copy link";
    els.copyLink.classList.remove("copy-failed");
  }, 1600);
}

function selectPerson(id, reroot = true, openProfile = true) {
  state.selectedId = id;
  syncHash(true);
  state.sourcesExpanded = false;
  state.notesExpanded = false;
  els.detailsShell.scrollTop = 0;
  if (openProfile) {
    state.profileCollapsed = false;
    if (isCompactViewport()) state.peopleCollapsed = true;
  }
  if (reroot) {
    state.rootId = id;
    resetExpandedAncestors();
    fitTree({ renderNow: false });
  } else if (state.collapseCollateral && revealAncestorPath(id)) {
    fitTree({ renderNow: false });
  } else {
    ensurePersonVisible(id);
  }
  render();
}

// Selecting a hidden ancestor (from search, deep links, or profile relations)
// expands the chain of parent reveals leading to them, so the tree shows the
// person instead of silently keeping them off-screen. Returns true only when
// new expansions were added; already-visible or unreachable people fall back
// to the pan-into-view behavior.
function revealAncestorPath(targetId) {
  const index = relationshipIndex();
  if (!state.rootId || !index.has(targetId)) return false;
  const visible = expandedTreeIds(state.rootId, index);
  if (visible.has(targetId)) return false;

  // A hidden sibling of someone on screen (picked from search, a story link,
  // or profile relations) reveals through the sibling toggle: key the reveal
  // on a visible child of the shared parent.
  for (const parentId of index.get(targetId)?.parents || []) {
    if (!visible.has(parentId)) continue;
    const anchor = [...(index.get(parentId)?.children || [])].find((id) => visible.has(id));
    if (anchor) {
      state.expandedSiblings.add(anchor);
      saveViewState();
      return true;
    }
  }

  // A hidden child of someone on screen with no visible siblings (a cousin
  // picked from search once the aunt is visible) reveals through the child
  // toggle on the visible parent.
  for (const parentId of index.get(targetId)?.parents || []) {
    if (visible.has(parentId)) {
      state.expandedChildren.add(parentId);
      saveViewState();
      return true;
    }
  }

  const queue = [...visible].map((id) => ({ id, chain: [] }));
  const seen = new Set(visible);
  while (queue.length) {
    const { id, chain } = queue.shift();
    for (const parentId of index.get(id)?.parents || []) {
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      const nextChain = [...chain, id];
      const parentSpouses = index.get(parentId)?.spouses || new Set();
      if (parentId === targetId || parentSpouses.has(targetId)) {
        for (const link of nextChain) state.expandedAncestors.add(link);
        saveViewState();
        return true;
      }
      // A hidden aunt/uncle deeper up: expand the ancestor chain to their
      // parent, then reveal the target as a sibling of the chain's last link.
      if (index.get(parentId)?.children?.has(targetId)) {
        for (const link of nextChain) state.expandedAncestors.add(link);
        state.expandedSiblings.add(id);
        saveViewState();
        return true;
      }
      queue.push({ id: parentId, chain: nextChain });
    }
  }
  return false;
}

// Pan the current view to a person selected from the list or profile links,
// but only when their node sits outside the visible viewport.
function ensurePersonVisible(id) {
  const index = relationshipIndex();
  const root = personById(state.rootId);
  if (!root) return;
  const visibleIds = state.collapseCollateral ? expandedTreeIds(root.id, index) : null;
  const nodes = layoutNodes(buildBranch(root.id, index, visibleIds), index);
  const node = nodes.find((candidate) => candidate.person.id === id);
  if (!node) return;
  const width = Math.max(els.viewport.clientWidth, 360);
  const height = Math.max(els.viewport.clientHeight, 520);
  const screenX = node.x * state.scale + state.offsetX;
  const screenY = node.y * state.scale + state.offsetY;
  const margin = 48;
  const inView = screenX > margin && screenX < width - margin
    && screenY > margin && screenY < height - margin;
  if (inView) return;
  state.offsetX = width / 2 - node.x * state.scale;
  state.offsetY = height / 2 - node.y * state.scale;
}

function fitTree({ renderNow = true } = {}) {
  const index = relationshipIndex();
  const root = personById(state.rootId);
  const visibleIds = root && state.collapseCollateral ? expandedTreeIds(root.id, index) : null;
  const graph = root ? buildBranch(root.id, index, visibleIds) : [];
  const nodes = layoutNodes(graph, index);
  const bounds = treeBounds(nodes);
  const width = Math.max(els.viewport.clientWidth, 360);
  const height = Math.max(els.viewport.clientHeight, 520);
  const scaleX = width / Math.max(bounds.width + 48, 1);
  const scaleY = height / Math.max(bounds.height + 48, 1);
  state.scale = Math.min(1, Math.max(0.34, Math.min(scaleX, scaleY)));
  state.offsetX = (width - bounds.width * state.scale) / 2 - bounds.minX * state.scale;
  state.offsetY = (height - bounds.height * state.scale) / 2 - bounds.minY * state.scale;
  if (renderNow) renderTree();
}

function fitTreeAfterLayout() {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitTree);
  });
}

function onZoom(event) {
  event.preventDefault();
  const direction = event.deltaY > 0 ? -0.08 : 0.08;
  const rect = els.viewport.getBoundingClientRect();
  zoomAt(event.clientX - rect.left, event.clientY - rect.top, state.scale + direction);
}

// The +/− buttons and keyboard zoom have no cursor to anchor to, so they
// zoom around the viewport center instead.
function zoomStep(direction) {
  const rect = els.viewport.getBoundingClientRect();
  zoomAt(rect.width / 2, rect.height / 2, state.scale * (direction > 0 ? 1.2 : 1 / 1.2));
}

// Anchor the zoom so the point under the cursor/fingers stays put.
function zoomAt(pointerX, pointerY, nextScale) {
  const clamped = Math.min(1.8, Math.max(0.34, nextScale));
  if (clamped === state.scale) return;
  const ratio = clamped / state.scale;
  state.offsetX = pointerX - (pointerX - state.offsetX) * ratio;
  state.offsetY = pointerY - (pointerY - state.offsetY) * ratio;
  state.scale = clamped;
  renderTree();
}

function enableDrag() {
  const pointers = new Map();
  let start = null;
  let pinch = null;

  const viewportPoint = (event) => {
    const rect = els.viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const beginGesture = () => {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      start = null;
      pinch = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        scale: state.scale,
      };
    } else if (points.length === 1) {
      pinch = null;
      start = { x: points[0].x, y: points[0].y, ox: state.offsetX, oy: state.offsetY };
    } else {
      pinch = null;
      start = null;
    }
  };

  els.viewport.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, viewportPoint(event));
    els.viewport.setPointerCapture(event.pointerId);
    beginGesture();
  });

  els.viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, viewportPoint(event));
    const points = [...pointers.values()];

    if (pinch && points.length >= 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (!pinch.distance || !distance) return;
      const midX = (points[0].x + points[1].x) / 2;
      const midY = (points[0].y + points[1].y) / 2;
      zoomAt(midX, midY, pinch.scale * (distance / pinch.distance));
      return;
    }

    if (start) {
      state.offsetX = start.ox + points[0].x - start.x;
      state.offsetY = start.oy + points[0].y - start.y;
      renderTree();
    }
  });

  const endPointer = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    beginGesture();
  };
  els.viewport.addEventListener("pointerup", endPointer);
  els.viewport.addEventListener("pointercancel", endPointer);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "family.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const [file] = event.target.files;
  if (!file) return;
  await loadFamilyFile(file);
  event.target.value = "";
}

// Re-importing an updated export is routine (every research pass rewrites
// family.json), so resetting the selection, tree focus, and branch reveals
// on each import made iterating painful. Keep the user's place when the
// selected person still exists in the new data; ids that vanished drop out.
function preservedPlace(prior, data) {
  if (!prior) return null;
  const ids = new Set(data.people.map((person) => person.id));
  if (!ids.has(prior.selectedId)) return null;
  return {
    selectedId: prior.selectedId,
    rootId: ids.has(prior.rootId) ? prior.rootId : prior.selectedId,
    collapseCollateral: prior.collapseCollateral,
    expandedAncestors: [...prior.expandedAncestors].filter((id) => ids.has(id)),
    expandedSiblings: [...prior.expandedSiblings].filter((id) => ids.has(id)),
    expandedChildren: [...prior.expandedChildren].filter((id) => ids.has(id)),
  };
}

// "228 people" alone never says whether an import actually brought anything
// new. When the file updates the dataset already loaded (some ids overlap),
// name up to three newcomers; an unrelated dataset just reports its total.
function importedPeopleSummary(data, priorIds) {
  const total = `${data.people.length} people`;
  if (!priorIds || !data.people.some((person) => priorIds.has(person.id))) return total;
  const added = data.people.filter((person) => !priorIds.has(person.id));
  if (!added.length) return `${total} (no new people)`;
  const names = added.slice(0, 3).map((person) => strippedName(person.name));
  const extra = added.length > names.length ? `, +${added.length - names.length} more` : "";
  return `${total} (${added.length} new: ${names.join(", ")}${extra})`;
}

async function loadFamilyFile(file) {
  try {
    renderDataStatus(`Loading ${file.name}...`, "neutral");
    await afterNextPaint();
    const text = await file.text();
    await afterNextPaint();
    const data = JSON.parse(text);
    validateData(data);
    const prior = state.data
      ? {
          selectedId: state.selectedId,
          rootId: state.rootId,
          collapseCollateral: state.collapseCollateral,
          expandedAncestors: state.expandedAncestors,
          expandedSiblings: state.expandedSiblings,
          expandedChildren: state.expandedChildren,
        }
      : null;
    const priorIds = state.data ? new Set(state.data.people.map((person) => person.id)) : null;
    adoptData(data, preservedPlace(prior, data));
    const summary = importedPeopleSummary(data, priorIds);
    renderDataStatus(
      `Loaded ${summary} from ${file.name}. Saving a browser-only copy...`,
      "success",
    );
    scheduleStoreData(data, (stored) => {
      state.hasStoredData = stored;
      renderDataStatus(
        stored
          ? `Loaded ${summary} from ${file.name}. Saved in this browser only; nothing is uploaded.`
          : `Loaded ${summary} from ${file.name}. Could not save in this browser, so re-import next visit. Nothing was uploaded.`,
        stored ? "success" : "error",
      );
    });
  } catch (error) {
    renderDataStatus(`Could not load ${file.name}: ${error.message}`, "error");
  }
}

// Let a family JSON file be dropped anywhere on the app as an alternative to
// the Load-data button. Uses a depth counter because dragenter/dragleave fire
// for every child element crossed.
function enableDropImport() {
  let dragDepth = 0;

  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
  const hideOverlay = () => {
    dragDepth = 0;
    els.dropOverlay.hidden = true;
  };

  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    els.dropOverlay.hidden = false;
  });

  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
  });

  window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) els.dropOverlay.hidden = true;
  });

  window.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    hideOverlay();
    const file = [...event.dataTransfer.files]
      .find((candidate) => /\.json$/i.test(candidate.name) || candidate.type === "application/json");
    if (!file) {
      renderDataStatus("That file is not a .json family export. Drop a family.json file to load it.", "error");
      return;
    }
    loadFamilyFile(file);
  });
}

// Tips popover: renders HELP_TIPS lazily on first open. "?" toggles it from
// anywhere except text inputs; Escape and a backdrop click close it.
function enableHelpOverlay() {
  const setOpen = (open) => {
    if (open && !els.helpBody.childElementCount) renderHelpTips(els.helpBody);
    els.helpOverlay.hidden = !open;
  };
  els.treeHelp.addEventListener("click", () => setOpen(els.helpOverlay.hidden));
  els.helpClose.addEventListener("click", () => setOpen(false));
  els.helpOverlay.addEventListener("click", (event) => {
    if (event.target === els.helpOverlay) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    const typing = /^(input|textarea)$/i.test(event.target?.tagName || "");
    if (event.key === "?" && !typing) {
      event.preventDefault();
      setOpen(els.helpOverlay.hidden);
    } else if (event.key === "Escape" && !els.helpOverlay.hidden) {
      setOpen(false);
    } else if (
      (event.key === "+" || event.key === "=" || event.key === "-")
      && !typing && !event.metaKey && !event.ctrlKey && !event.altKey
      && els.helpOverlay.hidden && els.photoLightbox.hidden
    ) {
      // Plain +/− zoom the tree; ⌘/Ctrl variants stay with the browser.
      event.preventDefault();
      zoomStep(event.key === "-" ? -1 : 1);
    }
  });
}

function renderHelpTips(container) {
  for (const group of HELP_TIPS) {
    const heading = document.createElement("h3");
    heading.textContent = group.area;
    container.append(heading);
    for (const tip of group.tips) {
      const row = document.createElement("div");
      row.className = "help-tip";
      const keys = document.createElement("span");
      keys.className = "help-keys";
      tip.keys.forEach((key, index) => {
        if (index > 0) keys.append(" + ");
        const kbd = document.createElement("kbd");
        kbd.textContent = key;
        keys.append(kbd);
      });
      const does = document.createElement("span");
      does.className = "help-does";
      does.textContent = tip.does;
      row.append(keys, does);
      container.append(row);
    }
  }
}

function validateData(data) {
  if (!data || !Array.isArray(data.people) || data.people.length === 0) {
    throw new Error("Family JSON must include a non-empty people array.");
  }
  const ids = new Set();
  for (const person of data.people) {
    if (!person || typeof person !== "object" || Array.isArray(person)) {
      throw new Error("Each person must be an object.");
    }
    if (!person.id || typeof person.id !== "string" || !person.name || typeof person.name !== "string") {
      throw new Error("Each person needs a string id and name.");
    }
    if (ids.has(person.id)) throw new Error(`Duplicate person id: ${person.id}`);
    ids.add(person.id);
  }
  if (data.meta?.defaultPersonId && !ids.has(data.meta.defaultPersonId)) {
    throw new Error(`Default person id is missing: ${data.meta.defaultPersonId}`);
  }
  for (const person of data.people) {
    for (const key of ["parents", "spouses", "children"]) {
      if (person[key] !== undefined && !Array.isArray(person[key])) {
        throw new Error(`${person.name} ${key} must be an array.`);
      }
      for (const id of person[key] || []) {
        if (typeof id !== "string") throw new Error(`${person.name} has a non-string ${key} id.`);
        if (!ids.has(id)) throw new Error(`${person.name} references missing ${key} id: ${id}`);
      }
    }
    validateProfileEntries(person, "photos", [...(person.photos || []), ...(person.profile?.photos || [])]);
    validateProfileEntries(person, "sources", [...(person.sources || []), ...(person.profile?.sources || [])]);
    validateProfileEntries(person, "obituaries", [...(person.obituaries || []), ...(person.profile?.obituaries || [])]);
  }
}

function validateProfileEntries(person, key, entries) {
  const rootValue = person[key];
  const profileValue = person.profile?.[key];
  if (rootValue !== undefined && !Array.isArray(rootValue)) throw new Error(`${person.name} ${key} must be an array.`);
  if (profileValue !== undefined && !Array.isArray(profileValue)) throw new Error(`${person.name} profile.${key} must be an array.`);
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${person.name} has a malformed ${key} entry.`);
    }
    if (key === "photos" && (entry.url === undefined || typeof entry.url !== "string" || !entry.url)) {
      throw new Error(`${person.name} has a photo without a URL.`);
    }
    for (const field of ["label", "title", "url", "repository", "type", "confidence", "date", "publication", "excerpt"]) {
      if (entry[field] !== undefined && typeof entry[field] !== "string") {
        throw new Error(`${person.name} has a ${key} entry with non-string ${field}.`);
      }
    }
  }
}

function fact(label, value) {
  const fragment = document.createDocumentFragment();
  if (!value) return fragment;
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  fragment.append(dt, dd);
  return fragment;
}

// Neutral branch/topic tags ("Graves branch", "Prevatt Cemetery") render as
// clickable pills instead of a flat comma list, so a tag jumps straight to
// everyone who shares it. Status-toned tags already show as header pills.
function tagListFact(person) {
  const tags = (person.tags || []).filter((tag) => tag !== "sample" && !tagStatusTone(tag));
  const fragment = document.createDocumentFragment();
  if (!tags.length) return fragment;
  const dt = document.createElement("dt");
  dt.textContent = "Tags";
  const dd = document.createElement("dd");
  dd.className = "fact-tags";
  for (const tag of tags) {
    const pill = metaPill(tag, "", () => searchByTag(tag));
    pill.title = `Find everyone tagged "${tag}"`;
    dd.append(pill);
  }
  fragment.append(dt, dd);
  return fragment;
}

// Groups with more than this many members show a "Show N more" toggle so the
// relationships panel doesn't scroll past a wall of siblings or children.
const RELATION_GROUP_PREVIEW = 5;

function linkGroup(label, ids = [], noteById = null) {
  if (!ids.length) return [];
  const heading = document.createElement("h3");
  heading.textContent = `${label} (${ids.length})`;
  const root = personById(state.rootId);
  // Show each relation's kinship to the tree focus when the selected profile is
  // someone other than the focus — mirrors the directory's kinship column so
  // navigating from a distant relative's profile doesn't require mental bookkeeping.
  const showKinship = root && state.selectedId !== state.rootId;

  const items = ids.map((id) => {
    const person = personById(id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "relation-item";
    let kinshipNote = "";
    if (showKinship) {
      if (id === state.rootId) {
        kinshipNote = "Tree focus";
      } else {
        const kinship = kinshipLabel(id, root.id);
        if (kinship) kinshipNote = `${givenName(root.name)}'s ${kinship}`;
      }
    }
    const placeNote = (noteById && noteById.get(id)) || personListMeta(person);
    const meta = [kinshipNote, placeNote].filter(Boolean).join(" • ") || "Open profile";
    button.innerHTML = `
      <span class="relation-name">
        <strong>${escapeHtml(person?.name || id)}</strong>
        <small>${escapeHtml(formatYears(person || {}))}</small>
      </span>
      <small class="relation-meta">${escapeHtml(meta)}</small>
    `;
    button.addEventListener("click", () => {
      selectPerson(id, false, true);
    });
    return button;
  });

  // Collapse oversized groups; no global state needed — the toggle is
  // purely DOM-local and resets naturally when a new person is selected.
  const overflowCount = ids.length - RELATION_GROUP_PREVIEW;
  if (overflowCount > 1) {
    const overflow = items.slice(RELATION_GROUP_PREVIEW);
    overflow.forEach((el) => { el.hidden = true; });
    let expanded = false;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "relation-overflow-toggle";
    toggle.textContent = `Show ${overflowCount} more…`;
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      overflow.forEach((el) => { el.hidden = !expanded; });
      toggle.textContent = expanded ? "Show fewer" : `Show ${overflowCount} more…`;
    });
    return [heading, ...items, toggle];
  }

  return [heading, ...items];
}

function renderPersonRow(person, term = "") {
  const button = document.createElement("button");
  const isSelected = person.id === state.selectedId;
  const isFocused = person.id === state.rootId;
  button.type = "button";
  button.className = `person-row${isSelected ? " active" : ""}${isFocused ? " focused" : ""}`;
  button.append(personRowAvatar(person));

  const body = document.createElement("span");
  body.className = "person-row-body";
  const root = personById(state.rootId);
  const kinship = root && person.id !== state.rootId ? kinshipLabel(person.id, state.rootId) : "";
  const kinshipNote = kinship ? `${givenName(root.name)}'s ${kinship}` : "";
  const placeNote = personListMeta(person);
  const meta = [kinshipNote, placeNote].filter(Boolean).join(" • ") || "No date or place details yet.";
  body.innerHTML = `
    <span class="person-row-main">
      <span class="person-row-name">${escapeHtml(person.name)}</span>
      <small class="person-row-years">${escapeHtml(formatYears(person) || "")}</small>
    </span>
    <small class="person-row-meta">${escapeHtml(meta)}</small>
  `;

  const reason = searchMatchReason(person, term);
  if (reason) {
    const matchLine = document.createElement("small");
    matchLine.className = "person-row-match";
    matchLine.append(`${reason.field}: `);
    appendHighlighted(matchLine, reason.snippet, term);
    body.append(matchLine);
  }

  const flags = document.createElement("span");
  flags.className = "person-row-flags";
  if (isSelected) flags.append(metaPill("Selected", "selected"));
  if (isFocused) flags.append(metaPill("Tree focus", "focused"));
  const rowTags = (person.tags || [])
    .filter((tag) => tag !== "sample")
    .map((tag, at) => ({ tag, at, rank: tagStatusRank(tag) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .slice(0, 2);
  for (const { tag } of rowTags) {
    flags.append(metaPill(tag, tagStatusTone(tag)));
  }
  const sourceCount = profileSources(person).length;
  if (sourceCount) flags.append(metaPill(`${sourceCount} source${sourceCount === 1 ? "" : "s"}`));
  if (flags.childElementCount) body.append(flags);
  button.append(body);

  button.addEventListener("click", () => {
    selectPerson(person.id, false, true);
  });
  return button;
}

// Small portrait (or initials fallback) so the directory reads like the tree
// cards and people with photos are recognizable at a glance. Broken photo
// URLs fall back to the initials underneath.
function personRowAvatar(person) {
  const avatar = document.createElement("span");
  avatar.className = "person-row-avatar";
  avatar.textContent = initialsForName(person.name);
  const [photo] = profilePhotos(person);
  if (photo) {
    const image = document.createElement("img");
    image.src = photo.url;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove());
    avatar.append(image);
  }
  return avatar;
}

function emptyState(title, copy) {
  const item = document.createElement("div");
  item.className = "empty-state";

  const heading = document.createElement("strong");
  heading.textContent = title;
  item.append(heading);

  if (copy) {
    const paragraph = document.createElement("p");
    paragraph.className = "empty-state-copy";
    paragraph.textContent = copy;
    item.append(paragraph);
  }

  return item;
}

function empty(message) {
  const item = document.createElement("p");
  item.className = "empty";
  item.textContent = message;
  return item;
}

function metaPill(label, tone = "", onClick = null) {
  const pill = document.createElement(onClick ? "button" : "span");
  pill.className = `meta-pill${tone ? ` ${tone}` : ""}${onClick ? " clickable" : ""}`;
  pill.textContent = label;
  if (onClick) {
    pill.type = "button";
    pill.addEventListener("click", onClick);
  }
  return pill;
}

// Clicking a tag pill drops the tag into the search box, so a branch or
// research-status tag ("Graves branch", "needs direct source") doubles as a
// one-click filter across the directory and the tree highlights.
function searchByTag(tag) {
  els.search.value = tag;
  state.peopleCollapsed = false;
  if (isCompactViewport()) state.profileCollapsed = true;
  syncPanelState();
  renderPeople();
  renderTree();
}

// Research tags in the family data double as confidence markers ("needs
// direct source", "obituary verified", "date conflict", "possible
// duplicate"). Color those instead of leaving confidence buried in a flat
// comma list. First matching rule claims a tag; branch/topic tags get no
// tone and stay neutral.
const TAG_STATUS_RULES = [
  { tone: "status-attention", test: /conflict|duplicate|disputed/i },
  { tone: "status-verified", test: /verified|sourced\b|corroborated|user-provided/i },
  { tone: "status-lead", test: /needs direct source|\blead\b|probable|\bpossible\b|status unknown/i },
];

function tagStatusTone(tag) {
  return TAG_STATUS_RULES.find((rule) => rule.test.test(tag))?.tone || "";
}

function tagStatusRank(tag) {
  const at = TAG_STATUS_RULES.findIndex((rule) => rule.test.test(tag));
  return at === -1 ? TAG_STATUS_RULES.length : at;
}

// One pill per status tone (most urgent first) keeps the profile header
// compact when a person carries several same-tone tags ("Ancestry tree
// lead" + "needs direct source"); the rest ride along in the tooltip.
function researchStatusPills(person) {
  const groups = new Map();
  for (const tag of person.tags || []) {
    const tone = tagStatusTone(tag);
    if (!tone) continue;
    if (!groups.has(tone)) groups.set(tone, []);
    groups.get(tone).push(tag);
  }
  return TAG_STATUS_RULES
    .filter((rule) => groups.has(rule.tone))
    .map((rule) => {
      const tags = groups.get(rule.tone);
      const pill = metaPill(tags[0], rule.tone, () => searchByTag(tags[0]));
      pill.title = tags.length > 1
        ? `${tags.join(" · ")} — click to find everyone tagged "${tags[0]}"`
        : `Find everyone tagged "${tags[0]}"`;
      return pill;
    });
}

function profileRelations(person) {
  const index = relationshipIndex();
  const parents = orderedParentIds(person.id, index);
  const allSiblings = orderedChildren(parents, index).filter((id) => id !== person.id);
  return {
    parents,
    siblings: allSiblings.filter((id) => !isHalfSiblingPair(person.id, id, index)),
    halfSiblings: allSiblings.filter((id) => isHalfSiblingPair(person.id, id, index)),
    spouses: [...(index.get(person.id)?.spouses || [])],
    children: orderedChildren([person.id], index),
  };
}

// A pair only counts as half-siblings when both people have two recorded
// parents and exactly one is shared. With a parent missing we cannot tell
// full from half, so the plain "sibling" label stays.
function isHalfSiblingPair(aId, bId, index) {
  const aParents = index.get(aId)?.parents || new Set();
  const bParents = index.get(bId)?.parents || new Set();
  if (aParents.size < 2 || bParents.size < 2) return false;
  return [...aParents].filter((id) => bParents.has(id)).length === 1;
}

// The dataset has no gender field, so kinship labels stay gender-neutral
// ("grandparent", "aunt or uncle", "1st cousin once removed"). Blood lines
// walk parents only; spouses bridge with a single affinal hop on either side.
function kinshipLabel(personId, rootId, index = relationshipIndex()) {
  if (!personId || !rootId || personId === rootId) return "";
  const blood = bloodKinshipLabel(personId, rootId, index);
  if (blood) return blood;
  if (index.get(rootId)?.spouses?.has(personId)) return "spouse";
  for (const spouseId of index.get(personId)?.spouses || []) {
    const spouseBlood = bloodKinshipLabel(spouseId, rootId, index);
    if (spouseBlood) return `${spouseBlood}'s spouse`;
  }
  for (const spouseId of index.get(rootId)?.spouses || []) {
    const inLaw = bloodKinshipLabel(personId, spouseId, index);
    if (inLaw) return `spouse's ${inLaw}`;
  }
  return "";
}

// Label of person A relative to person B ("A is B's ___"), blood lines only.
function bloodKinshipLabel(aId, bId, index) {
  const aDepths = ancestorDepths(aId, index);
  const bDepths = ancestorDepths(bId, index);
  let best = null;
  for (const [ancestorId, aUp] of aDepths) {
    const bUp = bDepths.get(ancestorId);
    if (bUp === undefined) continue;
    if (!best || aUp + bUp < best.aUp + best.bUp) best = { aUp, bUp };
  }
  if (!best) return "";
  const { aUp, bUp } = best;
  if (aUp === 0) return lineLabel(bUp, "parent", "grandparent", "great-grandparent");
  if (bUp === 0) return lineLabel(aUp, "child", "grandchild", "great-grandchild");
  if (aUp === 1 && bUp === 1) return isHalfSiblingPair(aId, bId, index) ? "half-sibling" : "sibling";
  if (aUp === 1) return lineLabel(bUp - 1, "aunt or uncle", "great-aunt or great-uncle", "great-aunt or great-uncle", true);
  if (bUp === 1) return lineLabel(aUp - 1, "niece or nephew", "great-niece or great-nephew", "great-niece or great-nephew", true);
  const degree = Math.min(aUp, bUp) - 1;
  const removed = Math.abs(aUp - bUp);
  const removal = removed === 0 ? "" : removed === 1 ? " once removed" : removed === 2 ? " twice removed" : ` ${removed} times removed`;
  return `${ordinal(degree)} cousin${removal}`;
}

// depth=1 → first label, 2 → second, 3 → third, deeper → "Nth <third>".
// shiftOrdinal starts the "Nth" count at depth 3 (2nd great-aunt) instead of
// depth 4, matching aunt/niece convention vs grandparent convention.
function lineLabel(depth, one, two, deep, shiftOrdinal = false) {
  if (depth <= 1) return one;
  if (depth === 2) return two;
  const count = depth - (shiftOrdinal ? 1 : 2);
  return count <= 1 ? deep : `${ordinal(count)} ${deep}`;
}

// The person chain behind the kinship label: focus person up to the shared
// ancestor, then down to the selected person. Spouses bridge with one affinal
// hop on either end, mirroring kinshipLabel. Empty when unrelated.
function relationPath(personId, rootId, index = relationshipIndex()) {
  if (!personId || !rootId || personId === rootId) return [];
  const blood = bloodPath(rootId, personId, index);
  if (blood.length) return blood;
  if (index.get(rootId)?.spouses?.has(personId)) return [rootId, personId];
  for (const spouseId of index.get(personId)?.spouses || []) {
    const viaSpouse = bloodPath(rootId, spouseId, index);
    if (viaSpouse.length) return [...viaSpouse, personId];
  }
  for (const spouseId of index.get(rootId)?.spouses || []) {
    const inLaw = bloodPath(spouseId, personId, index);
    if (inLaw.length) return [rootId, ...inLaw];
  }
  return [];
}

// Consecutive pairs along the relation path between a person and the tree
// focus, keyed order-free, so hover tracing can light every connector that
// carries one hop of the lineage. Empty for the focus itself or strangers.
function lineageHops(personId, rootId, index = relationshipIndex()) {
  const path = relationPath(personId, rootId, index);
  const hops = new Set();
  for (let i = 1; i < path.length; i += 1) hops.add(hopKey(path[i - 1], path[i]));
  return hops;
}

function hopKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// A connector carries a lineage hop when both people of some hop ride on it.
// Parent-child drops list both parents plus the child, so requiring the pair
// keeps sibling drops and the couple's spouse link dark unless the path
// actually runs through them.
function linkOnLineage(people, hops) {
  if (!hops.size) return false;
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      if (hops.has(hopKey(people[i], people[j]))) return true;
    }
  }
  return false;
}

function bloodPath(aId, bId, index) {
  const aDepths = ancestorDepths(aId, index);
  const bDepths = ancestorDepths(bId, index);
  let best = null;
  for (const [ancestorId, aUp] of aDepths) {
    const bUp = bDepths.get(ancestorId);
    if (bUp === undefined) continue;
    if (!best || aUp + bUp < best.aUp + best.bUp) best = { ancestorId, aUp, bUp };
  }
  if (!best) return [];
  const up = chainToAncestor(aId, best.ancestorId, index);
  const down = chainToAncestor(bId, best.ancestorId, index);
  if (!up.length || !down.length) return [];
  return [...up, ...down.slice(0, -1).reverse()];
}

// Shortest parent-link chain [startId, …, ancestorId], via BFS backtracking.
function chainToAncestor(startId, ancestorId, index) {
  const cameFrom = new Map([[startId, null]]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (id === ancestorId) break;
    for (const parentId of index.get(id)?.parents || []) {
      if (cameFrom.has(parentId)) continue;
      cameFrom.set(parentId, id);
      queue.push(parentId);
    }
  }
  if (!cameFrom.has(ancestorId)) return [];
  const chain = [];
  for (let id = ancestorId; id !== null; id = cameFrom.get(id)) chain.push(id);
  return chain.reverse();
}

function ancestorDepths(startId, index) {
  const depths = new Map([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    for (const parentId of index.get(id)?.parents || []) {
      if (depths.has(parentId)) continue;
      depths.set(parentId, depths.get(id) + 1);
      queue.push(parentId);
    }
  }
  return depths;
}

function ordinal(value) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[value % 10] || "th";
  return `${value}${suffix}`;
}

function personListMeta(person) {
  if (!person) return "";
  const details = [
    person.birth?.place,
    person.death?.place ? `Died in ${person.death.place}` : "",
    person.aliases?.length ? `AKA ${person.aliases[0]}` : "",
  ].filter(Boolean);
  return details.slice(0, 2).join(" • ");
}

function initialsForName(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

// Age at death for the profile header. Exact only when both dates carry
// year-month-day; year-only records get an "about" age so partial dates never
// overstate precision. Dates that don't start with a 4-digit year (e.g.
// "abt 1850") or that run backwards return null and show no age.
function ageAtDeath(person) {
  const birth = parseDateParts(person.birth?.date);
  const death = parseDateParts(person.death?.date);
  if (!birth || !death) return null;
  if (birth.month && birth.day && death.month && death.day) {
    const beforeBirthday = death.month < birth.month
      || (death.month === birth.month && death.day < birth.day);
    const years = death.year - birth.year - (beforeBirthday ? 1 : 0);
    return years >= 0 ? { years, approx: false } : null;
  }
  const years = death.year - birth.year;
  return years >= 0 ? { years, approx: true } : null;
}

// Current age for people with no recorded death — shows "Age X" (exact) or
// "Age ~X" (year-only birth) so living profiles carry the same at-a-glance
// context as the "Died aged X" pill shown for deceased people.
function currentAgeLabel(person) {
  if (person.death?.date) return null;
  const birth = parseDateParts(person.birth?.date);
  if (!birth) return null;
  const now = new Date();
  const thisYear = now.getFullYear();
  if (birth.month && birth.day) {
    const hadBirthday = now.getMonth() + 1 > birth.month
      || (now.getMonth() + 1 === birth.month && now.getDate() >= birth.day);
    const years = thisYear - birth.year - (hadBirthday ? 0 : 1);
    return years >= 0 && years < 115 ? `Age ${years}` : null;
  }
  const years = thisYear - birth.year;
  return years >= 0 && years < 115 ? `Age ~${years}` : null;
}

function parseDateParts(value) {
  const match = String(value || "").match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: match[2] ? Number(match[2]) : null,
    day: match[3] ? Number(match[3]) : null,
  };
}

// Year range for cards, rows, and pills. Death-only records read "d. 1954"
// instead of a broken-looking "-1954"; full ranges use an en dash.
// Research dates aren't always ISO ("about 1897", "23 May 1975", "after 1900"),
// so pull the 4-digit year out of the string instead of slicing the first four
// characters, and keep approximate qualifiers as compact prefixes.
function yearLabel(value) {
  const raw = String(value || "");
  const match = raw.match(/\d{4}/);
  if (!match) return "";
  const year = match[0];
  if (/\b(?:about|abt|circa|ca)\b|~/i.test(raw)) return `c. ${year}`;
  if (/\b(?:before|bef)\b/i.test(raw)) return `bef. ${year}`;
  if (/\b(?:after|aft)\b/i.test(raw)) return `aft. ${year}`;
  return year;
}

function formatYears(person) {
  const born = yearLabel(person.birth?.date);
  const died = yearLabel(person.death?.date);
  if (born && died) return `${born}–${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  return "";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Turn ISO-ish record dates into readable prose: "1899-03-04" → "March 4, 1899",
// "1899-03" → "March 1899", bare years stay as-is. Anything that isn't a plain
// ISO date ("abt 1850", "before 1900") passes through untouched so hand-written
// research dates keep their wording.
function humanizeDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!match) return raw;
  const [, year, month, day] = match;
  if (!month) return year;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return raw;
  return day ? `${monthName} ${Number(day)}, ${year}` : `${monthName} ${year}`;
}

function formatEvent(event) {
  if (!event) return "";
  return [humanizeDate(event.date), event.place].filter(Boolean).join(" · ");
}

// Prose form for use in life story sentences: "February 6, 1923, in Kentucky, USA"
// vs formatEvent's " · " separator. Prefixes the place with "in" so place-only
// events read grammatically ("was born in Kentucky" rather than "was born Kentucky").
// Trims the trailing country name when it's the United States — redundant in
// narrative prose for an American ancestry tree, and the cleaned form reads more
// naturally: "born in Allen County, Kentucky" instead of "born in Allen County,
// Kentucky, USA".
function formatEventProse(event) {
  if (!event) return "";
  const date = humanizeDate(event.date);
  const place = event.place ? `in ${trimUsaCountry(event.place)}` : "";
  return [date, place].filter(Boolean).join(", ");
}

// Strip the trailing ", USA" / ", United States" / ", United States of America"
// from a place string used in narrative prose. Only used by formatEventProse;
// the facts panel and timeline keep the original form for precision.
function trimUsaCountry(place) {
  return String(place)
    .replace(/,\s*United States of America$/i, "")
    .replace(/,\s*United States$/i, "")
    .replace(/,\s*USA$/i, "")
    .trim();
}

function formatMetaDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `Updated ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed)}`;
}

function namesForIds(ids = []) {
  return [...ids]
    .map((id) => personById(id)?.name)
    .filter(Boolean);
}

function formatNameList(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function givenName(name = "") {
  return name.split(/\s+/).find(Boolean) || "They";
}

function splitParagraphs(value = "") {
  return String(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

// Tree cards used to chop long names to 25 characters with "…", which hit
// exactly the names genealogy cares about ("Margaret Elizabeth (Graves)
// Johnson"). Wrap onto a second line at the word break that best balances the
// two halves instead; only a name too long for even two lines still truncates.
const NODE_NAME_LINE_LIMIT = 21;

function nodeNameLines(name = "") {
  const clean = String(name).replace(/\s+/g, " ").trim();
  if (clean.length <= NODE_NAME_LINE_LIMIT) return [clean];
  const words = clean.split(" ");
  if (words.length === 1) return [truncate(clean, NODE_NAME_LINE_LIMIT)];
  let breakIndex = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) {
      bestDiff = diff;
      breakIndex = i;
    }
  }
  return [
    truncate(words.slice(0, breakIndex).join(" "), NODE_NAME_LINE_LIMIT),
    truncate(words.slice(breakIndex).join(" "), NODE_NAME_LINE_LIMIT),
  ];
}

function truncate(value = "", limit = 72) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}...` : clean;
}

function cssSafeId(value = "") {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function svgText(value, x, y, className, anchor = "middle") {
  const text = svgEl("text", { x, y, class: className, "text-anchor": anchor });
  text.textContent = value;
  return text;
}

// Wraps every occurrence of the search term inside the snippet in <mark>,
// built with DOM nodes so snippet text can never inject markup.
function appendHighlighted(container, text, term) {
  const lower = text.toLowerCase();
  let cursor = 0;
  let at = lower.indexOf(term);
  while (at !== -1) {
    if (at > cursor) container.append(text.slice(cursor, at));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(at, at + term.length);
    container.append(mark);
    cursor = at + term.length;
    at = lower.indexOf(term, cursor);
  }
  if (cursor < text.length) container.append(text.slice(cursor));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

if (!globalThis.__JMO_HEADLESS_TEST__) {
  init().catch((error) => {
    els.title.textContent = "Could not load family tree";
    console.error(error);
  });
}

// Headless smoke tests (test/layout-smoke.mjs) drive the pure layout helpers
// directly; browsers never set __JMO_HEADLESS_TEST__ so this stays inert.
export const __test = {
  state,
  NODE,
  relationshipIndex,
  buildBranch,
  expandedTreeIds,
  hiddenAncestorsAbove,
  hiddenSiblingIds,
  hiddenChildIds,
  saveViewState,
  restoreViewState,
  expandAncestorBranch,
  resetExpandedAncestors,
  revealAncestorPath,
  directRelatives,
  layoutNodes,
  layoutLinks,
  layoutFamilyUnits,
  orderedParentIds,
  kinshipLabel,
  relationPath,
  lineageHops,
  linkOnLineage,
  renderProfilePhoto,
  openPhotoLightbox,
  showLightboxPhoto,
  enablePhotoLightbox,
  lightbox,
  ageAtDeath,
  currentAgeLabel,
  lifeTimeline,
  sourceEventYear,
  chronologicalSources,
  formatYears,
  formatEvent,
  formatEventProse,
  surnameSortKey,
  surnameLabel,
  searchMatches,
  searchMatchReason,
  matchSnippet,
  storyText,
  storyMentions,
  storyNameIndex,
  strippedName,
  resolveMentionId,
  closeRelativeIds,
  nextSearchMatch,
  humanizeDate,
  sourceRepositoryName,
  cleanSourceLabel,
  ancestorLaneDirection,
  branchSideAssignments,
  branchSide,
  generationOffset,
  generationRowLabel,
  treeBounds,
  nodeNameLines,
  tagStatusTone,
  tagStatusRank,
  researchStatusPills,
  evidenceCoverage,
  evidenceCoverageSummary,
  evidenceStatusLabel,
  metaPill,
  tagListFact,
  searchByTag,
  HELP_TIPS,
  renderHelpTips,
  personLink,
  validateData,
  adoptData,
  preservedPlace,
  importedPeopleSummary,
  extractCensusLocation,
  profileObituaries,
  obituarySubject,
  obituarySubjectIsPerson,
  zoomStep,
  zoomAt,
  resolveMarriageYear,
  generatedLifeStory,
};

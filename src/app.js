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
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  peopleCollapsed: false,
  profileCollapsed: false,
  sourcesExpanded: false,
  notesExpanded: false,
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

const els = {
  search: document.querySelector("#person-search"),
  list: document.querySelector("#person-list"),
  loadJson: document.querySelector("#load-json"),
  clearData: document.querySelector("#clear-data"),
  importJson: document.querySelector("#import-json"),
  focusDirect: document.querySelector("#focus-direct"),
  fit: document.querySelector("#fit-tree"),
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
  detailMeta: document.querySelector("#detail-meta"),
  detailPhoto: document.querySelector("#detail-photo"),
  detailStory: document.querySelector("#detail-story"),
  detailFacts: document.querySelector("#detail-facts"),
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
  togglePeople: document.querySelector("#toggle-people"),
  toggleProfile: document.querySelector("#toggle-profile"),
  closeProfile: document.querySelector("#close-profile"),
  dropOverlay: document.querySelector("#drop-overlay"),
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

  els.search.addEventListener("input", renderPeople);
  els.search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const term = els.search.value.trim().toLowerCase();
      if (!term) return;
      const [first] = searchMatches(term);
      if (first) selectPerson(first.id, false, true);
    } else if (event.key === "Escape" && els.search.value) {
      event.stopPropagation();
      els.search.value = "";
      renderPeople();
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
    fitTree();
    render();
  });
  els.fit.addEventListener("click", fitTree);
  els.exportJson.addEventListener("click", exportData);
  els.centerPerson.addEventListener("click", () => {
    state.rootId = state.selectedId;
    resetExpandedAncestors();
    fitTree();
    render();
  });
  els.homePerson.addEventListener("click", () => {
    state.selectedId = state.data.meta?.defaultPersonId || state.data.people[0]?.id;
    state.rootId = state.selectedId;
    syncHash(true);
    resetExpandedAncestors();
    fitTree();
    render();
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
    renderDetails();
  });
  els.viewport.addEventListener("wheel", onZoom, { passive: false });
  enableDrag();
  enableDropImport();
  window.addEventListener("resize", fitTreeAfterLayout);

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
}

async function forgetStoredData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable; still fall back to sample data.
  }
  state.hasStoredData = false;
  adoptData(await fetchSampleData());
  renderDataStatus("Saved family data removed from this browser. Sample data loaded.", "success");
}

function adoptData(data) {
  state.data = data;
  state.selectedId = data.meta?.defaultPersonId || data.people[0]?.id;
  state.rootId = state.selectedId;
  syncHash();
  state.collapseCollateral = true;
  resetExpandedAncestors();
  applyDefaultPanelState();
  syncPanelState();
  els.search.value = "";
  fitTree();
  render();
  fitTreeAfterLayout();
}

function people() {
  return state.data.people;
}

function personById(id) {
  return people().find((person) => person.id === id);
}

function relationshipIndex() {
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

  return index;
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

function searchMatches(term) {
  const matches = people().filter((person) => {
    const haystack = [
      person.name,
      person.birth?.place,
      person.death?.place,
      person.birth?.date,
      person.death?.date,
      formatYears(person),
      person.notes,
      ...(person.aliases || []),
      ...(person.tags || []),
    ].join(" ").toLowerCase();
    return !term || haystack.includes(term);
  });
  if (!term) {
    return matches.sort((a, b) =>
      surnameSortKey(a.name).localeCompare(surnameSortKey(b.name)) || a.name.localeCompare(b.name));
  }
  return matches
    .map((person) => ({ person, rank: searchRank(person, term) }))
    .sort((a, b) => a.rank - b.rank || a.person.name.localeCompare(b.person.name))
    .map((entry) => entry.person);
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
      emptyState("No people matched that search.", "Try another name, place, note, or tag from your family JSON."),
    );
    return;
  }

  if (term) {
    els.list.replaceChildren(...matches.map(renderPersonRow));
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
    ...relations.spouses,
    ...relations.children,
  ]).size;

  const kinship = root ? kinshipLabel(person.id, root.id) : "";
  const age = ageAtDeath(person);
  els.detailName.textContent = person.name;
  els.detailContext.textContent = person.id === root?.id
    ? "Selected person and current tree focus."
    : kinship
      ? `${root.name}'s ${kinship}.`
      : `Selected profile while the tree stays focused on ${root?.name || person.name}.`;
  els.detailMeta.replaceChildren(
    ...[
      metaPill(formatYears(person) || "Dates pending"),
      person.birth?.place ? metaPill(`Born ${person.birth.place}`) : null,
      person.death?.place ? metaPill(`Died ${person.death.place}`) : null,
      age ? metaPill(age.approx ? `Died about age ${age.years}` : `Died aged ${age.years}`) : null,
      sources.length ? metaPill(`${sources.length} source${sources.length === 1 ? "" : "s"}`) : null,
      relationTotal ? metaPill(`${relationTotal} relationship${relationTotal === 1 ? "" : "s"}`) : null,
    ].filter(Boolean),
  );
  renderProfilePhoto(person);
  renderLifeStory(person);
  els.detailFacts.replaceChildren(
    fact("Born", formatEvent(person.birth)),
    fact("Died", formatEvent(person.death)),
    fact("Known as", person.aliases?.join(", ")),
    fact("Tags", person.tags?.join(", ")),
  );
  renderTimeline(person);
  renderNotes(person);
  els.centerPerson.textContent = person.id === root?.id ? "Tree focus" : "Make tree focus";
  els.centerPerson.disabled = person.id === root?.id;

  const relationItems = [
    ...linkGroup("Parents", relations.parents),
    ...linkGroup("Siblings", relations.siblings),
    ...linkGroup("Spouses", relations.spouses),
    ...linkGroup("Children", relations.children),
  ];
  els.relationsHeading.textContent = `Relationships (${relationTotal})`;
  els.detailRelations.replaceChildren(
    ...relationItems.length
      ? relationItems
      : [emptyState("No relationships recorded yet.", "Add parents, spouses, or children in the JSON when those connections are confirmed.")],
  );

  const sourceItems = sources.map(renderSourceItem);
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

  for (const paragraphText of splitParagraphs(shown)) {
    const paragraph = document.createElement("p");
    paragraph.className = "notes-body";
    paragraph.textContent = paragraphText;
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
    events.push({ year: birthYear, rank: 0, label: "Born", detail: formatEvent(person.birth) });
  }

  for (const childId of orderedChildren([person.id], index)) {
    const child = personById(childId);
    const year = numericYear(child?.birth?.date);
    if (year === null) continue;
    const age = birthYear !== null && year >= birthYear ? year - birthYear : null;
    events.push({
      year,
      rank: 1,
      personId: childId,
      label: `${child.name} born`,
      detail: [age !== null ? `around age ${age}` : "", child.birth?.place || ""].filter(Boolean).join(" · "),
    });
  }

  for (const { ids, role } of [
    { ids: index.get(person.id)?.parents, role: "parent" },
    { ids: index.get(person.id)?.spouses, role: "spouse" },
  ]) {
    for (const relativeId of ids || []) {
      const relative = personById(relativeId);
      const year = numericYear(relative?.death?.date);
      if (year === null) continue;
      if (birthYear !== null && year < birthYear) continue;
      if (deathYear !== null && year > deathYear) continue;
      const age = birthYear !== null ? year - birthYear : null;
      events.push({
        year,
        rank: 1,
        personId: relativeId,
        label: `${relative.name} died`,
        detail: [role, age !== null ? `around age ${age}` : ""].filter(Boolean).join(" · "),
      });
    }
  }

  if (deathYear !== null) {
    const age = ageAtDeath(person);
    events.push({
      year: deathYear,
      rank: 2,
      label: "Died",
      detail: [formatEvent(person.death), age ? (age.approx ? `about age ${age.years}` : `aged ${age.years}`) : ""]
        .filter(Boolean).join(" · "),
    });
  }

  for (const source of profileSources(person)) {
    const year = numericYear(source.date);
    if (year === null) continue;
    const inLifetime = birthYear !== null && year >= birthYear && (deathYear === null || year <= deathYear);
    events.push({
      year,
      rank: 3,
      record: true,
      label: source.label || source.title || source.url,
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

// The timeline only earns its space when it adds something beyond the
// Born/Died facts already listed above it.
function renderTimeline(person) {
  const events = lifeTimeline(person);
  const extras = events.filter((event) => event.rank === 1 || event.record);
  els.detailTimeline.hidden = !extras.length;
  els.detailTimeline.replaceChildren();
  if (!extras.length) return;

  const label = document.createElement("p");
  label.className = "notes-label";
  label.textContent = "Life timeline";
  els.detailTimeline.append(label);

  const list = document.createElement("ol");
  list.className = "timeline-list";
  for (const event of events) {
    const item = document.createElement("li");
    item.className = "timeline-item";

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
    const placeholder = document.createElement("div");
    placeholder.className = "photo-placeholder";
    placeholder.textContent = initialsForName(person.name);
    els.detailPhoto.append(placeholder);

    const caption = document.createElement("p");
    caption.textContent = "No profile photo attached yet.";
    els.detailPhoto.append(caption);
    return;
  }
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
    pick.append(small);
    pick.addEventListener("click", () => {
      if (index !== activeIndex) renderPhotoViewer(person, photos, index);
    });
    strip.append(pick);
  });
  els.detailPhoto.append(strip);
}

function renderLifeStory(person) {
  const obituary = primaryObituary(person);
  const story = person.profile?.article || person.lifeStory || person.profile?.summary || generatedLifeStory(person);
  const paragraphs = Array.isArray(story) ? story : splitParagraphs(story);

  els.detailStory.replaceChildren();
  if (obituary) {
    const badge = document.createElement(obituary.url ? "a" : "p");
    badge.className = "story-kicker";
    badge.textContent = obituary.publication
      ? `Obituary available from ${obituary.publication}`
      : "Obituary available";
    if (obituary.url) {
      badge.href = obituary.url;
      badge.target = "_blank";
      badge.rel = "noreferrer";
      badge.title = obituary.title || "Open the obituary in a new tab";
      badge.textContent += " ↗";
    }
    els.detailStory.append(badge);
  }

  for (const paragraphText of paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.textContent = paragraphText;
    els.detailStory.append(paragraph);
  }
}

function generatedLifeStory(person) {
  const index = relationshipIndex();
  const years = formatYears(person);
  const birth = formatEvent(person.birth);
  const death = formatEvent(person.death);
  const parents = namesForIds(index.get(person.id)?.parents);
  const spouses = namesForIds(index.get(person.id)?.spouses);
  const children = namesForIds(index.get(person.id)?.children);
  const lead = `${person.name}${years ? ` (${years})` : ""} is part of the working JMO family tree.`;
  const parts = [lead];

  if (birth) parts.push(`${givenName(person.name)} was born ${birth}.`);
  if (parents.length) parts.push(`${givenName(person.name)} was recorded as the child of ${formatNameList(parents)}.`);
  if (spouses.length) parts.push(`${givenName(person.name)} was connected in the tree with ${formatNameList(spouses)}.`);
  if (children.length) parts.push(`Known children in this research set include ${formatNameList(children)}.`);
  if (death) parts.push(`${givenName(person.name)} died ${death}.`);

  return parts.join(" ");
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

function primaryObituary(person) {
  return [...(person.profile?.obituaries || []), ...(person.obituaries || [])]
    .find((item) => item?.url || item?.title || item?.publication);
}

function renderSourceItem(source) {
  const item = document.createElement(source.url ? "a" : "div");
  item.className = `source-item ${source.type ? `source-${source.type}` : ""}`;
  if (source.url) {
    item.href = source.url;
    item.target = "_blank";
    item.rel = "noreferrer";
  }

  const title = document.createElement("span");
  title.className = "source-title";
  title.textContent = source.label || source.title || source.url;
  item.append(title);

  const meta = [source.date, source.publication, source.repository, source.confidence].filter(Boolean).join(" - ");
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
  const familyUnits = layoutFamilyUnits(nodes, index, directIds);
  const links = layoutLinks(nodes, index, directIds);
  const width = Math.max(els.viewport.clientWidth, 360);
  const height = Math.max(els.viewport.clientHeight, 520);
  const visibleParents = nodes.filter((node) => generationOffset(root.id, node.person.id, index) < 0).length;
  const hiddenParentCount = state.collapseCollateral ? hiddenExpandableParentCount(nodes, index) : 0;
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
  els.count.textContent = state.collapseCollateral
    ? `${nodes.length} visible people, ${visibleParents} ancestors shown, ${hiddenParentCount} hidden`
    : `${directCount} direct line, ${collateralCount} collateral`;
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
  for (const link of links) {
    const focused = link.people?.includes(selected.id);
    const el = svgEl("path", {
      class: `tree-link ${link.kind || ""} ${!state.collapseCollateral && !link.direct ? "dimmed" : ""} ${focused ? "focused" : ""}`,
      d: link.d,
    });
    linkEls.push({ el, people: link.people || [] });
    g.append(el);
  }
  // Hovering (or keyboard-focusing) a card lights up every connector touching
  // that person, so a line can be traced through the web without clicking.
  const setLinkTrace = (personId, on) => {
    for (const { el, people } of linkEls) {
      if (people.includes(personId)) el.classList.toggle("traced", on);
    }
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
      g.append(ancestorToggle(node, {
        label: deepBranch ? `Show parents · ${above} above` : `Show parent${hiddenParents === 1 ? "" : "s"}`,
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

    const group = svgEl("g", {
      class: `tree-node ${node.person.id === state.rootId ? "root" : ""} ${node.person.id === state.selectedId ? "selected" : ""} ${isCollateral ? "dimmed" : ""}`,
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
      }
    });

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
    renderTreePortrait(group, node.person);
    group.append(svgText(shortNodeName(node.person.name), NODE.textX, -7, "node-name"));
    group.append(svgText(formatYears(node.person), NODE.textX, 16, "node-years"));
    g.append(group);
  }
}

function ancestorToggle(node, { label, ariaLabel, tooltip = "", onToggle, collapse = false }) {
  const toggle = svgEl("g", {
    class: `ancestor-expander ${collapse ? "collapse" : ""}`,
    transform: `translate(${node.x} ${node.y - NODE_HALF_HEIGHT - 28})`,
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

function expandParents(personId) {
  state.expandedAncestors.add(personId);
  saveViewState();
  fitTree();
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
  fitTree();
  render();
}

function collapseParents(personId) {
  // Deeper expansions are kept so re-expanding restores the branch as it was.
  state.expandedAncestors.delete(personId);
  saveViewState();
  fitTree();
  render();
}

function resetExpandedAncestors() {
  state.expandedAncestors = new Set();
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

function selectPerson(id, reroot = true, openProfile = true) {
  state.selectedId = id;
  syncHash(true);
  state.sourcesExpanded = false;
  state.notesExpanded = false;
  if (openProfile) {
    state.profileCollapsed = false;
    if (isCompactViewport()) state.peopleCollapsed = true;
  }
  if (reroot) {
    state.rootId = id;
    resetExpandedAncestors();
    fitTree();
  } else if (state.collapseCollateral && revealAncestorPath(id)) {
    fitTree();
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

function fitTree() {
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
  renderTree();
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

async function loadFamilyFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    validateData(data);
    state.hasStoredData = storeData(data);
    adoptData(data);
    renderDataStatus(
      state.hasStoredData
        ? `Loaded ${data.people.length} people from ${file.name}. Saved in this browser only; nothing is uploaded.`
        : `Loaded ${data.people.length} people from ${file.name}. Could not save in this browser, so re-import next visit. Nothing was uploaded.`,
      "success",
    );
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

function validateData(data) {
  if (!data || !Array.isArray(data.people) || data.people.length === 0) {
    throw new Error("Family JSON must include a non-empty people array.");
  }
  const ids = new Set(data.people.map((person) => person.id));
  for (const person of data.people) {
    if (!person.id || !person.name) throw new Error("Each person needs an id and name.");
    for (const key of ["parents", "spouses", "children"]) {
      for (const id of person[key] || []) {
        if (!ids.has(id)) throw new Error(`${person.name} references missing ${key} id: ${id}`);
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

function linkGroup(label, ids = []) {
  if (!ids.length) return [];
  const heading = document.createElement("h3");
  heading.textContent = label;
  return [
    heading,
    ...ids.map((id) => {
      const person = personById(id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "relation-item";
      button.innerHTML = `
        <span class="relation-name">
          <strong>${escapeHtml(person?.name || id)}</strong>
          <small>${escapeHtml(formatYears(person || {}))}</small>
        </span>
        <small class="relation-meta">${escapeHtml(personListMeta(person) || "Open profile")}</small>
      `;
      button.addEventListener("click", () => {
        selectPerson(id, false, true);
      });
      return button;
    }),
  ];
}

function renderPersonRow(person) {
  const button = document.createElement("button");
  const isSelected = person.id === state.selectedId;
  const isFocused = person.id === state.rootId;
  button.type = "button";
  button.className = `person-row${isSelected ? " active" : ""}${isFocused ? " focused" : ""}`;
  button.append(personRowAvatar(person));

  const body = document.createElement("span");
  body.className = "person-row-body";
  body.innerHTML = `
    <span class="person-row-main">
      <span class="person-row-name">${escapeHtml(person.name)}</span>
      <small class="person-row-years">${escapeHtml(formatYears(person) || "")}</small>
    </span>
    <small class="person-row-meta">${escapeHtml(personListMeta(person) || "No date or place details yet.")}</small>
  `;

  const flags = document.createElement("span");
  flags.className = "person-row-flags";
  if (isSelected) flags.append(metaPill("Selected", "selected"));
  if (isFocused) flags.append(metaPill("Tree focus", "focused"));
  for (const tag of (person.tags || []).filter((tag) => tag !== "sample").slice(0, 2)) {
    flags.append(metaPill(tag));
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

function metaPill(label, tone = "") {
  const pill = document.createElement("span");
  pill.className = `meta-pill${tone ? ` ${tone}` : ""}`;
  pill.textContent = label;
  return pill;
}

function profileRelations(person) {
  const index = relationshipIndex();
  const parents = orderedParentIds(person.id, index);
  const siblings = orderedChildren(parents, index).filter((id) => id !== person.id);
  return {
    parents,
    siblings,
    spouses: [...(index.get(person.id)?.spouses || [])],
    children: orderedChildren([person.id], index),
  };
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
  if (aUp === 1 && bUp === 1) return "sibling";
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
    person.notes ? truncate(person.notes, 72) : "",
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

function shortNodeName(name = "") {
  const clean = String(name).replace(/\s+/g, " ").trim();
  return clean.length > 25 ? `${clean.slice(0, 24)}...` : clean;
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
  saveViewState,
  restoreViewState,
  expandAncestorBranch,
  revealAncestorPath,
  directRelatives,
  layoutNodes,
  layoutLinks,
  layoutFamilyUnits,
  orderedParentIds,
  kinshipLabel,
  renderProfilePhoto,
  ageAtDeath,
  lifeTimeline,
  formatYears,
  formatEvent,
  surnameSortKey,
  surnameLabel,
  searchMatches,
  humanizeDate,
  ancestorLaneDirection,
  generationOffset,
  treeBounds,
};

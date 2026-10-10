(function() {
  "use strict";

  const steps = [
    { number: 1, label: "Escolha a eleição e o turno", href: "index.html" },
    { number: 2, label: "Conheça os candidatos", href: "eleitor-escolhas.html" },
    { number: 3, label: "Informe acessibilidade", href: "acessibilidade.html" },
    { number: 4, label: "Simule a votação", href: "vota-wasm.html" }
  ];
  const scenarioIdStorageKey = "vota-wasm-cenario";
  const scenarioLabelStorageKey = "vota-wasm-cenario-label";

  function readJsonStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function getUnlockedSteps() {
    const scenarioSelected = Boolean(localStorage.getItem(scenarioIdStorageKey));
    const cargos = readJsonStorage("cargos", []);
    const escolhasSaved = localStorage.getItem("escolhas") !== null;
    const candidateStepCompleted = scenarioSelected && Array.isArray(cargos) && cargos.length > 0 && escolhasSaved;
    const accessibility = localStorage.getItem("acessibilidade");
    const accessibilityCompleted = accessibility === "sim" || accessibility === "nao";

    return [
      true,
      scenarioSelected,
      candidateStepCompleted,
      candidateStepCompleted && accessibilityCompleted
    ];
  }

  function setScenarioSummary(label) {
    const brandRow = document.querySelector(".brand-row");
    if (!brandRow) return;

    let summary = brandRow.querySelector(".selected-scenario");
    if (!label) {
      summary?.remove();
      return;
    }

    if (!summary) {
      summary = document.createElement("p");
      summary.className = "selected-scenario";

      const caption = document.createElement("span");
      caption.className = "selected-scenario-caption";
      caption.textContent = "Cenário selecionado";

      const name = document.createElement("strong");
      name.className = "selected-scenario-name";
      summary.append(caption, name);
      brandRow.append(summary);
    }

    summary.querySelector(".selected-scenario-name").textContent = label;
  }

  async function renderScenarioSummary() {
    const scenarioId = localStorage.getItem(scenarioIdStorageKey);
    if (!scenarioId) {
      setScenarioSummary("");
      return;
    }

    const savedLabel = localStorage.getItem(scenarioLabelStorageKey);
    if (savedLabel) {
      setScenarioSummary(savedLabel);
      return;
    }

    try {
      const response = await fetch("wasm/bases/manifest.json", { cache: "no-store" });
      if (!response.ok) return;
      const manifest = await response.json();
      const scenario = (manifest.scenarios || []).find(({ id }) => id === scenarioId);
      if (!scenario?.label || localStorage.getItem(scenarioIdStorageKey) !== scenarioId) return;
      localStorage.setItem(scenarioLabelStorageKey, scenario.label);
      setScenarioSummary(scenario.label);
    } catch (_) {
      // O restante da navegação continua funcional se o manifesto estiver indisponível.
    }
  }

  function createStepContent(step) {
    const number = document.createElement("span");
    number.className = "progress-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = String(step.number);

    const label = document.createElement("span");
    label.className = "progress-label";
    label.textContent = step.label;

    return [number, label];
  }

  function renderNavigation(navigation) {
    const currentStep = Number(navigation.dataset.currentStep);
    const unlockedSteps = getUnlockedSteps();
    const list = document.createElement("ol");
    list.className = "progress-container";

    steps.forEach((step, index) => {
      const item = document.createElement("li");
      item.className = "progress-panel";
      const accessibleLabel = `Etapa ${step.number}: ${step.label}`;
      let control;

      if (step.number === currentStep) {
        item.classList.add("is-current");
        control = document.createElement("span");
        control.setAttribute("aria-current", "step");
      } else if (unlockedSteps[index]) {
        item.classList.add("is-unlocked");
        control = document.createElement("a");
        control.href = step.href;
      } else {
        item.classList.add("is-locked");
        control = document.createElement("span");
        control.setAttribute("aria-disabled", "true");
      }

      control.className = "progress-link";
      control.setAttribute("aria-label", accessibleLabel);
      control.append(...createStepContent(step));
      item.append(control);
      list.append(item);
    });

    navigation.replaceChildren(list);
  }

  function renderAllNavigations() {
    document.querySelectorAll(".progress-navigation[data-current-step]")
      .forEach(renderNavigation);
    renderScenarioSummary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAllNavigations);
  } else {
    renderAllNavigations();
  }

  window.addEventListener("vota:progress-changed", renderAllNavigations);
})();

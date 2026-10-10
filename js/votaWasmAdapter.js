(function(global) {
  "use strict";

  const keyMap = {
    Enter: "C",
    Backspace: "D",
    Escape: "D",
    " ": "B",
    b: "B",
    B: "B"
  };

  const accessibilityStorageKey = "acessibilidade";
  const scenarioStorageKey = "vota-wasm-cenario";
  const defaultScenarioId = "municipal-t1";
  const rhvoiceDataScript = "wasm/rhvoice-leticia.data.js";
  const rhvoiceSentinel = "/share/RHVoice/voices/Leticia-F123/16000/voice.data";

  class VotaWasmAdapter {
    constructor(module) {
      this.module = module;
      this.running = false;
      const accessibilityEnabled = localStorage.getItem(accessibilityStorageKey) === "sim";
      this.audioEnabled = accessibilityEnabled;
      this.audioEleitorHabilitado = accessibilityEnabled;
      this.raf = 0;
      this.initialized = false;
      this.lastError = "";
      this.keyChain = Promise.resolve();
      this.tickPromise = null;
      this.currentState = null;
      this.currentScenario = null;
      this.scenarioLoaded = false;
      this.rhvoiceLoaded = false;
      this.currentVoteMode = "inicio";
      this.currentCandidatePrefix = "";
      this.currentCargoKey = "";
      this.pendingCargoConfirmation = false;
      this.elements = {
        status: document.getElementById("vota-status"),
        state: document.getElementById("vota-state"),
        cargo: document.getElementById("vota-cargo"),
        candidates: document.getElementById("vota-candidates"),
        candidatesTitle: document.getElementById("vota-candidates-title"),
        guideCards: document.getElementById("vota-guide-cards"),
        candidateSection: document.getElementById("vota-candidate-section"),
        candidateListTitle: document.getElementById("vota-candidate-list-title"),
        scenario: document.getElementById("vota-scenario"),
        technicalState: document.getElementById("vota-technical-state")
      };
    }

    start() {
      this.bindKeys();
      this.bindEvents();
      this.onReady();
    }

    async initializeEngine() {
      if (this.initialized) {
        return;
      }
      updateProgress("Carregando dados de votação...");
      this.initialized = true;
      this.setStatus("Preparando votação...");
      try {
        const scenario = await this.loadScenarioData();
        if (this.audioEleitorHabilitado) {
          await this.loadRhvoiceData();
        }
        const ok = await this.ccallAsync("votaInit", "number", ["string"], [JSON.stringify({
          fase: scenario.fase || "te",
          pe: scenario.pe,
          turno: scenario.turno,
          uf: scenario.uf,
          municipio: scenario.municipio,
          zona: scenario.zona,
          secao: scenario.secao,
          audioEleitorHabilitado: this.audioEleitorHabilitado,
          reproduzirAudio: this.audioEnabled
        })]);
        if (!ok) {
          this.initialized = false;
          this.setStatus("Não foi possível iniciar a votação. Recarregue a página ou escolha outro cenário.");
          return;
        }
        await this.ccallAsync("votaSetAudioEnabled", null, ["number"], [this.audioEnabled ? 1 : 0]);
        this.running = true;
        this.tick();
      } catch (error) {
        this.initialized = false;
        console.error(error);
        this.setStatus("Não foi possível iniciar a votação. Recarregue a página ou escolha outro cenário.");
      }
      finally {
        const loadingScreen = document.getElementById("vota-loading-screen");
        if (loadingScreen) loadingScreen.style.display = "none";
        console.log("Carregamento finalizado");

      }
    }

    async loadScenarioData() {
      if (this.scenarioLoaded && this.currentScenario) {
        return this.currentScenario;
      }
      const scenario = await this.selectScenario();
      this.currentScenario = scenario;
      this.renderScenario(scenario);
      this.setStatus(`Carregando dados: ${scenario.label}...`);
      await this.loadScenarioPackage(scenario);
      await this.waitForScenarioData(scenario);
      this.createScenarioAliases(scenario);
      this.scenarioLoaded = true;
      return scenario;
    }

    async selectScenario() {
      const selectedId = localStorage.getItem(scenarioStorageKey) || defaultScenarioId;
      const manifest = await this.fetchManifest();
      const scenarios = manifest.scenarios || [];
      const scenario = scenarios.find((item) => item.id === selectedId) || scenarios[0];
      if (!scenario) {
        throw new Error("Nenhum cenário de dados foi gerado. Execute tools/gerar-dados-vota.py.");
      }
      return scenario;
    }

    async fetchManifest() {
      const response = await fetch("wasm/bases/manifest.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Manifesto de bases não encontrado. Execute tools/gerar-dados-vota.py.");
      }
      return response.json();
    }

    loadScenarioPackage(scenario) {
      if (!scenario.dataJs) {
        throw new Error(`Cenário ${scenario.id} não informa dataJs.`);
      }
      return this.loadDataScript(`wasm/bases/${scenario.dataJs}`);
    }

    async waitForScenarioData(scenario) {
      const fase = scenario.fase === "of" ? "o" : "t";
      const pe = String(scenario.pe || "").padStart(5, "0");
      const uf = String(scenario.uf || "").toLowerCase();
      const sentinela = `/dsk/fi/estatico/${fase}${pe}${uf}-pu.dat`;
      const deadline = Date.now() + 30000;

      while (Date.now() < deadline) {
        if (globalThis.FS?.analyzePath?.(sentinela)?.exists) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      throw new Error(`Dados do cenário não foram montados no MEMFS: ${sentinela}`);
    }

    createScenarioAliases(scenario) {
      const fs = globalThis.FS;
      if (!fs) {
        throw new Error("Sistema de arquivos do simulador indisponível.");
      }

      const aliases = scenario.aliases || [
        { source: "/dsk/fi/estatico", target: "/dsk/fe/estatico" },
        { source: "/dsk/fi/serialv.dat", target: "/dsk/fe/serialv.dat" }
      ];

      aliases.forEach((alias) => this.createFsAlias(alias.source, alias.target));
    }

    createFsAlias(source, target) {
      const fs = globalThis.FS;
      if (!source || !target || fs.analyzePath?.(target)?.exists) {
        return;
      }
      if (!fs.analyzePath?.(source)?.exists) {
        throw new Error(`Origem do alias não encontrada no MEMFS: ${source}`);
      }

      const parent = target.replace(/\/[^/]+$/, "") || "/";
      if (!fs.analyzePath?.(parent)?.exists) {
        fs.mkdirTree(parent);
      }
      fs.symlink(source, target);
    }

    async loadRhvoiceData() {
      if (this.rhvoiceLoaded) {
        return;
      }
      this.setStatus("Carregando voz da urna...");
      await this.loadDataScript(this.versionedUrl(rhvoiceDataScript));
      await this.waitForRhvoiceData();
      this.rhvoiceLoaded = true;
    }

    async waitForRhvoiceData() {
      const deadline = Date.now() + 30000;

      while (Date.now() < deadline) {
        if (globalThis.FS?.analyzePath?.(rhvoiceSentinel)?.exists) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      throw new Error("Dados da voz da urna não foram montados no MEMFS.");
    }

    versionedUrl(src) {
      if (typeof global.votaWasmVersionedUrl === "function") {
        return global.votaWasmVersionedUrl(src);
      }
      return src;
    }

    loadDataScript(src) {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-vota-data-script="${src}"]`);
        if (existing?.dataset.loaded === "true") {
          resolve();
          return;
        }

        const originalAdd = this.module.addRunDependency?.bind(this.module);
        const originalRemove = this.module.removeRunDependency?.bind(this.module);
        const pending = new Set();
        let loaded = false;
        let restored = false;

        const restore = () => {
          if (restored) {
            return;
          }
          restored = true;
          if (originalAdd) {
            this.module.addRunDependency = originalAdd;
          }
          if (originalRemove) {
            this.module.removeRunDependency = originalRemove;
          }
        };
        const finish = () => {
          if (!loaded || pending.size) {
            return;
          }
          restore();
          script.dataset.loaded = "true";
          resolve();
        };

        if (originalAdd) {
          this.module.addRunDependency = (id) => {
            pending.add(id);
            originalAdd(id);
          };
        }
        if (originalRemove) {
          this.module.removeRunDependency = (id) => {
            originalRemove(id);
            pending.delete(id);
            finish();
          };
        }

        const script = existing || document.createElement("script");
        script.dataset.votaDataScript = src;
        script.onload = () => {
          loaded = true;
          finish();
        };
        script.onerror = () => {
          restore();
          reject(new Error(`Falha ao carregar ${src}`));
        };
        if (!existing) {
          script.src = src;
          document.head.appendChild(script);
        }
      });
    }

    renderScenario(scenario) {
      if (this.elements.scenario) {
        this.elements.scenario.textContent = scenario.label || scenario.id;
      }
    }


    bindKeys() {
      document.querySelectorAll("[data-vota-key]").forEach((button) => {
        button.addEventListener("click", () => {
          button.blur();
          this.pressKey(button.dataset.votaKey);
        });
      });
      document.addEventListener("keydown", (event) => {
        if (event.target instanceof Element &&
            event.target.closest("a, button, input, select, textarea, summary, [contenteditable='true']")) {
          return;
        }
        const key = event.key >= "0" && event.key <= "9" ? event.key : keyMap[event.key];
        if (key) {
          event.preventDefault();
          this.pressKey(key);
        }
      });
    }

    bindEvents() {
      window.addEventListener("vota:ready", () => this.onReady());
      window.addEventListener("vota:screen", () => {
        if (this.running) {
          this.setStatus("Tela atualizada.");
        }
      });
      window.addEventListener("vota:state", (event) => this.renderState(event.detail));
      window.addEventListener("vota:done", (event) => {
        this.running = false;
        this.renderState(event.detail);
        this.setStatus("Votação concluída.");
      });
      window.addEventListener("vota:error", (event) => {
        this.running = false;
        const technicalMessage = event.detail?.message || "";
        this.lastError = "Ocorreu um erro na simulação.";
        if (technicalMessage && this.elements.technicalState) {
          this.elements.technicalState.textContent = `Erro: ${technicalMessage}`;
        }
        this.setStatus(this.lastError);
      });
    }

    pressKey(key) {
      if (!this.running) {
        return Promise.resolve();
      }
      this.keyChain = this.keyChain.then(() => this.pressKeyNow(key));
      return this.keyChain;
    }

    async pressKeyNow(key) {
      this.pendingCargoConfirmation = key === "C";
      this.updateCandidatePrefix(key);
      await this.ccallAsync("votaPressKey", null, ["string"], [key]);
      await this.runTick();
      this.refreshCurrentGuide();
    }

    tick() {
      if (!this.running) {
        return;
      }
      this.runTick().finally(() => {
        if (this.running) {
          this.raf = requestAnimationFrame(() => this.tick());
        }
      });
    }

    async runTick() {
      if (this.tickInFlight) {
        return this.tickPromise;
      }
      this.tickInFlight = true;
      this.tickPromise = this.ccallAsync("votaTick", "number", [], [])
        .finally(() => {
          this.tickInFlight = false;
          this.tickPromise = null;
        });
      return this.tickPromise;
    }

    renderState(state) {
      if (!state) {
        return;
      }
      this.notifyCargoProgress(this.currentState, state);
      const voteMode = this.getVoteMode(state);
      this.updateCurrentState(state, voteMode);
      this.elements.state.textContent = this.formatGuideLabel(state, voteMode);
      if (this.elements.technicalState) {
        this.elements.technicalState.textContent = this.formatTechnicalStateLabel(state);
      }
      if (state.cargo) {
        this.elements.cargo.textContent = `${state.cargo.name} (${state.cargo.digits} dígitos)`;
      }
      if (state.done || voteMode === "fim") {
        this.renderDoneGuide();
        return;
      }
      if (voteMode === "accessibility") {
        this.renderAccessibilityGuide();
        return;
      }
      if (voteMode === "gravando") {
        this.renderRecordingGuide(state);
        return;
      }
      if (voteMode === "branco") {
        this.renderBlankVoteGuide(state);
        return;
      }
      if (voteMode === "nulo") {
        this.renderNullVoteGuide(state);
        return;
      }
      if (voteMode === "legendaOuNominal") {
        this.renderLegendOrNominalGuide(state);
        return;
      }
      if (voteMode === "legenda") {
        this.renderLegendVoteGuide(state);
        return;
      }
      if (voteMode === "nominal" && this.isNominalConfirmation(state)) {
        this.renderNominalConfirmationGuide(state);
        return;
      }
      if (state.cargo) {
        this.renderVotingGuide(state);
      } else {
        this.renderInitialGuide();
      }
    }

    notifyCargoProgress(previousState, state) {
      if (!this.pendingCargoConfirmation || !previousState?.cargo) {
        return;
      }

      const advancedToNextCargo = Boolean(
        state.cargo
        && this.isInitialCargoPrompt(state)
        && !this.isInitialCargoPrompt(previousState)
      );
      if (!state.done && !advancedToNextCargo) {
        return;
      }

      this.pendingCargoConfirmation = false;
      global.dispatchEvent(new CustomEvent("vota:cargo-completed", {
        detail: {
          cargo: previousState.cargo,
          nextCargo: state.cargo || null,
          done: Boolean(state.done)
        }
      }));
    }

    isInitialCargoPrompt(state) {
      const substate = state?.substate || "";
      return substate.includes("CPedeProporcional") || substate.includes("CPedeMajoritario");
    }

    formatTechnicalStateLabel(state) {
      const stateName = state.state || "desconhecido";
      if (state.substate) {
        return `Estado: ${stateName} / ${state.substate}`;
      }
      return `Estado: ${stateName}`;
    }

    formatGuideLabel(state, voteMode) {
      const labels = {
        inicio: "Guia: preparação",
        accessibility: "Guia: configuração de áudio",
        nominal: state.cargo ? `Guia: votando para ${state.cargo.name}` : "Guia: votação",
        legendaOuNominal: "Guia: legenda ou voto nominal",
        legenda: "Guia: voto em legenda",
        branco: "Guia: voto em branco",
        nulo: "Guia: voto nulo",
        gravando: "Guia: registrando voto",
        fim: "Guia: votação concluída"
      };
      return labels[voteMode] || "Guia: votação";
    }

    getVoteMode(state) {
      const substate = state.substate || "";
      const currentState = state.state || "";
      if (state.done) {
        return "fim";
      }
      if (substate.includes("CPedeNominal") && this.isProportionalCargo(state.cargo || {})) {
        return state.guide?.legendaValida === false ? "nulo" : "legendaOuNominal";
      }
      if (
        substate.includes("VotoLegenda")
        || (substate.includes("CandidatoInexistente") && this.isProportionalCargo(state.cargo || {}))
      ) {
        return state.guide?.legendaValida === false ? "nulo" : "legenda";
      }
      if (state.guide?.voteMode) {
        return state.guide.voteMode;
      }
      if (state.screen === "accessibility" || substate.includes("CInstrucaoVotacaoAcessibilidade")) {
        return "accessibility";
      }
      if (currentState.includes("CSincronismo") || substate.includes("CSincronismo")) {
        return "gravando";
      }
      if (substate.includes("Branco")) {
        return "branco";
      }
      if (
        substate.includes("Nulo")
        || substate.includes("Inexistente")
        || substate.includes("Inapto")
        || substate.includes("Repetido")
      ) {
        return "nulo";
      }
      return "nominal";
    }

    isNominalConfirmation(state) {
      if (state.guide?.confirmacao) {
        return true;
      }
      const substate = state.substate || "";
      return substate.includes("VotoNominal") || substate.includes("MajoritarioValido");
    }

    isProportionalCargo(cargo) {
      return cargo.tipo === "proporcional" || cargo.legendaDigits === 2 || cargo.name === "Vereador";
    }

    renderInitialGuide() {
      this.elements.cargo.textContent = "Aguardando início da votação";
      this.elements.candidatesTitle.textContent = "Prepare a simulação";
      const scenarioLabel = this.currentScenario?.label || "cenário escolhido";
      this.setGuideCards(
        this.createGuideCard("Cenário", scenarioLabel),
        this.createGuideCard("Áudio", "Escolha se deseja simular o áudio do eleitor."),
        this.createGuideCard("Início", "Pressione Iniciar votação para carregar a urna.")
      );
      this.hideCandidateList();
    }

    renderAccessibilityGuide() {
      this.elements.cargo.textContent = "Configuração de acessibilidade";
      this.elements.candidatesTitle.textContent = "Áudio do eleitor";
      this.setGuideCards();
      this.hideCandidateList();

      [
        ["CONFIRMA", "iniciar o voto"],
        ["3", "aumentar o volume"],
        ["9", "diminuir o volume"],
        ["4", "fala mais lenta"],
        ["6", "fala mais rápida"]
      ].forEach(([key, action]) => {
        const item = document.createElement("div");
        item.className = "accessibility-command";
        const keyLabel = document.createElement("span");
        keyLabel.className = "accessibility-key";
        keyLabel.textContent = key;
        const actionLabel = document.createElement("span");
        actionLabel.className = "accessibility-action";
        actionLabel.textContent = action;
        item.append(keyLabel, actionLabel);
        this.elements.guideCards.append(item);
      });

    }

    renderVotingGuide(state) {
      const cargo = state.cargo;
      const proporcional = this.isProportionalCargo(cargo);
      this.elements.candidatesTitle.textContent = `Como votar para ${cargo.name}`;
      this.setGuideCards(
        this.createGuideCard("Nominal", `${cargo.digits} dígitos do candidato.`),
        proporcional
          ? this.createGuideCard("Legenda", `${cargo.legendaDigits || 2} dígitos do partido e CONFIRMA.`)
          : this.createGuideCard("Branco", "BRANCO e depois CONFIRMA."),
        proporcional
          ? this.createGuideCard("Branco ou nulo", "BRANCO, ou número inexistente e CONFIRMA.")
          : this.createGuideCard("Nulo", "Número inexistente e depois CONFIRMA.")
      );
      this.appendCandidates(state.candidates || [], state);
      this.hideCandidateList();
    }

    renderNominalConfirmationGuide(state) {
      const cargo = state.cargo;
      this.elements.candidatesTitle.textContent = "Confirme o voto";
      this.setGuideCards(
        this.createGuideCard("CONFIRMA", "Registra o voto mostrado na tela da urna."),
        this.createGuideCard("CORRIGE", "Volta para digitar outro voto."),
        this.createGuideCard("Atenção", "Confira cargo, número e candidato antes de confirmar.")
      );
      this.hideCandidateList();
    }

    renderLegendVoteGuide(state) {
      const cargo = state.cargo;
      this.elements.candidatesTitle.textContent = "Voto em legenda";
      this.setGuideCards(
        this.createGuideCard("Legenda", "O voto vai para o partido, não para um candidato específico."),
        this.createGuideCard("CONFIRMA", "Registra o voto em legenda."),
        this.createGuideCard("CORRIGE", "Reinicia este voto.")
      );
      this.hideCandidateList();
    }

    renderLegendOrNominalGuide(state) {
      const cargo = state.cargo;
      const prefix = this.getCandidatePrefix(state);
      const filteredCandidates = this.filterCandidates(state.candidates || [], prefix);
      const legendaDigits = cargo.legendaDigits || 2;
      const partido = this.getPartyPrefix(state);
      const remainingDigits = Math.max((cargo.digits || legendaDigits) - prefix.length, 0);

      this.elements.candidatesTitle.textContent = partido
        ? `Partido ${partido} digitado`
        : "Legenda ou voto nominal";
      this.setGuideCards(
        filteredCandidates.length
          ? this.createGuideCard(
            "Legenda",
            partido
              ? `CONFIRMA registra voto na legenda do partido ${partido}.`
              : "CONFIRMA registra voto em legenda se o partido for válido."
          )
          : this.createGuideCard("Nulo", "Se confirmar agora, será registrado voto nulo."),
        this.createGuideCard(
          "Nominal",
          remainingDigits
            ? `Digite mais ${remainingDigits} dígito${remainingDigits === 1 ? "" : "s"} para voto nominal.`
            : "Confira o candidato e confirme o voto nominal."
        ),
        this.createGuideCard("CORRIGE", "Reinicia este voto.")
      );
      this.appendCandidates(state.candidates || [], state);
      this.hideCandidateList();
    }

    renderBlankVoteGuide(state) {
      const cargo = state.cargo;
      this.elements.candidatesTitle.textContent = "Voto em branco";
      this.setGuideCards(
        this.createGuideCard("Branco", "Escolha registrada sem candidato ou partido."),
        this.createGuideCard("CONFIRMA", "Registra o voto em branco."),
        this.createGuideCard("CORRIGE", "Volta para digitar outro voto.")
      );
      this.hideCandidateList();
    }

    renderNullVoteGuide(state) {
      const cargo = state.cargo;
      this.elements.candidatesTitle.textContent = "Voto nulo";
      this.setGuideCards(
        this.createGuideCard("Nulo", "Número inexistente ou opção inválida para este cargo."),
        this.createGuideCard("CONFIRMA", "Registra o voto nulo."),
        this.createGuideCard("CORRIGE", "Reinicia este voto.")
      );
      this.hideCandidateList();
    }

    renderRecordingGuide(state) {
      this.elements.candidatesTitle.textContent = "Registrando voto";
      this.setGuideCards(
        this.createGuideCard("Aguarde", "A urna está registrando o voto confirmado."),
        this.createGuideCard("Próximo passo", "A tela avançará automaticamente.")
      );
      this.hideCandidateList();
      if (state.cargo) {
        this.elements.cargo.textContent = `Registrando ${state.cargo.name}`;
      }
    }

    renderDoneGuide() {
      this.elements.cargo.textContent = "Fim da votação";
      this.elements.candidatesTitle.textContent = "Treinamento concluído";
      this.setGuideCards(this.createFinishPanel());
      this.hideCandidateList();
      this.setStatus("Votação concluída.");
    }

    renderCandidates(candidates) {
      this.appendCandidates(candidates, this.currentState || {});
    }

    setGuideCards(...cards) {
      this.elements.guideCards.replaceChildren(...cards);
    }

    hideCandidateList() {
      this.elements.candidates.replaceChildren();
      this.elements.candidateSection.hidden = true;
    }

    appendCandidates(candidates, state) {
      this.elements.candidates.replaceChildren();
      this.elements.candidateSection.hidden = false;
      const prefix = this.getCandidatePrefix(state);
      const filteredCandidates = this.filterCandidates(candidates, prefix);
      this.elements.candidateListTitle.textContent = this.formatCandidateListTitle(
        candidates.length,
        filteredCandidates.length,
        prefix,
        state
      );
      if (!candidates.length) {
        const empty = document.createElement("div");
        empty.className = "empty-candidates";
        empty.textContent = "Os candidatos aparecerão aqui quando o cargo for carregado.";
        this.elements.candidates.append(empty);
        return;
      }
      if (!filteredCandidates.length) {
        const empty = document.createElement("div");
        empty.className = "empty-candidates";
        empty.textContent = `Nenhum candidato começa com ${prefix}. Continue digitando ou use CORRIGE.`;
        this.elements.candidates.append(empty);
        return;
      }
      filteredCandidates.forEach((candidate) => {
        const row = document.createElement("div");
        row.className = "candidate";
        const number = document.createElement("div");
        number.className = "number";
        number.textContent = candidate.number;
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = candidate.name || "Sem nome";
        const party = document.createElement("div");
        party.className = "party";
        party.textContent = candidate.party ? `Partido ${candidate.party}` : "";
        row.append(number, name, party);
        this.elements.candidates.append(row);
      });
    }

    updateCurrentState(state, voteMode) {
      const cargoKey = state.cargo ? `${state.cargo.id}:${state.cargo.digits}` : "";
      if (cargoKey !== this.currentCargoKey) {
        this.currentCandidatePrefix = "";
      }
      if (!this.isCandidateTypingMode(voteMode)) {
        this.currentCandidatePrefix = "";
      }
      this.currentState = state;
      this.currentVoteMode = voteMode;
      this.currentCargoKey = cargoKey;
    }

    updateCandidatePrefix(key) {
      const state = this.currentState;
      if (!state?.cargo || !this.isCandidateTypingMode(this.currentVoteMode)) {
        return;
      }
      if (key >= "0" && key <= "9") {
        const maxLength = state.cargo.digits || 5;
        this.currentCandidatePrefix = `${this.currentCandidatePrefix}${key}`.slice(0, maxLength);
        return;
      }
      if (key === "D" || key === "B" || key === "C") {
        this.currentCandidatePrefix = "";
      }
    }

    refreshCurrentGuide() {
      if (!this.currentState || !this.isCandidateTypingMode(this.currentVoteMode)) {
        return;
      }
      if (this.currentVoteMode === "legendaOuNominal") {
        this.renderLegendOrNominalGuide(this.currentState);
      } else {
        this.renderVotingGuide(this.currentState);
      }
    }

    getCandidatePrefix(state) {
      if (!state?.cargo || !this.isCandidateTypingMode(this.currentVoteMode)) {
        return "";
      }
      return this.currentCandidatePrefix;
    }

    getPartyPrefix(state) {
      const prefix = this.getCandidatePrefix(state);
      const legendaDigits = state?.cargo?.legendaDigits || 2;
      return prefix.slice(0, legendaDigits);
    }

    isCandidateTypingMode(voteMode) {
      return voteMode === "nominal" || voteMode === "legendaOuNominal";
    }

    filterCandidates(candidates, prefix) {
      if (!prefix) {
        return candidates;
      }
      return candidates.filter((candidate) => String(candidate.number).startsWith(prefix));
    }

    formatCandidateListTitle(total, filtered, prefix, state) {
      if (!total) {
        return "Candidatos disponíveis";
      }
      const cargo = state?.cargo || {};
      if (prefix && this.isProportionalCargo(cargo) && prefix.length === (cargo.legendaDigits || 2)) {
        return `Candidatos do partido ${prefix} (${filtered} de ${total})`;
      }
      if (prefix) {
        return `Candidatos com número iniciado por ${prefix} (${filtered} de ${total})`;
      }
      return `Candidatos disponíveis (${total})`;
    }

    createGuideCard(title, text) {
      const item = document.createElement("div");
      item.className = "guide-card";
      const heading = document.createElement("span");
      heading.className = "guide-card-title";
      heading.textContent = title;
      const body = document.createElement("span");
      body.className = "guide-card-text";
      body.textContent = text;
      item.append(heading, body);
      return item;
    }

    createFinishPanel() {
      const panel = document.createElement("section");
      panel.className = "finish-panel";
      panel.setAttribute("aria-label", "Treinamento concluído");

      const kicker = document.createElement("div");
      kicker.className = "finish-kicker";
      kicker.textContent = "Treinamento concluído";
      const title = document.createElement("h2");
      title.textContent = "Fim da votação";
      const text = document.createElement("p");
      text.textContent = "Você pode refazer esta votação ou voltar para escolher outro cenário de treinamento.";

      const actions = document.createElement("div");
      actions.className = "finish-actions";
      const restart = document.createElement("button");
      restart.className = "finish-button primary";
      restart.type = "button";
      restart.textContent = "Refazer votação";
      restart.addEventListener("click", () => this.restartVoting());
      const chooseScenario = document.createElement("button");
      chooseScenario.className = "finish-button";
      chooseScenario.type = "button";
      chooseScenario.textContent = "Escolher outro cenário";
      chooseScenario.addEventListener("click", () => this.chooseScenario());
      actions.append(restart, chooseScenario);

      panel.append(kicker, title, text, actions);
      return panel;
    }

    onReady() {
      if (this.initialized) {
        return;
      }
      this.renderInitialGuide();
      this.setStatus("Preparando votação...");
      this.initializeEngine();
    }

    setStatus(message) {
      this.elements.status.textContent = message;
    }

    restartVoting() {
      window.location.reload();
    }

    chooseScenario() {
      window.location.href = "index.html";
    }

    ccallAsync(name, returnType, argTypes, args) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(this.module.ccall(name, returnType, argTypes, args));
          } catch (error) {
            reject(error);
          }
        }, 0);
      });
    }

    ccall(name, returnType, argTypes, args) {
      return this.module.ccall(name, returnType, argTypes, args);
    }
  }

  global.VotaWasmAdapter = {
    start(module) {
      const adapter = new VotaWasmAdapter(module);
      global.votaWasmAdapter = adapter;
      adapter.start();
    }
  };
})(window);

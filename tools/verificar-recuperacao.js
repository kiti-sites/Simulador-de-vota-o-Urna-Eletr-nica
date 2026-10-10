// Verifica integridade dos artefatos recuperados (somente leitura).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const expected = {
  "js/votaWasmAdapter.js": "b7dc17b1818646bca78f5a9a48388fea2d85de4ee00a61cef548b6983f223c27",
  "js/progress-navigation.js": "13eb02ccab47ce381d3a497c95f2563f3deb3c80647f44136b61a03278d80fb9",
  "css/vota-wasm.css": "c92a7a440264314f800baf0512df5c3a959e95a23a90de2a0593a95265293284",
  "css/eleitor-escolhas.css": "d262d2e276972e19a19faba605f787ef26a535517d3f3dcb36908ebc4a086b0b",
  "wasm/vota_web_wasm.js": "31e985a01b80449c78c726e4070355bd9875c7a2df7f6fac8b69c61f49248754",
  "wasm/vota_web_wasm.wasm": "8579ef8d1a93819152cecdbf52906d2e4dd0f57999cb2e1e8c0d1161cd1007e2",
  "wasm/vota_web_wasm.data": "fbb19714507f63063a4b45773699297d7925e666e1eef407d9403b733457da4c",
  // vota-wasm.html ganhou o link "Trocar cenário" no cabeçalho (seletor, 10/10/2026)
  "vota-wasm.html": "5e2920566300ec7134fd6f5bc0f7038b12eacc4eda79a68ee49246ebfe7a1d92",
  "index.html": null, // só presença + ganchos (conteúdo pode evoluir com o menu)
};
let fail = 0;
for (const [rel, sha] of Object.entries(expected)) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { console.log(`FALTA ${rel}`); fail++; continue; }
  const got = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const ok = sha === null ? true : got === sha;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${rel} ${got}`);
}
// menu index.html: ganchos obrigatórios
{
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  // valor padrão municipal-t1 verificado via radio com value (aspas podem variar)
  const need = ["wasm/bases/manifest.json", "vota-wasm-cenario", "vota-wasm.html",
    "municipal-t1", "btn-start", "scenario-list"];
  let hok = true;
  for (const h of need) {
    if (!html.includes(h)) { console.log(`FALTA gancho ${h} no index.html`); hok = false; fail++; }
  }
  if (hok) console.log("OK   index.html ganchos do menu");
}
// vota-wasm.html mantém o link de retorno ao menu
{
  const html = fs.readFileSync(path.join(root, "vota-wasm.html"), "utf8");
  const ok = html.includes('href="index.html"') && html.includes("vota-change-scenario");
  if (!ok) { console.log("FALTA link Trocar cenário em vota-wasm.html"); fail++; }
  else console.log("OK   vota-wasm.html link Trocar cenário");
}
// manifest precisa ser JSON valido com 8 cenarios
const manifest = JSON.parse(fs.readFileSync(path.join(root, "wasm/bases/manifest.json"), "utf8"));
console.log(`manifest scenarios: ${manifest.scenarios.length} (esperado 8)`);
if (manifest.scenarios.length !== 8) fail++;
// loader municipal precisa referenciar municipal-t1.data 782119
const loader = fs.readFileSync(path.join(root, "wasm/bases/municipal-t1.data.js"), "utf8");
const m = loader.match(/"data":"([^"]+)","remote_package_size":(\d+)/);
console.log(`loader data: ${m && m[1]} size ${m && m[2]} (esperado municipal-t1.data 782119)`);
if (!m || m[1] !== "municipal-t1.data" || m[2] !== "782119") fail++;
// glue precisa referenciar remote_package_size 14855585 compativel com .data
const glue = fs.readFileSync(path.join(root, "wasm/vota_web_wasm.js"), "utf8");
const g = glue.match(/remote_package_size["']?\s*:\s*(\d+)/);
const dataSize = fs.statSync(path.join(root, "wasm/vota_web_wasm.data")).size;
console.log(`glue package: ${g && g[1]} vs data bytes: ${dataSize}`);
if (!g || Number(g[1]) !== dataSize) fail++;
// wasm magic + validacao WebAssembly
const wasm = fs.readFileSync(path.join(root, "wasm/vota_web_wasm.wasm"));
console.log(`wasm magic: ${wasm.subarray(0,4).toString("hex")} (esperado 0061736d)`);
const valid = WebAssembly.validate(wasm);
console.log(`WebAssembly.validate: ${valid}`);
if (!valid) fail++;
const mod = new WebAssembly.Module(wasm);
const kinds = Object.fromEntries(WebAssembly.Module.exports(mod).map(e => [e.name, e.kind]));
console.log(`wasm exports: ${Object.entries(kinds).map(([n,k]) => `${k}:${n}`).join(", ")}`);
if (kinds.Cb !== "memory") { console.log("FALTA export de memoria (Cb)"); fail++; }
if (kinds.Fb !== "table") { console.log("FALTA export de tabela (Fb)"); fail++; }
// O build Emscripten minifica os exports; as funcoes vota* sao expostas via
// ccall/dlsym em runtime. Confere-se a presenca dos simbolos no glue JS.
for (const fn of ["_votaInit","_votaPressKey","_votaTick","_votaSetAudioEnabled","_votaGetStateJson"]) {
  if (!glue.includes(fn)) { console.log(`FALTA simbolo ${fn} no glue`); fail++; }
  else { console.log(`OK   simbolo ${fn} no glue`); }
}
// Demais pacotes de cenário (loaders reconstruídos a partir dos binários;
// método validado pelo autoteste byte-idêntico do municipal-t1.data.js).
const SCEN_SHA = {
  "municipal-t1": "0e8ab495df9fdaf6d1247decb9361843252cc30db325c148f10f5eabcf30d5f3",
  "geral-df-t1": "375423e67054e529664028ff97355337ea48fa541fb6f4e1dcafe30214cd465d",
  "geral-df-t2": "a55361aabd2409f9948931dd0c91c41506a8ea77ddab102250fbdf35daaf0102",
  "geral-t1": "84aa2e1e660ec59017c7c3084d7dee5bacc5d39123c6b911cd47194eebac8cdb",
  "geral-t2": "316cc5bef1d57d924f74dbc7bdb5efdcd1b21ee218623efd088977ccba297b64",
  "geral-zz-t1": "6fe58072d5679b47c2185e12c4f1f1452b598ab633848342d4e1662dcc4cab80",
  "geral-zz-t2": "5dfa665aadc2118a76b00c2fa8b83cde7a99573d69ebf8c42502b7967ec546e9",
  "municipal-t2": "83e753c939bdadbd436b4cfccddcfcab5797028f1065db5876fbe1f9f18caafa",
};
function readMeta(loaderSrc) {
  const startIdx = loaderSrc.indexOf('{"data"');
  let depth = 0, endIdx = -1, inStr = false, esc = false;
  for (let i = startIdx; i < loaderSrc.length; i++) {
    const c = loaderSrc[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }
  return JSON.parse(loaderSrc.slice(startIdx, endIdx));
}
for (const [id, sha] of Object.entries(SCEN_SHA)) {
  const dp = path.join(root, `wasm/bases/${id}.data`);
  const lp = path.join(root, `wasm/bases/${id}.data.js`);
  if (!fs.existsSync(dp) || !fs.existsSync(lp)) { console.log(`FALTA pacote ${id}`); fail++; continue; }
  const buf = fs.readFileSync(dp);
  const okHash = crypto.createHash("sha256").update(buf).digest("hex") === sha;
  const meta = readMeta(fs.readFileSync(lp, "utf8"));
  const okMeta = meta.data === `${id}.data` && meta.remote_package_size === buf.length;
  let pos = 0, bad = 0;
  for (const f of meta.files) { if (f.start !== pos || f.end < f.start || f.end > buf.length) bad++; pos = f.end; }
  const okTile = bad === 0 && pos === buf.length;
  const scen = meta.files.length ? buf.subarray(0, meta.files[0].end).toString("utf8") : "";
  const okId = scen.includes(`"id": "${id}"`);
  const sentinel = `/dsk/fi/estatico/t${String(manifest.scenarios.find((s) => s.id === id)?.pe ?? "").padStart(5, "0")}${(manifest.scenarios.find((s) => s.id === id)?.uf ?? "").toLowerCase()}-pu.dat`;
  const okSent = meta.files.some((f) => f.filename === sentinel && f.end > f.start);
  const ok = okHash && okMeta && okTile && okId && okSent;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${id}: hash=${okHash} meta=${okMeta} tiling=${okTile}(${meta.files.length}) id=${okId} sentinela=${okSent}`);
}
console.log(fail === 0 ? "RESULTADO: TODAS AS VERIFICACOES DISPONIVEIS PASSARAM" : `RESULTADO: ${fail} FALHA(S)`);
process.exit(fail === 0 ? 0 : 1);

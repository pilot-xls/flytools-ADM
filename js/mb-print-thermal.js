// =====================================================
// mb-print-thermal.js
// Gera a imagem do talão desenhando-a directamente num <canvas>
// (Canvas 2D API) em vez de tirar "print" à página com o
// html2canvas. As tentativas anteriores com html2canvas (grid,
// float, tabela nativa) perderam sempre texto/posições — é um
// problema conhecido do html2canvas ao tentar reproduzir CSS à
// mão. Desenhar directamente é o mesmo método que geradores de
// recibo "a sério" costumam usar: zero dependência de como a
// página está estilizada, controlo total sobre o resultado.
//
// A imagem é gerada automaticamente ao abrir a página. Há dois botões:
// "Imprimir / Guardar PDF" (window.print()) para impressoras normais
// AirPrint ou para guardar um PDF; e "Partilhar imagem" (Web Share API
// com ficheiros) para apps como o Thermer, que recebem a imagem em
// bruto — isto evita o window.print(), porque nesse caminho o iOS
// obriga a paginar para A3/A4/etc. antes de partilhar, distorcendo o
// tamanho pensado para o rolo de 80mm.
// =====================================================

// 576px = 8 pontos/mm × 72mm — a largura imprimível real da grande maioria
// das impressoras térmicas ESC/POS de "80mm" (o rolo tem 80mm, mas a área
// imprimível costuma ficar-se pelos 72mm por causa das margens laterais).
// Se a nossa imagem tiver uma largura diferente desta, a app recetora
// (ex: Thermer) tem de a redimensionar antes de imprimir — e mesmo
// partindo de preto/branco puro, esse redimensionamento reintroduz
// cinzentos nos bordos do texto, o que dá o aspecto "borrado".
const OUTPUT_WIDTH = 576;
const MARGIN = 22;
const FONT_FAMILY = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
// Fontes monoespaçadas têm dígitos com formas mais geométricas e
// "aberturas" maiores do que as fontes normais do sistema (que têm
// curvas suaves, pensadas para ecrã, não para impressão térmica a
// baixa resolução) — números como 5/6/9 deixam de colapsar numa
// mancha ao serem convertidos para preto/branco puro. Usada só nos
// números (pesos, momentos, avisos); os títulos/etiquetas continuam
// na fonte normal para haver contraste hierárquico.
const MONO_FONT_FAMILY = "ui-monospace, 'SF Mono', 'Cascadia Mono', 'Menlo', Consolas, monospace";
// Desenhar directamente a 576px faz o texto perder detalhe nas curvas
// (poucos pixels para definir a barriga de um 6/9) ainda antes de
// convertermos para preto/branco puro — a nossa própria imagem já saía
// em "degraus". Desenhamos tudo a esta escala mais alta e reduzimos
// (com boa interpolação) para o tamanho final só no fim, o que dá
// contornos muito mais limpos sem mudar a largura final de 576px
// (continua a bater certo com a impressora, ver OUTPUT_WIDTH acima).
const SUPERSAMPLE = 2;
const PAGE_WIDTH_MM = 80; // largura do rolo térmico

// O CSS "@page { size: 80mm auto; }" não é fiável — muitos motores de
// impressão ignoram a palavra "auto" para a altura e caem de volta para
// A4/Letter, o que faz o conteúdo (pensado para 80mm) ser esticado/
// reposicionado para preencher essa folha maior. Em vez disso calculamos
// aqui a altura exacta (em mm) a partir da proporção real da imagem
// gerada, e definimos um @page com as duas dimensões fixas — isso sim
// é respeitado de forma consistente ao imprimir/guardar como PDF.
function atualizarTamanhoPaginaImpressao(canvas) {
    const alturaMm = PAGE_WIDTH_MM * (canvas.height / canvas.width);
    let styleEl = document.getElementById("mbThermalPageSize");
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "mbThermalPageSize";
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@page { size: ${PAGE_WIDTH_MM}mm ${alturaMm.toFixed(2)}mm; margin: 0; }`;
}

let lastReceiptCanvas = null; // guarda o último recibo gerado, para o botão "Partilhar imagem" reutilizar

// Partilha a imagem gerada como ficheiro em bruto (Web Share API), em vez
// de a imprimir — assim apps como o Thermer recebem-na tal como foi
// desenhada (já à proporção certa para 80mm), sem passar pelo mecanismo
// de impressão do iOS, que só paginação para tamanhos fixos (A3, A4, ...).
async function partilharImagemTermica() {
    if (!lastReceiptCanvas) return;

    const blob = await new Promise(resolve => lastReceiptCanvas.toBlob(resolve, "image/png"));
    if (!blob) {
        alert("Não foi possível preparar a imagem para partilha.");
        return;
    }

    const file = new File([blob], "weight-balance-80mm.png", { type: "image/png" });

    if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
        alert("Este browser não suporta partilhar esta imagem diretamente — usa \"Guardar imagem (PNG)\" e partilha esse ficheiro manualmente.");
        return;
    }

    try {
        await navigator.share({ files: [file], title: "Weight & Balance" });
    } catch (error) {
        if (error?.name !== "AbortError") {
            console.error("Erro ao partilhar a imagem:", error);
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await waitForPrintPageReady();
        if (typeof exec_calculo === "function") {
            await exec_calculo();
        }
        // Gera a imagem logo à entrada, sem esperar por um clique manual.
        await gerarImagemTermica({ silent: true });
    } catch (error) {
        console.error("Erro ao preparar os dados:", error);
    }

    const btnPrintThermalImage = document.getElementById("btnPrintThermalImage");
    if (btnPrintThermalImage) {
        btnPrintThermalImage.addEventListener("click", async () => {
            await gerarImagemTermica({ silent: true });
            window.print();
        });
    }

    const btnShareThermalImage = document.getElementById("btnShareThermalImage");
    if (btnShareThermalImage && navigator.share) {
        btnShareThermalImage.hidden = false;
        btnShareThermalImage.addEventListener("click", async () => {
            await gerarImagemTermica({ silent: true });
            await partilharImagemTermica();
        });
    }

    const btnClosePrint = document.getElementById("btnClosePrint");
    if (btnClosePrint) {
        btnClosePrint.addEventListener("click", () => {
            if (window.opener) {
                window.close();
                return;
            }
            window.history.back();
        });
    }
});

function atualizarDataHoraImpressao() {
    const el = document.getElementById("mbPrintTimestamp");
    const agora = new Date();
    const texto = agora.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
    const textoFinal = `Generated: ${texto}`;
    if (el) el.textContent = textoFinal;
    return textoFinal;
}

async function waitForPrintPageReady() {
    if (document.readyState !== "complete") {
        await new Promise(resolve => window.addEventListener("load", resolve, { once: true }));
    }
    const images = Array.from(document.querySelectorAll("img"));
    await Promise.allSettled(images.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
            setTimeout(resolve, 1500);
        });
    }));
}

// --- Leitura dos dados a partir do DOM (depois de exec_calculo() correr) ---

function getEl(id) {
    const el = document.getElementById(id);
    return el ? String(el.textContent ?? "").trim() : "";
}

function getVal(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    if ("value" in el) return String(el.value ?? "").trim();
    return String(el.textContent ?? "").trim();
}

// Converte o conteúdo da célula INFO (pode ter <br> e um
// <span class="info-warning">) numa lista de linhas de texto simples.
function getInfoLines(trEl) {
    if (!trEl) return [];
    const cell = trEl.querySelector("td:last-child");
    if (!cell) return [];
    const html = cell.innerHTML.trim();
    if (!html) return [];
    return html.split(/<br\s*\/?>/i).map(fragment => {
        const tmp = document.createElement("div");
        tmp.innerHTML = fragment;
        return {
            text: tmp.textContent.trim(),
            warning: !!tmp.querySelector(".info-warning")
        };
    }).filter(line => line.text);
}

function buildRows() {
    const fuelTr = document.getElementById("fuel")?.closest("tr");
    const payloadTr = document.getElementById("manualPayload")?.closest("tr");
    const zfwTr = document.getElementById("zfw")?.closest("tr");
    const rampTr = document.getElementById("rampRow");
    const takeoffTr = document.getElementById("takeoffRow");
    const landingTr = document.getElementById("landingRow");

    return [
        { label: "Basic weight", weight: getEl("basicWeight"), moment: getEl("basicMoment") },
        { label: "Pilots", weight: getVal("pilots"), moment: getEl("momentPilots") },
        { label: "Payload", weight: getVal("manualPayload"), moment: getEl("momentPayload"), info: getInfoLines(payloadTr) },
        { label: "ZFW", weight: getEl("zfw"), moment: getEl("momentZfw"), info: getInfoLines(zfwTr), gray: true, exceeded: zfwTr?.classList.contains("limit-exceed") },
        { label: "Fuel loading", weight: getVal("fuel"), moment: getEl("momentFuel"), info: getInfoLines(fuelTr), exceeded: fuelTr?.classList.contains("limit-exceed") },
        { label: "Ramp Weight", weight: getEl("rampWeight"), moment: getEl("momentRamp"), info: getInfoLines(rampTr), gray: true, exceeded: rampTr?.classList.contains("limit-exceed") },
        { label: "Fuel taxi", weight: getVal("fuelTaxi"), moment: getEl("momentTaxi") },
        { label: "Take-off Weight", weight: getEl("takeoffWeight"), moment: getEl("momentTakeoff"), info: getInfoLines(takeoffTr), gray: true, exceeded: takeoffTr?.classList.contains("limit-exceed") },
        { label: "Fuel to destination", weight: getVal("fuelDest"), moment: getEl("momentDest") },
        { label: "Landing Weight", weight: getEl("landingWeight"), moment: getEl("momentLanding"), info: getInfoLines(landingTr), gray: true, exceeded: landingTr?.classList.contains("limit-exceed") }
    ];
}

// --- Geração da imagem ---

async function gerarImagemTermica({ silent = false } = {}) {
    try {
        if (typeof exec_calculo === "function") {
            await exec_calculo();
        }
        const timestamp = atualizarDataHoraImpressao();

        const finalCanvas = desenharRecibo(timestamp);
        lastReceiptCanvas = finalCanvas;
        atualizarTamanhoPaginaImpressao(finalCanvas);

        const wrap = document.getElementById("mbThermalPreviewWrap");
        const img = document.getElementById("mbThermalPreviewImg");
        const downloadLink = document.getElementById("mbThermalDownloadLink");

        const dataUrl = finalCanvas.toDataURL("image/png");
        if (img) img.src = dataUrl;
        if (downloadLink) downloadLink.href = dataUrl;
        if (wrap) {
            wrap.hidden = false;
            if (!silent) {
                wrap.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    } catch (error) {
        console.error("Erro ao gerar a imagem térmica:", error);
        if (!silent) {
            alert("Não foi possível gerar a imagem: " + (error?.message || error));
        }
    }
}

function desenharRecibo(timestamp) {
    // Canvas "de trabalho" bem alto — no fim recorta-se só o espaço usado.
    // Físicamente é SUPERSAMPLE vezes maior; o ctx.scale() abaixo faz com
    // que todo o resto do código continue a desenhar com as mesmas
    // coordenadas/tamanhos de sempre (em unidades "lógicas" de OUTPUT_WIDTH),
    // só que rasterizadas com mais detalhe.
    const WORK_HEIGHT = 4000;
    const work = document.createElement("canvas");
    work.width = OUTPUT_WIDTH * SUPERSAMPLE;
    work.height = WORK_HEIGHT * SUPERSAMPLE;
    const ctx = work.getContext("2d");
    ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_WIDTH, WORK_HEIGHT);
    ctx.textBaseline = "alphabetic";

    let y = MARGIN;

    // --- Logo ---
    const logoImg = document.getElementById("thermalLogo");
    if (logoImg && logoImg.naturalWidth) {
        const logoW = 130;
        const logoH = logoW * (logoImg.naturalHeight / logoImg.naturalWidth);
        ctx.drawImage(logoImg, (OUTPUT_WIDTH - logoW) / 2, y, logoW, logoH);
        y += logoH + 14;
    }

    // --- Título / aeronave / leg / hora ---
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.font = `bold 28px ${FONT_FAMILY}`;
    ctx.fillText("Weight & Balance", OUTPUT_WIDTH / 2, y + 22);
    y += 34;

    ctx.font = `600 16px ${FONT_FAMILY}`;
    const acSelected = getEl("ac-selected");
    const nomeLeg = getEl("nomeLeg");
    if (acSelected) {
        ctx.fillText(acSelected, OUTPUT_WIDTH / 2, y + 14);
        y += 20;
    }
    if (nomeLeg) {
        ctx.fillText(nomeLeg, OUTPUT_WIDTH / 2, y + 14);
        y += 20;
    }

    ctx.font = `12px ${FONT_FAMILY}`;
    ctx.fillStyle = "#555555";
    ctx.fillText(timestamp, OUTPUT_WIDTH / 2, y + 12);
    y += 26;

    // --- Cabeçalho da tabela ---
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(OUTPUT_WIDTH, y);
    ctx.stroke();
    y += 4;

    // --- Linhas da tabela ---
    ctx.textAlign = "left";
    const rows = buildRows();
    rows.forEach(row => {
        const rowTop = y;
        const line1H = 26;
        const infoLinesH = row.info && row.info.length ? row.info.length * 15 : 0;
        const line2H = Math.max(row.moment ? 15 : 0, infoLinesH);
        const rowH = 8 + line1H + line2H + 8;

        if (row.exceeded) {
            ctx.fillStyle = "#ffe3e3";
            ctx.fillRect(0, rowTop, OUTPUT_WIDTH, rowH);
        } else if (row.gray) {
            ctx.fillStyle = "#f0f0f0";
            ctx.fillRect(0, rowTop, OUTPUT_WIDTH, rowH);
        }

        let ty = rowTop + 8 + 18;
        ctx.fillStyle = "#111111";
        ctx.font = `600 17px ${FONT_FAMILY}`;
        ctx.textAlign = "left";
        ctx.fillText(row.label, MARGIN, ty);

        ctx.font = `bold 19px ${MONO_FONT_FAMILY}`;
        ctx.textAlign = "right";
        const weightText = String(row.weight ?? "0");
        const weightX = OUTPUT_WIDTH - MARGIN;
        ctx.fillText(weightText, weightX, ty);
        // Reforça (faux bold) os números mais importantes do talão:
        // um traço fino por cima do preenchimento fecha as "barrigas"
        // de dígitos como 6/9/5, que senão colapsam ao converter para
        // preto/branco puro.
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "#111111";
        ctx.strokeText(weightText, weightX, ty);

        ty += 18;
        if (row.moment) {
            // 600 em vez de normal: traços finos são os primeiros a
            // esbater/desaparecer em qualquer redimensionamento posterior
            // (feito pela app que recebe a imagem, ex: Thermer).
            ctx.font = `600 12px ${MONO_FONT_FAMILY}`;
            ctx.fillStyle = "#333333";
            ctx.textAlign = "left";
            ctx.fillText(`Mom ${row.moment}`, MARGIN, ty);
        }
        if (row.info && row.info.length) {
            row.info.forEach((line, idx) => {
                ctx.font = `600 12px ${MONO_FONT_FAMILY}`;
                ctx.fillStyle = line.warning ? "#c0102a" : "#333333";
                ctx.textAlign = "right";
                ctx.fillText(line.text, OUTPUT_WIDTH - MARGIN, ty + idx * 15);
            });
        }

        y = rowTop + rowH;
        ctx.strokeStyle = "#dcdcdc";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(OUTPUT_WIDTH, y);
        ctx.stroke();
    });

    y += 10;

    // --- Envelope CG ---
    const envelopeImg = document.getElementById("loadsheet-base");
    if (envelopeImg && envelopeImg.naturalWidth) {
        const imgW = OUTPUT_WIDTH;
        const imgH = imgW * (envelopeImg.naturalHeight / envelopeImg.naturalWidth);
        ctx.drawImage(envelopeImg, 0, y, imgW, imgH);

        // Pontos ZFW/TOW/LDG lidos directamente do SVG já desenhado pelo
        // mb.js (desenharPontos()), para não duplicar essa lógica aqui.
        const svg = document.getElementById("cg-svg");
        if (svg) {
            const scaleX = imgW / 400;
            const scaleY = imgH / 300;

            // Os pontos vêm com cores (azul/verde/laranja) no SVG do ecrã,
            // mas numa impressora térmica só existe preto e branco — e o
            // laranja do LDG, em particular, é claro demais e acabava
            // classificado como "branco" pelo limiar preto/branco puro
            // (fica invisível). Desenhamos sempre a preto aqui; quem
            // identifica cada ponto é a etiqueta ("ZFW"/"TOW"/"LDG") ao
            // lado, não a cor.
            svg.querySelectorAll("circle.ponto").forEach(circle => {
                const cx = parseFloat(circle.getAttribute("cx")) * scaleX;
                const cy = y + parseFloat(circle.getAttribute("cy")) * scaleY;
                const r = Math.max(4, parseFloat(circle.getAttribute("r")) * ((scaleX + scaleY) / 2));
                ctx.fillStyle = "#000000";
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            });

            svg.querySelectorAll("text.label").forEach(text => {
                const tx = parseFloat(text.getAttribute("x")) * scaleX;
                const ty2 = y + parseFloat(text.getAttribute("y")) * scaleY;
                ctx.fillStyle = "#000000";
                ctx.font = `bold 13px ${FONT_FAMILY}`;
                ctx.textAlign = text.getAttribute("text-anchor") === "end" ? "right" : "left";
                ctx.fillText(text.textContent, tx, ty2);
            });
        }

        y += imgH;
    }

    y += MARGIN;

    // Recorta o canvas "de trabalho" para o tamanho realmente usado, e
    // reduz da resolução de supersampling para o tamanho final (576px) —
    // é esta redução, feita por nós com boa interpolação, que dá
    // contornos limpos aos textos antes do preto/branco puro.
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = OUTPUT_WIDTH;
    finalCanvas.height = Math.ceil(y);
    finalCanvas.getContext("2d").drawImage(
        work,
        0, 0, OUTPUT_WIDTH * SUPERSAMPLE, Math.ceil(y) * SUPERSAMPLE,
        0, 0, OUTPUT_WIDTH, finalCanvas.height
    );
    aplicarPretoBrancoPuro(finalCanvas);
    return finalCanvas;
}

// Impressoras térmicas só têm preto ou branco — sem isto, os bordos com
// anti-aliasing (texto, linhas) chegam como cinzentos à app de impressão,
// que os converte com o seu próprio dithering (pensado para fotos), e o
// texto sai esfumado/"borrado". Ao forçar aqui cada pixel para preto ou
// branco puro, não sobra cinzento nenhum para essa conversão estragar.
const THERMAL_BW_THRESHOLD = 165; // mesmo limiar já validado no antigo caminho Bluetooth direto
function aplicarPretoBrancoPuro(canvas) {
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const alpha = data[i + 3];
        const branco = alpha < 10 || lum >= THERMAL_BW_THRESHOLD;
        const valor = branco ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = valor;
        data[i + 3] = 255; // remove transparência — fundo passa a branco opaco
    }
    ctx.putImageData(imgData, 0, 0);
}

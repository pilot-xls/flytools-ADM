// =====================================================
// mb-print-thermal.js
// Gera a imagem do talão desenhando-a directamente num <canvas>
// (Canvas 2D API) em vez de tirar "print" à página com o
// html2canvas. As tentativas anteriores com html2canvas (grid,
// float, tabela nativa) perderam sempre texto/posições — é um
// problema conhecido do html2canvas ao tentar reproduzir CSS à
// mão. Desenhar directamente é o mesmo método que geradores de
// recibo "a sério" costumam usar: zero dependência de como a
// página está estilizada, controlo total sobre o resultado, e
// já fica no formato exacto (imagem) que a app nativa vai enviar
// para a impressora por Bluetooth.
// =====================================================

const OUTPUT_WIDTH = 640; // px "de trabalho" para 80mm — ajustável depois de sabermos os pontos reais da impressora
const MARGIN = 22;
const FONT_FAMILY = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

let lastReceiptCanvas = null; // guarda o último recibo gerado, para o botão de imprimir por Bluetooth reutilizar

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await waitForPrintPageReady();
        if (typeof exec_calculo === "function") {
            await exec_calculo();
        }
        // Gera a imagem logo à entrada, sem esperar por um clique manual em "Gerar imagem".
        await gerarImagemTermica({ silent: true });
    } catch (error) {
        console.error("Erro ao preparar os dados:", error);
    }

    const btnGerarImagem = document.getElementById("btnGerarImagem");
    if (btnGerarImagem) {
        btnGerarImagem.addEventListener("click", () => {
            gerarImagemTermica();
        });
    }

    const btnPrintThermalImage = document.getElementById("btnPrintThermalImage");
    if (btnPrintThermalImage) {
        btnPrintThermalImage.addEventListener("click", async () => {
            await gerarImagemTermica({ silent: true });
            window.print();
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
    const btn = document.getElementById("btnGerarImagem");
    const textoOriginal = btn ? btn.textContent : "";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "A gerar...";
    }

    try {
        if (typeof exec_calculo === "function") {
            await exec_calculo();
        }
        const timestamp = atualizarDataHoraImpressao();

        const finalCanvas = desenharRecibo(timestamp);
        lastReceiptCanvas = finalCanvas;

        const wrap = document.getElementById("mbThermalPreviewWrap");
        const img = document.getElementById("mbThermalPreviewImg");
        const info = document.getElementById("mbThermalPreviewInfo");
        const downloadLink = document.getElementById("mbThermalDownloadLink");

        const dataUrl = finalCanvas.toDataURL("image/png");
        img.src = dataUrl;
        downloadLink.href = dataUrl;
        info.textContent = `${finalCanvas.width} x ${finalCanvas.height} px`;
        wrap.hidden = false;
        if (!silent) {
            wrap.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (error) {
        console.error("Erro ao gerar a imagem térmica:", error);
        alert("Não foi possível gerar a imagem: " + (error?.message || error));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    }
}

function desenharRecibo(timestamp) {
    // Canvas "de trabalho" bem alto — no fim recorta-se só o espaço usado.
    const work = document.createElement("canvas");
    work.width = OUTPUT_WIDTH;
    work.height = 4000;
    const ctx = work.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, work.width, work.height);
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

    ctx.font = `16px ${FONT_FAMILY}`;
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

        ctx.font = `bold 19px ${FONT_FAMILY}`;
        ctx.textAlign = "right";
        ctx.fillText(String(row.weight ?? "0"), OUTPUT_WIDTH - MARGIN, ty);

        ty += 18;
        if (row.moment) {
            ctx.font = `12px ${FONT_FAMILY}`;
            ctx.fillStyle = "#555555";
            ctx.textAlign = "left";
            ctx.fillText(`Mom ${row.moment}`, MARGIN, ty);
        }
        if (row.info && row.info.length) {
            row.info.forEach((line, idx) => {
                ctx.font = `12px ${FONT_FAMILY}`;
                ctx.fillStyle = line.warning ? "#c0102a" : "#555555";
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

            svg.querySelectorAll("circle.ponto").forEach(circle => {
                const cx = parseFloat(circle.getAttribute("cx")) * scaleX;
                const cy = y + parseFloat(circle.getAttribute("cy")) * scaleY;
                const r = Math.max(3, parseFloat(circle.getAttribute("r")) * ((scaleX + scaleY) / 2));
                ctx.fillStyle = circle.getAttribute("fill") || "#000";
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            });

            svg.querySelectorAll("text.label").forEach(text => {
                const tx = parseFloat(text.getAttribute("x")) * scaleX;
                const ty2 = y + parseFloat(text.getAttribute("y")) * scaleY;
                ctx.fillStyle = text.getAttribute("fill") || "#000";
                ctx.font = `bold 13px ${FONT_FAMILY}`;
                ctx.textAlign = text.getAttribute("text-anchor") === "end" ? "right" : "left";
                ctx.fillText(text.textContent, tx, ty2);
            });
        }

        y += imgH;
    }

    y += MARGIN;

    // Recorta o canvas "de trabalho" para o tamanho realmente usado.
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = OUTPUT_WIDTH;
    finalCanvas.height = Math.ceil(y);
    finalCanvas.getContext("2d").drawImage(
        work,
        0, 0, OUTPUT_WIDTH, finalCanvas.height,
        0, 0, OUTPUT_WIDTH, finalCanvas.height
    );
    return finalCanvas;
}

// =====================================================
// Bluetooth — liga à impressora e envia o recibo já gerado, usando o
// protocolo "cat printer" (js/cat-printer-protocol.js), confirmado a
// funcionar em hardware real. IMPORTANTE: a impressora tem de estar
// com a bateria colocada (ligada só por cabo USB, desligava-se a meio
// por falta de corrente ao aquecer a cabeça + mover o motor).
// Isto só funciona dentro do Bluefy (Safari não suporta Bluetooth).
// =====================================================

const CAT_SERVICE_UUID = "0000ff00-0000-1000-8000-00805f9b34fb";
const CAT_WRITE_CHAR_UUID = "0000ff02-0000-1000-8000-00805f9b34fb";
const CAT_NAME_PREFIX = "MTP-3";

let btDevice = null;
let btWriteChar = null;

document.addEventListener("DOMContentLoaded", () => {
    const noBluefyCard = document.getElementById("noBluefyCard");
    const printReadyCard = document.getElementById("printReadyCard");
    const btnConnect = document.getElementById("btnConnect");
    const btnPrintBt = document.getElementById("btnPrintBt");
    const btnDisconnect = document.getElementById("btnDisconnect");
    const btnPrintDirect = document.getElementById("btnPrintDirect");

    // Deteta se este browser suporta Bluetooth (só existe dentro do Bluefy,
    // nunca no Safari) — isso decide qual dos dois cartões mostrar:
    // aviso + link para instalar o Bluefy, ou o botão de imprimir a sério.
    const temBluetooth = !!navigator.bluetooth;
    if (noBluefyCard) noBluefyCard.hidden = temBluetooth;
    if (printReadyCard) printReadyCard.hidden = !temBluetooth;

    if (!btnConnect) return; // esta página pode não ter a secção avançada de Bluetooth

    if (!temBluetooth) {
        btnConnect.disabled = true;
        btLog("navigator.bluetooth não existe neste browser — abre esta página no Bluefy.");
    }

    btnConnect.addEventListener("click", btConnect);
    btnDisconnect.addEventListener("click", btDisconnect);
    btnPrintBt.addEventListener("click", imprimirReciboNaImpressora);
    if (btnPrintDirect) btnPrintDirect.addEventListener("click", imprimirDireto);
});

// Fluxo de um único botão: gera a imagem, liga à impressora se ainda não
// estiver ligada, e imprime — tudo de seguida, sem passos manuais. É o
// que aparece quando já estamos dentro do Bluefy.
async function imprimirDireto() {
    const btnPrintDirect = document.getElementById("btnPrintDirect");
    if (!btnPrintDirect) return;

    const textoOriginal = btnPrintDirect.textContent;
    btnPrintDirect.disabled = true;

    try {
        btnPrintDirect.textContent = "A preparar a imagem...";
        if (typeof exec_calculo === "function") {
            await exec_calculo();
        }
        const timestamp = atualizarDataHoraImpressao();
        lastReceiptCanvas = desenharRecibo(timestamp);

        if (!btWriteChar) {
            btnPrintDirect.textContent = "A ligar à impressora...";
            const ligou = await btConnect();
            if (!ligou) {
                alert("Não foi possível ligar à impressora. Confirma que está ligada (com bateria) e não está já ligada a outro telemóvel — vê também o \"Registo\" em Opções avançadas.");
                return;
            }
        }

        btnPrintDirect.textContent = "A imprimir...";
        await imprimirReciboNaImpressora();
    } catch (error) {
        console.error("Erro no fluxo de impressão direta:", error);
        alert("Não foi possível imprimir: " + (error?.message || error));
    } finally {
        btnPrintDirect.disabled = false;
        btnPrintDirect.textContent = textoOriginal;
    }
}

function btLog(msg) {
    const logEl = document.getElementById("log");
    if (!logEl) return;
    const time = new Date().toLocaleTimeString("pt-PT");
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log(msg);
}

function btSetStatus(connected, text) {
    const dot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");
    const btnConnect = document.getElementById("btnConnect");
    const btnPrintBt = document.getElementById("btnPrintBt");
    const btnDisconnect = document.getElementById("btnDisconnect");
    if (dot) dot.classList.toggle("ok", connected);
    if (statusText) statusText.textContent = text;
    if (btnPrintBt) btnPrintBt.disabled = !connected;
    if (btnDisconnect) btnDisconnect.disabled = !connected;
    if (btnConnect) btnConnect.disabled = connected;
}

async function btConnect() {
    try {
        btLog(`A procurar dispositivos com nome a começar por "${CAT_NAME_PREFIX}"...`);
        btDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: CAT_NAME_PREFIX }],
            optionalServices: [CAT_SERVICE_UUID]
        });
        btLog(`Selecionado: ${btDevice.name || "(sem nome)"} — a ligar...`);

        btDevice.addEventListener("gattserverdisconnected", () => {
            btLog("Ligação perdida (normal a impressora desligar-se sozinha depois de imprimir).");
            btSetStatus(false, "Impressora desligada");
            btWriteChar = null;
        });

        const server = await btDevice.gatt.connect();
        const service = await server.getPrimaryService(CAT_SERVICE_UUID);
        btWriteChar = await service.getCharacteristic(CAT_WRITE_CHAR_UUID);

        btSetStatus(true, `Ligado a ${btDevice.name || "impressora"}`);
        btLog("Pronto para imprimir.");
        return true;
    } catch (error) {
        btLog(`Erro ao ligar: ${error?.name || ""} ${error?.message || String(error)}`);
        btSetStatus(false, "Impressora desligada");
        return false;
    }
}

function btDisconnect() {
    if (btDevice && btDevice.gatt.connected) {
        btDevice.gatt.disconnect();
    }
    btSetStatus(false, "Impressora desligada");
    btWriteChar = null;
}

// Converte o canvas do recibo num array de linhas de pixels (0/1), à
// largura de pontos da impressora (CAT_PRINT_WIDTH), redimensionando
// mantendo a proporção.
function canvasParaLinhasDePixels(canvas, targetWidth) {
    const scale = targetWidth / canvas.width;
    const targetHeight = Math.max(1, Math.round(canvas.height * scale));

    const resized = document.createElement("canvas");
    resized.width = targetWidth;
    resized.height = targetHeight;
    const rctx = resized.getContext("2d");
    rctx.fillStyle = "#ffffff";
    rctx.fillRect(0, 0, targetWidth, targetHeight);
    rctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

    const imgData = rctx.getImageData(0, 0, targetWidth, targetHeight).data;
    const rows = [];
    for (let y = 0; y < targetHeight; y++) {
        const row = new Array(targetWidth);
        for (let x = 0; x < targetWidth; x++) {
            const idx = (y * targetWidth + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            const a = imgData[idx + 3];
            const lum = r * 0.299 + g * 0.587 + b * 0.114;
            row[x] = (a > 10 && lum < 165) ? 1 : 0; // limiar simples — ajustável se sair claro/escuro a mais
        }
        rows.push(row);
    }
    return rows;
}

async function imprimirReciboNaImpressora() {
    const btnPrintBt = document.getElementById("btnPrintBt");
    if (!btWriteChar) {
        btLog("Sem ligação à impressora — carrega em \"Ligar à impressora\" primeiro.");
        return;
    }
    if (!lastReceiptCanvas) {
        btLog("Ainda não geraste a imagem — carrega em \"Gerar imagem\" primeiro.");
        return;
    }

    btnPrintBt.disabled = true;
    const textoOriginal = btnPrintBt.textContent;
    const ENERGY = 0x3000;

    try {
        btLog("A converter a imagem para pontos preto/branco...");
        const rows = canvasParaLinhasDePixels(lastReceiptCanvas, CAT_PRINT_WIDTH);
        btLog(`${rows.length} linhas a enviar (${CAT_PRINT_WIDTH} pontos de largura).`);

        btnPrintBt.textContent = "A imprimir... (config)";
        await catWriteInChunks(new Uint8Array(catConcatBytes([CAT_CMD_GET_DEV_STATE, CAT_CMD_SET_QUALITY_200_DPI])), btWriteChar, 40);
        await catSleep(150);

        btnPrintBt.textContent = "A imprimir... (a aquecer)";
        await catWriteInChunks(new Uint8Array(catConcatBytes([catCmdSetEnergy(ENERGY), catCmdApplyEnergy()])), btWriteChar, 40);
        await catSleep(200);

        await catWriteInChunks(new Uint8Array(CAT_CMD_LATTICE_START), btWriteChar, 40);
        await catSleep(150);

        for (let i = 0; i < rows.length; i++) {
            btnPrintBt.textContent = `A imprimir... (linha ${i + 1}/${rows.length})`;
            const packet = catBuildImageRowPacket(rows[i]);
            await catWriteInChunks(new Uint8Array(packet), btWriteChar, 25);
        }
        await catSleep(150);

        btnPrintBt.textContent = "A imprimir... (a terminar)";
        await catWriteInChunks(new Uint8Array(catConcatBytes([
            catCmdFeedPaper(25),
            CAT_CMD_SET_PAPER,
            CAT_CMD_SET_PAPER,
            CAT_CMD_SET_PAPER,
            CAT_CMD_LATTICE_END
        ])), btWriteChar, 40);

        btLog("Recibo enviado por completo. Verifica o papel.");
    } catch (error) {
        btLog(`Erro a imprimir: ${error?.name || ""} ${error?.message || String(error)}`);
    } finally {
        btnPrintBt.disabled = !btWriteChar;
        btnPrintBt.textContent = textoOriginal;
    }
}

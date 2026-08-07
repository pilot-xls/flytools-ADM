// =====================================================
// mb-print-thermal.js
// Equivalente ao mb-print.js, mas para a versão térmica 80mm.
// Em vez de window.print() (que só chega a impressoras AirPrint
// por Wi-Fi), este ficheiro transforma a área capturada numa
// imagem PNG (html2canvas) — essa imagem é o que, no passo
// seguinte, a app companheira vai enviar por Bluetooth para a
// impressora.
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await waitForPrintPageReady();
        await hydratePrintPage();
        atualizarDataHoraImpressao();
    } catch (error) {
        console.error("Erro ao preparar a página de impressão térmica:", error);
    }

    const btnGerarImagem = document.getElementById("btnGerarImagem");
    if (btnGerarImagem) {
        btnGerarImagem.addEventListener("click", () => {
            gerarImagemTermica();
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

// Preenche a página com os dados finais (mesma lógica do mb-print.js)
async function hydratePrintPage() {
    if (typeof exec_calculo === "function") {
        await exec_calculo();
    }
    convertInputsToStaticValues();
}

// Converte os inputs em texto estático alinhado à direita (compacto)
function convertInputsToStaticValues() {
    const inputs = Array.from(document.querySelectorAll('#mbPrintCapture input:not([type="hidden"])'));
    if (!inputs.length) return;

    inputs.forEach(input => {
        const staticValue = document.createElement("div");
        staticValue.className = "mb-static-value";
        staticValue.textContent = String(input.value ?? "").trim() || "0";
        input.replaceWith(staticValue);
    });
}

function atualizarDataHoraImpressao() {
    const el = document.getElementById("mbPrintTimestamp");
    if (!el) return;
    const agora = new Date();
    const texto = agora.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
    el.textContent = `Generated: ${texto}`;
}

async function waitForPrintPageReady() {
    if (document.readyState !== "complete") {
        await new Promise(resolve => window.addEventListener("load", resolve, { once: true }));
    }
    if (document.fonts && document.fonts.ready) {
        try {
            await document.fonts.ready;
        } catch (error) {
            console.warn("fonts.ready falhou:", error);
        }
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
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Carrega o html2canvas só quando é preciso (em vez de confiar em "defer"
// + timing, que foi o que causou o erro "ainda não carregou"). Se o
// caminho local js/vendor/html2canvas.min.js falhar (ex.: não existe no
// repo), tenta automaticamente a versão do CDN.
let html2canvasLoadPromise = null;
function carregarHtml2Canvas() {
    if (typeof html2canvas === "function") return Promise.resolve();
    if (html2canvasLoadPromise) return html2canvasLoadPromise;

    html2canvasLoadPromise = new Promise((resolve, reject) => {
        const local = document.createElement("script");
        local.src = "js/vendor/html2canvas.min.js";
        local.onload = () => resolve();
        local.onerror = () => {
            const cdn = document.createElement("script");
            cdn.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
            cdn.onload = () => resolve();
            cdn.onerror = () => reject(new Error("Não foi possível carregar o html2canvas (local nem CDN)."));
            document.head.appendChild(cdn);
        };
        document.head.appendChild(local);
    });

    return html2canvasLoadPromise;
}

// Gera a imagem final a partir da área capturada e mostra a pré-visualização.
// A "scale" aumenta a resolução do raster (mais nítido), independentemente
// do tamanho em mm do papel — o pixel-a-pixel exacto para a impressora
// (ex.: 384 ou 576 pontos de largura) é decidido depois, na app nativa,
// redimensionando esta imagem para a largura de pontos real da impressora.
async function gerarImagemTermica() {
    const btn = document.getElementById("btnGerarImagem");
    const capture = document.getElementById("mbPrintCapture");
    if (!capture) return;

    const textoOriginal = btn ? btn.textContent : "";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "A carregar...";
    }

    try {
        await carregarHtml2Canvas();

        if (btn) btn.textContent = "A gerar...";
        atualizarDataHoraImpressao();

        // foreignObjectRendering:true muda o motor do html2canvas: em vez de
        // ele próprio tentar "adivinhar" o layout e desenhar texto/caixas à
        // mão (onde temos andado a apanhar bugs — grid, float, agora texto
        // a desaparecer mesmo em tabela nativa), passa a pedir ao PRÓPRIO
        // Safari para desenhar o conteúdo (via <svg><foreignObject>) e só
        // tira a "fotografia" a esse resultado. Corrige de uma vez todas
        // estas classes de bug, à custa de exigir que o browser suporte
        // bem foreignObject (o Safari no iOS suporta).
        const canvas = await html2canvas(capture, {
            backgroundColor: "#ffffff",
            scale: 3,
            useCORS: true,
            foreignObjectRendering: true
        });

        const wrap = document.getElementById("mbThermalPreviewWrap");
        const img = document.getElementById("mbThermalPreviewImg");
        const info = document.getElementById("mbThermalPreviewInfo");
        const downloadLink = document.getElementById("mbThermalDownloadLink");

        const dataUrl = canvas.toDataURL("image/png");
        img.src = dataUrl;
        downloadLink.href = dataUrl;
        info.textContent = `${canvas.width} x ${canvas.height} px`;
        wrap.hidden = false;
        wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Erro ao gerar a imagem térmica:", error);
        alert("Não foi possível gerar a imagem.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    }
}

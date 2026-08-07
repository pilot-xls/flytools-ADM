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

// Gera a imagem final a partir da área capturada e mostra a pré-visualização.
// A "scale" aumenta a resolução do raster (mais nítido), independentemente
// do tamanho em mm do papel — o pixel-a-pixel exacto para a impressora
// (ex.: 384 ou 576 pontos de largura) é decidido depois, na app nativa,
// redimensionando esta imagem para a largura de pontos real da impressora.
async function gerarImagemTermica() {
    const btn = document.getElementById("btnGerarImagem");
    const capture = document.getElementById("mbPrintCapture");
    if (!capture) return;

    if (typeof html2canvas !== "function") {
        alert("html2canvas ainda não carregou — tenta novamente daqui a pouco.");
        return;
    }

    const textoOriginal = btn ? btn.textContent : "";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "A gerar...";
    }

    try {
        atualizarDataHoraImpressao();

        const canvas = await html2canvas(capture, {
            backgroundColor: "#ffffff",
            scale: 3,
            useCORS: true
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

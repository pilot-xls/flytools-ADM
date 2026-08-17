// =====================================================
// mb-print-thermal.js
// Versão simplificada: já não desenha nada em <canvas> nem fala
// Bluetooth com a impressora — usa exactamente o mesmo mecanismo
// que o botão "Imprimir" (📤) já usa em mb.html/mb-print.js: o
// diálogo nativo de impressão do iOS (window.print()), que deixa
// o piloto Guardar como PDF ou imprimir directamente numa
// impressora AirPrint, sem precisar de nenhuma app extra.
//
// Ficou muito mais pequeno de propósito — só há dois botões
// (Partilhar/Imprimir e Sair), por isso não há Bluetooth, canvas,
// nem código morto à espera de ser usado.
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await waitForPrintPageReady();
        await hydratePrintPage();

        // Actualiza a data/hora se a página tiver sido aberta a partir do botão de impressão
        if (localStorage.getItem("mbPrintRequestedAt")) {
            atualizarDataHoraImpressao();
        }
    } catch (error) {
        console.error("Erro ao preparar a página de impressão térmica:", error);
    }

    const btnShare = document.getElementById("btnPrintThermalShare");
    if (btnShare) {
        btnShare.addEventListener("click", () => {
            atualizarDataHoraImpressao();
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

    window.addEventListener("afterprint", () => {
        localStorage.removeItem("mbPrintRequestedAt");
    });
});

// Preenche a página com os dados finais necessários para impressão
async function hydratePrintPage() {
    if (typeof exec_calculo === "function") {
        await exec_calculo();
    }
    convertInputsToStaticValues();
}

// Converte os campos input em caixas de texto estáticas para a impressão ficar limpa
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

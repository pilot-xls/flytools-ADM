// Registo do Service Worker, partilhado por todas as páginas.
//
// Antes só corria em index.html (via index.js), por isso a app só detetava
// atualizações quando o utilizador entrava pela página inicial. Como o
// spa-router evita recarregar o documento ao navegar entre calculadora/mb/
// rotas, um utilizador podia ficar horas dentro da app sem nunca disparar
// uma verificação de update.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js', {
    // Sem isto, o pedido de verificação de update ao service-worker.js fica
    // sujeito ao cache HTTP normal (só é ignorado ao fim de ~24h), o que faz
    // com que uma versão nova só seja detetada muito depois de publicada.
    updateViaCache: 'none'
  })
    .then((reg) => {
      const checkForUpdate = () => reg.update().catch(() => {});

      // Verifica logo ao registar, e sempre que a página volta a ficar
      // visível (em vez de depender só da verificação automática do browser
      // ou de esperar por uma transição offline -> online).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });

      // O spa-router troca de página sem recarregar o documento (nem disparar
      // visibilitychange), por isso navegar entre calculadora/mb/rotas dentro
      // da app nunca chegava a verificar updates. O spa-router despacha este
      // evento a cada navegação interna.
      window.addEventListener('spa:navigate', checkForUpdate);
    })
    .catch((err) => console.error('Erro ao registar SW:', err));

  // Assim que um Service Worker novo assume o controlo da página, recarrega
  // para que a versão atualizada (já em cache) fique visível de imediato,
  // sem depender do utilizador fechar e reabrir a app.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
